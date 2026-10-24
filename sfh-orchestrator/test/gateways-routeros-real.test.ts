import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { MikrotikRestAdapter } from '../src/gateways/mikrotik.js';

const SERVERS: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (SERVERS.length) await SERVERS.pop()!();
});

/** RouterOS v7 real (CHR): PUT crea address-list, POST login falla sin host, GET lista. */
async function startRealisticRouterOs() {
  const state = {
    list: new Map<string, Record<string, unknown>>(),
    loginAttempts: 0,
    seq: 0,
  };
  const server = http.createServer((req, res) => {
    const url = req.url ?? '';
    const send = (status: number, body?: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (req.method === 'POST' && url === '/rest/ip/hotspot/active/login') {
      state.loginAttempts++;
      return send(400, { error: 400, detail: 'unknown host IP', message: 'Bad Request' });
    }
    if (req.method === 'GET' && url.startsWith('/rest/ip/hotspot/active')) {
      return send(200, []);
    }
    if (req.method === 'PUT' && url === '/rest/ip/firewall/address-list') {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        const id = `*${++state.seq}`;
        state.list.set(id, { '.id': id, ...body });
        send(201, state.list.get(id));
      });
      return;
    }
    if (req.method === 'GET' && url === '/rest/ip/firewall/address-list') {
      return send(200, [...state.list.values()]);
    }
    if (req.method === 'DELETE' && url.startsWith('/rest/ip/firewall/address-list/')) {
      const id = decodeURIComponent(url.split('/').pop() ?? '');
      state.list.delete(id);
      return send(204);
    }
    return send(404, { error: 'not_found' });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  SERVERS.push(() => new Promise<void>((r) => server.close(() => r())));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, state };
}

const req = {
  sessionId: 's-1',
  mac: '02:00:00:00:00:01',
  ip: '10.20.0.11',
  bandwidthDownBps: 25_000_000,
  bandwidthUpBps: 5_000_000,
};

describe('RouterOS real (CHR): address-list con PUT y revocación', () => {
  it('autoriza por fallback address-list (PUT) y desconecta retirando la entrada', async () => {
    const { url, state } = await startRealisticRouterOs();
    const adapter = new MikrotikRestAdapter({ baseUrl: url, username: 'admin', password: 'x', timeoutMs: 1000 });
    const auth = await adapter.authorize(req);
    expect(auth.ack).toBe(true);
    expect(auth.code).toBe('address-list');
    expect(state.list.size).toBe(1);
    expect(state.loginAttempts).toBe(1);

    const disc = await adapter.disconnect({ sessionId: req.sessionId, mac: req.mac, ip: req.ip, reason: 'test' } as never);
    expect(disc.ack).toBe(true);
    expect(state.list.size).toBe(0);

    const again = await adapter.disconnect({ sessionId: req.sessionId, mac: req.mac, ip: req.ip, reason: 'test' } as never);
    expect(again.ack).toBe(true);
    expect(again.code).toBe('not-found');
  });

  it('preferAddressList evita el POST login no soportado', async () => {
    const { url, state } = await startRealisticRouterOs();
    const adapter = new MikrotikRestAdapter({
      baseUrl: url,
      username: 'admin',
      password: 'x',
      timeoutMs: 1000,
      preferAddressList: true,
    });
    const auth = await adapter.authorize(req);
    expect(auth.ack).toBe(true);
    expect(state.loginAttempts).toBe(0);
    expect(state.list.size).toBe(1);
  });
});
