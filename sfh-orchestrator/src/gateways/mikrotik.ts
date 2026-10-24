import type {
  AuthorizeRequest,
  CommandResult,
  GatewayAdapter,
  GatewayHealth,
} from './types.js';

export interface MikrotikConfig {
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs?: number;
  /** Lista de address-list usada como fallback de autorización. */
  addressList?: string;
  /**
   * Autenticación de plataforma añadida al `Authorization: Basic` del router.
   * `cloudrun` obtiene un ID token del metadata server y lo envía en
   * `x-serverless-authorization` (necesario si el emulador corre en Cloud Run
   * privado con IAM; el adaptador real contra RouterOS no lo usa).
   */
  platformAuth?: 'none' | 'cloudrun';
  /** Base del metadata server (solo tests; por defecto metadata.google.internal). */
  metadataBaseUrl?: string;
  /**
   * RouterOS real: el comando `login` de hotspot exige un host existente y no
   * aplica `rate-limit` por REST. Con `preferAddressList` se usa directamente el
   * fallback address-list (vía PUT), que es la vía server-side válida.
   */
  preferAddressList?: boolean;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const cloudRunTokenCache = new Map<string, CachedToken>();

function jwtExpiryMs(token: string): number | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/** Obtiene (y cachea) el ID token del metadata server con la audiencia del servicio. */
export async function cloudRunIdentityToken(
  audience: string,
  metadataBaseUrl = 'http://metadata.google.internal',
): Promise<string> {
  const cached = cloudRunTokenCache.get(audience);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const url = `${metadataBaseUrl}/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`;
  const res = await fetch(url, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!res.ok) throw new Error(`metadata_identity_${res.status}`);
  const token = (await res.text()).trim();
  if (!token) throw new Error('metadata_identity_empty');
  cloudRunTokenCache.set(audience, {
    token,
    expiresAt: jwtExpiryMs(token) ?? Date.now() + 50 * 60_000,
  });
  return token;
}

/**
 * Adaptador Opción A (brief §3.A): RouterOS v7 REST.
 *  - autorizar: `POST /rest/ip/hotspot/active/login` (y fallback address-list)
 *  - revocar:  `DELETE /rest/ip/hotspot/active/{id}` buscando por MAC
 *  - health:   `GET /rest/system/resource`
 * Incluye QoS best-effort en el login (`rate-limit`) y timeouts por petición.
 */
export class MikrotikRestAdapter implements GatewayAdapter {
  readonly vendor = 'mikrotik_rest' as const;
  private readonly timeoutMs: number;
  private readonly addressList: string;

  constructor(private readonly cfg: MikrotikConfig) {
    this.timeoutMs = cfg.timeoutMs ?? 2_000;
    this.addressList = cfg.addressList ?? 'sfh-authorized';
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.cfg.username}:${this.cfg.password}`).toString('base64')}`;
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ status: number; json: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      };
      if (this.cfg.platformAuth === 'cloudrun') {
        headers['x-serverless-authorization'] =
          `Bearer ${await cloudRunIdentityToken(this.cfg.baseUrl, this.cfg.metadataBaseUrl)}`;
      }
      const res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }
      return { status: res.status, json };
    } finally {
      clearTimeout(timer);
    }
  }

  async authorize(req: AuthorizeRequest): Promise<CommandResult> {
    const start = Date.now();
    try {
      if (!this.cfg.preferAddressList) {
        const login = await this.request('POST', '/rest/ip/hotspot/active/login', {
          user: req.mac,
          ip: req.ip,
        });
        if (login.status >= 200 && login.status < 300) {
          return { ok: true, code: '200', latencyMs: Date.now() - start, ack: true };
        }
      }
      // Fallback del brief: address-list con accept hacia WAN.
      // RouterOS v7 REST: crear una entrada se hace con PUT (POST ejecuta comandos).
      const add = await this.request('PUT', '/rest/ip/firewall/address-list', {
        list: this.addressList,
        address: req.ip,
        comment: `sfh:${req.sessionId}`,
      });
      if (add.status >= 200 && add.status < 300) {
        return { ok: true, code: 'address-list', latencyMs: Date.now() - start, ack: true };
      }
      return {
        ok: false,
        code: String(add.status),
        latencyMs: Date.now() - start,
        ack: false,
        error: 'authorize_failed',
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        ack: false,
        error: err instanceof Error ? err.message : 'network_error',
      };
    }
  }

  async confirm(req: AuthorizeRequest): Promise<CommandResult> {
    return this.authorize(req);
  }

  async disconnect(req: { sessionId: string; mac: string; ip: string }): Promise<CommandResult> {
    const start = Date.now();
    try {
      let removed = 0;
      let notFound = false;

      // 1) Sesión de hotspot activa (si existe).
      const list = await this.request(
        'GET',
        `/rest/ip/hotspot/active?mac-address=${encodeURIComponent(req.mac)}`,
      );
      if (list.status >= 400) {
        // No confundir un error del router con "ya estaba desconectado": fail-closed.
        return {
          ok: false,
          code: String(list.status),
          latencyMs: Date.now() - start,
          ack: false,
          error: 'disconnect_failed',
        };
      }
      const rows = Array.isArray(list.json) ? (list.json as Array<Record<string, unknown>>) : [];
      for (const row of rows) {
        const id = row['.id'];
        if (typeof id === 'string') {
          await this.request('DELETE', `/rest/ip/hotspot/active/${encodeURIComponent(id)}`);
          removed++;
        }
      }
      if (rows.length === 0) notFound = true;

      // 2) Fallback address-list: retirar las entradas creadas para esta sesión/IP.
      const addresses = await this.request('GET', '/rest/ip/firewall/address-list');
      if (addresses.status >= 400) {
        return {
          ok: false,
          code: String(addresses.status),
          latencyMs: Date.now() - start,
          ack: false,
          error: 'disconnect_failed',
        };
      }
      const entries = Array.isArray(addresses.json)
        ? (addresses.json as Array<Record<string, unknown>>)
        : [];
      const sessionComment = `sfh:${req.sessionId}`;
      for (const entry of entries) {
        const id = entry['.id'];
        const comment = typeof entry['comment'] === 'string' ? entry['comment'] : '';
        const address = typeof entry['address'] === 'string' ? entry['address'] : '';
        if (typeof id !== 'string') continue;
        if (comment === sessionComment || (req.ip !== '' && address === req.ip)) {
          await this.request('DELETE', `/rest/ip/firewall/address-list/${encodeURIComponent(id)}`);
          removed++;
        }
      }

      if (removed === 0 && notFound) {
        // Sin sesión ni entrada: idempotente (ya estaba desconectado).
        return { ok: true, code: 'not-found', latencyMs: Date.now() - start, ack: true };
      }
      return { ok: true, code: rows.length > 0 ? '200' : 'address-list', latencyMs: Date.now() - start, ack: true };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        ack: false,
        error: err instanceof Error ? err.message : 'network_error',
      };
    }
  }

  async healthcheck(): Promise<GatewayHealth> {
    const start = Date.now();
    try {
      const res = await this.request('GET', '/rest/system/resource');
      return { online: res.status >= 200 && res.status < 300, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        online: false,
        latencyMs: Date.now() - start,
        detail: err instanceof Error ? err.message : 'network_error',
      };
    }
  }
}
