// sfh-demo — demo scripted del CU-01 completo (portal cautivo Web3) con wallet
// real en Besu y gateway MikroTik emulado, ejecutada como Cloud Run Job.
//
// Flujo: NAS simulado (bind HMAC) → portal (aviso, wallet, SIWE, wrap, stream)
//        → authorize (202) → worker de validación → adaptador → emulador MikroTik
//        → pausa/revocación → verificación en emulador y BD.
//
// Genera: capturas PNG por paso, vídeo webm y log JSON; los sube a GCS.
import { chromium } from 'playwright';
import { defineChain, createPublicClient, createWalletClient, http, hexToString, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Storage } from '@google-cloud/storage';
import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';

const env = (k, d = '') => (process.env[k] ?? d).trim();
const cfg = {
  portalUrl: env('PORTAL_URL').replace(/\/$/, ''),
  apiUrl: env('API_URL').replace(/\/$/, ''),
  simUrl: env('SFH_SIM_URL').replace(/\/$/, ''),
  rpcUrl: env('RPC_URL'),
  chainId: Number(env('CHAIN_ID', '81234')),
  brlt: env('BRLT_ADDRESS'),
  brltx: env('BRLTX_ADDRESS'),
  payout: env('PAYOUT_WALLET'),
  walletKey: env('DEMO_WALLET_KEY'),
  gatewayId: env('SFH_GATEWAY_ID'),
  gatewaySecret: env('SFH_GATEWAY_SECRET'),
  internalSecret: env('INTERNAL_SECRET'),
  simAdminToken: env('SFH_SIM_ADMIN_TOKEN'),
  databaseUrl: env('DATABASE_URL'),
  bucket: env('GCS_BUCKET'),
  prefix: env('GCS_PREFIX', 'demo'),
  platformAuth: env('PLATFORM_AUTH', 'cloudrun'),
  metadataBaseUrl: env('METADATA_BASE_URL', 'http://metadata.google.internal'),
  outDir: env('DEMO_OUT', '/tmp/sfh-demo'),
};

const steps = [];
function step(name, ok, detail) {
  steps.push({ name, ok, detail: String(detail ?? ''), at: new Date().toISOString() });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
  return ok;
}

// ------------------------------------------------------------------ auth plataforma
const tokenCache = new Map();
async function identityToken(audience) {
  const hit = tokenCache.get(audience);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
  if (cfg.platformAuth !== 'cloudrun') return '';
  const url = `${cfg.metadataBaseUrl}/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`;
  const res = await fetch(url, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!res.ok) throw new Error(`metadata_identity_${res.status}`);
  const token = (await res.text()).trim();
  let exp = Date.now() + 50 * 60_000;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
    if (typeof payload.exp === 'number') exp = payload.exp * 1000;
  } catch {
    /* opaco */
  }
  tokenCache.set(audience, { token, expiresAt: exp });
  return token;
}
async function platformHeaders(audience, extra = {}) {
  const headers = { 'content-type': 'application/json', ...extra };
  if (cfg.platformAuth === 'cloudrun') {
    headers['x-serverless-authorization'] = `Bearer ${await identityToken(audience)}`;
  }
  return headers;
}
async function apiJson(pathname, init = {}) {
  const headers = await platformHeaders(cfg.apiUrl, init.headers ?? {});
  const res = await fetch(`${cfg.apiUrl}${pathname}`, { ...init, headers });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

// ------------------------------------------------------------------ cadena + wallet
const account = privateKeyToAccount(cfg.walletKey);
const chain = defineChain({
  id: cfg.chainId,
  name: 'Codecrypto Besu',
  nativeCurrency: { name: 'CC', symbol: 'CC', decimals: 18 },
  rpcUrls: { default: { http: [cfg.rpcUrl] } },
});
const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) });
const brltxAbi = parseAbi([
  'function getFlow(address sender, address receiver) view returns (int96 flowRate, uint8 status, uint128 accumulatedBalance, int256 virtualDevengo)',
  'function closeFlow(address receiver)',
]);

