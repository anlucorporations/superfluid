import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouterOsEmulator } from '../src/routeros-emulator.mjs';

const BASIC = `Basic ${Buffer.from('sfh:sfh-sim-password').toString('base64')}`;
const ADMIN = 'sfh-sim-admin';

function client(url) {
  const req = (path, init = {}) =>
    fetch(`${url}${path}`, { ...init, headers: { authorization: BASIC, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const admin = (path, init = {}) =>
    fetch(`${url}${path}`, { ...init, headers: { 'x-admin-token': ADMIN, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  return { req, admin };
}

test('sfh-sim routeros: contrato REST + inyección de fallos', async (t) => {
  const emu = createRouterOsEmulator({ port: 0 });
  const { url } = await emu.listen(0, '127.0.0.1');
  t.after(() => emu.close());
  const { req, admin } = client(url);

  await t.test('rechaza peticiones sin Basic auth', async () => {
    const res = await fetch(`${url}/rest/system/resource`);
    assert.equal(res.status, 401);
  });

  await t.test('health del propio emulador', async () => {
    const res = await fetch(`${url}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, 'sfh-sim-routeros');
  });

  await t.test('healthcheck RouterOS', async () => {
    const res = await req('/rest/system/resource');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.version, /emulado/);
  });

  await t.test('login crea sesión, GET filtra por MAC y DELETE desconecta', async () => {
    const mac = '02:00:00:00:00:01';
    const login = await req('/rest/ip/hotspot/active/login', {
      method: 'POST',
      body: JSON.stringify({ user: mac, ip: '10.20.0.11', 'rate-limit': '25000000/5000000' }),
    });
    assert.equal(login.status, 200);
    const created = await login.json();
    assert.match(created['.id'], /^\*/);

    const list = await req(`/rest/ip/hotspot/active?mac-address=${encodeURIComponent(mac)}`);
    const rows = await list.json();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]['mac-address'], mac);

    const del = await req(`/rest/ip/hotspot/active/${encodeURIComponent(created['.id'])}`, { method: 'DELETE' });
    assert.equal(del.status, 204);
    const again = await req(`/rest/ip/hotspot/active/${encodeURIComponent(created['.id'])}`, { method: 'DELETE' });
    assert.equal(again.status, 404);
  });

  await t.test('address-list como fallback (PUT crea, POST no)', async () => {
    const created = await req('/rest/ip/firewall/address-list', {
      method: 'PUT',
      body: JSON.stringify({ list: 'sfh-authorized', address: '10.20.0.12', comment: 'sfh:s2' }),
    });
    assert.equal(created.status, 201);
    const list = await req('/rest/ip/firewall/address-list');
    const rows = await list.json();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].address, '10.20.0.12');
    const post = await req('/rest/ip/firewall/address-list', {
      method: 'POST',
      body: JSON.stringify({ list: 'sfh-authorized', address: '10.20.0.13' }),
    });
    assert.equal(post.status, 400, 'RouterOS real no crea con POST');
  });

  await t.test('admin requiere token y valida el modo', async () => {
    const unauthorized = await fetch(`${url}/__admin/state`);
    assert.equal(unauthorized.status, 401);
    const bad = await admin('/__admin/mode', { method: 'POST', body: JSON.stringify({ mode: 'nope' }) });
    assert.equal(bad.status, 400);
  });

  await t.test('modo login-fail: login 500 y address-list 200', async () => {
    await admin('/__admin/mode', { method: 'POST', body: JSON.stringify({ mode: 'login-fail' }) });
    const login = await req('/rest/ip/hotspot/active/login', {
      method: 'POST',
      body: JSON.stringify({ user: '02:00:00:00:00:02', ip: '10.20.0.13' }),
    });
    assert.equal(login.status, 500);
    const add = await req('/rest/ip/firewall/address-list', {
      method: 'PUT',
      body: JSON.stringify({ list: 'sfh-authorized', address: '10.20.0.13' }),
    });
    assert.equal(add.status, 201);
  });

  await t.test('modo error: 500 en login y healthcheck', async () => {
    await admin('/__admin/mode', { method: 'POST', body: JSON.stringify({ mode: 'error' }) });
    const login = await req('/rest/ip/hotspot/active/login', {
      method: 'POST',
      body: JSON.stringify({ user: '02:00:00:00:00:03', ip: '10.20.0.14' }),
    });
    assert.equal(login.status, 500);
    const health = await req('/rest/system/resource');
    assert.equal(health.status, 500);
  });

  await t.test('modo timeout: la respuesta se retrasa', async () => {
    await admin('/__admin/mode', { method: 'POST', body: JSON.stringify({ mode: 'timeout', delayMs: 120 }) });
    const start = Date.now();
    const res = await req('/rest/system/resource');
    assert.equal(res.status, 200);
    assert.ok(Date.now() - start >= 100, 'debe retrasar al menos el delayMs configurado');
  });

  await t.test('reset devuelve el estado limpio', async () => {
    await admin('/__admin/reset', { method: 'POST' });
    const state = await (await admin('/__admin/state')).json();
    assert.equal(state.mode, 'ok');
    assert.equal(state.sessions.length, 0);
    assert.equal(state.addressList.length, 0);
  });
});
