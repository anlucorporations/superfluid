/** Lógica pura del portal (testeable sin navegador ni cadena). */

export const MIN_OPENING_SECONDS = 3600; // D54: apertura = 1 h de tarifa

export function minOpeningBalanceWei(rateWei: bigint): bigint {
  return rateWei * BigInt(MIN_OPENING_SECONDS);
}

export type StreamReason =
  | 'ok'
  | 'invalid_rate'
  | 'rate_below_tariff'
  | 'insufficient_balance'
  | 'invalid_receiver';

export interface StreamCheckInput {
  rateWei: bigint;
  tariffWei: bigint;
  balanceWei: bigint;
  receiver: string;
  payoutWallet: string;
}

/** Valida el alta de stream: tarifa y saldo mínimo de 1 h (D54/RF-05). */
export function validateStream(input: StreamCheckInput): { ok: boolean; reason: StreamReason } {
  if (input.rateWei <= 0n) return { ok: false, reason: 'invalid_rate' };
  if (!input.receiver || !/^0x[0-9a-fA-F]{40}$/.test(input.receiver)) {
    return { ok: false, reason: 'invalid_receiver' };
  }
  if (input.receiver.toLowerCase() !== input.payoutWallet.toLowerCase()) {
    return { ok: false, reason: 'invalid_receiver' };
  }
  if (input.rateWei < input.tariffWei) return { ok: false, reason: 'rate_below_tariff' };
  if (input.balanceWei < minOpeningBalanceWei(input.rateWei)) {
    return { ok: false, reason: 'insufficient_balance' };
  }
  return { ok: true, reason: 'ok' };
}

/** Formatea wei a string decimal recortando decimales. */
export function formatToken(wei: bigint, decimals = 18, maxFraction = 4): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  let fracStr = frac.toString().padStart(decimals, '0').slice(0, maxFraction).replace(/0+$/, '');
  if (!fracStr) fracStr = '0';
  return `${negative ? '-' : ''}${whole.toString()}.${fracStr}`;
}

/** Parsea un decimal del usuario a wei (sin coma flotante). */
export function parseToken(input: string, decimals = 18): bigint {
  const clean = input.trim().replace(',', '.');
  if (!/^\d*(\.\d*)?$/.test(clean) || clean === '' || clean === '.') return 0n;
  const [whole = '0', frac = ''] = clean.split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
}

/** Formatea segundos como `1 h 02 min 05 s`. */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0 s';
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} h`);
  if (m > 0) parts.push(`${String(m).padStart(2, '0')} min`);
  parts.push(`${String(sec).padStart(2, '0')} s`);
  return parts.join(' ');
}

export function remainingSeconds(untilIso: string | null | undefined, nowMs = Date.now()): number | null {
  if (!untilIso) return null;
  const until = Date.parse(untilIso);
  if (Number.isNaN(until)) return null;
  return Math.max(0, Math.floor((until - nowMs) / 1000));
}

/** QoS del equipo hijo (RF-26). */
export function childBandwidth(
  downBps: number,
  upBps: number,
  percent: number,
): { downBps: number; upBps: number } {
  if (percent < 1 || percent > 100) throw new Error('bandwidth_percent inválido');
  return {
    downBps: Math.floor((downBps * percent) / 100),
    upBps: Math.floor((upBps * percent) / 100),
  };
}

/** Mensaje SIWE-like ligado a la sesión del portal (D45/CU-01). */
export function buildSiweMessage(args: {
  domain: string;
  sessionId: string;
  wallet: string;
  issuedAt: string;
}): string {
  return [
    `${args.domain} quiere vincular tu wallet a la sesión WiFi.`,
    '',
    `Wallet: ${args.wallet}`,
    `Session: ${args.sessionId}`,
    `Issued At: ${args.issuedAt}`,
    '',
    'Firmar este mensaje no envía ninguna transacción.',
  ].join('\n');
}

export interface PortalChecklistInput {
  hasBindToken: boolean;
  noticeAccepted: boolean;
  sessionId: string | null;
  walletConnected: boolean;
  bindingId: string | null;
  wrappedBalanceWei: bigint;
}

export interface PortalChecklist {
  canSign: boolean;
  canWrap: boolean;
  canStream: boolean;
}

/** Orden determinista de pasos del portal (CU-01 → CU-02 → CU-03). */
export function portalChecklist(input: PortalChecklistInput): PortalChecklist {
  const canSign = input.hasBindToken && input.noticeAccepted && input.sessionId !== null && input.walletConnected;
  const canWrap = canSign && input.bindingId !== null;
  const canStream = canWrap && input.wrappedBalanceWei > 0n;
  return { canSign, canWrap, canStream };
}
