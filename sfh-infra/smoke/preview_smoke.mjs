// Smoke E2E real del preview: Cloud Run (API) ↔ Cloud SQL + canal NAS→portal.
// Se ejecuta en Cloud Build, que adjunta el token de identidad del build SA
// (IAM invoker sobre el servicio). No hay secretos hardcodeados: llegan por
// Secret Manager en env (API_KEY, HMAC_RAW).
import { createHmac, randomUUID } from 'node:crypto';

const API_URL = (process.env.API_URL || '').replace(/\/+$/, '');
const PORTAL_URL = (process.env.PORTAL_URL || '').replace(/\/+$/, '');
const API_KEY = (process.env.API_KEY || '').trim();
const HMAC_RAW = (process.env.HMAC_RAW || '').trim();

if (!API_URL || !PORTAL_URL || !API_KEY || !HMAC_RAW) {
  console.error('faltan API_URL / PORTAL_URL / API_KEY / HMAC_RAW');
  process.exit(2);
}

const eq = HMAC_RAW.indexOf('=');
const gid = HMAC_RAW.slice(0, eq);
const gatewaySecret = HMAC_RAW.slice(eq + 1);

async function idToken(audience) {
  const url =
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=' +
    encodeURIComponent(audience);
  const res = await fetch(url, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!res.ok) throw new Error(`metadata identity ${res.status}`);
  return (await res.text()).trim();
}

const token = await idToken(API_URL);
const portalToken = await idToken(PORTAL_URL);
const results = [];
let failed = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
}

async function req(path, init = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'x-serverless-authorization': `Bearer ${token}`, ...(init.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
}

// 1. liveness — reintenta para absorber el cold start (min-instances=0).
//    Nota: `/healthz` queda interceptado por el GFE de Cloud Run (404), por eso
//    el alias externo verificable es `/health`.
let healthz = null;
let attempts = 0;
for (let i = 0; i < 12; i++) {
  attempts = i + 1;
  healthz = await req('/health');
  if (healthz.status === 200 && healthz.body?.ok === true) break;
  await new Promise((r) => setTimeout(r, 3000));
}
record(
  'health (/health)',
  healthz.status === 200 && healthz.body?.ok === true,
  `status=${healthz.status} intentos=${attempts} body=${String(healthz.text).slice(0, 160).replace(/\n/g, ' ')}`,
);

// 2. readyz con API key (real DB round-trip)
{
  const r = await req('/readyz', { headers: { 'x-api-key': API_KEY } });
  record('readyz (DB)', r.status === 200 && r.body?.db === true, `status=${r.status} body=${JSON.stringify(r.body)}`);
}

// 3. canal NAS→API firmado (HMAC) con MAC/IP observados por el gateway
const mac = 'aa:bb:cc:00:00:01';
const ip = '10.20.0.101';
const ts = Math.floor(Date.now() / 1000);
const nonce = randomUUID();
const signature = createHmac('sha256', gatewaySecret)
  .update(`${gid}|${mac}|${ip}|${ts}|${nonce}`)
  .digest('hex');
let bindToken = null;
{
  const r = await req('/v1/internal/hotspot/bind', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-gateway-id': gid,
      'x-gateway-signature': signature,
    },
    body: JSON.stringify({ mac, ip, ts, nonce }),
  });
  bindToken = r.body?.bind_token ?? null;
  record('bind HMAC', r.status === 200 && typeof bindToken === 'string', `status=${r.status}`);
}

// 4. firma inválida → 403 (borde de identidad, V2-01)
{
  const bad = await req('/v1/internal/hotspot/bind', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-gateway-id': gid,
      'x-gateway-signature': '00'.repeat(32),
    },
    body: JSON.stringify({ mac, ip, ts, nonce: randomUUID() }),
  });
  record('bind firma inválida → 403', bad.status === 403, `status=${bad.status}`);
}

// 5. portal session (aviso previo) persistiendo en Cloud SQL
let sessionId = null;
if (bindToken) {
  const r = await req('/v1/portal/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bindToken}` },
    body: JSON.stringify({ notice_version: 'v1', notice_accepted_at: new Date().toISOString() }),
  });
  sessionId = r.body?.session_id ?? null;
  record('portal session (DB write)', r.status === 200 && typeof sessionId === 'string', `status=${r.status}`);
} else {
  record('portal session (DB write)', false, 'sin bind_token');
}

// 6. separación portal_sessions ↔ hotspot_sessions: un id de portal todavía no
//    es una sesión de acceso; el endpoint debe responder 404 session_not_found.
if (sessionId) {
  const r = await req(`/v1/session/${sessionId}`);
  record(
    'aislamiento portal/hotspot (404 esperado)',
    r.status === 404 && r.body?.error === 'session_not_found',
    `status=${r.status} body=${JSON.stringify(r.body)}`,
  );
}

// 7. portal Next.js servido en Cloud Run (disclaimer visible)
{
  const res = await fetch(PORTAL_URL + '/', {
    headers: { 'x-serverless-authorization': `Bearer ${portalToken}` },
  });
  const html = await res.text();
  record(
    'portal HTML + disclaimer',
    res.status === 200 && html.includes('Aviso legal') && html.includes('SFhostpot'),
    `status=${res.status} bytes=${html.length}`,
  );
}

console.log(JSON.stringify({ api: API_URL, portal: PORTAL_URL, passed: results.length - failed, failed, results }, null, 2));
process.exit(failed === 0 ? 0 : 1);
