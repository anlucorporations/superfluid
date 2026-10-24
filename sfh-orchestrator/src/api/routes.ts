import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyMessage } from 'ethers';
import { z } from 'zod';
import type { Config } from '../config.js';
import { parseGatewaySecrets } from '../config.js';
import type { Db } from '../db.js';
import type { ChainClient } from '../chain.js';
import type { TaskQueue } from '../tasks.js';
import type { GatewayAdapter } from '../gateways/types.js';
import {
  NonceStore,
  generateApiKey,
  hashApiKey,
  issueBindToken,
  verifyBindToken,
  verifyNasBind,
} from '../domain/auth.js';
import { canRedeem, generateVoucherCode, hashVoucherCode } from '../domain/voucher.js';
import { validateAuthorize, expireProvisional } from '../jobs/authorize.js';
import { metrics, METRIC } from '../metrics.js';

export interface ApiDeps {
  cfg: Config;
  db: Db;
  queue: TaskQueue;
  chain: ChainClient;
  adapterFor: (gatewayId: string) => GatewayAdapter;
  now?: () => number;
  nonces?: NonceStore;
}

type Row = Record<string, unknown>;

function bad(reply: FastifyReply, code: number, error: string, detail?: string) {
  return reply.code(code).send({ error, detail });
}

function parse<T>(schema: z.ZodType<T>, data: unknown, reply: FastifyReply): T | null {
  const r = schema.safeParse(data);
  if (!r.success) {
    bad(reply, 400, 'invalid_body', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    return null;
  }
  return r.data;
}

export async function registerRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const secrets = parseGatewaySecrets(deps.cfg.GATEWAY_HMAC_SECRETS);
  const nonces = deps.nonces ?? new NonceStore();
  const now = deps.now ?? Date.now;

  async function requireApiKey(req: FastifyRequest, reply: FastifyReply): Promise<Row | null> {
    const key = req.headers['x-api-key'];
    if (typeof key !== 'string' || !key) {
      bad(reply, 401, 'missing_api_key');
      return null;
    }
    const hash = hashApiKey(deps.cfg.API_KEY_PEPPER, key);
    const [op] = await deps.db.query<Row>(
      `select id, role, api_key_scopes from operators
        where api_key_hash=$1 and api_key_revoked_at is null
          and (api_key_expires_at is null or api_key_expires_at > now())`,
      [hash],
    );
    if (!op) {
      bad(reply, 401, 'invalid_api_key');
      return null;
    }
    await deps.db.query(`update operators set api_key_last_used_at=now() where id=$1`, [op['id']]);
    return op;
  }

  function requireInternal(req: FastifyRequest, reply: FastifyReply): boolean {
    const secret = req.headers['x-internal-secret'];
    if (typeof secret !== 'string' || secret !== deps.cfg.INTERNAL_SECRET) {
      bad(reply, 403, 'forbidden');
      return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ salud
  // `/healthz` es interceptado por el frontend de Cloud Run (GFE responde 404
  // en *.run.app); se expone también `/health` como alias externo verificable.
  const liveness = async () => ({ ok: true, service: 'sfh-orchestrator' });
  app.get('/health', liveness);
  app.get('/healthz', liveness);
  app.get('/metrics', { preHandler: requireApiKey }, async (_req, reply) => {
    reply.type('text/plain; version=0.0.4');
    return metrics.render();
  });
  app.get('/readyz', { preHandler: requireApiKey }, async (_req, reply) => {
    try {
      await deps.db.query('select 1');
      return { ok: true, db: true };
    } catch {
      return bad(reply, 503, 'db_unavailable');
    }
  });

  // -------------------------------------------- canal autenticado NAS -> API
  const bindBody = z.object({
    mac: z.string().min(11),
    ip: z.string().min(7),
    ts: z.coerce.number().int(),
    nonce: z.string().min(8),
  });
  app.post('/v1/internal/hotspot/bind', async (req, reply) => {
    const gid = req.headers['x-gateway-id'];
    const sig = req.headers['x-gateway-signature'];
    if (typeof gid !== 'string' || typeof sig !== 'string') return bad(reply, 401, 'missing_signature');
    const body = parse(bindBody, req.body, reply);
    if (!body) return;
    const secret = secrets[gid];
    if (!secret) return bad(reply, 403, 'unknown_gateway');
    const verdict = verifyNasBind(
      secret,
      { gid, mac: body.mac, ip: body.ip, ts: body.ts, nonce: body.nonce },
      sig,
      { windowSeconds: deps.cfg.BIND_HMAC_WINDOW_SECONDS, nowMs: now(), consumeNonce: (n) => nonces.consume(n) },
    );
    if (!verdict.ok) { metrics.inc(METRIC.bindRequests, { result: verdict.reason }); return bad(reply, 403, verdict.reason); }
    metrics.inc(METRIC.bindRequests, { result: 'ok' });
    const token = await issueBindToken(deps.cfg.JWT_SECRET, { gid, mac: body.mac, ip: body.ip }, deps.cfg.BIND_TOKEN_TTL_SECONDS);
    return { bind_token: token, expires_in: deps.cfg.BIND_TOKEN_TTL_SECONDS };
  });

  // ------------------------------------------- portal session (con aviso previo)
  const portalBody = z.object({
    user_agent: z.string().max(512).optional(),
    notice_version: z.string().min(1),
    notice_accepted_at: z.string().min(10),
  });
  app.post('/v1/portal/sessions', async (req, reply) => {
    const auth = req.headers.authorization;
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return bad(reply, 401, 'missing_bind_token');
    const claims = await verifyBindToken(deps.cfg.JWT_SECRET, auth.slice(7));
    if (!claims) return bad(reply, 401, 'invalid_bind_token');
    const body = parse(portalBody, req.body, reply);
    if (!body) return;
    if (body.notice_version !== 'v1') return bad(reply, 409, 'privacy_notice_missing');
    const tokenHash = hashApiKey(deps.cfg.API_KEY_PEPPER, `${claims.gid}:${claims.mac}:${now()}`);
    const [row] = await deps.db.query<Row>(
      `insert into portal_sessions (gateway_id, mac_address, ip_address, user_agent, notice_version,
          notice_accepted_at, session_token_hash, expires_at)
       values ($1,$2,$3,$4,$5,$6,$7, now() + interval '15 minutes')
       returning id::text as id, expires_at::text as expires_at`,
      [claims.gid, claims.mac, claims.ip, body.user_agent ?? null, body.notice_version, body.notice_accepted_at, tokenHash],
    );
    metrics.inc(METRIC.portalSessions);
    return { session_id: row?.['id'], expires_at: row?.['expires_at'] };
  });

  // ------------------------------------------------- authorize (202 + Cloud Tasks)
  const authorizeBody = z.object({
    portal_session_id: z.string().uuid(),
    device_binding_id: z.string().uuid(),
    tx_hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    flow_rate_wei_s: z.string().regex(/^\d+$/),
  });
  app.post('/v1/session/authorize', async (req, reply) => {
    const body = parse(authorizeBody, req.body, reply);
    if (!body) return;
    const [ctx] = await deps.db.query<Row>(
      `select ps.gateway_id::text as gateway_id, g.super_token_address, gt.id::text as tariff_id,
              gt.price_per_second_wei::text as price, gt.payout_wallet
         from portal_sessions ps
         join gateways g on g.id = ps.gateway_id
         join lateral (
           select * from gateway_tariffs t
            where t.gateway_id = ps.gateway_id and t.active
            order by t.valid_from desc limit 1
         ) gt on true
        where ps.id = $1`,
      [body.portal_session_id],
    );
    if (!ctx) return bad(reply, 409, 'no_tariff_or_session');
    const [binding] = await deps.db.query<Row>(
      `select wallet_address, mac_address::text as mac, ip_address::text as ip
         from device_bindings where id=$1 and portal_session_id=$2 and status='active'`,
      [body.device_binding_id, body.portal_session_id],
    );
    if (!binding) return bad(reply, 409, 'binding_not_found');

    const rate = BigInt(body.flow_rate_wei_s);
    const price = BigInt(String(ctx['price']));
    if (rate < price) return bad(reply, 422, 'rate_below_tariff');

    const [row] = await deps.db.query<Row>(
      `insert into hotspot_sessions (portal_session_id, device_binding_id, gateway_id, tariff_id, access_mode,
          bandwidth_percent, mac_address, ip_address, wallet_address, super_token_address, sender_wallet,
          receiver_wallet, flow_rate_wei_s, min_rate_required_wei, status, tx_hash)
       values ($1,$2,$3,$4,'wallet_stream',100,$5,$6,$7,$8,$7,$9,$10,$10,'pending',$11)
       returning id::text as id`,
      [
        body.portal_session_id,
        body.device_binding_id,
        ctx['gateway_id'],
        ctx['tariff_id'],
        binding['mac'],
        binding['ip'],
        binding['wallet_address'],
        ctx['super_token_address'],
        ctx['payout_wallet'],
        body.flow_rate_wei_s,
        body.tx_hash,
      ],
    );
    const sessionId = String(row?.['id']);
    metrics.inc(METRIC.authorizeRequests);
    await deps.queue.enqueue({
      queue: deps.cfg.CLOUD_TASKS_QUEUE_AUTH,
      url: `${deps.cfg.INTERNAL_BASE_URL}/v1/internal/jobs/authorize/validate`,
      payload: { sessionId },
    });
    return reply.code(202).send({ session_id: sessionId, status: 'pending', oracle: deps.cfg.MEMPOOL_MODE });
  });

  // ----------------------------------------------------- sesión: consulta/pausa
  app.get('/v1/session/:id', async (req, reply) => {
    const id = (req.params as { id?: string }).id;
    const [row] = await deps.db.query<Row>(
      `select id::text as id, status, access_mode, mac_address::text as mac, ip_address::text as ip,
              wallet_address, flow_rate_wei_s::text as rate, min_rate_required_wei::text as min_rate,
              authorized_at::text as authorized_at, provisional_until::text as provisional_until,
              disconnect_reason
         from hotspot_sessions where id=$1`,
      [id],
    );
    if (!row) return bad(reply, 404, 'session_not_found');
    return row;
  });

  const sessionBody = z.object({ session_id: z.string().uuid() });
  app.post('/v1/session/pause', async (req, reply) => {
    const body = parse(sessionBody, req.body, reply);
    if (!body) return;
    const [row] = await deps.db.query<Row>(
      `select id::text as id, gateway_id::text as gateway_id, status,
              mac_address::text as mac, ip_address::text as ip
         from hotspot_sessions where id=$1`,
      [body.session_id],
    );
    if (!row) return bad(reply, 404, 'session_not_found');
    const adapter = deps.adapterFor(String(row['gateway_id']));
    await deps.db.query(`update hotspot_sessions set status='revoking', disconnect_reason='flow_paused', updated_at=now() where id=$1`, [body.session_id]);
    const res = await adapter.disconnect({
      sessionId: body.session_id,
      mac: String(row['mac'] ?? ''),
      ip: String(row['ip'] ?? ''),
      reason: 'flow_paused',
    });
    await deps.db.query(
      `update hotspot_sessions set status=$2, disconnected_at=now(), updated_at=now() where id=$1`,
      [body.session_id, res.ack ? 'revoked' : 'degraded'],
    );
    return { session_id: body.session_id, status: res.ack ? 'revoked' : 'degraded' };
  });

  app.post('/v1/session/resume', async (req, reply) => {
    const body = parse(sessionBody, req.body, reply);
    if (!body) return;
    await deps.db.query(`update hotspot_sessions set status='pending', disconnect_reason=null, updated_at=now() where id=$1`, [body.session_id]);
    await deps.queue.enqueue({
      queue: deps.cfg.CLOUD_TASKS_QUEUE_AUTH,
      url: `${deps.cfg.INTERNAL_BASE_URL}/v1/internal/jobs/authorize/validate`,
      payload: { sessionId: body.session_id },
    });
    return reply.code(202).send({ session_id: body.session_id, status: 'pending' });
  });

  // ----------------------------------------- binding wallet SIWE (CU-01/H4)
  const bindingBody = z.object({
    session_id: z.string().uuid(),
    wallet_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    message: z.string().min(10),
    signature: z.string().min(10),
  });
  app.post('/v1/portal/bindings', async (req, reply) => {
    const body = parse(bindingBody, req.body, reply);
    if (!body) return;
    let recovered: string;
    try {
      recovered = verifyMessage(body.message, body.signature);
    } catch {
      return bad(reply, 400, 'bad_signature');
    }
    if (recovered.toLowerCase() !== body.wallet_address.toLowerCase()) {
      return bad(reply, 401, 'bad_signature');
    }
    if (!body.message.includes(body.session_id)) {
      return bad(reply, 422, 'message_missing_session');
    }
    const [ps] = await deps.db.query<Row>(
      `select gateway_id::text as gateway_id, mac_address::text as mac, ip_address::text as ip
         from portal_sessions where id=$1 and status in ('pending','challenge_issued','wallet_linked','bound','consumed')`,
      [body.session_id],
    );
    if (!ps) return bad(reply, 409, 'portal_session_not_found');

    const bindingHash = createHash('sha256')
      .update(`${body.wallet_address.toLowerCase()}|${ps['mac']}|${ps['ip']}|${body.session_id}`)
      .digest('hex');
    try {
      const [row] = await deps.db.query<Row>(
        `insert into device_bindings (portal_session_id, binding_type, wallet_address, mac_address, ip_address, binding_hash)
         values ($1,'wallet',$2,$3,$4,$5) returning id::text as id`,
        [body.session_id, body.wallet_address, ps['mac'], ps['ip'], bindingHash],
      );
      await deps.db.query(
        `update portal_sessions set wallet_address=$2, status='bound', bound_at=now(), updated_at=now() where id=$1`,
        [body.session_id, body.wallet_address],
      );
      return reply.code(201).send({ binding_id: row?.['id'], wallet_address: body.wallet_address });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('uq_device_bindings_active_mac') || msg.includes('duplicate key')) {
        return bad(reply, 409, 'mac_conflict'); // D47: no se revoca el binding legítimo
      }
      throw err;
    }
  });

  // ------------------------------------------------------------------ vouchers
  const voucherCreate = z.object({
    parent_session_id: z.string().uuid(),
    max_children: z.number().int().min(1).max(10).optional(),
    bandwidth_percent: z.number().int().min(1).max(100).optional(),
  });
  app.post('/v1/vouchers', async (req, reply) => {
    const body = parse(voucherCreate, req.body, reply);
    if (!body) return;
    const [parent] = await deps.db.query<Row>(
      `select gateway_id::text as gateway_id, tariff_id::text as tariff_id
         from hotspot_sessions where id=$1 and status in ('active','provisional')`,
      [body.parent_session_id],
    );
    if (!parent) return bad(reply, 409, 'parent_not_active');
    const code = generateVoucherCode();
    const [row] = await deps.db.query<Row>(
      `insert into vouchers (code_hash, gateway_id, tariff_id, parent_hotspot_session_id,
          max_children, bandwidth_percent, valid_to)
       values ($1,$2,$3,$4,$5,$6, now() + interval '90 days')
       returning id::text as id, valid_to::text as valid_to`,
      [
        hashVoucherCode(code),
        parent['gateway_id'],
        parent['tariff_id'],
        body.parent_session_id,
        body.max_children ?? 2,
        body.bandwidth_percent ?? 50,
      ],
    );
    metrics.inc(METRIC.vouchersCreated);
    return reply.code(201).send({
      voucher_id: row?.['id'],
      code, // se muestra UNA sola vez; no se almacena en claro
      valid_to: row?.['valid_to'],
    });
  });

  const voucherRedeem = z.object({
    code: z.string().min(8),
    portal_session_id: z.string().uuid(),
    device_binding_id: z.string().uuid(),
    mac: z.string().min(11),
    ip: z.string().min(7),
  });
  app.post('/v1/vouchers/redeem', async (req, reply) => {
    const body = parse(voucherRedeem, req.body, reply);
    if (!body) return;
    const codeHash = hashVoucherCode(body.code);
    try {
      const result = await deps.db.withTx(async (tx) => {
        const [v] = await tx.query<Row>(
          `select v.id::text as id, v.status, v.valid_from::text as valid_from, v.valid_to::text as valid_to,
                  v.max_children, v.children_used, v.bandwidth_percent, v.parent_hotspot_session_id::text as parent_id,
                  hs.status as parent_status
             from vouchers v join hotspot_sessions hs on hs.id = v.parent_hotspot_session_id
            where v.code_hash=$1 for update of v`,
          [codeHash],
        );
        if (!v) throw new Error('voucher_not_found');
        const [live] = await tx.query<Row>(
          `select 1 from voucher_redemptions where voucher_id=$1 and mac_address=$2 and released_at is null`,
          [v['id'], body.mac],
        );
        const verdict = canRedeem({
          voucher: {
            status: String(v['status']),
            validFrom: new Date(String(v['valid_from'])),
            validTo: new Date(String(v['valid_to'])),
            maxChildren: Number(v['max_children']),
            childrenUsed: Number(v['children_used']),
            parentAlive: ['active', 'provisional'].includes(String(v['parent_status'])),
          },
          now: new Date(now()),
          sameDeviceLive: live !== undefined,
        });
        if (!verdict.ok) throw new Error(`redeem_${verdict.reason}`);

        const [p] = await tx.query<Row>(
          `select gateway_id::text as gateway_id, tariff_id::text as tariff_id, sender_wallet, receiver_wallet,
                  super_token_address, min_rate_required_wei::text as min_rate
             from hotspot_sessions where id=$1`,
          [v['parent_id']],
        );
        const [child] = await tx.query<Row>(
          `insert into hotspot_sessions (portal_session_id, device_binding_id, gateway_id, tariff_id, access_mode,
              parent_hotspot_session_id, voucher_id, bandwidth_percent, mac_address, ip_address, wallet_address,
              super_token_address, sender_wallet, receiver_wallet, flow_rate_wei_s, min_rate_required_wei, status)
           values ($1,$2,$3,$4,'voucher_child',$5,$6,$7,$8,$9,$10,$11,$12,$13,0,$14,'pending')
           returning id::text as id`,
          [
            body.portal_session_id,
            body.device_binding_id,
            p?.['gateway_id'],
            p?.['tariff_id'],
            v['parent_id'],
            v['id'],
            v['bandwidth_percent'],
            body.mac,
            body.ip,
            p?.['sender_wallet'],
            p?.['super_token_address'],
            p?.['sender_wallet'],
            p?.['receiver_wallet'],
            p?.['min_rate'],
          ],
        );
        await tx.query(
          `insert into voucher_redemptions (voucher_id, portal_session_id, hotspot_session_id, mac_address, ip_address)
           values ($1,$2,$3,$4,$5)`,
          [v['id'], body.portal_session_id, child?.['id'], body.mac, body.ip],
        );
        return { childId: String(child?.['id']), parentId: String(v['parent_id']) };
      });
      await deps.queue.enqueue({
        queue: deps.cfg.CLOUD_TASKS_QUEUE_AUTH,
        url: `${deps.cfg.INTERNAL_BASE_URL}/v1/internal/jobs/authorize/validate`,
        payload: { sessionId: result.childId },
      });
      metrics.inc(METRIC.vouchersRedeemed);
      return reply.code(201).send({ session_id: result.childId, status: 'pending' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'redeem_error';
      const known = ['voucher_not_found', 'redeem_no_quota', 'redeem_expired', 'redeem_parent_not_alive', 'redeem_device_already_live', 'redeem_not_active'];
      return bad(reply, known.includes(msg) ? 409 : 422, msg);
    }
  });

  // ------------------------------------------------------------------- admin
  const gatewayCreate = z.object({
    name: z.string().min(2),
    vendor: z.enum(['mikrotik_rest', 'radius', 'mock', 'generic']),
    chain_id: z.number().int().positive().default(81234),
    super_token_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    mgmt_url: z.string().url().optional(),
    radius_nas_ip: z.string().optional(),
  });
  app.post('/v1/admin/gateways', { preHandler: requireApiKey }, async (req, reply) => {
    const body = parse(gatewayCreate, req.body, reply);
    if (!body) return;
    const [row] = await deps.db.query<Row>(
      `insert into gateways (name, vendor, status, chain_id, super_token_address, mgmt_url, radius_nas_ip)
       values ($1,$2,'offline',$3,$4,$5,$6) returning id::text as id`,
      [body.name, body.vendor, body.chain_id, body.super_token_address, body.mgmt_url ?? null, body.radius_nas_ip ?? null],
    );
    return reply.code(201).send({ gateway_id: row?.['id'] });
  });

  const tariffCreate = z.object({
    gateway_id: z.string().uuid(),
    name: z.string().min(2),
    price_per_second_wei: z.string().regex(/^\d+$/),
    token_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    payout_wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    bandwidth_down_bps: z.number().int().positive().optional(),
    bandwidth_up_bps: z.number().int().positive().optional(),
    max_children_per_parent: z.number().int().min(1).max(50).optional(),
  });
  app.post('/v1/admin/tariffs', { preHandler: requireApiKey }, async (req, reply) => {
    const body = parse(tariffCreate, req.body, reply);
    if (!body) return;
    const [row] = await deps.db.query<Row>(
      `insert into gateway_tariffs (gateway_id, name, price_per_second_wei, token_address, payout_wallet,
          bandwidth_down_bps, bandwidth_up_bps, max_children_per_parent)
       values ($1,$2,$3,$4,$5, coalesce($6,50000000), coalesce($7,10000000), coalesce($8,5))
       returning id::text as id`,
      [
        body.gateway_id,
        body.name,
        body.price_per_second_wei,
        body.token_address,
        body.payout_wallet,
        body.bandwidth_down_bps ?? null,
        body.bandwidth_up_bps ?? null,
        body.max_children_per_parent ?? null,
      ],
    );
    return reply.code(201).send({ tariff_id: row?.['id'] });
  });

  const operatorCreate = z.object({
    username: z.string().min(2),
    email: z.string().email().optional(),
    role: z.enum(['admin', 'operator', 'readonly', 'auditor', 'dpo']),
  });
  app.post('/v1/admin/operators', { preHandler: requireApiKey }, async (req, reply) => {
    const body = parse(operatorCreate, req.body, reply);
    if (!body) return;
    const key = generateApiKey();
    const [row] = await deps.db.query<Row>(
      `insert into operators (username, email, password_hash, role, api_key_hash, api_key_prefix)
       values ($1,$2,'!', $3,$4,$5) returning id::text as id`,
      [body.username, body.email ?? null, body.role, key.hashWith(deps.cfg.API_KEY_PEPPER), key.prefix],
    );
    return reply.code(201).send({ operator_id: row?.['id'], api_key: key.apiKey, prefix: key.prefix, note: 'se muestra una sola vez' });
  });

  // ------------------------------------------------------- jobs internos (Tasks)
  const internalBody = z.object({ sessionId: z.string().uuid() });
  app.post('/v1/internal/jobs/authorize/validate', async (req, reply) => {
    if (!requireInternal(req, reply)) return;
    const body = parse(internalBody, req.body, reply);
    if (!body) return;
    const out = await validateAuthorize(
      { db: deps.db, chain: deps.chain, adapterFor: deps.adapterFor, queue: deps.queue, cfg: deps.cfg },
      body.sessionId,
    );
    return out;
  });

  app.post('/v1/internal/jobs/provisional/expire', async (req, reply) => {
    if (!requireInternal(req, reply)) return;
    const body = parse(internalBody, req.body, reply);
    if (!body) return;
    const out = await expireProvisional(
      { db: deps.db, chain: deps.chain, adapterFor: deps.adapterFor, queue: deps.queue, cfg: deps.cfg },
      body.sessionId,
    );
    return out;
  });
}
