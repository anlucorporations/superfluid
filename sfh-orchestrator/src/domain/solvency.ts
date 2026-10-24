import type { FlowStatus } from './types.js';

/**
 * Predicado de solvencia H-01/D43: una sesión `wallet_stream` es solvente si y solo si
 *   1) el flow on-chain está `active`,
 *   2) su `flowRate` cubre la tarifa, y
 *   3) `virtualBalanceOf(sender) > 0`.
 * La garantía (buffer) es de 1 h = `rate × 3600` y se exige al abrir el flow (D54).
 */
export type SolvencyReason =
  | 'ok'
  | 'flow_not_active'
  | 'rate_below_tariff'
  | 'insufficient_balance';

export interface SolvencyInput {
  status: FlowStatus | string;
  flowRateWei: bigint;
  tariffWei: bigint;
  virtualBalanceWei: bigint;
}

export interface SolvencyVerdict {
  solvent: boolean;
  reason: SolvencyReason;
}

export function evaluateSolvency(input: SolvencyInput): SolvencyVerdict {
  if (input.status !== 'active') {
    return { solvent: false, reason: 'flow_not_active' };
  }
  if (input.flowRateWei < input.tariffWei) {
    return { solvent: false, reason: 'rate_below_tariff' };
  }
  if (input.virtualBalanceWei <= 0n) {
    return { solvent: false, reason: 'insufficient_balance' };
  }
  return { solvent: true, reason: 'ok' };
}

/**
 * Un hijo (`voucher_child`) no tiene flow propio: su solvencia es la de la sesión padre
 * viva y solvente (D34). Pausar/cerrar el padre revoca a los hijos (D22).
 */
export function evaluateChildSolvency(parent: SolvencyInput): SolvencyVerdict {
  return evaluateSolvency(parent);
}

/** Garantía mínima de apertura (D54): exactamente 1 h de tarifa. */
export function openingCollateralWei(flowRateWei: bigint): bigint {
  return flowRateWei * 3600n;
}
