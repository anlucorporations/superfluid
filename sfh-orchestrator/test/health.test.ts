import { describe, expect, it } from 'vitest';
import type { Db } from '../src/db.js';
import type { ChainClient } from '../src/chain.js';
import { runHealthOnce } from '../src/jobs/health.js';
import { MockGatewayAdapter } from '../src/gateways/mock.js';

interface Recorded {
  text: string;
  params?: unknown[];
}

class FakeDb implements Db {
  readonly calls: Recorded[] = [];
  constructor(private readonly session: Record<string, unknown> | null) {}
  async query<T>(text: string, params?: unknown[]): Promise<T[]> {
    this.calls.push({ text, params });
    const t = text.replace(/\s+/g, ' ');
    if (/select id, gateway_id, access_mode/.test(t)) {
      return (this.session ? [this.session] : []) as unknown as T[];
    }
    return [] as T[];
  }
  async withTx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    return fn(this);
  }
  find(pattern: RegExp): Recorded[] {
    return this.calls.filter((c) => pattern.test(c.text.replace(/\s+/g, ' ')));
  }
}

const SESSION = {
  id: '11111111-1111-1111-1111-111111111111',
  gateway_id: '22222222-2222-2222-2222-222222222222',
  access_mode: 'wallet_stream',
  parent_hotspot_session_id: null,
  sender_wallet: '0x' + '33'.repeat(20),
  receiver_wallet: '0x' + '44'.repeat(20),
  flow_rate_wei_s: '500000000000000',
  min_rate_required_wei: '500000000000000',
  status: 'active',
};

function chain(behavior: 'throw' | 'insolvent' | 'solvent'): ChainClient {
  return {
    blockNumber: async () => 100,
    getFlow: async () => {
      if (behavior === 'throw') throw new Error('RPC caído');
      if (behavior === 'insolvent') {
        return { flowRateWei: 0n, status: 'active' as const, virtualBalanceWei: 0n };
      }
      return { flowRateWei: 500_000_000_000_000n, status: 'active' as const, virtualBalanceWei: 10n ** 18n };
    },
    getTransactionObservation: async () => null,
    getLogs: async () => [],
  };
}

describe('health-check bajo caos (H5, RNF-19/20)', () => {
  it('RPC caído no revoca ni rompe el ciclo (ciclo incompleto)', async () => {
    const db = new FakeDb(SESSION);
    const out = await runHealthOnce({ db, chain: chain('throw'), adapterFor: () => new MockGatewayAdapter() });
    expect(out).toEqual({ checked: 0, actions: 0 });
    expect(db.find(/status='revoking'|status=\$2/)).toHaveLength(0);
  });

  it('insolvencia → registra muestra y revoca con ACK', async () => {
    const db = new FakeDb(SESSION);
    const out = await runHealthOnce({ db, chain: chain('insolvent'), adapterFor: () => new MockGatewayAdapter() });
    expect(out.actions).toBe(1);
    expect(db.find(/insert into session_health_checks/)).toHaveLength(1);
    expect(db.find(/status='revoking'/)).toHaveLength(1);
    const final = db.find(/update hotspot_sessions set status=\$2/);
    expect(final).toHaveLength(1);
    expect(final[0]?.params?.[1]).toBe('revoked');
  });

  it('sesión solvente no genera acciones', async () => {
    const db = new FakeDb(SESSION);
    const out = await runHealthOnce({ db, chain: chain('solvent'), adapterFor: () => new MockGatewayAdapter() });
    expect(out).toEqual({ checked: 1, actions: 0 });
  });
});
