export type GatewayVendor = 'mikrotik_rest' | 'radius' | 'mock';

export interface AuthorizeRequest {
  sessionId: string;
  mac: string;
  ip: string;
  bandwidthDownBps: number;
  bandwidthUpBps: number;
  /** Solo sesiones hijas: límite relativo (50 % del padre). */
  bandwidthPercent?: number;
}

export interface CommandResult {
  ok: boolean;
  /** Código RADIUS o HTTP normalizado (Access-Accept, CoA-ACK, Disconnect-ACK, 200...). */
  code?: string;
  latencyMs: number;
  routerSessionId?: string;
  error?: string;
  /** Indica si el transporte devolvió ACK verificable (RNF-19). */
  ack: boolean;
}

export interface GatewayHealth {
  online: boolean;
  latencyMs: number;
  detail?: string;
}

/** Contrato común de adaptadores (D3): MikroTik REST, RADIUS CoA/PoD o mock. */
export interface GatewayAdapter {
  readonly vendor: GatewayVendor;
  authorize(req: AuthorizeRequest): Promise<CommandResult>;
  confirm(req: AuthorizeRequest): Promise<CommandResult>;
  disconnect(req: { sessionId: string; mac: string; ip: string; reason: string }): Promise<CommandResult>;
  healthcheck(): Promise<GatewayHealth>;
}
