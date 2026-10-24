import type {
  AuthorizeRequest,
  CommandResult,
  GatewayAdapter,
  GatewayHealth,
} from './types.js';

type Mode = 'ok' | 'timeout' | 'error';

/** Adaptador determinista para CI y demos (D16): permite forzar ACK/timeout/error. */
export class MockGatewayAdapter implements GatewayAdapter {
  readonly vendor = 'mock' as const;
  private readonly sessions = new Map<string, { mac: string; ip: string }>();
  private mode: Mode = 'ok';

  setMode(mode: Mode): void {
    this.mode = mode;
  }

  private result(start: number): CommandResult {
    const latencyMs = Date.now() - start;
    if (this.mode === 'timeout') {
      return { ok: false, latencyMs, error: 'timeout', ack: false };
    }
    if (this.mode === 'error') {
      return { ok: false, latencyMs, error: 'gateway_error', ack: false };
    }
    return { ok: true, code: 'ACK', latencyMs, ack: true };
  }

  async authorize(req: AuthorizeRequest): Promise<CommandResult> {
    const start = Date.now();
    if (this.mode === 'ok') this.sessions.set(req.sessionId, { mac: req.mac, ip: req.ip });
    return { ...this.result(start), routerSessionId: `mock-${req.sessionId}` };
  }

  async confirm(req: AuthorizeRequest): Promise<CommandResult> {
    return this.authorize(req);
  }

  async disconnect(req: { sessionId: string; mac: string; ip: string }): Promise<CommandResult> {
    const start = Date.now();
    if (this.mode === 'ok') this.sessions.delete(req.sessionId);
    return { ...this.result(start), code: 'Disconnect-ACK' };
  }

  async healthcheck(): Promise<GatewayHealth> {
    return { online: this.mode !== 'error', latencyMs: 1 };
  }

  get activeSessions(): Map<string, { mac: string; ip: string }> {
    return this.sessions;
  }
}
