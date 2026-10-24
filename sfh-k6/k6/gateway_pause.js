// Escenario k6 B: comandos de gateway reales (pause → adaptador → emulador → BD).
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const API_URL = __ENV.API_URL;
const API_TOKEN = __ENV.API_TOKEN;
const SESSION_IDS = JSON.parse(open('./sessions.json'));

const ackLatency = new Trend('gateway_ack_ms', true);
const failures = new Rate('flow_failures');

export const options = {
  scenarios: {
    gateway_pause: { executor: 'per-vu-iterations', vus: Math.min(Number(__ENV.VUS || 100), SESSION_IDS.length), iterations: 1 },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate==1'],
    http_req_duration: ['p(95)<1000'],
    gateway_ack_ms: ['p(95)<500'],
  },
};

const headers = { 'x-serverless-authorization': `Bearer ${API_TOKEN}`, 'content-type': 'application/json' };

export default function () {
  const id = SESSION_IDS[(__VU - 1) % SESSION_IDS.length];
  const t0 = Date.now();
  const res = http.post(`${API_URL}/v1/session/pause`, JSON.stringify({ session_id: id }), { headers, tags: { flow: 'gateway_pause' } });
  ackLatency.add(Date.now() - t0);
  const ok = check(res, {
    'pause 200': (r) => r.status === 200,
    'estado revoked': (r) => r.status === 200 && r.json('status') === 'revoked',
  });
  failures.add(!ok);
}
