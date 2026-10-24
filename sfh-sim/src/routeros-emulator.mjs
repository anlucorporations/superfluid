// RouterOS v7 REST — emulador de contrato para SFhostpot (sfh-sim).
//
// Implementa el subconjunto que usa `MikrotikRestAdapter`:
//   POST   /rest/ip/hotspot/active/login        (autorizar; fallback si falla)
//   GET    /rest/ip/hotspot/active?mac-address= (buscar sesión por MAC)
//   DELETE /rest/ip/hotspot/active/{id}         (desconectar)
//   POST   /rest/ip/firewall/address-list       (fallback de autorización)
//   GET    /rest/system/resource                (healthcheck)
//
// Además expone un canal de administración para inyectar fallos (timeout,
// error 5xx, login fallido) y consultar el estado — solo para el entorno de
// pruebas. No es un emulador del firmware RouterOS: emula el CONTRATO que el
// adaptador de la plataforma consume (ver propuesta §4/§5).
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const DEFAULTS = {
  user: 'sfh',
  password: 'sfh-sim-password',
  adminToken: 'sfh-sim-admin',
  port: 8728,
  host: '127.0.0.1',
};

export function createRouterOsEmulator(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const state = {
    mode: 'ok', // ok | login-fail | error | timeout | slow
    delayMs: 900,
    sessions: new Map(),
    addressList: new Map(),
    requests: [],
  };

  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  function authed(req) {
    const h = req.headers.authorization ?? '';
    if (!h.startsWith('Basic ')) return false;
    const [u, p] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':');
    return u === cfg.user && p === cfg.password;
  }

  function adminAuthed(req) {
    return req.headers['x-admin-token'] === cfg.adminToken;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw) return resolve({});
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error('invalid_json'));
        }
      });
      req.on('error', reject);
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    state.requests.push({ method: req.method, path, query: url.search, ts: Date.now() });
    if (state.requests.length > 500) state.requests.shift();

    // ---- Canal de administración (no forma parte de RouterOS) ------------
    if (path.startsWith('/__admin/')) {
      if (!adminAuthed(req)) return json(res, 401, { error: 'admin_unauthorized' });
      if (req.method === 'GET' && path === '/__admin/state') {
        return json(res, 200, {
          mode: state.mode,
          sessions: [...state.sessions.entries()].map(([id, s]) => ({ '.id': id, ...s })),
          addressList: [...state.addressList.entries()].map(([id, a]) => ({ '.id': id, ...a })),
          requests: state.requests.length,
        });
      }
      if (req.method === 'POST' && path === '/__admin/mode') {
        const body = await readBody(req);
        if (!['ok', 'login-fail', 'error', 'timeout', 'slow'].includes(body.mode)) {
          return json(res, 400, { error: 'invalid_mode' });
        }
        state.mode = body.mode;
        if (typeof body.delayMs === 'number') state.delayMs = body.delayMs;
        return json(res, 200, { mode: state.mode, delayMs: state.delayMs });
      }
      if (req.method === 'POST' && path === '/__admin/reset') {
        state.mode = 'ok';
        state.sessions.clear();
        state.addressList.clear();
        state.requests = [];
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'admin_not_found' });
    }

    // ---- health del propio emulador (contenedor / Cloud Run) ------------
    if (req.method === 'GET' && (path === '/health' || path === '/healthz')) {
      return json(res, 200, {
        ok: true,
        service: 'sfh-sim-routeros',
        mode: state.mode,
        sessions: state.sessions.size,
        addressList: state.addressList.size,
      });
    }

    // ---- API RouterOS emulada -------------------------------------------
    if (!path.startsWith('/rest/')) return json(res, 404, { error: 'not_found' });
    if (!authed(req)) return json(res, 401, { error: 'unauthorized' });

    const mode = state.mode;
    const busy = mode === 'timeout' || mode === 'slow';
    if (busy) await delay(mode === 'timeout' ? state.delayMs : Math.min(state.delayMs, 200));
    if (mode === 'timeout') {
      // Deja que el cliente aborte por timeout; responde tarde igualmente.
      return json(res, 200, {});
    }

    // healthcheck
    if (req.method === 'GET' && path === '/rest/system/resource') {
      if (mode === 'error') return json(res, 500, { error: 'emulated_failure' });
      return json(res, 200, {
        'architecture-name': 'arm64',
        'board-name': 'CHR (emulado sfh-sim)',
        version: '7.15.3 (emulado)',
        uptime: `${Math.floor(process.uptime())}s`,
      });
    }

    // autorizar (login hotspot)
    if (req.method === 'POST' && path === '/rest/ip/hotspot/active/login') {
      if (mode === 'login-fail' || mode === 'error') {
        return json(res, 500, { error: 'emulated_login_failure' });
      }
      const body = await readBody(req);
      const id = `*${randomUUID().slice(0, 8)}`;
      state.sessions.set(id, {
        'mac-address': String(body.user ?? '').toLowerCase(),
        address: String(body.ip ?? ''),
        'rate-limit': String(body['rate-limit'] ?? ''),
      });
      return json(res, 200, { '.id': id });
    }

    // fallback address-list — RouterOS v7 real: PUT crea, POST ejecuta comandos
    if (path === '/rest/ip/firewall/address-list' && (req.method === 'PUT' || req.method === 'POST')) {
      if (req.method === 'POST') {
        // Fidelidad con RouterOS real: POST no crea entradas.
        return json(res, 400, { error: 400, detail: 'no such command', message: 'Bad Request' });
      }
      if (mode === 'error') return json(res, 500, { error: 'emulated_failure' });
      const body = await readBody(req);
      const id = `*${randomUUID().slice(0, 8)}`;
      state.addressList.set(id, {
        list: String(body.list ?? ''),
        address: String(body.address ?? ''),
        comment: String(body.comment ?? ''),
      });
      return json(res, 201, { '.id': id });
    }

    // buscar sesiones activas por MAC
    if (req.method === 'GET' && path === '/rest/ip/hotspot/active') {
      if (mode === 'error') return json(res, 500, { error: 'emulated_failure' });
      const mac = (url.searchParams.get('mac-address') ?? '').toLowerCase();
      const rows = [...state.sessions.entries()]
        .filter(([, s]) => !mac || s['mac-address'] === mac)
        .map(([id, s]) => ({ '.id': id, ...s }));
      return json(res, 200, rows);
    }

    // desconectar
    if (req.method === 'DELETE' && path.startsWith('/rest/ip/hotspot/active/')) {
      if (mode === 'error') return json(res, 500, { error: 'emulated_failure' });
      const id = decodeURIComponent(path.slice('/rest/ip/hotspot/active/'.length));
      if (!state.sessions.has(id)) return json(res, 404, { error: 'no_such_item' });
      state.sessions.delete(id);
      return json(res, 204);
    }

    // listar address-list (útil para aserciones del banco de pruebas)
    if (req.method === 'GET' && path === '/rest/ip/firewall/address-list') {
      return json(res, 200, [...state.addressList.entries()].map(([id, a]) => ({ '.id': id, ...a })));
    }

    return json(res, 404, { error: 'not_found' });
  });

  return {
    state,
    httpServer: server,
    config: cfg,
    listen(port = cfg.port, host = cfg.host) {
      return new Promise((resolve) => {
        server.listen(port, host, () => resolve({ port: server.address().port, url: `http://${host}:${server.address().port}` }));
      });
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

// Arranque directo: `node src/routeros-emulator.mjs` (SFH_SIM_PORT, SFH_SIM_USER, ...)
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const emu = createRouterOsEmulator({
    port: Number(process.env.SFH_SIM_PORT ?? 8728),
    host: process.env.SFH_SIM_HOST ?? '0.0.0.0',
    user: process.env.SFH_SIM_USER ?? DEFAULTS.user,
    password: process.env.SFH_SIM_PASSWORD ?? DEFAULTS.password,
    adminToken: process.env.SFH_SIM_ADMIN_TOKEN ?? DEFAULTS.adminToken,
  });
  emu.listen().then(({ url }) => {
    console.log(JSON.stringify({ event: 'sfh-sim-listening', url, mode: emu.state.mode }));
  });
}
