// Escenario k6 A: canal NAS→API (bind HMAC) + portal session.
import http from 'k6/http';
import crypto from 'k6/crypto';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const API_URL = __ENV.API_URL;
const API_TOKEN = __ENV.API_TOKEN;
const GATEWAY_ID = __ENV.SFH_GATEWAY_ID;
const GATEWAY_SECRET = __ENV.SFH_GATEWAY_SECRET;

const bindLatency = new Trend('bind_latency_ms', true);
const portalLatency = new Trend('portal_latency_ms', true);
const failures = new Rate('flow_failures');

function hex(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i++) out.push(('0' + bytes.charCodeAt(i).toString(16)).slice(-2));
  return out.join('');
}
function sha256hex(s) {
  return crypto.sha256(s, 'hex');
}
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const options = {
  scenarios: {
    nas_portal: { executor: 'constant-vus', vus: Number(__ENV.VUS || 100), duration: __ENV.DURATION || '20s' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate==1'],
    http_req_duration: ['p(95)<1000'],
    bind_latency_ms: ['p(95)<1000'],
    portal_latency_ms: ['p(95)<1000'],
  },
};

const headers = { 'x-serverless-authorization': `Bearer ${API_TOKEN}`, 'content-type': 'application/json' };

export default function () {
  const hex2 = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  const mac = `02:00:00:9a:${hex2()}:${hex2()}`;
  const ip = `10.40.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
  const ts = Math.floor(Date.now() / 1000);
  const nonce = uuid();
  const signature = crypto.hmac('sha256', GATEWAY_SECRET, `${GATEWAY_ID}|${mac}|${ip}|${ts}|${nonce}`, 'hex');

  const t0 = Date.now();
  const bind = http.post(
    `${API_URL}/v1/internal/hotspot/bind`,
    JSON.stringify({ mac, ip, ts, nonce }),
    { headers: { ...headers, 'x-gateway-id': GATEWAY_ID, 'x-gateway-signature': signature }, tags: { flow: 'bind' } },
  );
  bindLatency.add(Date.now() - t0);
  const bindOk = check(bind, { 'bind 200 + token': (r) => r.status === 200 && typeof r.json('bind_token') === 'string' });
  failures.add(!bindOk);
  if (!bindOk) return;

  const bindToken = bind.json('bind_token');
  const t1 = Date.now();
  const ps = http.post(
    `${API_URL}/v1/portal/sessions`,
    JSON.stringify({ notice_version: 'v1', notice_accepted_at: new Date().toISOString() }),
    { headers: { ...headers, authorization: `Bearer ${bindToken}` }, tags: { flow: 'portal' } },
  );
  portalLatency.add(Date.now() - t1);
  const ok = check(ps, { 'portal session 200': (r) => r.status === 200 && r.json('session_id') });
  failures.add(!ok);
}
