import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

/**
 * Smoke del despliegue en Cloud Run (H7): flujo real sobre Besu con la app
 * servida desde la URL de preview. Uso: SMOKE_URL=... node scripts/smoke-h4-preview.mjs
 */

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BASE = process.env.SMOKE_URL ?? "https://brltv2-crx2qw5whq-ew.a.run.app";

function log(...args) {
  console.log("[smoke-preview]", ...args);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const BRLTX_ABI = [
  "function wrapAndCreateFlow(uint256 amount, address receiver, uint64 durationSeconds) returns (uint256)",
  "function updateFlow(uint256 flowId, uint128 newFlowRate)",
  "function deleteFlow(uint256 flowId) returns (uint256, uint256)",
  "function changeReceiver(uint256 flowId, address newReceiver)",
  "function getFlow(uint256 flowId) view returns (tuple(uint256 flowRate, uint256 startedAt, uint256 endsAt, uint256 lastSettledAt, uint256 pausedAt, uint256 rateBeforePause, uint256 deposited, uint256 settled, address sender, address receiver, bool paused, bool terminated))",
  "function getPending(uint256 flowId) view returns (uint256)",
  "event FlowCreated(uint256 indexed flowId, address indexed sender, address indexed receiver, uint256 amount, uint256 flowRate, uint64 endsAt)",
];
const BRLT_ABI = ["function approve(address spender, uint256 amount) returns (bool)"];

const GAS = { gasPrice: 1000, gasLimit: 900000, type: 0 };
const SIX_DAYS = 6 * 86_400;
const AMOUNT = ethers.utils.parseUnits("5", 18);

async function main() {
  const envFile = readFileSync(`${REPO_ROOT}/sc/.env`, "utf8");
  const env = {};
  for (const line of envFile.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  assert(env.ADMIN_PRIVATE_KEY, "falta ADMIN_PRIVATE_KEY");
  const rpcUrl = env.RPC_URL ?? "https://besu.alumnos.codecrypto.academy";

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const admin = new ethers.Wallet(env.ADMIN_PRIVATE_KEY, provider);
  const brlt = new ethers.Contract(env.BRLT_ADDRESS, BRLT_ABI, admin);
  const brltX = new ethers.Contract(env.BRLTX_ADDRESS, BRLTX_ABI, admin);
  log(`URL de preview: ${BASE}`);

  async function api(path, { method = "GET", body, cookie, csrf } = {}) {
    const headers = {};
    if (body) headers["content-type"] = "application/json";
    if (cookie) headers.cookie = cookie;
    if (csrf) headers["x-csrf-token"] = csrf;
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json().catch(() => null);
    return { response, json, status: response.status };
  }

  // 1) login SIWE
  const nonce = await api("/api/auth/nonce", {
    method: "POST",
    body: { wallet: admin.address, purpose: "admin" },
  });
  assert(nonce.status === 200, `nonce: ${nonce.status}`);
  const signature = await admin.signMessage(nonce.json.data.message);
  const verify = await api("/api/auth/verify", {
    method: "POST",
    body: { message: nonce.json.data.message, signature },
  });
  const c = {};
  for (const ck of verify.response.headers.getSetCookie?.() ?? []) {
    const p = ck.split(";")[0];
    const i = p.indexOf("=");
    if (i > 0) c[p.slice(0, i)] = p.slice(i + 1);
  }
  const cookie = `sf_session=${c.sf_session}; sf_csrf=${c.sf_csrf}`;
  const csrf = c.sf_csrf;
  assert(verify.status === 200, `login: ${verify.status}`);
  log(`login ${verify.json.data.session.role} ✓`);

  // 2) salud
  const health = await api("/api/health");
  assert(health.json.data.status === "ok", "health degradado");
  log("health ok (db+rpc) ✓");

  // 3) empleado
  const receiver = ethers.Wallet.createRandom();
  const employee = await api("/api/employees", {
    method: "POST",
    cookie,
    csrf,
    body: {
      nombre: "Empleado Cloud Run",
      wallet: receiver.address,
      concepto: "nomina",
      montoPeriodo: AMOUNT.toString(),
      periodo: 6,
    },
  });
  assert(employee.status === 201, `empleado: ${employee.status} ${JSON.stringify(employee.json)}`);
  const employeeId = employee.json.data.employee.id;
  log(`empleado creado ${employeeId} ✓`);

  // 4) flujo real on-chain
  const approve = await brlt.approve(env.BRLTX_ADDRESS, AMOUNT, GAS);
  await approve.wait();
  const flowTx = await brltX.wrapAndCreateFlow(AMOUNT, receiver.address, SIX_DAYS, GAS);
  const flowReceipt = await flowTx.wait();
  const iface = new ethers.utils.Interface(BRLTX_ABI);
  let flowId = null;
  for (const l of flowReceipt.logs) {
    try {
      const parsed = iface.parseLog(l);
      if (parsed.name === "FlowCreated") flowId = parsed.args.flowId.toString();
    } catch {
      // otro contrato
    }
  }
  assert(flowId, "sin FlowCreated");
  log(`flujo #${flowId} creado en Besu ✓`);

  const register = await api("/api/flows", {
    method: "POST",
    cookie,
    csrf,
    body: { flowId, employeeId, txHash: flowReceipt.transactionHash },
  });
  assert(register.status === 201, `registro: ${register.status}`);
  const flow = register.json.data.flow;
  assert(flow.estado === "activo", "estado inicial inesperado");
  log("flujo registrado en la Suite web (Cloud Run) ✓");

  // 5) pausa + reanudación (firmas on-chain del admin, como en la UI)
  const pauseOnChain = await brltX.updateFlow(flowId, 0, GAS);
  await pauseOnChain.wait();
  const pause = await api("/api/flows/actions", {
    method: "POST",
    cookie,
    csrf,
    body: { flowId, operacion: "pausa", employeeId, txHash: pauseOnChain.hash },
  });
  assert(pause.status === 200, `pausa action: ${pause.status}`);
  const paused = await api(`/api/flows/${flow.id}`, { cookie });
  assert(paused.json.data.flow.estado === "pausado", "no quedó pausado");
  log("pausa reconciliada ✓");

  const rate = AMOUNT.div(SIX_DAYS).toString();
  const resume = await brltX.updateFlow(flowId, rate, GAS);
  await resume.wait();
  const resumeAction = await api("/api/flows/actions", {
    method: "POST",
    cookie,
    csrf,
    body: { flowId, operacion: "reanudacion", employeeId },
  });
  assert(resumeAction.status === 200, `reanudación: ${resumeAction.status}`);
  log("reanudación reconciliada ✓");

  // 6) cambio de receptor
  const newReceiver = ethers.Wallet.createRandom();
  const changed = await brltX.changeReceiver(flowId, newReceiver.address, GAS);
  const changedReceipt = await changed.wait();
  let newFlowId = null;
  for (const l of changedReceipt.logs) {
    try {
      const parsed = iface.parseLog(l);
      if (parsed.name === "FlowCreated") newFlowId = parsed.args.flowId.toString();
    } catch {
      // otro contrato
    }
  }
  const changeAction = await api("/api/flows/actions", {
    method: "POST",
    cookie,
    csrf,
    body: {
      flowId,
      operacion: "cambio_receptor",
      employeeId,
      txHash: changedReceipt.hash,
      newFlowId,
    },
  });
  assert(changeAction.status === 200, `cambio receptor: ${changeAction.status}`);
  log(`cambio de receptor: #${flowId} → #${newFlowId} ✓`);

  // 7) terminación
  const terminated = await brltX.deleteFlow(newFlowId, GAS);
  const terminatedReceipt = await terminated.wait();
  const terminateAction = await api("/api/flows/actions", {
    method: "POST",
    cookie,
    csrf,
    body: { flowId: newFlowId, operacion: "terminacion", employeeId, txHash: terminatedReceipt.hash },
  });
  assert(terminateAction.status === 200, `terminación: ${terminateAction.status}`);
  const flows = await api("/api/flows", { cookie });
  assert(
    flows.json.data.flows.some((f) => f.flowId === newFlowId && f.estado === "terminado"),
    "flujo no terminado",
  );
  const pending = await brltX.getPending(newFlowId);
  assert(pending.toString() === "0", "escrow pendiente");
  log("terminación con escrow 0 ✓");

  // 8) tesorería + auditoría
  const treasury = flows.json.data.treasury;
  assert(treasury && BigInt(treasury.escrow) >= 0n, "escrow incoherente");
  log(`tesorería cuadrada (escrow total ${treasury.escrow}) ✓`);
  const audit = await api("/api/audit?limit=50", { cookie });
  const ops = audit.json.data.events.filter((e) => e.accion === "flujo").map((e) => e.meta?.operacion);
  for (const expected of ["alta", "pausa", "reanudacion", "cambio_receptor", "terminacion"]) {
    assert(ops.includes(expected), `auditoría falta ${expected}`);
  }
  log("auditoría completa ✓");

  log("TODO OK");
  process.exit(0);
}

main().catch((err) => {
  console.error("[smoke-preview] FALLO:", err);
  process.exit(1);
});
