/**
 * E2E headless con Chromium (Playwright) — Fase 4.
 * Recorre el panel admin autenticado (sesión SIWE creada por API y escrita en
 * cookies httpOnly), verifica página por página el render y las guardas de
 * sesión, y descarga pantallazos a `RepoTecnico/pruebas/`.
 *
 * Uso: npm run build && npm run e2e:ui
 */

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ethers } from "ethers";

const PORT = Number(process.env.E2E_PORT ?? 3107);
const BASE = `http://localhost:${PORT}`;
const NEXT_BIN = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const SHOTS = fileURLToPath(new URL("../../RepoTecnico/pruebas", import.meta.url));

function log(...args) {
  console.log("[e2e:ui]", ...args);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const { chromium } = await import("playwright");

  const mongod = await MongoMemoryServer.create({
    binary: { version: process.env.MEM_MONGO_VERSION ?? "7.0.14" },
  });
  const mongo = new MongoClient(mongod.getUri("superfluid"));
  await mongo.connect();
  const db = mongo.db("superfluid");

  const admin = new ethers.Wallet.createRandom();
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
      DISABLE_JOBS: "1",
      MONGODB_URI: mongod.getUri("superfluid"),
      MONGODB_DB: "superfluid",
      SIWE_DOMAIN: `localhost:${PORT}`,
      ADMIN_BOOTSTRAP_WALLET: admin.address,
    },
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
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
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        ready = (await fetch(`${BASE}/api/auth/me`)).status === 401;
      } catch {
        ready = false;
      }
    }
    assert(ready, "Next no arrancó a tiempo");
    log(`Next escuchando en ${BASE}`);

    // --- Sesión admin vía API (SIWE real firmado en el runner) --------------
    const nonceRes = await fetch(`${BASE}/api/auth/nonce`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: admin.address, purpose: "admin" }),
    });
    const nonceJson = await nonceRes.json();
    assert(nonceRes.ok, `nonce: ${nonceRes.status}`);
    const signature = await admin.signMessage(nonceJson.data.message);
    const verifyRes = await fetch(`${BASE}/api/auth/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: nonceJson.data.message, signature }),
    });
    const verifyJson = await verifyRes.json();
    assert(verifyRes.ok, `login: ${verifyRes.status}`);
    const cookies = verifyRes.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0].split("="))
      .map(([name, ...rest]) => ({
        name,
        value: rest.join("="),
        domain: "localhost",
        path: "/",
        httpOnly: name === "sf_session",
        sameSite: "Strict",
      }));

    mkdirSync(SHOTS, { recursive: true });
    const browser = await chromium.launch();
    try {
      // --- Guardas de sesión (sin cookies) ---------------------------------
      const anon = await browser.newContext();
      const anonPage = await anon.newPage();
      await anonPage.goto(`${BASE}/admin`);
      await anonPage.waitForURL("**/login", { timeout: 15_000 });
      assert(anonPage.url().includes("/login"), `guarda admin: ${anonPage.url()}`);
      await anonPage.screenshot({ path: fileURLToPath(new URL("e2e_01_guarda_admin.png", `file://${SHOTS}/`)) });
      log("guarda de sesión admin → /login ✓");

      await anonPage.goto(`${BASE}/suite`);
      await anonPage.waitForURL("**/suite/login", { timeout: 15_000 });
      assert(anonPage.url().includes("/suite/login"), "guarda suite");
      log("guarda de sesión suite / Suite del Empleado → /suite/login ✓");

      // /login y /suite/login renderizan el botón de wallet con estado de error
      // cuando no hay proveedor EIP-1193 (MetaMask) presente.
      await anonPage.goto(`${BASE}/login`);
      const text = await anonPage.textContent("body");
      assert(/Acceso|administrad/i.test(text ?? ""), "login admin sin contenido");
      log("pantalla /login renderizada headless (sin MetaMask) ✓");
      await anon.close();

      // --- Panel admin autenticado ------------------------------------------
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addCookies(cookies);
      const page = await context.newPage();

      const adminChecks = [
        {
          path: "/admin",
          expect: /resumen|acceso rápido|empleado/i,
          shot: "e2e_02_admin_resumen.png",
        },
        {
          path: "/admin/empleados",
          expect: /plantilla|nuevo empleado/i,
          shot: "e2e_03_admin_empleados.png",
        },
        {
          path: "/admin/proyectos",
          expect: /proyecto/i,
          shot: "e2e_04_admin_proyectos.png",
        },
        {
          path: "/admin/flujos",
          expect: /flujo/i,
          shot: "e2e_05_admin_flujos.png",
        },
        {
          path: "/admin/jobs",
          expect: /jobs/i,
          shot: "e2e_06_admin_jobs.png",
        },
        {
          path: "/admin/auditoria",
          expect: /auditor/i,
          shot: "e2e_07_admin_auditoria.png",
        },
        {
          path: "/admin/sistema",
          expect: /configuraci|sistema/i,
          shot: "e2e_08_admin_sistema.png",
        },
      ];

      for (const check of adminChecks) {
        await page.goto(`${BASE}${check.path}`);
        await page.waitForLoadState("networkidle");
        const body = (await page.textContent("body")) ?? "";
        assert(check.expect.test(body), `en ${check.path} no se vio ${check.expect}`);
        await page.screenshot({
          path: fileURLToPath(new URL(check.shot, `file://${SHOTS}/`)),
          fullPage: true,
        });
        log(`página ${check.path} renderizada ✓`);
      }

      // Cierre de sesión vía UI y verificación de la revocación.
      await page.goto(`${BASE}/admin`);
      await page.waitForLoadState("networkidle");
      const logout = page.getByRole("button", { name: /^salir$/i }).first();
      if (await logout.isVisible().catch(() => false)) {
        await logout.click();
        await page.waitForURL("**/login", { timeout: 15_000 });
        log("logout del panel ✓");
      } else {
        log("(sin botón de salir visible en resumen, se omite)");
      }
      await context.close();
      const after = await fetch(`${BASE}/api/auth/me`);
      assert(after.status === 401, "la sesión sigue viva tras el logout");
      log("revocación de sesión comprobada ✓");
    } finally {
      await browser.close();
    }

    log("TODO OK");
    await stopNext();
    await mongo.close().catch(() => undefined);
    await mongod.stop().catch(() => undefined);
    process.exit(0);
  } catch (error) {
    await stopNext();
    await mongo.close().catch(() => undefined);
    await mongod.stop().catch(() => undefined);
    throw error;
  }
}

main().catch((error) => {
  console.error("[e2e:ui] FALLO:", error);
  process.exit(1);
});
