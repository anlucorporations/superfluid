import type { Db } from '../db.js';

export interface PurgeDeps {
  db: Db;
  /** Retención de PII en días (D52: 30). */
  piiRetentionDays?: number;
  /** Retención de audit_log de seguridad en días (D52: 365). */
  auditRetentionDays?: number;
  /** Tamaño de lote (RB-35: 1000). */
  batchSize?: number;
}

export interface PurgeResult {
  flowEventsPseudonymized: number;
  flowSubscriptionsDeleted: number;
  accessCommandsScrubbed: number;
  hotspotSessionsDeleted: number;
  deviceBindingsDeleted: number;
  portalSessionsDeleted: number;
  auditLogDeleted: number;
}

/**
 * D52/RNF-12: purga diaria (03:00 UTC) en orden que respeta las FK RESTRICT:
 *  1) seudonimiza flow_events y elimina flow_subscriptions cerradas antiguas;
 *  2) limpia payloads de access_commands;
 *  3) borra hotspot_sessions → device_bindings → portal_sessions (en ese orden);
 *  4) rota audit_log (retención de seguridad 12 meses).
 * Lotes de `batchSize` (RB-35) para no bloquear la BD.
 */
export async function runPurgeOnce(deps: PurgeDeps): Promise<PurgeResult> {
  const piiDays = deps.piiRetentionDays ?? 30;
  const auditDays = deps.auditRetentionDays ?? 365;
  const batch = deps.batchSize ?? 1000;
  const cutoff = `now() - interval '${piiDays} days'`;
  const auditCutoff = `now() - interval '${auditDays} days'`;
  const out: PurgeResult = {
    flowEventsPseudonymized: 0,
    flowSubscriptionsDeleted: 0,
    accessCommandsScrubbed: 0,
    hotspotSessionsDeleted: 0,
    deviceBindingsDeleted: 0,
    portalSessionsDeleted: 0,
    auditLogDeleted: 0,
  };

  // 1) flow_events: seudonimizar wallet y payload
  const fe = await deps.db.query<{ id: string }>(
    `with lote as (
       select id from flow_events
        where observed_at < ${cutoff} and pseudonymized_at is null
        order by id limit ${batch} for update skip locked
     )
     update flow_events f set sender_wallet=null, receiver_wallet=null,
            payload='{"pseudonymized":true}'::jsonb, pseudonymized_at=now()
       from lote where f.id = lote.id
     returning f.id::text as id`,
  );
  out.flowEventsPseudonymized = fe.length;

  // 1b) flow_subscriptions cerradas antiguas: se eliminan (proyección, no histórico)
  const fs = await deps.db.query<{ id: string }>(
    `with lote as (
       select id from flow_subscriptions
        where status='closed' and last_update_timestamp < ${cutoff}
        order by last_update_timestamp limit ${batch} for update skip locked
     )
     delete from flow_subscriptions s using lote where s.id = lote.id
     returning s.id::text as id`,
  );
  out.flowSubscriptionsDeleted = fs.length;

  // 2) access_commands antiguos: borrar payloads (posible PII)
  const ac = await deps.db.query<{ id: string }>(
    `with lote as (
       select id from access_commands
        where created_at < ${cutoff}
          and (request_payload <> '{}'::jsonb or response_payload is not null)
        order by created_at limit ${batch} for update skip locked
     )
     update access_commands c set request_payload='{}'::jsonb, response_payload=null, error=null
       from lote where c.id = lote.id
     returning c.id::text as id`,
  );
  out.accessCommandsScrubbed = ac.length;

  // 3) sesiones hijas REDENCIÓN: liberar antes de borrar sesiones
  await deps.db.query(
    `update voucher_redemptions set released_at=coalesce(released_at, now())
      where hotspot_session_id in (
        select id from hotspot_sessions
         where status in ('revoked','closed','expired','failed') and updated_at < ${cutoff}
         limit ${batch}
      )`,
  );

  // 3a) hotspot_sessions terminales
  const hs = await deps.db.query<{ id: string }>(
    `with lote as (
       select id from hotspot_sessions
        where status in ('revoked','closed','expired','failed') and updated_at < ${cutoff}
        order by updated_at limit ${batch} for update skip locked
     )
     delete from hotspot_sessions s using lote where s.id = lote.id
     returning s.id::text as id`,
  );
  out.hotspotSessionsDeleted = hs.length;

  // 3b) device_bindings ya sin sesión
  const db_ = await deps.db.query<{ id: string }>(
    `with lote as (
       select b.id from device_bindings b
        where b.created_at < ${cutoff}
          and not exists (select 1 from hotspot_sessions s where s.device_binding_id = b.id)
        order by b.created_at limit ${batch} for update skip locked
     )
     delete from device_bindings b using lote where b.id = lote.id
     returning b.id::text as id`,
  );
  out.deviceBindingsDeleted = db_.length;

  // 3c) portal_sessions ya sin dependencias
  const ps = await deps.db.query<{ id: string }>(
    `with lote as (
       select p.id from portal_sessions p
        where p.created_at < ${cutoff}
          and not exists (select 1 from hotspot_sessions s where s.portal_session_id = p.id)
          and not exists (select 1 from device_bindings b where b.portal_session_id = p.id)
        order by p.created_at limit ${batch} for update skip locked
     )
     delete from portal_sessions p using lote where p.id = lote.id
     returning p.id::text as id`,
  );
  out.portalSessionsDeleted = ps.length;

  // 4) audit_log de seguridad: retención 12 meses
  const al = await deps.db.query<{ id: string }>(
    `with lote as (
       select id from audit_log where created_at < ${auditCutoff}
        order by created_at limit ${batch} for update skip locked
     )
     delete from audit_log a using lote where a.id = lote.id
     returning a.id::text as id`,
  );
  out.auditLogDeleted = al.length;

  return out;
}