/** Cierra un flujo previo account→payout (re-ejecuciones de la demo). */
async function ensureNoFlow() {
  try {
    const [flowRate, status] = await publicClient.readContract({
      address: cfg.brltx,
      abi: brltxAbi,
      functionName: 'getFlow',
      args: [account.address, cfg.payout],
    });
    if (Number(status) === 3) return; // closed
    if (BigInt(flowRate) === 0n && Number(status) === 0) return;
    const hash = await walletClient.writeContract({
      account,
      chain,
      address: cfg.brltx,
      abi: brltxAbi,
      functionName: 'closeFlow',
      args: [cfg.payout],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    step('flujo previo cerrado (re-ejecución)', true, hash);
  } catch (err) {
    step('flujo previo cerrado (re-ejecución)', false, err instanceof Error ? err.message : String(err));
  }
}

async function nodeProviderRequest(method, params = []) {
  switch (method) {
    case 'personal_sign': {
      const raw = params[0];
      const message = typeof raw === 'string' && raw.startsWith('0x') ? hexToString(raw) : String(raw);
      return account.signMessage({ message });
    }
    case 'eth_sendTransaction': {
      const tx = params[0] ?? {};
      const hash = await walletClient.sendTransaction({
        account,
        chain,
        to: tx.to,
        data: tx.data,
        value: tx.value ? BigInt(tx.value) : undefined,
        gas: tx.gas ? BigInt(tx.gas) : undefined,
        nonce: tx.nonce !== undefined ? Number(tx.nonce) : undefined,
      });
      return hash;
    }
    default:
      return publicClient.request({ method, params });
  }
}

// ------------------------------------------------------------------ NAS → API
function signNasBind(secret, { gid, mac, ip, ts, nonce }) {
  return createHmac('sha256', secret).update(`${gid}|${mac.toLowerCase()}|${ip}|${ts}|${nonce}`).digest('hex');
}

async function getBindToken() {
  // MAC/IP únicos por ejecución: el binding activo por MAC es único (D47).
  const mac = `02:00:00:7a:${randomUUID().slice(0, 2)}:${randomUUID().slice(2, 4)}`;
  const ip = `10.20.${1 + (Math.floor(Math.random() * 250))}.${1 + (Math.floor(Math.random() * 250))}`;
  const ts = Math.floor(Date.now() / 1000);
  const nonce = randomUUID();
  const signature = signNasBind(cfg.gatewaySecret, { gid: cfg.gatewayId, mac, ip, ts, nonce });
  const res = await apiJson('/v1/internal/hotspot/bind', {
    method: 'POST',
    headers: { 'x-gateway-id': cfg.gatewayId, 'x-gateway-signature': signature },
    body: JSON.stringify({ mac, ip, ts, nonce }),
  });
  return { bindToken: res.body?.bind_token ?? null, mac, ip, status: res.status };
}

// ------------------------------------------------------------------ DB / sesión
const pool = new pg.Pool({ connectionString: cfg.databaseUrl, max: 2, connectionTimeoutMillis: 15_000 });
async function hotspotSessionFor(portalSessionId) {
  const { rows } = await pool.query(
    `select id::text as id, status::text as status from hotspot_sessions
      where portal_session_id=$1 order by created_at desc limit 1`,
    [portalSessionId],
  );
  return rows[0] ?? null;
}
async function sessionStatus(id) {
  const res = await apiJson(`/v1/session/${id}`);
  return res.body?.status ?? null;
}
async function ensureTariff() {
  await pool.query(
    `insert into gateway_tariffs (gateway_id, name, price_per_second_wei, token_address, payout_wallet,
        bandwidth_down_bps, bandwidth_up_bps, max_children_per_parent, active)
     values ($1,'tarifa-demo',500000000000000,$2,$3,50000000,10000000,2,true)
     on conflict (gateway_id, name) do update
       set price_per_second_wei=excluded.price_per_second_wei,
           token_address=excluded.token_address,
           payout_wallet=excluded.payout_wallet,
           active=true, updated_at=now()`,
    [cfg.gatewayId, cfg.brltx, cfg.payout],
  );
}

async function emulatorState() {
  const res = await fetch(`${cfg.simUrl}/__admin/state`, {
    headers: {
      ...(await platformHeaders(cfg.simUrl)),
      'x-admin-token': cfg.simAdminToken,
    },
  });
  if (!res.ok) throw new Error(`sim_state_${res.status}`);
  return res.json();
}

// ------------------------------------------------------------------ navegador
async function waitText(page, text, timeout = 120_000) {
  await page.getByText(text).first().waitFor({ state: 'visible', timeout });
}

async function launchDemo() {
  await fs.mkdir(cfg.outDir, { recursive: true });
  const shots = path.join(cfg.outDir, 'capturas');
  const videos = path.join(cfg.outDir, 'video');
  await fs.mkdir(shots, { recursive: true });
  await fs.mkdir(videos, { recursive: true });

  const portalOrigin = new URL(cfg.portalUrl).origin;
  const apiOrigin = new URL(cfg.apiUrl).origin;
  const portalToken = await identityToken(cfg.portalUrl);
  const apiToken = await identityToken(cfg.apiUrl);

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: videos, size: { width: 1280, height: 720 } },
  });
  const rpcOrigin = new URL(cfg.rpcUrl).origin;
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': '*',
  };
  // La plataforma es privada (IAM): inyectar el ID token de cada origen.
  // El RPC de Besu se proxya para añadir CORS (el navegador lo necesita).
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === rpcOrigin) {
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });
      const resp = await fetch(req.url(), {
        method: req.method(),
        headers: { 'content-type': req.headers()['content-type'] ?? 'application/json' },
        body: req.postData() ?? undefined,
      });
      const body = await resp.text();
      return route.fulfill({
        status: resp.status,
        headers: { ...corsHeaders, 'content-type': resp.headers.get('content-type') ?? 'application/json' },
        body,
      });
    }
    const headers = { ...req.headers() };
    if (url.origin === portalOrigin) headers['x-serverless-authorization'] = `Bearer ${portalToken}`;
    else if (url.origin === apiOrigin) headers['x-serverless-authorization'] = `Bearer ${apiToken}`;
    await route.continue({ headers });
  });
  const page = await context.newPage();
  const consoleLines = [];
  page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
  await page.exposeFunction('__sfhNodeRequest', (method, params) => nodeProviderRequest(method, params));
  await page.addInitScript(
    ({ address, chainIdHex }) => {
      const listeners = new Map();
      const provider = {
        isMetaMask: true,
        async request({ method, params }) {
          if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
          if (method === 'eth_chainId') return chainIdHex;
          if (method === 'net_version') return String(parseInt(chainIdHex, 16));
          if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
          return window.__sfhNodeRequest(method, params ?? []);
        },
        on(event, cb) {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event).push(cb);
        },
        removeListener() {},
        removeAllListeners() {},
        enable: async () => [address],
      };
      Object.defineProperty(window, 'ethereum', { value: provider, configurable: true });
    },
    { address: account.address, chainIdHex: `0x${cfg.chainId.toString(16)}` },
  );

  const video = page.video();
  let portalSessionId = null;
  let networkSessionId = null;
  try {
    const bind = await getBindToken();
    step('NAS bind HMAC', Boolean(bind.bindToken), `status=${bind.status}`);
    if (!bind.bindToken) throw new Error('sin bind_token');

    await page.goto(`${cfg.portalUrl}/?bind_token=${encodeURIComponent(bind.bindToken)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    await waitText(page, 'Token recibido del hotspot.', 120_000);
    await page.screenshot({ path: path.join(shots, '01-aviso.png'), fullPage: true });
    step('portal cargado con bind_token', true);

    await page.locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: 'Aceptar y crear sesión' }).click();
    await waitText(page, 'session_id:', 60_000);
    const sessionText = await page.getByText(/session_id:/).innerText();
    portalSessionId = sessionText.split(':')[1].trim();
    await page.screenshot({ path: path.join(shots, '02-sesion-portal.png'), fullPage: true });
    step('sesión de portal creada', Boolean(portalSessionId), portalSessionId);

    const connectBtn = page.getByRole('button', { name: 'Conectar wallet' });
    if ((await connectBtn.count()) > 0) await connectBtn.click().catch(() => {});
    await page.getByText(account.address, { exact: false }).first().waitFor({ state: 'visible', timeout: 60_000 });
    await page.screenshot({ path: path.join(shots, '03-wallet.png'), fullPage: true });
    step('wallet conectada', true, account.address);

    await page.getByRole('button', { name: 'Firmar vinculación (SIWE)' }).click();
    await waitText(page, 'binding:', 90_000);
    await page.screenshot({ path: path.join(shots, '04-siwe-binding.png'), fullPage: true });
    step('firma SIWE + binding', true);

    await page.getByRole('button', { name: 'Aprobar y envolver' }).click();
    await waitText(page, 'BRLTx disponible', 240_000);
    await page.screenshot({ path: path.join(shots, '05-wrap.png'), fullPage: true });
    step('wrap BRLT→BRLTx', true);

    await page.getByRole('button', { name: 'Abrir flujo y solicitar acceso' }).click();
    await waitText(page, 'Acceso provisional solicitado', 240_000);
    await page.screenshot({ path: path.join(shots, '06-stream-create.png'), fullPage: true });
    step('stream abierto + authorize 202', true);

    // Worker durable (Cloud Tasks) no está desplegado: se invoca la validación
    // interna para completar el flujo real API→adaptador→emulador.
    let hs = null;
    for (let i = 0; i < 20 && !hs; i++) {
      hs = await hotspotSessionFor(portalSessionId);
      if (!hs) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!hs) throw new Error('hotspot_session no creada');
    networkSessionId = hs.id;
    const validation = await apiJson('/v1/internal/jobs/authorize/validate', {
      method: 'POST',
      headers: { 'x-internal-secret': cfg.internalSecret },
      body: JSON.stringify({ sessionId: hs.id }),
    });
    step('worker valida tx + autoriza gateway', validation.status === 200, `status=${validation.body?.status}`);

    let status = null;
    for (let i = 0; i < 30; i++) {
      status = await sessionStatus(hs.id);
      if (status && status !== 'pending') break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    const st = await emulatorState();
    await page.screenshot({ path: path.join(shots, '07-sesion-autorizada.png'), fullPage: true });
    step('sesión autorizada en portal', ['provisional', 'active'].includes(status), `status=${status}`);
    step('sesión visible en emulador MikroTik', st.sessions.length >= 1, `sessions=${st.sessions.length}`);

    await page.getByRole('button', { name: 'Pausar (revoca)' }).click();
    await waitText(page, 'Sesión revocada', 90_000);
    let revoked = null;
    for (let i = 0; i < 20; i++) {
      revoked = await sessionStatus(hs.id);
      if (revoked === 'revoked') break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    const st2 = await emulatorState();
    await page.screenshot({ path: path.join(shots, '08-pausa-revocada.png'), fullPage: true });
    step('pausa → revoked en BD', revoked === 'revoked', `status=${revoked}`);
    step('disconnect elimina sesión del emulador', st2.sessions.length === 0, `sessions=${st2.sessions.length}`);
  } catch (err) {
    try {
      await page.screenshot({ path: path.join(shots, '99-error.png'), fullPage: true });
      const bodyText = await page.locator('body').innerText().catch(() => '');
      await fs.writeFile(
        path.join(cfg.outDir, 'demo-error.txt'),
        `error: ${err instanceof Error ? err.message : String(err)}\n\n--- body ---\n${bodyText}\n\n--- console ---\n${consoleLines.join('\n')}\n`,
      );
    } catch {
      /* diagnóstico best-effort */
    }
    throw err;
  } finally {
    const videoPath = video ? await video.path().catch(() => null) : null;
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    if (videoPath) {
      await fs.copyFile(videoPath, path.join(cfg.outDir, 'demo.webm')).catch(() => {});
    }
  }
}

// ------------------------------------------------------------------ main
async function main() {
  let error = null;
  try {
    await ensureTariff();
    await ensureNoFlow();
    // estado limpio del emulador (idempotencia entre ejecuciones)
    await fetch(`${cfg.simUrl}/__admin/reset`, {
      method: 'POST',
      headers: { ...(await platformHeaders(cfg.simUrl)), 'x-admin-token': cfg.simAdminToken },
    }).catch(() => {});
    await launchDemo();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    step('ejecución demo', false, error);
  } finally {
    await pool.end().catch(() => {});
  }
  const failed = steps.filter((s) => !s.ok).length;
  const summary = { suite: 'sfh-demo', wallet: account.address, portal: cfg.portalUrl, api: cfg.apiUrl, passed: steps.length - failed, failed, error, steps };
  await fs.writeFile(path.join(cfg.outDir, 'demo-log.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  if (cfg.bucket) {
    const storage = new Storage();
    const all = await fs.readdir(cfg.outDir, { recursive: true });
    for (const rel of all) {
      const full = path.join(cfg.outDir, String(rel));
      const stat = await fs.stat(full).catch(() => null);
      if (!stat?.isFile()) continue;
      const destination = `${cfg.prefix}/${String(rel).replaceAll('\\', '/')}`;
      await storage.bucket(cfg.bucket).upload(full, { destination, resumable: false }).catch((e) => {
        console.error(`upload ${destination}: ${e.message}`);
      });
      console.log(`uploaded gs://${cfg.bucket}/${destination}`);
    }
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
