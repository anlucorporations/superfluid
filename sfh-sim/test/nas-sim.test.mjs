import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createNasSim, signNasBind } from '../src/nas-sim.mjs';

function startMockApi({ secret = 's3cr3t', gatewayId = 'gw-1' } = {}) {
  const seen = { requests: [], nonces: new Set() };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      const signature = req.headers['x-gateway-signature'];
      const gid = req.headers['x-gateway-id'];
      const expected = signNasBind(secret, { gid: gatewayId, ...body });
      const now = Math.floor(Date.now() / 1000);
      const fresh = Math.abs(now - body.ts) <= 60;
      const nonceOk = !seen.nonces.has(body.nonce);
      const ok = gid === gatewayId && signature === expected && fresh && nonceOk;
      if (ok) seen.nonces.add(body.nonce);
      seen.requests.push({ ok, body, gid });
      if (!ok) {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'forbidden' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ bind_token: `tok-${body.nonce.slice(0, 8)}`, expires_in: 300 }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ url: `http://127.0.0.1:${port}`, seen, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

test('sfh-sim nas: bind HMAC + redirección al portal', async (t) => {
  const api = await startMockApi();
  t.after(() => api.close());
  const nas = createNasSim({
    port: 0,
    host: '127.0.0.1',
    apiUrl: api.url,
    portalUrl: 'https://portal.test',
    gatewayId: 'gw-1',
    gatewaySecret: 's3cr3t',
  });
  const { url } = await nas.listen(0, '127.0.0.1');
  t.after(() => nas.close());

  await t.test('POST /associate firma y devuelve portal_url con bind_token', async () => {
    const res = await fetch(`${url}/associate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mac: '02:00:00:00:00:01', ip: '10.20.0.11' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.match(body.bind_token, /^tok-/);
    assert.ok(body.portal_url.startsWith('https://portal.test/?bind_token='));
    assert.equal(api.seen.requests.length, 1);
    assert.equal(api.seen.requests[0].ok, true);
  });

  await t.test('GET /login redirige 302 al portal', async () => {
    const res = await fetch(`${url}/login?mac=02:00:00:00:00:02&ip=10.20.0.12`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    const location = res.headers.get('location');
    assert.ok(location.startsWith('https://portal.test/?bind_token='));
  });

  await t.test('rechaza MAC/IP inválidas', async () => {
    const res = await fetch(`${url}/associate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mac: 'no-es-mac', ip: '10.20.0.13' }),
    });
    assert.equal(res.status, 400);
  });

  await t.test('health del NAS', async () => {
    const res = await fetch(`${url}/health`);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, 'sfh-sim-nas');
  });

  await t.test('secreto incorrecto → sin bind_token (fail-closed)', async () => {
    const bad = createNasSim({
      port: 0,
      host: '127.0.0.1',
      apiUrl: api.url,
      portalUrl: 'https://portal.test',
      gatewayId: 'gw-1',
      gatewaySecret: 'secreto-incorrecto',
    });
    const badUrl = (await bad.listen(0, '127.0.0.1')).url;
    t.after(() => bad.close());
    const out = await bad.associate({ mac: '02:00:00:00:00:03', ip: '10.20.0.14' });
    assert.equal(out.ok, false);
    assert.equal(out.status, 403);
  });
});
