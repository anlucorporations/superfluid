import type { Db } from '../db.js';
import type { ChainClient } from '../chain.js';
import type { GatewayAdapter } from '../gateways/types.js';
import { evaluateChildSolvency, evaluateSolvency } from '../domain/solvency.js';

export interface HealthDeps {
  db: Db;
  chain: ChainClient;
  adapterFor: (gatewayId: string) => GatewayAdapter;
}

interface OpenSessionRow {
  id: string;
  gateway_id: string;
  access_mode: 'wallet_stream' | 'voucher_child';
  parent_hotspot_session_id: string | null;
  sender_wallet: string;
  receiver_wallet: string;
  flow_rate_wei_s: string;
  min_rate_required_wei: string;
  status: string;
}

/**
 * D43/RF-13: una pasada del health-check (Job de 1 min). Evalúa solvencia por sesión,
 * registra la muestra y revoca (o marca `degraded`) cuando deja de ser solvente.
 */
export async function runHealthOnce(deps: HealthDeps): Promise<{ checked: number; actions: number }> {
  const sessions = await deps.db.query<OpenSessionRow>(
    `select id, gateway_id, access_mode, parent_hotspot_session_id, sender_wallet, receiver_wallet,
            flow_rate_wei_s::text as flow_rate_wei_s, min_rate_required_wei::text as min_rate_required_wei, status
       from hotspot_sessions
      where status in ('active','provisional','degraded')
      order by created_at asc
      limit 500`,
  );

  let checked = 0;
  let actions = 0;

  for (const s of sessions) {
    const target =
      s.access_mode === 'voucher_child' && s.parent_hotspot_session_id
        ? await loadParent(deps, s.parent_hotspot_session_id)
        : s;
    if (!target) continue;

    let flow;
    try {
      flow = await deps.chain.getFlow(target.sender_wallet, target.receiver_wallet);
    } catch {
      continue; // RPC caído: ciclo incompleto (métrica), no se revoca por error de lectura
    }
    const verdict =
      s.access_mode === 'voucher_child'
        ? evaluateChildSolvency({
            status: flow.status,
            flowRateWei: flow.flowRateWei,
            tariffWei: BigInt(target.min_rate_required_wei),
            virtualBalanceWei: flow.virtualBalanceWei,
          })
        : evaluateSolvency({
            status: flow.status,
            flowRateWei: flow.flowRateWei,
            tariffWei: BigInt(target.min_rate_required_wei),
            virtualBalanceWei: flow.virtualBalanceWei,
          });

    checked++;
    await deps.db.query(
      `insert into session_health_checks (hotspot_session_id, flow_rate_wei_s, min_rate_required_wei,
          virtual_balance_wei, is_solvent, action, details)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        s.id,
        flow.flowRateWei.toString(),
        target.min_rate_required_wei,
        flow.virtualBalanceWei.toString(),
        verdict.solvent,
        verdict.solvent ? 'none' : 'disconnect',
        JSON.stringify({ reason: verdict.reason }),
      ],
    );
    await deps.db.query(`update hotspot_sessions set last_health_at=now(), updated_at=now() where id=$1`, [s.id]);

    if (!verdict.solvent && s.status === 'active') {
      actions++;
      const adapter = deps.adapterFor(s.gateway_id);
      await deps.db.query(
        `update hotspot_sessions set status='revoking', disconnect_reason=$2, updated_at=now() where id=$1`,
        [s.id, verdict.reason],
      );
      const res = await adapter.disconnect({
        sessionId: s.id,
        mac: '',
        ip: '',
        reason: verdict.reason,
      });
      await deps.db.query(
        `update hotspot_sessions set status=$2, disconnected_at=now(), updated_at=now() where id=$1`,
        [s.id, res.ack ? 'revoked' : 'degraded'],
      );
    }
  }

  return { checked, actions };
}

async function loadParent(deps: HealthDeps, parentId: string): Promise<OpenSessionRow | null> {
  const [p] = await deps.db.query<OpenSessionRow>(
    `select id, gateway_id, access_mode, parent_hotspot_session_id, sender_wallet, receiver_wallet,
            flow_rate_wei_s::text as flow_rate_wei_s, min_rate_required_wei::text as min_rate_required_wei, status
       from hotspot_sessions where id=$1`,
    [parentId],
  );
  return p ?? null;
}
