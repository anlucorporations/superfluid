export type MemPoolMode = 'visible' | 'receipt';

/**
 * D56/V2-06: un ÚNICO oráculo por modo, usado tanto para conceder como para confirmar/revocar.
 *  - visible: `eth_getTransactionByHash` (tx pendiente en mempool)
 *  - receipt: `eth_getTransactionReceipt` (tx ya incluida)
 */
export function provisionalOracle(mode: MemPoolMode): string {
  return mode === 'visible' ? 'eth_getTransactionByHash' : 'eth_getTransactionReceipt';
}

export interface TxObservation {
  from: string;
  to: string;
  method: string;
  receiver: string;
  flowRateWei: bigint;
  /** nonce y saldo ejecutables según el nodo */
  executable: boolean;
}

export interface ProvisionalExpectation {
  wallet: string;
  superToken: string;
  payoutWallet: string;
  tariffWei: bigint;
  method?: string;
}

export type ProvisionalReason =
  | 'ok'
  | 'not_executable'
  | 'wrong_sender'
  | 'wrong_target'
  | 'wrong_method'
  | 'wrong_receiver'
  | 'rate_below_tariff';

/** RF-12/H-02: valida la observación de la tx antes de conceder acceso provisional. */
export function validateProvisionalObservation(
  obs: TxObservation,
  exp: ProvisionalExpectation,
): { ok: boolean; reason: ProvisionalReason } {
  if (!obs.executable) return { ok: false, reason: 'not_executable' };
  if (lower(obs.from) !== lower(exp.wallet)) return { ok: false, reason: 'wrong_sender' };
  if (lower(obs.to) !== lower(exp.superToken)) return { ok: false, reason: 'wrong_target' };
  if (obs.method !== (exp.method ?? 'createFlow')) return { ok: false, reason: 'wrong_method' };
  if (lower(obs.receiver) !== lower(exp.payoutWallet)) {
    return { ok: false, reason: 'wrong_receiver' };
  }
  if (obs.flowRateWei < exp.tariffWei) return { ok: false, reason: 'rate_below_tariff' };
  return { ok: true, reason: 'ok' };
}

/** Ventana provisional en segundos (D5/D44). */
export function provisionalUntil(nowMs: number, provisionalSeconds: number): Date {
  return new Date(nowMs + provisionalSeconds * 1000);
}

/** Debe revocarse si, al vencer la ventana, no hay confirmación a N bloques (D56). */
export function shouldExpireProvisional(provisionalUntilMs: number, nowMs: number, confirmed: boolean): boolean {
  return !confirmed && nowMs >= provisionalUntilMs;
}

function lower(s: string): string {
  return s.toLowerCase();
}
