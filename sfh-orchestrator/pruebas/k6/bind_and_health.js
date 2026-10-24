// H5 · Carga: 100 VUs contra el canal bind (HMAC) y /healthz del orquestador.
import http from 'k6/http';
import { check } from 'k6';
import crypto from 'k6/crypto';

export const options = {
  scenarios: {
    load: { executor: 'constant-vus', vus: 100, duration: '20s' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

const BASE = __ENV.BASE_URL || 'http://127.0.0.1:8080';
const GID = __ENV.GW_ID || 'g1';
const SECRET = __ENV.GW_SECRET || 'secret';
const MAC = '02:00:00:00:00:01';
const IP = '10.0.0.2';

export default function () {
  const ts = Math.floor(Date.now() / 1000);
  const nonce = `n-${__VU}-${__ITER}-${Date.now()}`;
  const msg = `${GID}|${MAC}|${IP}|${ts}|${nonce}`;
  const sig = crypto.hmac('sha256', SECRET, msg, 'hex');
  const res = http.post(`${BASE}/v1/internal/hotspot/bind`, JSON.stringify({ mac: MAC, ip: IP, ts, nonce }), {
    headers: {
      'Content-Type': 'application/json',
      'X-Gateway-Id': GID,
      'X-Gateway-Signature': sig,
    },
  });
  check(res, { 'bind 200': (r) => r.status === 200, 'token': (r) => !!r.json('bind_token') });
  const h = http.get(`${BASE}/healthz`);
  check(h, { 'health 200': (r) => r.status === 200 });
}
