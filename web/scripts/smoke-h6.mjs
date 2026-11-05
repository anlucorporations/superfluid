import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MongoClient, ObjectId } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ethers } from "ethers";

/**
 * Smoke de H6 contra la Besu real (chainId 81234):
 *   1. Admin + empleado + flujo real registrados.
 *   2. Deriva provocada en MongoDB corregida por `reconcile_flows`.
 *   3. `flows_history` espeja los eventos de BrltX de forma idempotente.
 *   4. `anonymize_pii` anonimiza 30 días después de la solicitud (AC-10).
 *   5. `mark_scheduled_due` contabiliza las programaciones ya vencidas.
 *   6. El scheduler automático (instrumentation) lanza jobs `cron`.
 *
 * Uso: npm run build && npm run smoke:h6
 * Requiere `sc/.env` con ADMIN_PRIVATE_KEY, BRLT_ADDRESS, BRLTX_ADDRESS y DEPLOY_BLOCK.
 */

const PORT = Number(process.env.SMOKE_PORT ?? 3103);
const BASE = `http://localhost:${PORT}`;
const NEXT_BIN = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function log(...args) {
  console.log("[smoke-h6]", ...args);
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

const BRLT_ABI = ["function approve(address,uint256) returns (bool)"];
const BRLTX_ABI =
  [
    "function wrapAndCreateFlow(uint256,address,uint64) returns (uint256)",
    "function deleteFlow(uint256) returns (uint256,uint256)",
  ];

const GAS = { gasPrice: 1000, gasLimit: 900000, type: 0 };
const AMOUNT = ethers.utils.parseUnits("10", 18);

async function main() {
  const env = readScEnv();
  const provider = new ethers.providers.JsonRpcProvider(
    env.RPC_URL ?? "https://besu.alumnos.codecrypto.academy",
  );
  const admin = new ethers.Wallet(env.ADMIN_PRIVATE_KEY, provider);
  const brlt = new ethers.Contract(env.BRLT_ADDRESS, BRLT_ABI, admin);
  const brltX = new ethers.Contract(env.BRLTX_ADDRESS, BRLTX_ABI, admin);

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
      DISABLE_JOBS: "1", // el cron se valida aparte al final; sin interferencias
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

  async function stopNext() {
    if (exited) return;
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 4_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  try {
    let ready = false;
    for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      try {
        ready = (await fetch(`${BASE}/api/auth/me`)).status === 401;
      } catch {
        ready = false;
      }
    }
    assert(ready, "Next no arrancó");
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
      return {
        response,
        json,
        status: response.status,
        cookies: cookiesFrom(response),
      };
    }

    async function login(wallet, purpose) {
      const nonce = await api("/api/auth/nonce", {
        method: "POST",
        body: { wallet: wallet.address, purpose },
      });
      assert(nonce.status === 200, `nonce: ${nonce.status}`);
      const signature = await wallet.signMessage(nonce.json.data.message);
      const result = await api("/api/auth/verify", {
        method: "POST",
        body: { message: nonce.json.data.message, signature },
      });
      assert(result.status === 200, `login ${purpose}: ${result.status}`);
      return {
        cookie: `sf_session=${result.cookies.sf_session}; sf_csrf=${result.cookies.sf_csrf}`,
        csrf: result.cookies.sf_csrf,
      };
    }

    const adminAuth = await login(admin, "admin");
    const csrf = adminAuth.csrf;
    const cookie = adminAuth.cookie;

    const system = await api("/api/system", {
      method: "PATCH",
      cookie,
      csrf,
      body: {
        rpcUrl: env.RPC_URL ?? "https://besu.alumnos.codecrypto.academy",
        brltAddress: env.BRLT_ADDRESS,
        brltXAddress: env.BRLTX_ADDRESS,
        deployBlock: Number(env.DEPLOY_BLOCK ?? 0),
      },
    });
    assert(system.status === 200, `system: ${system.status}`);

    const employee = ethers.Wallet.createRandom();
    const created = await api("/api/employees", {
      method: "POST",
      cookie,
      csrf,
      body: {
        nombre: "Empleado H6",
        wallet: employee.address,
        concepto: "nomina",
        montoPeriodo: AMOUNT.toString(),
        periodo: 6,
        datosPersonales: { email: "h6@brlt.test" },
      },
    });
    assert(created.status === 201, `empleado: ${created.status} ${JSON.stringify(created.json)}`);
    const employeeId = created.json.data.employee.id;

    const approve = await brlt.approve(env.BRLTX_ADDRESS, AMOUNT, GAS);
    await approve.wait();
    const flowTx = await brltX.wrapAndCreateFlow(AMOUNT, employee.address, 6 * 86_400, GAS);
    const flowReceipt = await flowTx.wait();
    const iface = new ethers.utils.Interface([...BRLTX_ABI,
      "event FlowCreated(uint256 indexed flowId, address indexed sender, address indexed receiver, uint256 amount, uint256 flowRate, uint64 endsAt)"]);
    let flowId = null;
    for (const entry of flowReceipt.logs) {
      try {
        const parsed = iface.parseLog(entry);
        if (parsed.name === "FlowCreated") flowId = parsed.args.flowId?.toString();
      } catch {
        // otro contrato
      }
    }
    assert(flowId, "sin FlowCreated");
    const registered = await api("/api/flows", {
      method: "POST",
      cookie,
      csrf,
      body: { flowId, employeeId, txHash: flowReceipt.transactionHash },
    });
    assert(registered.status === 201, `registro: ${registered.status}`);
    log(`flujo #${flowId} creado y registrado ✓`);

    // --- Deriva provocada ----------------------------------------------------
    await db
      .collection("flows")
      .updateOne(
        { flowId },
        { $set: { estado: "pausado", paid: "999", flowRate: "1", receiver: ethers.utils.getAddress(ethers.utils.hexZeroPad("0x00", 20)), } },
      );
    const before = await db.collection("flows").findOne({ flowId });
    assert(before.estado === "pausado", "la deriva no se provocó en MongoDB");

    const reconcile = await api("/api/jobs", {
      method: "POST",
      cookie,
      csrf,
      body: { job: "reconcile_flows" },
    });
    assert(
      reconcile.status === 200,
      `reconcile: ${reconcile.status} ${JSON.stringify(reconcile.json)}`,
    );
    assert(reconcile.json.data.result.drifts >= 1, "debería detectar al menos una deriva");
    const after = await db.collection("flows").findOne({ flowId });
    assert(after.estado === "activo", `estado tras reconciliar: ${after.estado}`);
    assert(after.paid === "0", `paid tras reconciliar: ${after.paid}`);
    assert(after.receiver.toLowerCase() === employee.address.toLowerCase(), "receptor no corregido");
    assert(after.flowRate === AMOUNT.div(6 * 86_400).toString(), "tasa no corregida");
    log(`deriva corregida por el job (drifts ${reconcile.json.data.result.drifts}) ✓`);

    // --- flows_history idempotente -------------------------------------------
    const first = await api("/api/jobs", {
      method: "POST",
      cookie,
      csrf,
      body: { job: "flows_history" },
    });
    assert(first.status === 200, `history: ${first.status} ${JSON.stringify(first.json)}`);
    const firstCount = first.json.data.result.total;
    const second = await api("/api/jobs", {
      method: "POST",
      cookie,
      csrf,
      body: { job: "flows_history" },
    });
    assert(second.status === 200, `history 2: ${second.status}`);
    assert(
      second.json.data.result.total === firstCount,
      "el espejo no es idempotente (claves duplicadas)",
    );
    assert(firstCount > 0, "no hay eventos espejados");
    const samples = await db.collection("flows_history").find().limit(5).toArray();
    for (const doc of samples) {
      assert(doc.key.includes("-"), "clave txHash-logIndex inválida");
      assert(!!doc.evento, "evento faltante");
    }
    log(`flows_history espejo OK (${firstCount} eventos idempotentes) ✓`);

    // --- Anonimización a 30 días ---------------------------------------------
    await db.collection("employees").updateOne(
      { _id: new ObjectId(employeeId) },
      {
        $set: {
          borroSolicitado: true,
          borroSolicitadoAt: new Date(Date.now() - 31 * 86_400_000),
          datosPersonales: { email: "h6@brlt.test", telefono: "+34 600 111 222" },
        },
      },
    );
    const anonymize = await api("/api/jobs", {
      method: "POST",
      cookie,
      csrf,
      body: { job: "anonymize_pii" },
    });
    assert(anonymize.status === 200, `anonymize: ${anonymize.status} ${JSON.stringify(anonymize.json)}`);
    assert(anonymize.json.data.result.anonymized >= 1, "no anonimizó al empleado");
    const anonDoc = await db.collection("employees").findOne({ _id: new ObjectId(employeeId) });
    assert(anonDoc.nombre.startsWith("Anonimizado"), `nombre: ${anonDoc.nombre}`);
    assert(Object.keys(anonDoc.datosPersonales).length === 0, "los datos personales no se borraron");
    assert(anonDoc.anonymizado === true, "marca anonymizado faltante");
    log("anonimización GDPR a 30 días ✓");

    // --- Programaciones vencidas ---------------------------------------------
    // El empleado 1 quedó inactivo tras el anonimizado; se crea otro para la nómina.
    const employee2 = ethers.Wallet.createRandom();
    const created2 = await api("/api/employees", {
      method: "POST",
      cookie,
      csrf,
      body: {
        nombre: "Empleado H6-2",
        wallet: employee2.address,
        concepto: "nomina",
        montoPeriodo: AMOUNT.toString(),
        periodo: 30,
      },
    });
    assert(created2.status === 201, `empleado 2: ${created2.status} ${JSON.stringify(created2.json)}`);
    const scheduled = await api("/api/scheduled-flows", {
      method: "POST",
      cookie,
      csrf,
      body: {
        employeeId: created2.json.data.employee.id,
        amount: AMOUNT.toString(),
        periodo: 30,
        fechaInicio: new Date(Date.now() - 3_600_000).toISOString(),
      },
    });
    assert(scheduled.status === 201, `programado: ${scheduled.status}`);
    const due = await api("/api/jobs", {
      method: "POST",
      cookie,
      csrf,
      body: { job: "mark_scheduled_due" },
    });
    assert(due.status === 200, `due: ${due.status}`);
    assert(due.json.data.result.pendientes >= 1, "no contabilizó la programación vencida");
    log(`programaciones vencidas: ${due.json.data.result.pendientes} ✓`);

    // --- Estado de jobs ------------------------------------------------------
    const status = await api("/api/jobs", { cookie });
    assert(status.status === 200, "job status KO");
    const names = status.json.data.lastRuns.map((run) => run.job);
    for (const expected of ["reconcile_flows", "flows_history", "anonymize_pii", "mark_scheduled_due"]) {
      assert(names.includes(expected), `falta ejecución de ${expected}`);
    }
    log("estado del panel /admin/jobs ✓");

    // --- Limpieza: terminar el flujo -----------------------------------------
    const terminated = await brltX.deleteFlow(flowId, GAS);
    await terminated.wait();
    await api("/api/flows/actions", {
      method: "POST",
      cookie,
      csrf,
      body: { flowId, operacion: "terminacion", employeeId, txHash: terminated.hash },
    });
    const flows = await api("/api/flows", { cookie });
    assert(
      flows.json.data.flows.some((f) => f.flowId === flowId && f.estado === "terminado"),
      "flujo no terminado",
    );
    log("flujo terminado y remanente devuelto ✓");

    // --- Scheduler automático (cron) -----------------------------------------
    await stopNext();
    const child2 = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT + 1)], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DISABLE_JOBS: undefined, // sin desactivar: debe lanzar el cron
        MONGODB_URI: mongod.getUri("superfluid"),
        MONGODB_DB: "superfluid",
        SIWE_DOMAIN: `localhost:${PORT + 1}`,
        ADMIN_BOOTSTRAP_WALLET: admin.address,
      },
    });
    child2.stdout.on("data", (chunk) => process.stdout.write(`[next2] ${chunk}`));
    let exited2 = false;
    child2.on("exit", () => {
      exited2 = true;
    });
    try {
      const base2 = `http://localhost:${PORT + 1}`;
      let ready2 = false;
      for (let attempt = 0; attempt < 60 && !ready2; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        try {
          ready2 = (await fetch(`${base2}/api/auth/me`)).status === 401;
        } catch {
          ready2 = false;
        }
      }
      assert(ready2, "segundo Next no arrancó");

      async function api2(path, { method = "GET", body, cookie } = {}) {
        const headers = {};
        if (body) headers["content-type"] = "application/json";
        if (cookie) headers.cookie = cookie;
        const response = await fetch(`${base2}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
        return {
          json: await response.json().catch(() => null),
          status: response.status,
          cookies: cookiesFrom(response),
        };
      }

      const nonce2 = await api2("/api/auth/nonce", {
        method: "POST",
        body: { wallet: admin.address, purpose: "admin" },
      });
      assert(nonce2.status === 200, `nonce 2: ${nonce2.status}`);
      const sig2 = await admin.signMessage(nonce2.json.data.message);
      const verify2 = await api2("/api/auth/verify", {
        method: "POST",
        body: { message: nonce2.json.data.message, signature: sig2 },
      });
      assert(verify2.status === 200, `login 2: ${verify2.status}`);
      const adminCookie2 = `sf_session=${verify2.cookies?.sf_session ?? ""}`;

      // El primer tick del cron ocurre a los 20 s: esperamos hasta 75 s.
      let cron = false;
      for (let attempt = 0; attempt < 15 && !cron; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 5_000));
        try {
          const status2 = await api2("/api/jobs", { cookie: adminCookie2 });
          cron = (status2.json?.data?.lastRuns ?? []).some((run) => run.trigger === "cron");
        } catch {
          cron = false;
        }
      }
      assert(cron, "el scheduler automático no registró ejecuciones cron");
      log("scheduler automático (cron, cada 5 min) ✓");
    } finally {
      if (!exited2) {
        child2.kill("SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
    }

    log("TODO OK");
    await mongo.close();
    await mongod.stop();
    process.exit(0);
  } catch (error) {
    await stopNext();
    await mongo.close().catch(() => undefined);
    await mongod.stop().catch(() => undefined);
    throw error;
  }
}

main().catch((error) => {
  console.error("[smoke-h6] FALLO:", error);
  process.exit(1);
});
