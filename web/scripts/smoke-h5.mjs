import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ethers } from "ethers";

/**
 * Smoke end-to-end de H5 contra la Besu real (chainId 81234):
 *   1. Login admin + configuración de red + empleado y flujo real (10 BRLT / 6 días).
 *   2. Pausa del flujo → liquidación parcial → BrltX acreditado al empleado.
 *   3. Login SIWE del empleado y Suite: ficha, balances y flujos reconciliados.
 *   4. Auditoría verificada: un txHash falso se rechaza (422).
 *   5. Cobro autónomo con `downgrade` (BrltX → BRLT) + verificación del evento.
 *   6. Guarda de liquidación: `settleFlow` sobre flujo no vencido revierte.
 *   7. Perfil GDPR: consentimiento, borrado inmediato y retiro tras la baja.
 *
 * Uso: npm run build && npm run smoke:h5
 * Requiere `sc/.env` con ADMIN_PRIVATE_KEY, RPC_URL, BRLT_ADDRESS, BRLTX_ADDRESS,
 * ADMIN_ADDRESS y DEPLOY_BLOCK.
 */

const PORT = Number(process.env.SMOKE_PORT ?? 3102);
const BASE = `http://localhost:${PORT}`;
const NEXT_BIN = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function log(...args) {
  console.log("[smoke-h5]", ...args);
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
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
];
const BRLTX_ABI_ADMIN = [
  "function wrapAndCreateFlow(uint256, address, uint64) returns (uint256)",
  "function updateFlow(uint256, uint128)",
  "function deleteFlow(uint256) returns (uint256, uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function getFlow(uint256) view returns (tuple(uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, address, address, bool, bool))",
  "function getRealtimeBalance(address) view returns (uint256)",
];
const BRLTX_ABI_EMPLOYEE = ["function downgrade(uint256)"];

const GAS = { gasPrice: 1000, gasLimit: 900000, type: 0 };
const SIX_DAYS = 6 * 86_400;
const AMOUNT = ethers.utils.parseUnits("10", 18);

