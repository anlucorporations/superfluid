import { createHash } from 'node:crypto';
import dgram from 'node:dgram';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { MikrotikRestAdapter } from '../src/gateways/mikrotik.js';
import { RadiusGatewayAdapter } from '../src/gateways/radius.js';
import { ResilientGateway } from '../src/gateways/fallback.js';
import { MockGatewayAdapter } from '../src/gateways/mock.js';

const SERVERS: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (SERVERS.length) await SERVERS.pop()!();
});

async function startMikrotik(): Promise<string> {
  const server = http.createServer((req, res) => {
    const url = req.url ?? '';
    if (req.method === 'GET' && url === '/rest/ip/firewall/address-list') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[]');
      return;
    }
    if (req.method === 'PUT' && url === '/rest/ip/firewall/address-list') {
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ '.id': '*A1' }));
      return;
    }
    if (req.method === 'POST' && url === '/rest/ip/hotspot/active/login') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
      return;
    }
    if (req.method === 'GET' && url.startsWith('/rest/ip/hotspot/active')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([{ '.id': '*1' }]));
      return;
    }
    if (req.method === 'DELETE' && url.startsWith('/rest/ip/hotspot/active/')) {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === 'GET' && url === '/rest/system/resource') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  SERVERS.push(() => new Promise<void>((r) => server.close(() => r())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function startRadius(secret: string): Promise<number> {
  const sock = dgram.createSocket('udp4');
  sock.on('message', (msg, rinfo) => {
    const code = msg.readUInt8(0);
    const id = msg.readUInt8(1);
    const reqAuth = msg.subarray(4, 20);
    const respCode = code === 43 ? 44 : code === 40 ? 41 : 2;
    const h = Buffer.alloc(4);
    h.writeUInt8(respCode, 0);
    h.writeUInt8(id, 1);
    h.writeUInt16BE(20, 2);
    const auth = createHash('md5').update(h).update(reqAuth).update(secret).digest();
    sock.send(Buffer.concat([h, auth]), rinfo.port, rinfo.address);
  });
  await new Promise<void>((r) => sock.bind(0, '127.0.0.1', () => r()));
  SERVERS.push(() => new Promise<void>((r) => sock.close(() => r())));
  return (sock.address() as AddressInfo).port;
}

describe('MikroTik REST (H3, Opción A)', () => {
  it('autoriza, desconecta y comprueba salud', async () => {
    const baseUrl = await startMikrotik();
    const adapter = new MikrotikRestAdapter({ baseUrl, username: 'u', password: 'p', timeoutMs: 1000 });
    const auth = await adapter.authorize({
      sessionId: 's1',
      mac: '02:00:00:00:00:01',
      ip: '10.0.0.2',
      bandwidthDownBps: 25_000_000,
      bandwidthUpBps: 5_000_000,
    });
    expect(auth.ack).toBe(true);

    const disc = await adapter.disconnect({ sessionId: 's1', mac: '02:00:00:00:00:01', ip: '10.0.0.2' });
    expect(disc.ack).toBe(true);

    const health = await adapter.healthcheck();
    expect(health.online).toBe(true);
  });
});

describe('RADIUS CoA/PoD (H3, Opción B)', () => {
  it('CoA-ACK al autorizar y Disconnect-ACK al revocar', async () => {
    const secret = 'radius-secret';
    const port = await startRadius(secret);
    const adapter = new RadiusGatewayAdapter({
      host: '127.0.0.1',
      port,
      secret,
      nasIp: '10.0.0.1',
      timeoutMs: 800,
      retries: 0,
    });
    const auth = await adapter.authorize({
      sessionId: 's1',
      mac: '02:00:00:00:00:01',
      ip: '10.0.0.2',
      bandwidthDownBps: 25_000_000,
      bandwidthUpBps: 5_000_000,
    });
    expect(auth.ack).toBe(true);
    expect(auth.code).toBe('CoA-ACK');

    const disc = await adapter.disconnect({ sessionId: 's1', mac: '02:00:00:00:00:01', ip: '10.0.0.2' });
    expect(disc.ack).toBe(true);
    expect(disc.code).toBe('Disconnect-ACK');
  });

  it('timeout sin servidor RADIUS → ack=false', async () => {
    const adapter = new RadiusGatewayAdapter({
      host: '127.0.0.1',
      port: 1, // puerto sin servidor
      secret: 'x',
      nasIp: '10.0.0.1',
      timeoutMs: 200,
      retries: 0,
    });
    const res = await adapter.authorize({
      sessionId: 's1',
      mac: '02:00:00:00:00:01',
      ip: '10.0.0.2',
      bandwidthDownBps: 1,
      bandwidthUpBps: 1,
    });
    expect(res.ack).toBe(false);
  });
});

describe('Fallback CoA↔REST (D24)', () => {
  it('si el primario no da ACK, usa el secundario', async () => {
    const primary = new MockGatewayAdapter();
    primary.setMode('timeout');
    const secondary = new MockGatewayAdapter();
    const gw = new ResilientGateway(primary, secondary, { attempts: 1, delaysMs: [0] });
    const res = await gw.authorize({
      sessionId: 's1',
      mac: '02:00:00:00:00:01',
      ip: '10.0.0.2',
      bandwidthDownBps: 1,
      bandwidthUpBps: 1,
    });
    expect(res.ack).toBe(true);
  });

  it('si ambos fallan, devuelve ack=false (el llamador marca degraded)', async () => {
    const primary = new MockGatewayAdapter();
    primary.setMode('error');
    const secondary = new MockGatewayAdapter();
    secondary.setMode('error');
    const gw = new ResilientGateway(primary, secondary, { attempts: 1, delaysMs: [0] });
    const res = await gw.disconnect({ sessionId: 's1', mac: 'm', ip: 'i', reason: 'test' });
    expect(res.ack).toBe(false);
  });
});
