import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ethers } from "ethers";

/**
 * Smoke test end-to-end de H3:
 *   1. MongoDB en memoria + `next start`.
 *   2. Login SIWE admin, CSRF, proyectos y empleados.
 *   3. Cambio de wallet con doble firma EIP-712.
 *   4. Login SIWE del empleado y lectura de su Suite.
 *   5. Guardas: CSRF obligatorio y prohibición de revocar el último admin.
 *
 * Uso: npm run build && npm run smoke
 */

const PORT = Number(process.env.SMOKE_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;
const NEXT_BIN = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

function log(...args) {
  console.log("[smoke]", ...args);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

async function main() {
  const mongod = await MongoMemoryServer.create({
    binary: { version: process.env.MEM_MONGO_VERSION ?? "7.0.14" },
  });
  const mongo = new MongoClient(mongod.getUri("superfluid"));
  await mongo.connect();
  const db = mongo.db("superfluid");
  log("MongoDB en memoria listo");

  const admin = ethers.Wallet.createRandom();
  const initialWallet = ethers.Wallet.createRandom();
  const newWallet = ethers.Wallet.createRandom();
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
        const response = await fetch(`${BASE}/api/auth/me`);
        ready = response.status === 401;
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
      return { response, json };
    }

    async function login(wallet, purpose) {
      const { response: nonceRes, json: nonceJson } = await api("/api/auth/nonce", {
        method: "POST",
        body: { wallet: wallet.address, purpose },
      });
      assert(nonceRes.status === 200, `nonce ${purpose}: ${nonceRes.status}`);
      const signature = await wallet.signMessage(nonceJson.data.message);
      const { response, json } = await api("/api/auth/verify", {
        method: "POST",
        body: { message: nonceJson.data.message, signature },
      });
      log(`login ${purpose} → ${response.status} ${json?.data?.session?.role ?? ""}`);
      if (response.status !== 200) {
        log("detalle:", JSON.stringify(json));
        log("mensaje:", JSON.stringify(nonceJson?.data?.message ?? ""));
      }
      return { response, json, cookies: cookiesFrom(response) };
    }

    // --- Login admin + CSRF -------------------------------------------------
    const adminLogin = await login(admin, "admin");
    assert(adminLogin.response.status === 200, "login admin falló");
    assert(adminLogin.json.data.session.role === "admin", "rol admin inesperado");
    const { sf_session: sessionToken, sf_csrf: csrf } = adminLogin.cookies;
    assert(sessionToken && csrf, "faltan cookies de sesión");
    const cookie = `sf_session=${sessionToken}; sf_csrf=${csrf}`;

    const csrfFail = await api("/api/projects", {
      method: "POST",
      cookie,
      body: { nombre: "Sin CSRF" },
    });
    assert(csrfFail.response.status === 403, "CSRF no bloqueó la petición");
    log("CSRF obligatorio ✓");

    // --- Proyecto y empleado ------------------------------------------------
    const project = await api("/api/projects", {
      method: "POST",
      cookie,
      csrf,
      body: { nombre: "Proyecto Smoke", descripcion: "H3", presupuesto: "0" },
    });
    assert(project.response.status === 201, `proyecto: ${project.response.status}`);
    const projectId = project.json.data.project.id;

    const employee = await api("/api/employees", {
      method: "POST",
      cookie,
      csrf,
      body: {
        nombre: "Empleado Smoke",
        wallet: initialWallet.address,
        proyectoId: projectId,
        concepto: "nomina",
        montoPeriodo: "2000000000000000000000",
        periodo: 30,
      },
    });
    assert(employee.response.status === 201, `empleado: ${employee.response.status}`);
    const employeeId = employee.json.data.employee.id;
    assert(employee.json.data.employee.proyectoNombre === "Proyecto Smoke", "lookup proyecto");
    log(`empleado creado (${employeeId}) ✓`);

    // --- Cambio de wallet con doble firma EIP-712 ---------------------------
    const authorization = await api(`/api/employees/${employeeId}/wallet/authorization`, {
      method: "POST",
      cookie,
      csrf,
      body: { employeeId, newWallet: newWallet.address },
    });
    assert(
      authorization.response.status === 200,
      `autorización: ${authorization.response.status} ${JSON.stringify(authorization.json)}`,
    );
    const auth = authorization.json.data;
    const employeeSig = await newWallet._signTypedData(
      auth.domain,
      auth.types.employee,
      auth.employeeValue,
    );
    const adminSig = await admin._signTypedData(auth.domain, auth.types.admin, auth.adminValue);

    const change = await api(`/api/employees/${employeeId}/wallet`, {
      method: "POST",
      cookie,
      csrf,
      body: {
        newWallet: newWallet.address,
        employeeSignature: employeeSig,
        adminSignature: adminSig,
        nonce: auth.nonce,
        issuedAt: auth.issuedAt,
      },
    });
    assert(
      change.response.status === 200,
      `cambio wallet: ${change.response.status} ${JSON.stringify(change.json)}`,
    );
    assert(
      change.json.data.employee.wallet.toLowerCase() === newWallet.address.toLowerCase(),
      "la wallet no se actualizó",
    );
    log("cambio de wallet con doble firma ✓");

    const replayWallet = ethers.Wallet.createRandom();
    const replayValue = {
      employeeId,
      oldWallet: newWallet.address,
      newWallet: replayWallet.address,
      nonce: auth.nonce,
      issuedAt: auth.issuedAt,
    };
    const replayEmployeeSig = await replayWallet._signTypedData(
      auth.domain,
      auth.types.employee,
      replayValue,
    );
    const replayAdminSig = await admin._signTypedData(auth.domain, auth.types.admin, {
      action: "change_wallet",
      ...replayValue,
    });
    const replay = await api(`/api/employees/${employeeId}/wallet`, {
      method: "POST",
      cookie,
      csrf,
      body: {
        newWallet: replayWallet.address,
        employeeSignature: replayEmployeeSig,
        adminSignature: replayAdminSig,
        nonce: auth.nonce,
        issuedAt: auth.issuedAt,
      },
    });
    assert(
      replay.response.status === 401 && replay.json.error.code === "nonce_invalido",
      `el nonce se reutilizó: ${replay.response.status} ${JSON.stringify(replay.json)}`,
    );
    log("nonce de un solo uso ✓");

    // --- Guarda del último admin -------------------------------------------
    const revoke = await api(`/api/admin/allowlist/${admin.address}`, {
      method: "PATCH",
      cookie,
      csrf,
      body: { estado: "inactivo" },
    });
    assert(revoke.response.status === 409, `último admin: ${revoke.response.status}`);
    assert(revoke.json.error.code === "ultimo_admin", "código de error inesperado");
    log("protección del último admin ✓");

    // --- Suite del empleado -------------------------------------------------
    const employeeLogin = await login(newWallet, "suite");
    assert(employeeLogin.response.status === 200, "login suite falló");
    assert(employeeLogin.json.data.session.role === "empleado", "rol empleado inesperado");
    const employeeCookie = `sf_session=${employeeLogin.cookies.sf_session}; sf_csrf=${employeeLogin.cookies.sf_csrf}`;

    const suite = await api("/api/suite/me", { cookie: employeeCookie });
    assert(suite.response.status === 200, `suite/me: ${suite.response.status}`);
    assert(suite.json.data.employee.id === employeeId, "empleado incorrecto en la Suite");
    log("Suite del empleado ✓");

    // --- Auditoría y logout -------------------------------------------------
    const audit = await api("/api/audit?limit=50", { cookie });
    assert(audit.response.status === 200, "auditoría no disponible");
    const actions = audit.json.data.events.map((event) => event.accion);
    for (const expected of ["login", "alta", "cambio_wallet"]) {
      assert(actions.includes(expected), `falta evento de auditoría: ${expected}`);
    }
    log(`auditoría con ${actions.length} eventos ✓`);

    const logout = await api("/api/auth/logout", { method: "POST", cookie, csrf });
    assert(logout.response.status === 200, "logout falló");
    const after = await api("/api/auth/me", { cookie });
    assert(after.response.status === 401, "la sesión sigue viva tras logout");
    log("logout y revocación ✓");

    log("TODO OK");
    await shutdown();
    process.exit(0);
  } catch (error) {
    await shutdown();
    throw error;
  }
}

main().catch((error) => {
  console.error("[smoke] FALLO:", error);
  process.exit(1);
});
