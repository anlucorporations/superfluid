import type { Db } from '../db.js';
import type { ChainClient } from '../chain.js';
import type { GatewayAdapter } from '../gateways/types.js';
import type { Config } from '../config.js';
import type { TaskQueue } from '../tasks.js';
import { validateProvisionalObservation } from '../domain/provisional.js';
import { evaluateSolvency, evaluateChildSolvency } from '../domain/solvency.js';

export interface AuthorizeJobDeps {
  db: Db;
  chain: ChainClient;
  adapterFor: (gatewayId: string) => GatewayAdapter;
  queue: TaskQueue;
  cfg: Config;
}

interface SessionRow {
  id: string;
  gateway_id: string;
  access_mode: 'wallet_stream' | 'voucher_child';
  parent_hotspot_session_id: string | null;
  mac_address: string;
  ip_address: string;
  wallet_address: string;
  sender_wallet: string;
  receiver_wallet: string;
  super_token_address: string;
  flow_rate_wei_s: string;
  min_rate_required_wei: string;
  status: string;
  tx_hash: string | null;
  bandwidth_percent: number;
  vendor: string;
}

/**
 * D44: valida la tx observada y autoriza en el gateway. Se ejecuta en el worker durable
 * (Cloud Tasks), no en la petición que devolvió 202.
 */
export async function validateAuthorize(deps: AuthorizeJobDeps, sessionId: string): Promise<{ status: string; reason?: string }> {
  const [s] = await deps.db.query<SessionRow>(
    `select hs.id, hs.gateway_id, hs.access_mode, hs.parent_hotspot_session_id, hs.mac_address::text as mac_address,
            hs.ip_address::text as ip_address, hs.wallet_address, hs.sender_wallet, hs.receiver_wallet,
            hs.super_token_address, hs.flow_rate_wei_s::text as flow_rate_wei_s,
            hs.min_rate_required_wei::text as min_rate_required_wei, hs.status, hs.tx_hash,
            hs.bandwidth_percent, g.vendor
       from hotspot_sessions hs join gateways g on g.id = hs.gateway_id
      where hs.id = $1`,
    [sessionId],
  );
  if (!s) return { status: 'missing' };
  if (s.status !== 'pending') return { status: s.status };

  const adapter = deps.adapterFor(s.gateway_id);

  // Hijo: no valida tx propia; hereda la del padre (D34).
  if (s.access_mode === 'voucher_child') {
    const ok = await parentAlive(deps, s.parent_hotspot_session_id);
    if (!ok) {
      await markFailed(deps, s.id, 'parent_not_alive');
      return { status: 'revoked', reason: 'parent_not_alive' };
    }
  } else {
    if (!s.tx_hash) {
      await markFailed(deps, s.id, 'missing_tx');
      return { status: 'failed', reason: 'missing_tx' };
    }
    const obs = await deps.chain.getTransactionObservation(s.tx_hash);
    if (!obs) {
      await markFailed(deps, s.id, 'tx_not_found');
      return { status: 'failed', reason: 'tx_not_found' };
    }
    const verdict = validateProvisionalObservation(obs, {
      wallet: s.sender_wallet,
      superToken: s.super_token_address,
      payoutWallet: s.receiver_wallet,
      tariffWei: BigInt(s.min_rate_required_wei),
    });
    if (!verdict.ok) {
      await markFailed(deps, s.id, verdict.reason);
      return { status: 'failed', reason: verdict.reason };
    }
  }

  const auth = await adapter.authorize({
    sessionId: s.id,
    mac: s.mac_address,
    ip: s.ip_address,
    bandwidthDownBps: 0,
    bandwidthUpBps: 0,
    bandwidthPercent: s.bandwidth_percent,
  });

  await deps.db.query(
    `insert into access_commands (hotspot_session_id, gateway_id, command_type, transport, idempotency_key,
        request_payload, response_payload, radius_code, status, attempts, latency_ms, completed_at)
     values ($1,$2,'authorize',$3,$4,$5,$6,$7,$8,1,$9,now())`,
    [
      s.id,
      s.gateway_id,
      adapter.vendor === 'radius' ? 'radius_access_accept' : adapter.vendor === 'mock' ? 'mock' : 'mikrotik_rest',
      `authorize:${s.id}`,
      JSON.stringify({ mac: s.mac_address, ip: s.ip_address }),
      JSON.stringify(auth),
      auth.code ?? null,
      auth.ack ? 'success' : 'failed',
      auth.latencyMs,
    ],
  );

  if (!auth.ack) {
    await deps.db.query(
      `update hotspot_sessions set status='failed', disconnect_reason=$2, updated_at=now() where id=$1`,
      [s.id, `authorize_${auth.error ?? 'no_ack'}`],
    );
    return { status: 'failed', reason: auth.error ?? 'no_ack' };
  }

  await deps.db.query(
    `update hotspot_sessions set status='provisional', authorized_at=now(),
        provisional_until=now() + ($2 || ' seconds')::interval, router_session_id=$3, updated_at=now()
      where id=$1`,
    [s.id, String(deps.cfg.PROVISIONAL_SECONDS), auth.routerSessionId ?? null],
  );

  await deps.queue.enqueue({
    queue: deps.cfg.CLOUD_TASKS_QUEUE_EXPIRY,
    url: `${deps.cfg.INTERNAL_BASE_URL}/v1/internal/jobs/provisional/expire`,
    payload: { sessionId: s.id },
    scheduleTime: new Date(Date.now() + deps.cfg.PROVISIONAL_SECONDS * 1000),
  });

  return { status: 'provisional' };
}