async function main() {
  const env = readScEnv();
  for (const key of ["ADMIN_PRIVATE_KEY", "BRLT_ADDRESS", "BRLTX_ADDRESS"]) {
    assert(env[key], `falta ${key} en sc/.env`);
  }
  const rpcUrl = env.RPC_URL ?? "https://besu.alumnos.codecrypto.academy";
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const admin = new ethers.Wallet(env.ADMIN_PRIVATE_KEY, provider);
  const employeeWallet = ethers.Wallet.createRandom();
  const employee = new ethers.Wallet(employeeWallet.privateKey, provider);
  const brlt = new ethers.Contract(env.BRLT_ADDRESS, BRLT_ABI, admin);
  const brltX = new ethers.Contract(env.BRLTX_ADDRESS, BRLTX_ABI_ADMIN, admin);
  const employeeBrltX = new ethers.Contract(env.BRLTX_ADDRESS, BRLTX_ABI_EMPLOYEE, employee);
  log(`admin ${admin.address} · empleado ${employee.address}`);

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
      await new Promise((resolve) => setTimeout(resolve, 1_000));
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
      return { response, json, status: response.status, cookies: cookiesFrom(response) };
    }

    async function login(wallet, purpose) {
      const nonce = await api("/api/auth/nonce", {
        method: "POST",
        body: { wallet: wallet.address, purpose },
      });
      assert(nonce.status === 200, `nonce ${purpose}: ${nonce.status}`);
      const signature = await wallet.signMessage(nonce.json.data.message);
      const result = await api("/api/auth/verify", {
        method: "POST",
        body: { message: nonce.json.data.message, signature },
      });
      assert(result.status === 200, `login ${purpose}: ${result.status} ${JSON.stringify(result.json)}`);
      return {
        cookie: `sf_session=${result.cookies.sf_session}; sf_csrf=${result.cookies.sf_csrf}`,
        csrf: result.cookies.sf_csrf,
      };
    }

    // --- Admin: sesión + config + empleado ---------------------------------
    const adminAuth = await login(admin, "admin");
    const system = await api("/api/system", {
      method: "PATCH",
      cookie: adminAuth.cookie,
      csrf: adminAuth.csrf,
      body: {
        rpcUrl,
        brltAddress: env.BRLT_ADDRESS,
        brltXAddress: env.BRLTX_ADDRESS,
        deployBlock: Number(env.DEPLOY_BLOCK ?? 0),
      },
    });
    assert(system.status === 200, `system: ${system.status}`);

    const created = await api("/api/employees", {
      method: "POST",
      cookie: adminAuth.cookie,
      csrf: adminAuth.csrf,
      body: {
        nombre: "Empleado H5",
        wallet: employee.address,
        concepto: "nomina",
        montoPeriodo: AMOUNT.toString(),
        periodo: 6,
      },
    });
    assert(created.status === 201, `empleado: ${created.status} ${JSON.stringify(created.json)}`);
    const employeeId = created.json.data.employee.id;
    log(`empleado creado (${employeeId}) ✓`);

    // Gas para las firmas del empleado (downgrade): 0,1 CC de la wallet admin.
    const fund = await admin.sendTransaction({ to: employee.address, value: ethers.utils.parseEther("0.1"), ...GAS });
    await fund.wait();
    log("0,1 CC de gas para la wallet del empleado ✓");

    // --- Flujo real + pausa inmediata (acredita devengo al empleado) --------
    const approve = await brlt.approve(env.BRLTX_ADDRESS, AMOUNT, GAS);
    await approve.wait();
    const flowTx = await brltX.wrapAndCreateFlow(AMOUNT, employee.address, SIX_DAYS, GAS);
    const flowReceipt = await flowTx.wait();
    const iface = new ethers.utils.Interface([...BRLTX_ABI_ADMIN,
      "event FlowCreated(uint256 indexed flowId, address indexed sender, address indexed receiver, uint256 amount, uint256 flowRate, uint64 endsAt)"]);
    let flowId = null;
    for (const entry of flowReceipt.logs) {
      try {
        const parsed = iface.parseLog(entry);
        if (parsed.name === "FlowCreated") flowId = parsed.args.flowId.toString();
      } catch {
        // log ajeno
      }
    }
    assert(flowId, "no se encontró FlowCreated");
    const registered = await api("/api/flows", {
      method: "POST",
      cookie: adminAuth.cookie,
      csrf: adminAuth.csrf,
      body: { flowId, employeeId, txHash: flowReceipt.transactionHash },
    });
    assert(registered.status === 201, `registro flujo: ${registered.status}`);

    const pause = await brltX.updateFlow(flowId, 0, GAS);
    await pause.wait();
    // Esperamos a que el tramo devenguado genere BrltX (mínimo 1 bloque).
    let cobrableRaw = 0n;
    for (let attempt = 0; attempt < 24 && cobrableRaw === 0n; attempt += 1) {
      cobrableRaw = BigInt(await brltX.getRealtimeBalance(employee.address));
      if (cobrableRaw === 0n) await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    assert(cobrableRaw > 0n, "el devengo acred por liquidación no llegó");
    log(`flujo #${flowId} creado y pausado (devengo acreditado) ✓`);

    // --- Suite del empleado ------------------------------------------------
    const employeeAuth = await login(employee, "suite");
    const me = await api("/api/suite/me", { cookie: employeeAuth.cookie });
    assert(me.status === 200, `suite/me: ${me.status}`);
    assert(me.json.data.employee.id === employeeId, "ficha incorrecta");
    assert(
      Array.isArray(me.json.data.flows) && me.json.data.flows.some((f) => f.flowId === flowId),
      "flujo no visible en la Suite",
    );
    const cobrable = BigInt(me.json.data.balances.cobrable);
    const brltx = BigInt(me.json.data.balances.walletBrltx);
    assert(brltx === cobrable && cobrable > 0n, "con la pausa activa cobrable == BrltX y > 0");
    log(`Suite OK (BrltX ${ethers.utils.formatUnits(brltx, 18)} BRLT) ✓`);

    // --- Auditoría verificada: txHash falso --------------------------------
    const fake = await api("/api/suite/actions", {
      method: "POST",
      cookie: employeeAuth.cookie,
      csrf: employeeAuth.csrf,
      body: {
        operacion: "cobro",
        txHash: "0x"
          + "1".repeat(64),
      },
    });
    assert(fake.status === 422, `txHash falso: ${fake.status} ${JSON.stringify(fake.json)}`);
    assert(fake.json.error.code === "tx_no_verificada", "código inesperado");
    log("auditoría verifica el evento on-chain (tx falso 422) ✓");

    // --- Cobro autónomo ----------------------------------------------------
    const downgraded = await employeeBrltX.downgrade(brltx, GAS);
    const downReceipt = await downgraded.wait();
    const cobro = await api("/api/suite/actions", {
      method: "POST",
      cookie: employeeAuth.cookie,
      csrf: employeeAuth.csrf,
      body: { operacion: "cobro", txHash: downReceipt.transactionHash },
    });
    assert(cobro.status === 200, `cobro: ${cobro.status} ${JSON.stringify(cobro.json)}`);
    assert(cobro.json.data.operacion === "cobro", "operación cobro inesperada");
    const meAfter = await api("/api/suite/me", { cookie: employeeAuth.cookie });
    assert(
      BigInt(meAfter.json.data.balances.walletBrlt) === brltx,
      "el empleado debería tener exactamente lo cobrado en BRLT",
    );
    assert(
      BigInt(meAfter.json.data.balances.walletBrltx) === 0n,
      "la wallet debería quedar sin BrltX tras el cobro total",
    );
    log(`downgrade de ${ethers.utils.formatUnits(brltx, 18)} BRLT verificado ✓`);

    // --- Liquidar un flujo no vencido debe revertir: AC-02 solo cubre vencidos ---
    const employeeBrltXFull = new ethers.Contract(
      env.BRLTX_ADDRESS,
      ["function settleFlow(uint256) returns (uint256, uint256)"],
      employee,
    );
    let rejected = false;
    try {
      const settleTx = await employeeBrltXFull.settleFlow(flowId, {
        ...GAS,
        gasLimit: 100_000,
      });
      const settleReceipt = await settleTx.wait();
      rejected = settleReceipt.status === 0; // nodos sin revert-reason: el recibo marca 0
    } catch {
      rejected = true; // el nodo rechazó la ejecución (p. ej. en la estimación)
    }
    assert(rejected, "settleFlow sobre un flujo pausado/no vencido no fue rechazado");
    log("settleFlow no vencido rechazado (AC-02: solo vencidos) ✓");

    // --- Perfil GDPR -------------------------------------------------------
    const saveProfile = await api("/api/suite/profile", {
      method: "PATCH",
      cookie: employeeAuth.cookie,
      csrf: employeeAuth.csrf,
      body: {
        datosPersonales: { email: "qa@brlt.test", telefono: "+34 600 000 000" },
      },
    });
    assert(saveProfile.status === 200, `perfil: ${saveProfile.status}`);
    log("perfil actualizado ✓");

    const consent = await api("/api/suite/profile", {
      method: "PATCH",
      cookie: employeeAuth.cookie,
      csrf: employeeAuth.csrf,
      body: { consentimiento: true },
    });
    assert(consent.status === 200, `consentimiento: ${consent.status}`);
    assert(consent.json.data.profile.consentimiento.aceptado, "consentimiento no registrado");
    const meConsent = await api("/api/suite/me", { cookie: employeeAuth.cookie });
    assert(meConsent.json.data.employee.consentimiento.aceptado, "consentimiento no visible");
    log("consentimiento GDPR ✓");

    const erase = await api("/api/suite/erase", {
      method: "POST",
      cookie: employeeAuth.cookie,
      csrf: employeeAuth.csrf,
    });
    assert(erase.status === 200, `erase: ${erase.status} ${JSON.stringify(erase.json)}`);
    assert(
      Object.keys(erase.json.data.profile.datosPersonales).length === 0,
      "los datos personales deberían quedar vacíos",
    );
    assert(erase.json.data.profile.borroSolicitado, "borroSolicitado faltante");
    log("borrado inmediato de datos personales ✓");

    // --- Retiro tras la baja (90 días) -------------------------------------
    const baja = await api(`/api/employees/${employeeId}`, {
      method: "PATCH",
      cookie: adminAuth.cookie,
      csrf: adminAuth.csrf,
      body: { estado: "inactivo" },
    });
    assert(baja.status === 200, `baja: ${baja.status}`);
    // La baja revoca la sesión vigente (AC-08); el empleado vuelve a entrar con SIWE
    // y conserva acceso de solo retiro durante 90 días (AC-10).
    const employeeAuth2 = await login(employee, "suite");
    const meInactivo = await api("/api/suite/me", { cookie: employeeAuth2.cookie });
    assert(meInactivo.status === 200, "la Suite debe seguir accesible tras la baja");
    assert(meInactivo.json.data.employee.estado === "inactivo", "estado no reflejado");
    log("retiro tras la baja: re-login SIWE y Suite accesible ✓");

    // --- Limpieza on-chain: terminar el flujo pausado ----------------------
    const terminated = await brltX.deleteFlow(flowId, GAS);
    await terminated.wait();
    const terminateAction = await api("/api/flows/actions", {
      method: "POST",
      cookie: adminAuth.cookie,
      csrf: adminAuth.csrf,
      body: { flowId, operacion: "terminacion", employeeId, txHash: terminated.hash },
    });
    assert(terminateAction.status === 200, `terminación: ${terminateAction.status}`);
    const agree = await api(`/api/flows/${registered.json.data.flow.id}`, {
      cookie: adminAuth.cookie,
    });
    assert(agree.json.data.flow.estado === "terminado", "flujo no terminado");
    log("flujo terminado y remanente devuelto ✓");

    const audit = await api("/api/audit?limit=100", { cookie: adminAuth.cookie });
    const actions = audit.json.data.events.map((event) => [
      event.accion,
      event.meta?.operacion,
    ]);
    assert(
      actions.some(([accion, operacion]) => accion === "flujo" && operacion === "cobro"),
      "falta auditoría del cobro",
    );
    assert(actions.some(([accion]) => accion === "solicitud_borrado"), "falta solicitud de borrado");
    log("auditoría con cobro y borrado ✓");

    log("TODO OK");
    await shutdown();
    process.exit(0);
  } catch (error) {
    await shutdown();
    throw error;
  }
}

main().catch((error) => {
  console.error("[smoke-h5] FALLO:", error);
  process.exit(1);
});
