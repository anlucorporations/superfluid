import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { BindClaims, NasBindPayload } from './types.js';

// ---------------------------------------------------------------- HMAC del NAS
/** Firma la terna observada por el NAS: gateway|mac|ip|ts|nonce (D45/V2-01). */
export function signNasBind(secret: string, p: NasBindPayload): string {
  const msg = `${p.gid}|${p.mac.toLowerCase()}|${p.ip}|${p.ts}|${p.nonce}`;
  return createHmac('sha256', secret).update(msg).digest('hex');
}

export type BindVerifyReason = 'ok' | 'bad_signature' | 'stale_timestamp' | 'replayed_nonce';

export interface BindVerifyResult {
  ok: boolean;
  reason: BindVerifyReason;
}

export function verifyNasBind(
  secret: string,
  p: NasBindPayload,
  signature: string,
  opts: { windowSeconds: number; nowMs?: number; consumeNonce: (nonce: string) => boolean },
): BindVerifyResult {
  const expected = signNasBind(secret, p);
  if (!safeEqualHex(expected, signature.toLowerCase())) {
    return { ok: false, reason: 'bad_signature' };
  }
  const nowSeconds = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - p.ts) > opts.windowSeconds) {
    return { ok: false, reason: 'stale_timestamp' };
  }
  if (!opts.consumeNonce(p.nonce)) {
    return { ok: false, reason: 'replayed_nonce' };
  }
  return { ok: true, reason: 'ok' };
}

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

// ------------------------------------------------------------ bind_token (JWT)
function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** Token de corta vida que liga gateway|mac|ip y evita aceptar MAC/IP del cuerpo. */
export async function issueBindToken(
  secret: string,
  claims: BindClaims,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT({ gid: claims.gid, mac: claims.mac.toLowerCase(), ip: claims.ip })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey(secret));
}

export async function verifyBindToken(secret: string, token: string): Promise<BindClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret));
    const gid = payload['gid'];
    const mac = payload['mac'];
    const ip = payload['ip'];
    if (typeof gid !== 'string' || typeof mac !== 'string' || typeof ip !== 'string') return null;
    return { gid, mac, ip };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- API keys / nonces
export function hashApiKey(pepper: string, apiKey: string): string {
  return createHash('sha256').update(`${pepper}:${apiKey}`).digest('hex');
}

export function generateApiKey(): { apiKey: string; prefix: string; hashWith: (pepper: string) => string } {
  const apiKey = `sfh_${randomBytes(24).toString('base64url')}`;
  return {
    apiKey,
    prefix: apiKey.slice(0, 12),
    hashWith: (pepper: string) => hashApiKey(pepper, apiKey),
  };
}

/** Nonces anti-replay en memoria (en producción: almacén compartido, H2-28). */
export class NonceStore {
  private readonly seen = new Map<string, number>();
  constructor(private readonly ttlMs = 5 * 60_000) {}

  /** Devuelve false si el nonce ya fue usado (replay). */
  consume(nonce: string, nowMs = Date.now()): boolean {
    this.prune(nowMs);
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, nowMs + this.ttlMs);
    return true;
  }

  private prune(nowMs: number): void {
    for (const [k, exp] of this.seen) {
      if (exp <= nowMs) this.seen.delete(k);
    }
  }
}