async function parentAlive(deps: AuthorizeJobDeps, parentId: string | null): Promise<boolean> {
  if (!parentId) return false;
  const [p] = await deps.db.query<{
    status: string;
    sender_wallet: string;
    receiver_wallet: string;
    min_rate_required_wei: string;
  }>(
    `select status, sender_wallet, receiver_wallet, min_rate_required_wei::text as min_rate_required_wei
       from hotspot_sessions where id=$1`,
    [parentId],
  );
  if (!p || !['active', 'provisional'].includes(p.status)) return false;
  const flow = await deps.chain.getFlow(p.sender_wallet, p.receiver_wallet);
  const verdict = evaluateSolvency({
    status: flow.status,
    flowRateWei: flow.flowRateWei,
    tariffWei: BigInt(p.min_rate_required_wei),
    virtualBalanceWei: flow.virtualBalanceWei,
  });
  return verdict.solvent;
}

/** Confirmación a N bloques: pasa a `active` (o revoca si no confirma). */
export async function confirmProvisional(deps: AuthorizeJobDeps, sessionId: string): Promise<{ status: string }> {
  const [s] = await deps.db.query<{ status: string; sender_wallet: string; receiver_wallet: string; min_rate_required_wei: string }>(
    `select status, sender_wallet, receiver_wallet, min_rate_required_wei::text as min_rate_required_wei
       from hotspot_sessions where id=$1`,
    [sessionId],
  );
  if (!s) return { status: 'missing' };
  if (s.status !== 'provisional') return { status: s.status };
  const flow = await deps.chain.getFlow(s.sender_wallet, s.receiver_wallet);
  const verdict = evaluateSolvency({
    status: flow.status,
    flowRateWei: flow.flowRateWei,
    tariffWei: BigInt(s.min_rate_required_wei),
    virtualBalanceWei: flow.virtualBalanceWei,
  });
  if (!verdict.solvent) {
    await deps.db.query(
      `update hotspot_sessions set status='revoked', disconnect_reason=$2, disconnected_at=now(), updated_at=now() where id=$1`,
      [sessionId, `confirm_${verdict.reason}`],
    );
    return { status: 'revoked' };
  }
  await deps.db.query(
    `update hotspot_sessions set status='active', confirmed_at=now(), updated_at=now() where id=$1`,
    [sessionId],
  );
  return { status: 'active' };
}

/** Expiración de la ventana provisional sin confirmación (D56). */
export async function expireProvisional(deps: AuthorizeJobDeps, sessionId: string): Promise<{ status: string }> {
  const [s] = await deps.db.query<{ status: string; confirmed_at: string | null }>(
    `select status, confirmed_at::text as confirmed_at from hotspot_sessions where id=$1`,
    [sessionId],
  );
  if (!s) return { status: 'missing' };
  if (s.status !== 'provisional' || s.confirmed_at) return { status: s.status };
  await deps.db.query(
    `update hotspot_sessions set status='revoked', disconnect_reason='provisional_expired', disconnected_at=now(), updated_at=now() where id=$1`,
    [sessionId],
  );
  return { status: 'revoked' };
}

async function markFailed(deps: AuthorizeJobDeps, sessionId: string, reason: string): Promise<void> {
  await deps.db.query(
    `update hotspot_sessions set status='failed', disconnect_reason=$2, updated_at=now() where id=$1`,
    [sessionId, reason],
  );
}
