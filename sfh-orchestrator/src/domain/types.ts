/** Tipos de dominio compartidos por el orquestador. */

export type FlowStatus = 'active' | 'paused' | 'closed';

export type HotspotSessionStatus =
  | 'pending'
  | 'provisional'
  | 'active'
  | 'degraded'
  | 'revoking'
  | 'revoked'
  | 'closed'
  | 'expired'
  | 'failed';

export type AccessMode = 'wallet_stream' | 'voucher_child';

export interface BindClaims {
  /** id del gateway */
  gid: string;
  /** MAC observada por el NAS */
  mac: string;
  /** IP observada por el NAS */
  ip: string;
}

export interface NasBindPayload extends BindClaims {
  ts: number;
  nonce: string;
}

export interface TariffView {
  id: string;
  gatewayId: string;
  tokenAddress: string;
  payoutWallet: string;
  pricePerSecondWei: bigint;
  bandwidthDownBps: number;
  bandwidthUpBps: number;
  maxChildrenPerParent: number;
}

export interface FlowView {
  sender: string;
  receiver: string;
  flowRateWei: bigint;
  status: FlowStatus;
}
