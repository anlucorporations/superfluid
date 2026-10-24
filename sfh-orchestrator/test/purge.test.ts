import { describe, expect, it } from 'vitest';
import type { Db } from '../src/db.js';
import { runPurgeOnce } from '../src/jobs/purge.js';
import { metrics, METRIC } from '../src/metrics.js';

class FakeDb implements Db {
  readonly calls: Array<{ text: string; params?: unknown[] }> = [];
  constructor(private readonly rows: unknown[] = []) {}
  async query<T>(text: string, params?: unknown[]): Promise<T[]> {
    this.calls.push({ text: text.replace(/\s+/g, ' '), params });
    return this.rows as T[];
  }
  async withTx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    return fn(this);
  }
  indexOf(pattern: RegExp): number {
    return this.calls.findIndex((c) => pattern.test(c.text));
  }
}

describe('purga RGPD (D52/RNF-12)', () => {
  it('ejecuta los 7 pasos y cuenta las filas', async () => {
    const db = new FakeDb([{ id: 'x' }]);
    const out = await runPurgeOnce({ db, piiRetentionDays: 30, batchSize: 1000 });
    expect(out).toEqual({
      flowEventsPseudonymized: 1,
      flowSubscriptionsDeleted: 1,
      accessCommandsScrubbed: 1,
      hotspotSessionsDeleted: 1,
      deviceBindingsDeleted: 1,
      portalSessionsDeleted: 1,
      auditLogDeleted: 1,
    });
    expect(db.calls.length).toBeGreaterThanOrEqual(8);
  });

  it('respeta el orden de FK RESTRICT: sesiones → bindings → portal_sessions', async () => {
    const db = new FakeDb([{ id: 'x' }]);
    await runPurgeOnce({ db });
    const hs = db.indexOf(/delete from hotspot_sessions/);
    const db_ = db.indexOf(/delete from device_bindings/);
    const ps = db.indexOf(/delete from portal_sessions/);
    expect(hs).toBeGreaterThan(-1);
    expect(hs).toBeLessThan(db_);
    expect(db_).toBeLessThan(ps);
  });

  it('usa lotes de 1000 y retención de 30 días', async () => {
    const db = new FakeDb([]);
    const out = await runPurgeOnce({ db });
    expect(out.flowEventsPseudonymized).toBe(0);
    const first = db.calls[0]?.text ?? '';
    expect(first).toContain("interval '30 days'");
    expect(first).toContain('limit 1000');
  });

  it('audit_log usa retención de 365 días', async () => {
    const db = new FakeDb([]);
    await runPurgeOnce({ db });
    const audit = db.calls.find((c) => /delete from audit_log/.test(c.text));
    expect(audit?.text).toContain("interval '365 days'");
  });
});

describe('métricas Prometheus (RNF-22)', () => {
  it('expone contadores con formato Prometheus', () => {
    metrics.inc(METRIC.bindRequests, { result: 'ok' });
    metrics.inc(METRIC.vouchersRedeemed);
    const text = metrics.render();
    expect(text).toContain('sfh_bind_requests_total{result="ok"}');
    expect(text).toContain('sfh_vouchers_redeemed_total 1');
    expect(text).toContain('# TYPE sfh_uptime_seconds gauge');
  });
});
