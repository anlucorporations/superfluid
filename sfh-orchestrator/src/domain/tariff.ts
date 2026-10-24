import type { TariffView } from './types.js';

export type FlowTargetReason =
  | 'ok'
  | 'invalid_receiver'
  | 'token_mismatch'
  | 'payout_mismatch'
  | 'rate_below_tariff';

export interface FlowTargetInput {
  receiver: string;
  tokenAddress: string;
  requestedRateWei: bigint;
  tariff: TariffView;
  expectedToken: string;
}

/** RF-09: valida receptor, token, payout y tarifa de un flow propuesto. */
export function validateFlowTarget(input: FlowTargetInput): {
  ok: boolean;
  reason: FlowTargetReason;
} {
  if (!input.receiver || input.receiver === '0x0000000000000000000000000000000000000000') {
    return { ok: false, reason: 'invalid_receiver' };
  }
  if (lower(input.tokenAddress) !== lower(input.expectedToken)) {
    return { ok: false, reason: 'token_mismatch' };
  }
  if (lower(input.receiver) !== lower(input.tariff.payoutWallet)) {
    return { ok: false, reason: 'payout_mismatch' };
  }
  if (input.requestedRateWei < input.tariff.pricePerSecondWei) {
    return { ok: false, reason: 'rate_below_tariff' };
  }
  return { ok: true, reason: 'ok' };
}

/** QoS de un hijo: `bandwidth_percent` del plan base (RF-26/D55). */
export function childBandwidth(
  tariff: Pick<TariffView, 'bandwidthDownBps' | 'bandwidthUpBps'>,
  bandwidthPercent: number,
): { downBps: number; upBps: number } {
  if (bandwidthPercent < 1 || bandwidthPercent > 100) {
    throw new Error('bandwidth_percent fuera de rango (1..100)');
  }
  return {
    downBps: Math.floor((tariff.bandwidthDownBps * bandwidthPercent) / 100),
    upBps: Math.floor((tariff.bandwidthUpBps * bandwidthPercent) / 100),
  };
}

function lower(s: string): string {
  return s.toLowerCase();
}
