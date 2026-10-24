import type {
  AuthorizeRequest,
  CommandResult,
  GatewayAdapter,
  GatewayHealth,
} from './types.js';

export interface RetryPolicy {
  /** Número total de intentos por adaptador (>=1). */
  attempts: number;
  /** Retardos entre intentos; si se agotan se usa el último. */
  delaysMs: number[];
}

export const DEFAULT_RETRY: RetryPolicy = { attempts: 3, delaysMs: [1_000, 2_000, 4_000] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * D24/RNF-19: reintentos con backoff + jitter + fallback entre transports.
 * - 3 intentos con 1/2/4 s + jitter por adaptador.
 * - Si el primario no da ACK, prueba el secundario (CoA/PoD ↔ REST).
 * - `revoked` solo con ACK (el llamador decide a partir de `ack`).
 */
export class ResilientGateway implements GatewayAdapter {
  readonly vendor;

  constructor(
    private readonly primary: GatewayAdapter,
    private readonly secondary: GatewayAdapter | null = null,
    private readonly policy: RetryPolicy = DEFAULT_RETRY,
  ) {
    this.vendor = primary.vendor;
  }

  private async withRetries(
    fn: (a: GatewayAdapter) => Promise<CommandResult>,
  ): Promise<CommandResult> {
    const adapters = [this.primary, this.secondary].filter(Boolean) as GatewayAdapter[];
    let last: CommandResult = { ok: false, latencyMs: 0, ack: false, error: 'no_adapter' };
    for (const adapter of adapters) {
      for (let attempt = 0; attempt < this.policy.attempts; attempt++) {
        const res = await fn(adapter);
        if (res.ack) return res;
        last = res;
        if (attempt < this.policy.attempts - 1) {
          const base = this.policy.delaysMs[Math.min(attempt, this.policy.delaysMs.length - 1)] ?? 0;
          await sleep(base + Math.floor(Math.random() * 250));
        }
      }
    }
    return last;
  }

  authorize(req: AuthorizeRequest): Promise<CommandResult> {
    return this.withRetries((a) => a.authorize(req));
  }

  confirm(req: AuthorizeRequest): Promise<CommandResult> {
    return this.withRetries((a) => a.confirm(req));
  }

  disconnect(req: { sessionId: string; mac: string; ip: string; reason: string }): Promise<CommandResult> {
    return this.withRetries((a) => a.disconnect(req));
  }

  async healthcheck(): Promise<GatewayHealth> {
    const h = await this.primary.healthcheck();
    if (h.online) return h;
    if (this.secondary) return this.secondary.healthcheck();
    return h;
  }
}
