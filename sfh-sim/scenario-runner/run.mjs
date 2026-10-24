// scenario-runner — escenarios E2E del entorno MikroTik emulado contra la
// plataforma REAL: API → adaptador MikroTik → emulador → Cloud SQL.
//
// Uso local (docker compose overlay):
//   docker compose -f sfh-infra/docker-compose.yml -f sfh-infra/docker-compose.sim.yml \
//     --profile sim run --rm scenario-runner
//
// Uso cloud (Cloud Run Job): mismo script con DATABASE_URL/API_URL/SFH_SIM_URL y
// PLATFORM_AUTH=cloudrun (ID token del metadata server en x-serverless-authorization).
import pg from 'pg';
import { createHmac, randomUUID } from 'node:crypto';

const cfg = {
  apiUrl: (process.env.API_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, ''),
  databaseUrl: process.env.DATABASE_URL ?? '',
  simUrl: (process.env.SFH_SIM_URL ?? 'http://127.0.0.1:8728').replace(/\/$/, ''),
  simUser: (process.env.SFH_SIM_USER ?? 'sfh').trim(),
  simPassword: (process.env.SFH_SIM_PASSWORD ?? 'sfh-sim-password').trim(),
  simAdminToken: (process.env.SFH_SIM_ADMIN_TOKEN ?? 'sfh-sim-admin').trim(),
  gatewayId: process.env.SFH_GATEWAY_ID ?? '11111111-1111-4111-8111-111111111111',
  // admite el formato crudo o `gatewayId=secreto` (como el secreto sfhostpot-gateway-hmac)
  gatewaySecretRaw: (process.env.SFH_GATEWAY_SECRET ?? 'sfh-sim-gw-secret').trim(),
  platformAuth: process.env.PLATFORM_AUTH ?? 'none',
  metadataBaseUrl: process.env.METADATA_BASE_URL ?? 'http://metadata.google.internal',
  platformTimeoutMs: Number(process.env.PLATFORM_TIMEOUT_MS ?? 30_000),
};

const WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
cfg.gatewaySecret = cfg.gatewaySecretRaw.includes('=')
  ? cfg.gatewaySecretRaw.slice(cfg.gatewaySecretRaw.indexOf('=') + 1)
  : cfg.gatewaySecretRaw;
const SUPER_TOKEN = '0x6540b8f49168c6896d85f05b5ca8AdAaaEB65be0';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail: String(detail ?? '') });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
}

// ---------------------------------------------------------------- auth plataforma
const tokenCache = new Map();
async function identityToken(audience) {
  const cached = tokenCache.get(audience);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const url = `${cfg.metadataBaseUrl}/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`;
  const res = await fetch(url, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!res.ok) throw new Error(`metadata_identity_${res.status}`);
  const token = (await res.text()).trim();
  let exp = Date.now() + 50 * 60_000;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
    if (typeof payload.exp === 'number') exp = payload.exp * 1000;
  } catch {
    /* token opaco */
  }
  tokenCache.set(audience, { token, expiresAt: exp });
  return token;
}

async function platformHeaders(audience) {
  const headers = { 'content-type': 'application/json' };
  if (cfg.platformAuth === 'cloudrun') {
    headers['x-serverless-authorization'] = `Bearer ${await identityToken(audience)}`;
  }
  return headers;
}

