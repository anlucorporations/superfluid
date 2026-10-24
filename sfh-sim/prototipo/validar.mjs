// Spike de validación de la propuesta: el emulador sfh-sim debe ser capaz de
// ejercitar el adaptador REAL de la plataforma (MikrotikRestAdapter) sin router.
//
// Uso:
//   cd sfh-orchestrator && npm run build
//   node sfh-sim/prototipo/validar.mjs
import { MikrotikRestAdapter } from '../../sfh-orchestrator/dist/gateways/mikrotik.js';
import { createRouterOsEmulator } from '../src/routeros-emulator.mjs';

const ADMIN = { 'x-admin-token': 'sfh-sim-admin' };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail: detail ?? '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
}

const emu = createRouterOsEmulator({ port: 0 });
const { url } = await emu.listen(0, '127.0.0.1');
const adapter = new MikrotikRestAdapter({
  baseUrl: url,
  username: 'sfh',
  password: 'sfh-sim-password',
  timeoutMs: 400,
});

async function admin(path, init = {}) {
  const res = await fetch(`${url}${path}`, { ...init, headers: { ...ADMIN, 'content-type': 'application/json' } });
  return res.json();
}
async function mode(m) {
  await admin('/__admin/mode', { method: 'POST', body: JSON.stringify({ mode: m, delayMs: 900 }) });
}
async function reset() {
  await admin('/__admin/reset', { method: 'POST' });
}
async function emuState() {
  return admin('/__admin/state');
}

const req = (sessionId, mac, ip) => ({
  sessionId,
  mac,
  ip,
  bandwidthDownBps: 25_000_000,
  bandwidthUpBps: 5_000_000,
});

try {
  // 1. healthcheck con emulador sano
  {
    const h = await adapter.healthcheck();
    check('healthcheck online', h.online === true, `latency=${h.latencyMs}ms`);
  }

  // 2. autorización (login hotspot) + estado reflejado
  {
    const r = await adapter.authorize(req('s1', '02:00:00:00:00:01', '10.20.0.11'));
    const st = await emuState();
    check('authorize login OK', r.ack === true && r.code === '200', `ack=${r.ack} code=${r.code}`);
    check('sesión visible en emulador', st.sessions.length === 1 && st.sessions[0]['mac-address'] === '02:00:00:00:00:01');
  }

  // 3. desconexión por MAC + idempotencia
  {
    const d = await adapter.disconnect({ sessionId: 's1', mac: '02:00:00:00:00:01', ip: '10.20.0.11' });
    const st = await emuState();
    const d2 = await adapter.disconnect({ sessionId: 's1', mac: '02:00:00:00:00:01', ip: '10.20.0.11' });
    check('disconnect ACK', d.ack === true, `code=${d.code}`);
    check('desconexión efectiva', st.sessions.length === 0);
    check('disconnect idempotente', d2.ack === true && d2.code === 'not-found', `code=${d2.code}`);
  }

  // 4. fallback address-list cuando el login falla (brief §3.A)
  {
    await reset();
    await mode('login-fail');
    const r = await adapter.authorize(req('s2', '02:00:00:00:00:02', '10.20.0.12'));
    const st = await emuState();
    check('fallback address-list', r.ack === true && r.code === 'address-list', `ack=${r.ack} code=${r.code}`);
    check('entrada en address-list', st.addressList.length === 1 && st.addressList[0].address === '10.20.0.12');
  }

  // 5. gateway caído (5xx en login y fallback) → fail-closed
  {
    await reset();
    await mode('error');
    const r = await adapter.authorize(req('s3', '02:00:00:00:00:03', '10.20.0.13'));
    check('error 5xx → ack=false', r.ok === false && r.ack === false, `error=${r.error}`);
  }

  // 6. timeout del gateway (el adaptador aborta y no da ACK)
  {
    await reset();
    await mode('timeout');
    const r = await adapter.authorize(req('s4', '02:00:00:00:00:04', '10.20.0.14'));
    check('timeout → ack=false', r.ok === false && r.ack === false, `error=${r.error}`);
  }

  // 7. concurrencia (k6-like) contra el emulador
  {
    await reset();
    const many = Array.from({ length: 10 }, (_, i) =>
      adapter.authorize(req(`c${i}`, `02:00:00:00:10:${String(i).padStart(2, '0')}`, `10.21.0.${i + 1}`)),
    );
    const out = await Promise.all(many);
    const st = await emuState();
    check('10 autorizaciones concurrentes', out.every((r) => r.ack) && st.sessions.length === 10, `sessions=${st.sessions.length}`);
  }

  // 8. healthcheck con emulador detenido → offline
  {
    await reset();
    await emu.close();
    const h = await adapter.healthcheck();
    check('healthcheck offline', h.online === false, `detail=${h.detail}`);
  }
} finally {
  try {
    await emu.close();
  } catch {
    /* ya cerrado */
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(JSON.stringify({ emulador: 'sfh-sim/routeros-emulator', passed: results.length - failed, failed, results }, null, 2));
process.exit(failed === 0 ? 0 : 1);
