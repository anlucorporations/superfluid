// Siembra N sesiones activas + sesiones en el emulador para la carga de gateway.
import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const env = (k, d = '') => (process.env[k] ?? d).trim();
const API_URL = env('API_URL').replace(/\/$/, '');
const SIM_URL = env('SFH_SIM_URL').replace(/\/$/, '');
const SIM_USER = env('SFH_SIM_USER', 'sfh');
const SIM_PASSWORD = env('SFH_SIM_PASSWORD', 'sfh-sim-password');
const SIM_ADMIN = env('SFH_SIM_ADMIN_TOKEN', 'sfh-sim-admin');
const GATEWAY_ID = env('SFH_GATEWAY_ID');
const COUNT = Number(env('K6_SEED_COUNT', '120'));
const PLATFORM = env('PLATFORM_AUTH', 'cloudrun');
const METADATA = env('METADATA_BASE_URL', 'http://metadata.google.internal');
const WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const SUPER_TOKEN = '0x6540b8f49168c6896d85f05b5ca8AdAaaEB65be0';
const MAC_PREFIX = '02:00:00:5b';

const cache = new Map();
async function token(audience) {
  if (PLATFORM !== 'cloudrun') return '';
  const hit = cache.get(audience);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const url = `${METADATA}/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`;
  const res = await fetch(url, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!res.ok) throw new Error(`metadata_${res.status}`);
  const t = (await res.text()).trim();
  let exp = Date.now() + 50 * 60_000;
  try {
    const p = JSON.parse(Buffer.from(t.split('.')[1] ?? '', 'base64url').toString('utf8'));
    if (typeof p.exp === 'number') exp = p.exp * 1000;
  } catch {}
  cache.set(audience, { token: t, exp });
  return t;
}
async function simHeaders() {
  const h = { 'content-type': 'application/json', authorization: `Basic ${Buffer.from(`${SIM_USER}:${SIM_PASSWORD}`).toString('base64')}` };
  if (PLATFORM === 'cloudrun') h['x-serverless-authorization'] = `Bearer ${await token(SIM_URL)}`;
  return h;
}
async function simPost(pathname, body) {
  const res = await fetch(`${SIM_URL}${pathname}`, { method: 'POST', headers: await simHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`sim ${pathname} ${res.status}`);
  return res.text();
}

const pool = new pg.Pool({ connectionString: env('DATABASE_URL'), max: 2, connectionTimeoutMillis: 15_000 });

async function main() {
  await pool.query(
    `insert into gateways (id, name, vendor, status, chain_id, super_token_address, mgmt_url)
     values ($1,'sfh-sim-gw','mikrotik_rest','online',81234,$2,$3)
     on conflict (id) do update set status='online', mgmt_url=excluded.mgmt_url, updated_at=now()`,
    [GATEWAY_ID, SUPER_TOKEN, SIM_URL],
  );
  await pool.query(`delete from hotspot_sessions where mac_address::text like $1`, [`${MAC_PREFIX}:%`]);
  await pool.query(`delete from device_bindings where mac_address::text like $1`, [`${MAC_PREFIX}:%`]);
  await pool.query(`delete from portal_sessions where mac_address::text like $1`, [`${MAC_PREFIX}:%`]);

  const ids = [];
  for (let i = 0; i < COUNT; i++) {
    const idx = i.toString(16).padStart(2, '0');
    const mac = `${MAC_PREFIX}:${idx}:01`;
    const ip = `10.41.${Math.floor(i / 250)}.${(i % 250) + 1}`;
    const portalId = randomUUID();
    const bindingId = randomUUID();
    const hotspotId = randomUUID();
    // receiver distinto por sesión: el índice uq_hotspot_sessions_active_flow
    // exige unicidad (super_token, sender, receiver) en sesiones vivas.
    const receiver = `0x${(i + 1).toString(16).padStart(40, '0')}`;
    await pool.query(
      `insert into portal_sessions (id, gateway_id, mac_address, ip_address, user_agent, notice_version,
          notice_accepted_at, wallet_address, session_token_hash, status, expires_at)
       values ($1,$2,$3,$4,'sfh-k6','v1', now(), $5, $6, 'bound', now() + interval '1 hour')`,
      [portalId, GATEWAY_ID, mac, ip, WALLET, randomUUID()],
    );
    await pool.query(
      `insert into device_bindings (id, portal_session_id, binding_type, wallet_address, mac_address, ip_address, binding_hash, status)
       values ($1,$2,'wallet',$3,$4,$5,$6,'active')`,
      [bindingId, portalId, WALLET, mac, ip, randomUUID()],
    );
    await pool.query(
      `insert into hotspot_sessions (id, portal_session_id, device_binding_id, gateway_id, access_mode,
          mac_address, ip_address, wallet_address, super_token_address, sender_wallet, receiver_wallet,
          flow_rate_wei_s, min_rate_required_wei, status, authorized_at)
       values ($1,$2,$3,$4,'wallet_stream',$5,$6,$7,$8,$7,$9,500000000000000,1,'active',now())`,
      [hotspotId, portalId, bindingId, GATEWAY_ID, mac, ip, WALLET, SUPER_TOKEN, receiver],
    );
    // sesión activa en el emulador (para que pause/disconnect tenga efecto real)
    await simPost('/rest/ip/hotspot/active/login', { user: mac, ip, 'rate-limit': '25000000/5000000' });
    ids.push(hotspotId);
  }
  await fs.mkdir(path.join(process.cwd(), 'k6'), { recursive: true });
  await fs.writeFile(path.join(process.cwd(), 'k6', 'sessions.json'), JSON.stringify(ids));
  // token para k6 (evita depender de curl en el entrypoint)
  const tokenFile = path.join('/tmp', 'sfh-k6-token');
  await fs.writeFile(tokenFile, await token(API_URL));
  console.log(JSON.stringify({ seeded: ids.length, tokenFile }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