async function apiReq(path, init = {}) {
  const headers = { ...(await platformHeaders(cfg.apiUrl)), ...(init.headers ?? {}) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.platformTimeoutMs);
  try {
    const res = await fetch(`${cfg.apiUrl}${path}`, { ...init, headers, signal: controller.signal });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- emulador
const basic = `Basic ${Buffer.from(`${cfg.simUser}:${cfg.simPassword}`).toString('base64')}`;
async function simReq(path, init = {}) {
  const res = await fetch(`${cfg.simUrl}${path}`, {
    ...init,
    headers: {
      ...(await platformHeaders(cfg.simUrl)),
      authorization: basic,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}
async function simAdmin(path, init = {}) {
  return simReq(path, { ...init, headers: { 'x-admin-token': cfg.simAdminToken, ...(init.headers ?? {}) } });
}
async function simMode(mode, delayMs) {
  return simAdmin('/__admin/mode', { method: 'POST', body: JSON.stringify({ mode, delayMs }) });
}
async function simState() {
  return (await simAdmin('/__admin/state')).body;
}

// ---------------------------------------------------------------- BD (siembra)
const pool = new pg.Pool({ connectionString: cfg.databaseUrl, max: 3, connectionTimeoutMillis: 15_000 });

async function seedGateway() {
  await pool.query(
    `insert into gateways (id, name, vendor, status, chain_id, super_token_address, mgmt_url)
     values ($1, 'sfh-sim-gw', 'mikrotik_rest', 'online', 81234, $2, $3)
     on conflict (id) do update
       set name=excluded.name, vendor=excluded.vendor, status='online',
           super_token_address=excluded.super_token_address, mgmt_url=excluded.mgmt_url, updated_at=now()`,
    [cfg.gatewayId, SUPER_TOKEN, cfg.simUrl],
  );
}

const SESSION_UUIDS = {
  portal: '22222222-2222-4222-8222-222222222222',
  binding: '33333333-3333-4333-8333-333333333333',
  hotspot: '44444444-4444-4444-8444-444444444441',
};

async function cleanupFixed() {
  await pool.query('delete from hotspot_sessions where id = any($1::uuid[])', [
    ['44444444-4444-4444-8444-444444444441', '44444444-4444-4444-8444-444444444442', '44444444-4444-4444-8444-444444444443'],
  ]);
  await pool.query('delete from device_bindings where id = any($1::uuid[])', [Object.values(SESSION_UUIDS).slice(1, 2)]);
  await pool.query('delete from portal_sessions where id = any($1::uuid[])', [[SESSION_UUIDS.portal]]);
}

/** Crea portal_session + binding + hotspot_session sembrados y activos. */
async function seedHotspotSession({ hotspotId = SESSION_UUIDS.hotspot, mac = '02:00:00:7a:00:01', ip = '10.20.0.11' } = {}) {
  await pool.query('delete from hotspot_sessions where id = any($1::uuid[])', [
    ['44444444-4444-4444-8444-444444444441', '44444444-4444-4444-8444-444444444442', '44444444-4444-4444-8444-444444444443'],
  ]);
  await pool.query('delete from device_bindings where id=$1 or mac_address=$2::macaddr', [SESSION_UUIDS.binding, mac]);
  await pool.query('delete from portal_sessions where id=$1', [SESSION_UUIDS.portal]);
  await pool.query(
    `insert into portal_sessions (id, gateway_id, mac_address, ip_address, user_agent, notice_version,
        notice_accepted_at, wallet_address, session_token_hash, status, expires_at)
     values ($1,$2,$3,$4,'sfh-sim','v1', now(), $5, $6, 'bound', now() + interval '15 minutes')`,
    [SESSION_UUIDS.portal, cfg.gatewayId, mac, ip, WALLET, randomUUID()],
  );
  await pool.query(
    `insert into device_bindings (id, portal_session_id, binding_type, wallet_address, mac_address, ip_address, binding_hash, status)
     values ($1,$2,'wallet',$3,$4,$5,$6,'active')`,
    [SESSION_UUIDS.binding, SESSION_UUIDS.portal, WALLET, mac, ip, randomUUID()],
  );
  await pool.query(
    `insert into hotspot_sessions (id, portal_session_id, device_binding_id, gateway_id, access_mode,
        mac_address, ip_address, wallet_address, super_token_address, sender_wallet, receiver_wallet,
        flow_rate_wei_s, min_rate_required_wei, status, authorized_at)
     values ($1,$2,$3,$4,'wallet_stream',$5,$6,$7,$8,$7,$9, 500000000000000, 1, 'active', now())`,
    [hotspotId, SESSION_UUIDS.portal, SESSION_UUIDS.binding, cfg.gatewayId, mac, ip, WALLET, SUPER_TOKEN, '0x000000000000000000000000000000000000dEaD'],
  );
  await pool.query(
    `insert into session_health_checks (hotspot_session_id, flow_rate_wei_s, min_rate_required_wei, virtual_balance_wei, is_solvent, action)
     values ($1, 500000000000000, 1, 1000000000000000, true, 'none')`,
    [hotspotId],
  );
}

async function dbSessionStatus(hotspotId) {
  const { rows } = await pool.query('select status::text as status from hotspot_sessions where id=$1', [hotspotId]);
  return rows[0]?.status ?? null;
}

// ---------------------------------------------------------------- HMAC NAS→API
function signNasBind(secret, { gid, mac, ip, ts, nonce }) {
  return createHmac('sha256', secret).update(`${gid}|${mac.toLowerCase()}|${ip}|${ts}|${nonce}`).digest('hex');
}

// ---------------------------------------------------------------- escenarios
async function run() {
  // 0. salud del emulador
  {
    const res = await fetch(`${cfg.simUrl}/health`, {
      headers: await platformHeaders(cfg.simUrl),
    });
    const body = await res.json().catch(() => ({}));
    check('emulador /health', res.ok && body.ok === true, `mode=${body.mode}`);
  }

  await simAdmin('/__admin/reset', { method: 'POST' });
  await seedGateway();
  await cleanupFixed();

  // 1. NAS→API: bind HMAC + portal session (CU-01, D45/V2-01)
  {
    const mac = '02:00:00:00:7a:01';
    const ip = '10.20.0.101';
    const ts = Math.floor(Date.now() / 1000);
    const nonce = randomUUID();
    const signature = signNasBind(cfg.gatewaySecret, { gid: cfg.gatewayId, mac, ip, ts, nonce });
    const bind = await apiReq('/v1/internal/hotspot/bind', {
      method: 'POST',
      headers: { 'x-gateway-id': cfg.gatewayId, 'x-gateway-signature': signature },
      body: JSON.stringify({ mac, ip, ts, nonce }),
    });
    const bindToken = bind.body?.bind_token;
    check('NAS bind HMAC', bind.status === 200 && typeof bindToken === 'string', `status=${bind.status}`);

    if (bindToken) {
      const ps = await apiReq('/v1/portal/sessions', {
        method: 'POST',
        headers: { authorization: `Bearer ${bindToken}` },
        body: JSON.stringify({ notice_version: 'v1', notice_accepted_at: new Date().toISOString() }),
      });
      const sessionId = ps.body?.session_id;
      check('portal session (BD)', ps.status === 200 && typeof sessionId === 'string', `status=${ps.status}`);
      if (sessionId) {
        const { rows } = await pool.query('select count(*)::int as n from portal_sessions where id=$1', [sessionId]);
        check('portal_session persistida', rows[0].n === 1);
      }
    } else {
      check('portal session (BD)', false, 'sin bind_token');
    }
  }

  // 2. pausa feliz: platform → adaptador → emulador → BD
  {
    const hotspotId = '44444444-4444-4444-8444-444444444441';
    await seedHotspotSession({ hotspotId, mac: '02:00:00:7a:00:01', ip: '10.20.0.11' });
    const login = await simReq('/rest/ip/hotspot/active/login', {
      method: 'POST',
      body: JSON.stringify({ user: '02:00:00:7a:00:01', ip: '10.20.0.11', 'rate-limit': '25000000/5000000' }),
    });
    const before = await simState();
    const pause = await apiReq('/v1/session/pause', { method: 'POST', body: JSON.stringify({ session_id: hotspotId }) });
    const after = await simState();
    const status = await dbSessionStatus(hotspotId);
    check('emulador con sesión activa', login.status === 200 && before.sessions.length === 1, `sessions=${before.sessions.length}`);
    check('pause → revoked', pause.status === 200 && pause.body?.status === 'revoked' && status === 'revoked', `api=${pause.body?.status} db=${status}`);
    check('disconnect elimina sesión del router', after.sessions.length === 0, `sessions=${after.sessions.length}`);
  }

  // 3. gateway con error 5xx → fail-closed (degraded)
  {
    const hotspotId = '44444444-4444-4444-8444-444444444442';
    await seedHotspotSession({ hotspotId, mac: '02:00:00:7a:00:02', ip: '10.20.0.12' });
    await simMode('error');
    const pause = await apiReq('/v1/session/pause', { method: 'POST', body: JSON.stringify({ session_id: hotspotId }) });
    const status = await dbSessionStatus(hotspotId);
    check('gateway 5xx → degraded', pause.status === 200 && pause.body?.status === 'degraded' && status === 'degraded', `api=${pause.body?.status} db=${status}`);
  }

  // 4. timeout del gateway → fail-closed (degraded)
  {
    const hotspotId = '44444444-4444-4444-8444-444444444443';
    await seedHotspotSession({ hotspotId, mac: '02:00:00:7a:00:03', ip: '10.20.0.13' });
    await simMode('timeout', 2500); // > timeout del adaptador (2 s)
    const start = Date.now();
    const pause = await apiReq('/v1/session/pause', { method: 'POST', body: JSON.stringify({ session_id: hotspotId }) });
    const elapsed = Date.now() - start;
    const status = await dbSessionStatus(hotspotId);
    check('gateway timeout → degraded', pause.status === 200 && pause.body?.status === 'degraded' && status === 'degraded', `api=${pause.body?.status} db=${status} elapsed=${elapsed}ms`);
  }

  await simAdmin('/__admin/reset', { method: 'POST' });
  const finalState = await simState();
  check('estado final limpio', finalState.mode === 'ok' && finalState.sessions.length === 0, `sessions=${finalState.sessions.length}`);
}

try {
  if (!cfg.databaseUrl) throw new Error('DATABASE_URL requerida');
  await run();
} catch (err) {
  check('ejecución', false, err instanceof Error ? err.message : String(err));
} finally {
  await pool.end().catch(() => {});
}

const failed = results.filter((r) => !r.ok).length;
console.log(
  JSON.stringify(
    {
      suite: 'sfh-sim/scenario-runner',
      platformAuth: cfg.platformAuth,
      api: cfg.apiUrl,
      sim: cfg.simUrl,
      passed: results.length - failed,
      failed,
      results,
    },
    null,
    2,
  ),
);
process.exit(failed === 0 ? 0 : 1);
