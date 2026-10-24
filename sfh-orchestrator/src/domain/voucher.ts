import { createHash, randomInt } from 'node:crypto';

export type VoucherStatus = 'active' | 'redeemed' | 'expired' | 'revoked';

export interface VoucherState {
  status: VoucherStatus | string;
  validFrom: Date;
  validTo: Date;
  maxChildren: number;
  childrenUsed: number;
  /** El stream del padre debe seguir vivo y solvente (RF-25/D55). */
  parentAlive: boolean;
}

export type RedeemReason =
  | 'ok'
  | 'not_active'
  | 'not_yet_valid'
  | 'expired'
  | 'no_quota'
  | 'parent_not_alive'
  | 'device_already_live';

export interface RedeemInput {
  voucher: VoucherState;
  now?: Date;
  /** El mismo MAC ya tiene una redención viva de este voucher (índice parcial). */
  sameDeviceLive?: boolean;
}

/** RF-25/D55: decide si un hijo puede canjear el voucher en este instante. */
export function canRedeem(input: RedeemInput): { ok: boolean; reason: RedeemReason } {
  const now = input.now ?? new Date();
  const v = input.voucher;

  if (v.status !== 'active') return { ok: false, reason: 'not_active' };
  if (now < v.validFrom) return { ok: false, reason: 'not_yet_valid' };
  if (now >= v.validTo) return { ok: false, reason: 'expired' };
  if (!v.parentAlive) return { ok: false, reason: 'parent_not_alive' };
  if (input.sameDeviceLive === true) return { ok: false, reason: 'device_already_live' };
  if (v.childrenUsed >= v.maxChildren) return { ok: false, reason: 'no_quota' };

  return { ok: true, reason: 'ok' };
}

/** El cupo es por sesión viva: al desconectarse el hijo se libera (D55). */
export function childrenUsedAfterConnect(v: VoucherState): number {
  return Math.min(v.childrenUsed + 1, v.maxChildren);
}

export function childrenUsedAfterRelease(v: VoucherState): number {
  return Math.max(v.childrenUsed - 1, 0);
}

// Alfabeto Crockford Base32 sin caracteres ambiguos (P11/D18).
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Genera un código de 12 caracteres Crockford Base32. */
export function generateVoucherCode(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CROCKFORD[randomInt(0, CROCKFORD.length)];
  }
  return out;
}

/** El código nunca se almacena en claro: solo su SHA-256 (P11). */
export function hashVoucherCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}
