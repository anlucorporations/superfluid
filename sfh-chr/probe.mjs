// Fase D — validación del adaptador MikroTik contra RouterOS REAL (CHR).
// Ejecuta la matriz de fidelidad del contrato REST y las operaciones del
// adaptador (authorize/disconnect/health) contra un CHR accesible por URL.
//
// Uso:
//   cd sfh-orchestrator && npm run build && cd ..
//   CHR_URL=http://127.0.0.1:8080 CHR_USER=admin CHR_PASS=sfh-lab node sfh-chr/probe.mjs
import { MikrotikRestAdapter } from '../sfh-orchestrator/dist/gateways/mikrotik.js';

const cfg = {
  url: (process.env.CHR_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, ''),
  user: process.env.CHR_USER ?? 'admin',
  pass: process.env.CHR_PASS ?? 'sfh-lab',
  list: process.env.CHR_LIST ?? 'sfh-authorized',
};
const basic = `Basic ${Buffer.from(`${cfg.user}:${cfg.pass}`).toString('base64')}`;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}
async function rest(method, pathname, body) {
  const res = await fetch(`${cfg.url}${pathname}`, {
    method,
    headers: { authorization: basic, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function cleanup() {
  const list = await rest('GET', '/rest/ip/firewall/address-list');
  const entries = Array.isArray(list.body) ? list.body : [];
  let removed = 0;
  for (const e of entries) {
    const comment = typeof e.comment === 'string' ? e.comment : '';
    if (comment.startsWith('sfh:') && typeof e['.id'] === 'string') {
      await rest('DELETE', `/rest/ip/firewall/address-list/${encodeURIComponent(e['.id'])}`);
      removed++;
    }
  }
  console.log(`INFO  limpieza address-list sfh:*  removed=${removed}`);
}

async function rawMatrix() {
  const resource = await rest('GET', '/rest/system/resource');
  check('GET /rest/system/resource (health)', resource.status === 200 && resource.body?.platform === 'MikroTik', `status=${resource.status} version=${resource.body?.version ?? '?'}`);

  const active = await rest('GET', '/rest/ip/hotspot/active');
  check('GET /rest/ip/hotspot/active', active.status === 200 && Array.isArray(active.body), `status=${active.status}`);

  const filtered = await rest('GET', '/rest/ip/hotspot/active?mac-address=02:00:00:00:00:01');
  check('GET active?mac-address (sintaxis de filtro)', filtered.status === 200, `status=${filtered.status}`);

  const login = await rest('POST', '/rest/ip/hotspot/active/login', { user: '02:00:00:00:00:01', ip: '10.20.9.50' });
  check('POST hotspot/active/login reconoce la ruta (falla sin host)', login.status >= 400, `status=${login.status} detail=${JSON.stringify(login.body?.detail ?? login.body)}`);

  const put = await rest('PUT', '/rest/ip/firewall/address-list', { list: cfg.list, address: '10.20.9.10', comment: 'sfh:fase-d-raw' });
  check('PUT /rest/ip/firewall/address-list (crear)', put.status === 201 && typeof put.body?.['.id'] === 'string', `status=${put.status} id=${put.body?.['.id']}`);

  const list1 = await rest('GET', '/rest/ip/firewall/address-list');
  const created = Array.isArray(list1.body) ? list1.body.find((e) => e.address === '10.20.9.10') : null;
  check('GET address-list contiene la entrada', Boolean(created), `entries=${Array.isArray(list1.body) ? list1.body.length : '?'}`);

  const post = await rest('POST', '/rest/ip/firewall/address-list', { list: cfg.list, address: '10.20.9.11', comment: 'sfh:fase-d-post' });
  check('POST address-list NO crea (RouterOS real usa PUT)', post.status >= 400, `status=${post.status} detail=${JSON.stringify(post.body?.detail ?? post.body)}`);

  if (created) {
    const del = await rest('DELETE', `/rest/ip/firewall/address-list/${encodeURIComponent(created['.id'])}`);
    check('DELETE address-list/{id}', del.status === 204, `status=${del.status}`);
  }

  const badAuth = await fetch(`${cfg.url}/rest/system/resource`, { headers: { authorization: `Basic ${Buffer.from('admin:incorrecta').toString('base64')}` } });
  check('Basic auth incorrecta → 401', badAuth.status === 401, `status=${badAuth.status}`);
}

async function adapterMatrix() {
  const adapter = new MikrotikRestAdapter({
    baseUrl: cfg.url,
    username: cfg.user,
    password: cfg.pass,
    timeoutMs: 8000,
    addressList: cfg.list,
  });
  const health = await adapter.healthcheck();
  check('adapter.healthcheck online', health.online === true, `latency=${health.latencyMs}ms`);

  const req1 = { sessionId: 'fase-d-s1', mac: '02:00:00:00:d1:01', ip: '10.20.9.21', bandwidthDownBps: 25_000_000, bandwidthUpBps: 5_000_000 };
  const auth = await adapter.authorize(req1);
  check('adapter.authorize → fallback address-list', auth.ack === true && auth.code === 'address-list', `ack=${auth.ack} code=${auth.code} latency=${auth.latencyMs}ms`);

  const afterAuth = await rest('GET', '/rest/ip/firewall/address-list');
  const entry = Array.isArray(afterAuth.body) ? afterAuth.body.find((e) => e.address === req1.ip) : null;
  check('entrada address-list visible en RouterOS', Boolean(entry) && entry.comment === 'sfh:fase-d-s1', `comment=${entry?.comment ?? '—'}`);

  const disc = await adapter.disconnect({ sessionId: req1.sessionId, mac: req1.mac, ip: req1.ip });
  check('adapter.disconnect retira address-list', disc.ack === true, `ack=${disc.ack} code=${disc.code}`);
  const afterDisc = await rest('GET', '/rest/ip/firewall/address-list');
  const remains = Array.isArray(afterDisc.body) ? afterDisc.body.find((e) => e.address === req1.ip) : null;
  check('address-list vacía tras disconnect', !remains, `entries=${Array.isArray(afterDisc.body) ? afterDisc.body.length : '?'}`);

  const disc2 = await adapter.disconnect({ sessionId: req1.sessionId, mac: req1.mac, ip: req1.ip });
  check('disconnect idempotente', disc2.ack === true && disc2.code === 'not-found', `code=${disc2.code}`);

  // Variante preferAddressList: evita el POST login no soportado
  const prefer = new MikrotikRestAdapter({
    baseUrl: cfg.url, username: cfg.user, password: cfg.pass, timeoutMs: 8000,
    addressList: cfg.list, preferAddressList: true,
  });
  const reqP = { sessionId: 'fase-d-p1', mac: '02:00:00:00:d1:02', ip: '10.20.9.22', bandwidthDownBps: 1_000_000, bandwidthUpBps: 1_000_000 };
  const authP = await prefer.authorize(reqP);
  const discP = await prefer.disconnect({ sessionId: reqP.sessionId, mac: reqP.mac, ip: reqP.ip });
  check('preferAddressList (sin login no soportado)', authP.ack && authP.code === 'address-list' && discP.ack, `auth=${authP.code} latency=${authP.latencyMs}ms`);

  // Concurrencia: 10 autorizaciones + 10 revocaciones
  const many = Array.from({ length: 10 }, (_, i) => ({
    sessionId: `fase-d-c${i}`,
    mac: `02:00:00:00:c${i.toString(16).padStart(2, '0')}:01`,
    ip: `10.20.9.${30 + i}`,
    bandwidthDownBps: 1_000_000,
    bandwidthUpBps: 1_000_000,
  }));
  const auths = await Promise.all(many.map((r) => adapter.authorize(r)));
  check('10 autorizaciones concurrentes', auths.every((r) => r.ack), `acks=${auths.filter((r) => r.ack).length}/10`);
  const discs = await Promise.all(many.map((r) => adapter.disconnect({ sessionId: r.sessionId, mac: r.mac, ip: r.ip })));
  check('10 revocaciones concurrentes', discs.every((r) => r.ack), `acks=${discs.filter((r) => r.ack).length}/10`);
  const finalList = await rest('GET', '/rest/ip/firewall/address-list');
  check('sin entradas residuales', Array.isArray(finalList.body) && finalList.body.length === 0, `entries=${Array.isArray(finalList.body) ? finalList.body.length : '?'}`);
}

try {
  await cleanup();
  await rawMatrix();
  await adapterMatrix();
} catch (err) {
  check('ejecución', false, err instanceof Error ? err.message : String(err));
}
const failed = results.filter((r) => !r.ok).length;
console.log(JSON.stringify({ suite: 'sfh-chr/probe', chr: cfg.url, passed: results.length - failed, failed, results }, null, 2));
process.exit(failed === 0 ? 0 : 1);
