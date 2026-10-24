import { describe, expect, it } from 'vitest';
import {
  NonceStore,
  generateApiKey,
  hashApiKey,
  issueBindToken,
  signNasBind,
  verifyBindToken,
  verifyNasBind,
} from '../src/domain/auth.js';

const SECRET = 'secreto-gateway-de-prueba';
const PAYLOAD = {
  gid: 'g1',
  mac: '02:00:00:00:00:01',
  ip: '10.0.0.2',
  ts: 1_800_000_000,
  nonce: 'nonce-12345678',
};

describe('HMAC del NAS (D45/V2-01)', () => {
  it('firma y verifica correctamente', () => {
    const sig = signNasBind(SECRET, PAYLOAD);
    const res = verifyNasBind(SECRET, PAYLOAD, sig, {
      windowSeconds: 60,
      nowMs: PAYLOAD.ts * 1000,
      consumeNonce: () => true,
    });
    expect(res).toEqual({ ok: true, reason: 'ok' });
  });

  it('rechaza firma inválida', () => {
    const sig = signNasBind(SECRET, { ...PAYLOAD, mac: '02:00:00:00:00:99' });
    const res = verifyNasBind(SECRET, PAYLOAD, sig, {
      windowSeconds: 60,
      nowMs: PAYLOAD.ts * 1000,
      consumeNonce: () => true,
    });
    expect(res.reason).toBe('bad_signature');
  });

  it('rechaza timestamp fuera de ventana', () => {
    const sig = signNasBind(SECRET, PAYLOAD);
    const res = verifyNasBind(SECRET, PAYLOAD, sig, {
      windowSeconds: 60,
      nowMs: (PAYLOAD.ts + 120) * 1000,
      consumeNonce: () => true,
    });
    expect(res.reason).toBe('stale_timestamp');
  });

  it('rechaza nonce reutilizado (anti-replay)', () => {
    const sig = signNasBind(SECRET, PAYLOAD);
    const store = new NonceStore();
    const opts = {
      windowSeconds: 60,
      nowMs: PAYLOAD.ts * 1000,
      consumeNonce: (n: string) => store.consume(n, PAYLOAD.ts * 1000),
    };
    expect(verifyNasBind(SECRET, PAYLOAD, sig, opts).ok).toBe(true);
    expect(verifyNasBind(SECRET, PAYLOAD, sig, opts).reason).toBe('replayed_nonce');
  });
});

describe('bind_token (JWT corto, D45)', () => {
  it('emite y verifica claims gateway|mac|ip', async () => {
    const token = await issueBindToken('x'.repeat(32), { gid: 'g1', mac: '02:00:00:00:00:01', ip: '10.0.0.2' }, 60);
    const claims = await verifyBindToken('x'.repeat(32), token);
    expect(claims).toEqual({ gid: 'g1', mac: '02:00:00:00:00:01', ip: '10.0.0.2' });
  });

  it('rechaza token con secreto distinto', async () => {
    const token = await issueBindToken('x'.repeat(32), { gid: 'g1', mac: '02:00:00:00:00:01', ip: '10.0.0.2' }, 60);
    expect(await verifyBindToken('y'.repeat(32), token)).toBeNull();
  });
});

describe('API keys (D49)', () => {
  it('hash estable con pepper y prefijo visible', () => {
    const k = generateApiKey();
    expect(k.apiKey.startsWith('sfh_')).toBe(true);
    expect(k.prefix).toHaveLength(12);
    expect(k.hashWith('pepper')).toBe(hashApiKey('pepper', k.apiKey));
    expect(k.hashWith('pepper')).toHaveLength(64);
  });
});
