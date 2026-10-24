// NAS/hotspot simulado — dispara el canal autenticado NAS→API (D45/V2-01) y
// redirige al portal con el bind_token, igual que haría el MikroTik real.
import http from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';

export const DEFAULTS = {
  host: '127.0.0.1',
  port: 8081,
  apiUrl: 'http://127.0.0.1:8080',
  portalUrl: 'http://127.0.0.1:3000',
  gatewayId: '11111111-1111-4111-8111-111111111111',
  gatewaySecret: 'sfh-sim-gw-secret',
  hmacWindowSeconds: 60,
};

/** Firma la terna observada por el NAS: gateway|mac|ip|ts|nonce (mismo formato que el adaptador). */
export function signNasBind(secret, { gid, mac, ip, ts, nonce }) {
  return createHmac('sha256', secret)
    .update(`${gid}|${mac.toLowerCase()}|${ip}|${ts}|${nonce}`)
    .digest('hex');
}

export function createNasSim(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const state = { last: null, associations: 0, errors: 0 };

  async function associate({ mac, ip }) {
    if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac)) {
      return { ok: false, status: 400, error: 'invalid_mac' };
    }
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      return { ok: false, status: 400, error: 'invalid_ip' };
    }
    const ts = Math.floor(Date.now() / 1000);
    const nonce = randomUUID();
    const signature = signNasBind(cfg.gatewaySecret, { gid: cfg.gatewayId, mac, ip, ts, nonce });
    const res = await fetch(`${cfg.apiUrl.replace(/\/$/, '')}/v1/internal/hotspot/bind`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-gateway-id': cfg.gatewayId,
        'x-gateway-signature': signature,
      },
      body: JSON.stringify({ mac, ip, ts, nonce }),
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    if (!res.ok || typeof body?.bind_token !== 'string') {
      state.errors++;
      return { ok: false, status: res.status, error: body?.error ?? 'bind_failed', body };
    }
    state.associations++;
    const portalUrl = `${cfg.portalUrl.replace(/\/$/, '')}/?bind_token=${encodeURIComponent(body.bind_token)}`;
    state.last = { mac: mac.toLowerCase(), ip, ts, nonce, bindToken: body.bind_token, portalUrl };
    return { ok: true, status: 200, bind_token: body.bind_token, expires_in: body.expires_in, portal_url: portalUrl };
  }

  const html = (title, inner) =>
    `<!doctype html><html lang="es"><meta charset="utf-8"><title>${title}</title>` +
    `<body style="font-family:system-ui;max-width:32rem;margin:3rem auto"><h1>${title}</h1>${inner}</body></html>`;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const readBody = () =>
      new Promise((resolve) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
          } catch {
            resolve({});
          }
        });
      });

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(200, { ok: true, service: 'sfh-sim-nas', gateway_id: cfg.gatewayId, associations: state.associations });
    }
    if (req.method === 'POST' && url.pathname === '/associate') {
      const body = await readBody();
      const out = await associate({ mac: String(body.mac ?? ''), ip: String(body.ip ?? '') });
      return json(out.status, out);
    }
    if (req.method === 'GET' && url.pathname === '/login') {
      const out = await associate({
        mac: url.searchParams.get('mac') ?? '02:00:00:00:00:01',
        ip: url.searchParams.get('ip') ?? '10.20.0.11',
      });
      if (!out.ok) return json(502, out);
      res.writeHead(302, { location: out.portal_url });
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/__admin/reset') {
      state.last = null;
      state.associations = 0;
      state.errors = 0;
      return json(200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/') {
      return json(200, {
        service: 'sfh-sim-nas',
        gateway_id: cfg.gatewayId,
        endpoints: ['POST /associate {mac,ip}', 'GET /login?mac=&ip=', 'GET /health'],
        last: state.last ? { mac: state.last.mac, ip: state.last.ip, portal_url: state.last.portalUrl } : null,
      });
    }
    return json(404, { error: 'not_found' });
  });

  return {
    config: cfg,
    state,
    associate,
    html,
    httpServer: server,
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
