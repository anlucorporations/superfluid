/**
 * Métricas Prometheus mínimas (RNF-22). Sin dependencias externas.
 * Expuestas en `/metrics` (protegido por API key) para el scraper.
 */
class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly startedAt = Date.now();

  inc(name: string, labels?: Record<string, string>, value = 1): void {
    const key = labels ? `${name}{${formatLabels(labels)}}` : name;
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  render(): string {
    const lines: string[] = [
      '# HELP sfh_uptime_seconds Tiempo desde el arranque del proceso',
      '# TYPE sfh_uptime_seconds gauge',
      `sfh_uptime_seconds ${((Date.now() - this.startedAt) / 1000).toFixed(0)}`,
    ];
    for (const [key, value] of [...this.counters.entries()].sort()) {
      const name = key.split('{')[0] ?? key;
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${key} ${value}`);
    }
    return `${lines.join('\n')}\n`;
  }
}

function formatLabels(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
    .join(',');
}

export const metrics = new MetricsRegistry();

export const METRIC = {
  bindRequests: 'sfh_bind_requests_total',
  portalSessions: 'sfh_portal_sessions_total',
  authorizeRequests: 'sfh_authorize_requests_total',
  vouchersCreated: 'sfh_vouchers_created_total',
  vouchersRedeemed: 'sfh_vouchers_redeemed_total',
  gatewayCommands: 'sfh_gateway_commands_total',
} as const;
