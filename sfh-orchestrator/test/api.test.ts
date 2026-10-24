import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import type { Db } from '../src/db.js';
import type { ChainClient } from '../src/chain.js';
import { MemoryTaskQueue } from '../src/tasks.js';
import { MockGatewayAdapter } from '../src/gateways/mock.js';
import { issueBindToken, signNasBind } from '../src/domain/auth.js';
import { Wallet } from 'ethers';

const TOKEN = '0x' + '11'.repeat(20);
const PAYOUT = '0x' + '22'.repeat(20);
const WALLET = '0x' + '33'.repeat(20);
const MAC = '02:00:00:00:00:01';
const IP = '10.0.0.2';
const GID = 'g1';
const SECRET = 'secret';

class FakeDb implements Db {
  calls: string[] = [];
  async query<T>(text: string, _params?: unknown[]): Promise<T[]> {
    const t = text.replace(/\s+/g, ' ');
    this.calls.push(t.slice(0, 70));
    if (/select 1/.test(t)) return [{ ok: 1 } as unknown as T];
    if (/insert into portal_sessions/.test(t)) {
      return [{ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', expires_at: '2026-10-17T12:15:00Z' } as unknown as T];
    }
    if (/select ps\.gateway_id/.test(t)) {
      return [{
        gateway_id: GID,
        super_token_address: TOKEN,
        tariff_id: 't1',
        price: '500000000000000',
        payout_wallet: PAYOUT,
      } as unknown as T];
    }
    if (/select gateway_id::text as gateway_id, mac_address/.test(t)) {
      return [{ gateway_id: GID, mac: MAC, ip: IP } as unknown as T];
    }
    if (/insert into device_bindings/.test(t)) {
      return [{ id: 'dddddddd-dddd-dddd-dddd-dddddddddddd' } as unknown as T];
    }
    if (/update portal_sessions/.test(t)) return [] as T[];
    if (/select wallet_address/.test(t)) {
      return [{ wallet_address: WALLET, mac: MAC, ip: IP } as unknown as T];
    }
    if (/insert into hotspot_sessions/.test(t)) {
      return [{ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' } as unknown as T];
    }
    if (/update hotspot_sessions/.test(t)) return [] as T[];
    throw new Error(`query no esperada: ${t.slice(0, 80)}`);
  }
  async withTx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

function fakeChain(): ChainClient {
  return {
    blockNumber: async () => 100,
    getFlow: async () => ({ flowRateWei: 500_000_000_000_000n, status: 'active', virtualBalanceWei: 10n ** 18n }),
    getTransactionObservation: async () => null,
    getLogs: async () => [],
  };
}

function fakeConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'x'.repeat(32),
    INTERNAL_SECRET: 'internal-secret',
    API_KEY_PEPPER: 'pepper-change-me',
    GATEWAY_HMAC_SECRETS: `${GID}=${SECRET}`,
    SUPER_TOKEN_ADDRESS: TOKEN,
    RATE_LIMIT_MAX: '1000',
  });
}

async function makeApp() {
  const cfg = fakeConfig();
  const db = new FakeDb();
  const queue = new MemoryTaskQueue();
  const adapter = new MockGatewayAdapter();
  const app = await buildServer({ cfg, db, queue, chain: fakeChain(), adapterFor: () => adapter });
  return { app, db, queue, cfg };
}

describe('API v1 (H2)', () => {
  it('GET /healthz responde 200', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
    await app.close();
  });

  it('readyz exige API key', async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('bind: firma válida emite bind_token; firma inválida 403', async () => {
    const { app } = await makeApp();
    const ts = Math.floor(Date.now() / 1000);
    const nonce = 'nonce-12345678';
    const sig = signNasBind(SECRET, { gid: GID, mac: MAC, ip: IP, ts, nonce });

    const ok = await app.inject({
      method: 'POST',
      url: '/v1/internal/hotspot/bind',
      headers: { 'x-gateway-id': GID, 'x-gateway-signature': sig },
      payload: { mac: MAC, ip: IP, ts, nonce },
    });
    expect(ok.statusCode).toBe(200);
    expect(typeof ok.json().bind_token).toBe('string');

    const bad = await app.inject({
      method: 'POST',
      url: '/v1/internal/hotspot/bind',
      headers: { 'x-gateway-id': GID, 'x-gateway-signature': 'deadbeef' },
      payload: { mac: MAC, ip: IP, ts, nonce: 'nonce-99999999' },
    });
    expect(bad.statusCode).toBe(403);
    await app.close();
  });

  it('portal/sessions: con bind_token y aviso válido; 409 si el aviso es incorrecto', async () => {
    const { app, cfg } = await makeApp();
    const token = await issueBindToken(cfg.JWT_SECRET, { gid: GID, mac: MAC, ip: IP }, 60);

    const ok = await app.inject({
      method: 'POST',
      url: '/v1/portal/sessions',
      headers: { authorization: `Bearer ${token}` },
      payload: { notice_version: 'v1', notice_accepted_at: new Date().toISOString() },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().session_id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    const bad = await app.inject({
      method: 'POST',
      url: '/v1/portal/sessions',
      headers: { authorization: `Bearer ${token}` },
      payload: { notice_version: 'v0', notice_accepted_at: new Date().toISOString() },
    });
    expect(bad.statusCode).toBe(409);
    await app.close();
  });

  it('authorize responde 202 y encola una tarea durable (D44)', async () => {
    const { app, queue } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/session/authorize',
      payload: {
        portal_session_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        device_binding_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        tx_hash: '0x' + 'ab'.repeat(32),
        flow_rate_wei_s: '500000000000000',
      },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('pending');
    expect(queue.tasks).toHaveLength(1);
    expect(queue.tasks[0]?.url).toContain('/v1/internal/jobs/authorize/validate');
    await app.close();
  });

  it('rechaza authorize con tasa por debajo de la tarifa (422)', async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/session/authorize',
      payload: {
        portal_session_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        device_binding_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        tx_hash: '0x' + 'ab'.repeat(32),
        flow_rate_wei_s: '1',
      },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('binding SIWE: firma válida crea el binding; firma inválida 401 (D45/V2-01)', async () => {
    const { app } = await makeApp();
    const wallet = Wallet.createRandom();
    const sessionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const message = `SFhostpot wallet binding\nsession:${sessionId}`;
    const signature = await wallet.signMessage(message);

    const ok = await app.inject({
      method: 'POST',
      url: '/v1/portal/bindings',
      payload: { session_id: sessionId, wallet_address: wallet.address, message, signature },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().binding_id).toBe('dddddddd-dddd-dddd-dddd-dddddddddddd');

    const bad = await app.inject({
      method: 'POST',
      url: '/v1/portal/bindings',
      payload: { session_id: sessionId, wallet_address: wallet.address, message, signature: signature.slice(0, -4) + '0000' },
    });
    expect(bad.statusCode).toBe(401);
    await app.close();
  });

});
