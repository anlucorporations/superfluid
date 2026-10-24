import { MikrotikRestAdapter, type MikrotikConfig } from './mikrotik.js';
import { RadiusGatewayAdapter, type RadiusConfig } from './radius.js';
import { ResilientGateway } from './fallback.js';
import { MockGatewayAdapter } from './mock.js';
import type { GatewayAdapter, GatewayVendor } from './types.js';

export interface GatewayRuntimeConfig {
  id: string;
  vendor: GatewayVendor;
  mikrotik?: MikrotikConfig;
  radius?: RadiusConfig;
  /** Si el gateway soporta ambos transports, se usan con fallback (D24). */
  fallbackVendor?: GatewayVendor;
}

/**
 * Construye el registro de adaptadores a partir de la configuración runtime
 * (en producción, derivada de `gateways` + Secret Manager; en dev, de env JSON).
 */
export function createAdapterRegistry(
  configs: GatewayRuntimeConfig[],
): (gatewayId: string) => GatewayAdapter {
  const cache = new Map<string, GatewayAdapter>();
  const byId = new Map(configs.map((c) => [c.id, c]));

  return (gatewayId: string) => {
    const cached = cache.get(gatewayId);
    if (cached) return cached;
    const cfg = byId.get(gatewayId);
    const adapter = cfg ? buildAdapter(cfg) : new MockGatewayAdapter();
    cache.set(gatewayId, adapter);
    return adapter;
  };
}

function buildAdapter(cfg: GatewayRuntimeConfig): GatewayAdapter {
  const radius = cfg.radius ? new RadiusGatewayAdapter(cfg.radius) : null;
  const mikrotik = cfg.mikrotik ? new MikrotikRestAdapter(cfg.mikrotik) : null;

  const primaryVendor = cfg.vendor;
  const primary =
    primaryVendor === 'radius' && radius
      ? radius
      : primaryVendor === 'mikrotik_rest' && mikrotik
        ? mikrotik
        : null;

  if (!primary) return new MockGatewayAdapter();

  const secondary =
    cfg.fallbackVendor === 'radius' && radius && primary !== radius
      ? radius
      : cfg.fallbackVendor === 'mikrotik_rest' && mikrotik && primary !== mikrotik
        ? mikrotik
        : null;

  return secondary ? new ResilientGateway(primary, secondary) : primary;
}

/** Parsea `GATEWAY_RUNTIME_CONFIGS` (JSON) de entorno. */
export function parseGatewayRuntimeConfigs(raw: string): GatewayRuntimeConfig[] {
  if (!raw.trim()) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('GATEWAY_RUNTIME_CONFIGS debe ser un array JSON');
  return parsed as GatewayRuntimeConfig[];
}
