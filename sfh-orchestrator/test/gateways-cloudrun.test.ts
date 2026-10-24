import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, afterEach } from 'vitest';
import { MikrotikRestAdapter } from '../src/gateways/mikrotik.js';

const SERVERS: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (SERVERS.length) await SERVERS.pop()!();
});

async function listen(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  SERVERS.push(() => new Promise<void>((r) => server.close(() => r())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function jwtWithExp(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds, aud: 'test' })).toString('base64url');
  return `${header}.${payload}.sig`;
}

describe('MikroTik REST + autenticación de plataforma Cloud Run', () => {
  it('envía el ID token del metadata server en x-serverless-authorization y lo cachea', async () => {
    const token = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
    let metadataHits = 0;
    const metadataUrl = await listen((req, res) => {
      metadataHits++;
      expect(String(req.headers['metadata-flavor'])).toBe('Google');
      expect(req.url).toContain('audience=');
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(token);
    });

    const seen: Array<string | undefined> = [];
    const routerUrl = await listen((req, res) => {
      seen.push(req.headers['x-serverless-authorization'] as string | undefined);
      expect(String(req.headers.authorization)).toMatch(/^Basic /);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });

    const adapter = new MikrotikRestAdapter({
      baseUrl: routerUrl,
      username: 'sfh',
      password: 'p',
      timeoutMs: 1000,
      platformAuth: 'cloudrun',
      metadataBaseUrl: metadataUrl,
    });

    const first = await adapter.healthcheck();
    const second = await adapter.healthcheck();

    expect(first.online).toBe(true);
    expect(second.online).toBe(true);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(`Bearer ${token}`);
    expect(seen[1]).toBe(`Bearer ${token}`);
    expect(metadataHits).toBe(1); // token cacheado por audiencia
  });

  it("platformAuth 'none' no añade la cabecera de plataforma", async () => {
    const seen: Array<string | undefined> = [];
    const routerUrl = await listen((req, res) => {
      seen.push(req.headers['x-serverless-authorization'] as string | undefined);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
    const adapter = new MikrotikRestAdapter({ baseUrl: routerUrl, username: 'u', password: 'p' });
    await adapter.healthcheck();
    expect(seen[0]).toBeUndefined();
  });

  it('si el metadata server falla, la operación no da ACK (fail-closed)', async () => {
    const metadataUrl = await listen((_req, res) => {
      res.writeHead(500);
      res.end();
    });
    const routerUrl = await listen((_req, res) => {
      res.writeHead(200);
      res.end('{}');
    });
    const adapter = new MikrotikRestAdapter({
      baseUrl: routerUrl,
      username: 'u',
      password: 'p',
      timeoutMs: 1000,
      platformAuth: 'cloudrun',
      metadataBaseUrl: metadataUrl,
    });
    const res = await adapter.authorize({
      sessionId: 's1',
      mac: '02:00:00:00:00:01',
      ip: '10.0.0.2',
      bandwidthDownBps: 1,
      bandwidthUpBps: 1,
    });
    expect(res.ack).toBe(false);
    expect(res.error).toMatch(/metadata_identity_500/);
  });
});

describe('MikroTik disconnect fail-closed', () => {
  it('un 401/5xx al buscar la sesión no se interpreta como "ya desconectado"', async () => {
    const routerUrl = await listen((_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end('{"error":"unauthorized"}');
    });
    const adapter = new MikrotikRestAdapter({ baseUrl: routerUrl, username: 'u', password: 'p' });
    const res = await adapter.disconnect({ sessionId: 's1', mac: '02:00:00:00:00:01', ip: '10.0.0.2', reason: 'test' });
    expect(res.ok).toBe(false);
    expect(res.ack).toBe(false);
    expect(res.code).toBe('401');
  });
});
