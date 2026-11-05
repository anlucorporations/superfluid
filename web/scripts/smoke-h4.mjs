import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ethers } from "ethers";

/**
 * Smoke end-to-end de H4 contra la Besu real (chainId 81234):
 *   1. Login SIWE admin con la wallet que desplegó los contratos.
 *   2. Configuración de red vía API (mismos addresses que `sc/.env`).
 *   3. Alta de empleado y creación real de un flujo (approve + wrapAndCreateFlow).
 *   4. Registro verificado en MongoDB, lectura reconciliada y tesorería.
 *   5. Pausa, reanudación, cambio de receptor y terminación on-chain + auditoría.
 *   6. Programaciones y lotes (CU-05 / CU-09).
 *
 * Uso: npm run build && npm run smoke:h4
 * Requiere `sc/.env` con ADMIN_PRIVATE_KEY, RPC_URL, BRLT_ADDRESS y BRLTX_ADDRESS.
 */

const PORT = Number(process.env.SMOKE_PORT ?? 3101);
const BASE = `http://localhost:${PORT}`;
const NEXT_BIN = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function log(...args) {
  console.log("[smoke-h4]", ...args);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readScEnv() {
  const file = readFileSync(`${REPO_ROOT}/sc/.env`, "utf8");
  const out = {};
  for (const line of file.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function cookiesFrom(response) {
  const map = {};
  for (const cookie of response.headers.getSetCookie?.() ?? []) {
    const pair = cookie.split(";")[0];
    const index = pair.indexOf("=");
    if (index > 0) map[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return map;
}

const BRLT_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
];

const BRLTX_ABI = [
  "function wrapAndCreateFlow(uint256 amount, address receiver, uint64 durationSeconds) returns (uint256)",
  "function updateFlow(uint256 flowId, uint128 newFlowRate)",
  "function deleteFlow(uint256 flowId) returns (uint256, uint256)",
  "function changeReceiver(uint256 flowId, address newReceiver)",
  "function getFlow(uint256 flowId) view returns (tuple(uint256 flowRate, uint256 startedAt, uint256 endsAt, uint256 lastSettledAt, uint256 pausedAt, uint256 rateBeforePause, uint256 deposited, uint256 settled, address sender, address receiver, bool paused, bool terminated))",
  "function getPending(uint256 flowId) view returns (uint256)",
  "function totalEscrow() view returns (uint256)",
  "event FlowCreated(uint256 indexed flowId, address indexed sender, address indexed receiver, uint256 amount, uint256 flowRate, uint64 endsAt)",
];

const GAS = { gasPrice: 1000, gasLimit: 900000, type: 0 };
const SIX_DAYS = 6 * 86_400;

async function main() {
  const env = readScEnv();
  for (const key of ["ADMIN_PRIVATE_KEY", "BRLT_ADDRESS", "BRLTX_ADDRESS"]) {
    assert(env[key], `falta ${key} en sc/.env`);
  }
  const rpcUrl = env.RPC_URL ?? "https://besu.alumnos.codecrypto.academy";

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const admin = new ethers.Wallet(env.ADMIN_PRIVATE_KEY, provider);
  log(`admin ${admin.address}`);

  const chainId = await provider.getNetwork().then((network) => network.chainId);
  assert(chainId === 81234, `chainId inesperado: ${chainId}`);

  const brlt = new ethers.Contract(env.BRLT_ADDRESS, BRLT_ABI, admin);
  const brltX = new ethers.Contract(env.BRLTX_ADDRESS, BRLTX_ABI, admin);
  const balance = await brlt.balanceOf(admin.address);
  log(`saldo admin: ${ethers.utils.formatUnits(balance, 18)} BRLT`);
  assert(balance.gte(ethers.utils.parseUnits("20", 18)), "saldo BRLT insuficiente para el smoke");

  const mongod = await MongoMemoryServer.create({
    binary: { version: process.env.MEM_MONGO_VERSION ?? "7.0.14" },
  });
  const mongo = new MongoClient(mongod.getUri("superfluid"));
  await mongo.connect();
  const db = mongo.db("superfluid");
  const now = new Date();
  await db.collection("admin_allowlist").insertOne({
    wallet: admin.address,
    walletLower: admin.address.toLowerCase(),
    rol: "admin",
    estado: "activo",
    creadoPor: null,
    createdAt: now,
    updatedAt: now,
  });

  const child = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      MONGODB_URI: mongod.getUri("superfluid"),
      MONGODB_DB: "superfluid",
      SIWE_DOMAIN: `localhost:${PORT}`,
      ADMIN_BOOTSTRAP_WALLET: admin.address,
    },
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));

  let exited = false;
  child.on("exit", () => {
    exited = true;
  });

  async function shutdown() {
    if (!exited) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 4_000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    await mongo.close().catch(() => undefined);
    await mongod.stop().catch(() => undefined);
  }

  try {
    let ready = false;
    for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        ready = (await fetch(`${BASE}/api/auth/me`)).status === 401;
      } catch {
        ready = false;
      }
    }
    assert(ready, "El servidor Next no arrancó a tiempo");
    log(`Next escuchando en ${BASE}`);

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

    // --- Login admin --------------------------------------------------------
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
    assert(verify.status === 200, `login: ${verify.status} ${JSON.stringify(verify.json)}`);
    const cookies = cookiesFrom(verify.response);
    const cookie = `sf_session=${cookies.sf_session}; sf_csrf=${cookies.sf_csrf}`;
    const csrf = cookies.sf_csrf;
    log(`login SIWE admin ✓ (${verify.json.data.session.role})`);

    // --- Configuración de red ----------------------------------------------
    const system = await api("/api/system", {
      method: "PATCH",
      cookie,
      csrf,
      body: {
        rpcUrl,
        brltAddress: env.BRLT_ADDRESS,
        brltXAddress: env.BRLTX_ADDRESS,
        deployBlock: Number(env.DEPLOY_BLOCK ?? 0),
      },
    });
    assert(system.status === 200, `system: ${system.status} ${JSON.stringify(system.json)}`);
    assert(system.json.data.config.brltXAddress === env.BRLTX_ADDRESS, "config no persistida");
    log("system_config con addresses reales ✓");

    // --- Empleado -----------------------------------------------------------
    const receiver = ethers.Wallet.createRandom();
    const employee = await api("/api/employees", {
      method: "POST",
      cookie,
      csrf,
      body: {
        nombre: "Empleado H4",
        wallet: receiver.address,
        concepto: "nomina",
        montoPeriodo: ethers.utils.parseUnits("10", 18).toString(),
        periodo: 6,
      },
    });
    assert(employee.status === 201, `empleado: ${employee.status} ${JSON.stringify(employee.json)}`);
    const employeeId = employee.json.data.employee.id;
    log(`empleado ${employeeId} (${receiver.address}) ✓`);

    // Lote abierto antes de crear flujos: el registro lo asocia y evita duplicados.
    const batch = await api("/api/batches", {
      method: "POST",
      cookie,
      csrf,
      body: { employeeIds: [employeeId] },
    });
    assert(batch.status === 201, `lote: ${batch.status} ${JSON.stringify(batch.json)}`);
    const batchId = batch.json.data.batch.id;
    log(`lote ${batchId} abierto ✓`);

    // --- Flujo real on-chain ------------------------------------------------
    const amount = ethers.utils.parseUnits("10", 18);
    const approve = await brlt.approve(env.BRLTX_ADDRESS, amount, GAS);
    await approve.wait();
    const created = await brltX.wrapAndCreateFlow(amount, receiver.address, SIX_DAYS, GAS);
    const receipt = await created.wait();
    const iface = new ethers.utils.Interface(BRLTX_ABI);
    let flowId = null;
    for (const entry of receipt.logs) {
      try {
        const parsed = iface.parseLog(entry);
        if (parsed.name === "FlowCreated") flowId = parsed.args.flowId.toString();
      } catch {
        // log ajeno
      }
    }
    assert(flowId, "no se encontró FlowCreated en el recibo");
    const onchain = await brltX.getFlow(flowId);
    const expectedRate = amount.div(SIX_DAYS).toString();
    assert(onchain.flowRate.toString() === expectedRate, "tasa on-chain inesperada");
    log(`flujo #${flowId} creado on-chain (tasa ${expectedRate} wei/s) ✓`);

    const registered = await api("/api/flows", {
      method: "POST",
      cookie,
      csrf,
      body: { flowId, employeeId, txHash: receipt.transactionHash, batchId },
    });
    assert(
      registered.status === 201,
      `registro: ${registered.status} ${JSON.stringify(registered.json)}`,
    );
    const flow = registered.json.data.flow;
    assert(flow.employeeId === employeeId, "empleado no vinculado");
    assert(flow.receiver.toLowerCase() === receiver.address.toLowerCase(), "receptor distinto");
    assert(flow.estado === "activo", `estado inesperado: ${flow.estado}`);
    assert(flow.flowRate === expectedRate, `tasa registrada ${flow.flowRate}`);
    log("registro verificado por RPC ✓");

    const listed = await api("/api/flows", { cookie });
    assert(listed.status === 200, `listado: ${listed.status}`);
    assert(listed.json.data.flows.some((item) => item.flowId === flowId), "flujo no listado");
    assert(listed.json.data.treasury, "tesorería vacía");
    assert(
      BigInt(listed.json.data.treasury.escrow) > 0n,
      "el escrow debería reflejar el flujo activo",
    );
    log(`listado + tesorería (escrow ${listed.json.data.treasury.escrow}) ✓`);

    // --- Pausa / reanudación ------------------------------------------------
    const paused = await brltX.updateFlow(flowId, 0, GAS);
    await paused.wait();
    const pauseAction = await api("/api/flows/actions", {
      method: "POST",
      cookie,
      csrf,
      body: { flowId, operacion: "pausa", employeeId, txHash: paused.hash },
    });
    assert(pauseAction.status === 200, `acción pausa: ${pauseAction.status}`);
    const pausedFlow = await api(`/api/flows/${flow.id}`, { cookie });
    assert(pausedFlow.json.data.flow.estado === "pausado", "no quedó pausado");
    assert(
      pausedFlow.json.data.flow.flowRate === expectedRate,
      "la tasa contractual se perdió al pausar",
    );
    log("pausa reconciliada (tasa contractual conservada) ✓");

    const resumed = await brltX.updateFlow(flowId, expectedRate, GAS);
    await resumed.wait();
    const resumeAction = await api("/api/flows/actions", {
      method: "POST",
      cookie,
      csrf,
      body: { flowId, operacion: "reanudacion", employeeId, txHash: resumed.hash },
    });
    assert(resumeAction.status === 200, `acción reanudación: ${resumeAction.status}`);
    const activeFlow = await api(`/api/flows/${flow.id}`, { cookie });
    assert(activeFlow.json.data.flow.estado === "activo", "no volvió a activo");
    log("reanudación reconciliada ✓");

    // --- Cambio de receptor (AC-03) ----------------------------------------
    // `changeReceiver` cierra el flujo antiguo y abre uno nuevo hacia la wallet nueva.
    const newReceiver = ethers.Wallet.createRandom();
    const changed = await brltX.changeReceiver(flowId, newReceiver.address, GAS);
    const changedReceipt = await changed.wait();
    let newFlowId = null;
    for (const entry of changedReceipt.logs) {
      try {
        const parsed = iface.parseLog(entry);
        if (parsed.name === "FlowCreated") newFlowId = parsed.args.flowId.toString();
      } catch {
        // log ajeno
      }
    }
    assert(newFlowId, "changeReceiver no emitió FlowCreated");
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
        meta: { receiver: newReceiver.address },
      },
    });
    assert(changeAction.status === 200, `acción cambio receptor: ${changeAction.status}`);
    const oldFlow = await api(`/api/flows/${flow.id}`, { cookie });
    assert(oldFlow.json.data.flow.estado === "terminado", "el flujo antiguo no se cerró");
    const afterChange = await api("/api/flows", { cookie });
    const moved = afterChange.json.data.flows.find((item) => item.flowId === newFlowId);
    assert(moved, "el flujo nuevo no se registró");
    assert(
      moved.receiver.toLowerCase() === newReceiver.address.toLowerCase(),
      "el receptor no se migró",
    );
    assert(moved.estado === "activo", `estado del flujo nuevo: ${moved.estado}`);
    log(`cambio de receptor: flujo #${flowId} → #${newFlowId} ✓`);

    // --- Terminación --------------------------------------------------------
    const terminated = await brltX.deleteFlow(newFlowId, GAS);
    const terminatedReceipt = await terminated.wait();
    const terminateAction = await api("/api/flows/actions", {
      method: "POST",
      cookie,
      csrf,
      body: {
        flowId: newFlowId,
        operacion: "terminacion",
        employeeId,
        txHash: terminatedReceipt.hash,
      },
    });
    assert(terminateAction.status === 200, `acción terminación: ${terminateAction.status}`);
    const closedFlow = await api(`/api/flows/${moved.id}`, { cookie });
    assert(closedFlow.json.data.flow.estado === "terminado", "no quedó terminado");
    assert(closedFlow.json.data.flow.pending === "0", "pendiente distinto de 0 tras liquidar");
    const remaining = await brltX.getPending(newFlowId);
    assert(remaining.toString() === "0", "el contrato aún reporta pendiente");
    log("terminación + liquidación (pendiente 0) ✓");

    // --- Programados (CU-05) ------------------------------------------------
    const scheduled = await api("/api/scheduled-flows", {
      method: "POST",
      cookie,
      csrf,
      body: {
        employeeId,
        amount: ethers.utils.parseUnits("5", 18).toString(),
        periodo: 30,
        fechaInicio: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      },
    });
    assert(
      scheduled.status === 201,
      `programado: ${scheduled.status} ${JSON.stringify(scheduled.json)}`,
    );
    assert(scheduled.json.data.scheduled.estado === "proximo", "estado inicial incorrecto");
    const cancelled = await api(`/api/scheduled-flows?id=${scheduled.json.data.scheduled.id}`, {
      method: "PATCH",
      cookie,
      csrf,
      body: { estado: "cancelado" },
    });
    assert(cancelled.status === 200, `cancelar programado: ${cancelled.status}`);
    assert(cancelled.json.data.scheduled.estado === "cancelado", "no se canceló");
    log("programado creado y cancelado ✓");

    // --- Lote (CU-09) -------------------------------------------------------
    const progress = await api(`/api/batches/${batchId}`, { cookie });
    assert(progress.status === 200, `progreso: ${progress.status}`);
    assert(progress.json.data.total === 1, "total del lote incorrecto");
    assert(progress.json.data.completados === 1, "el lote no ve el flujo creado");
    assert(
      progress.json.data.empleadosConFlujo.includes(employeeId),
      "el lote no registra al empleado",
    );
    log("progreso del lote (1/1, sin duplicar) ✓");

    // --- Auditoría ----------------------------------------------------------
    const audit = await api("/api/audit?limit=100", { cookie });
    assert(audit.status === 200, "auditoría no disponible");
    const flowEvents = audit.json.data.events.filter((event) => event.accion === "flujo");
    assert(flowEvents.length >= 6, `eventos de flujo insuficientes: ${flowEvents.length}`);
    const operations = flowEvents.map((event) => event.meta?.operacion);
    for (const expected of [
      "alta",
      "pausa",
      "reanudacion",
      "cambio_receptor",
      "terminacion",
      "programacion",
    ]) {
      assert(operations.includes(expected), `falta auditoría de ${expected}`);
    }
    log(`auditoría con ${flowEvents.length} eventos de flujo ✓`);

    log("TODO OK");
    await shutdown();
    process.exit(0);
  } catch (error) {
    await shutdown();
    throw error;
  }
}

main().catch((error) => {
  console.error("[smoke-h4] FALLO:", error);
  process.exit(1);
});
