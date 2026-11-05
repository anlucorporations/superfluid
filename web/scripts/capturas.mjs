/**
 * CAPTURISTA — capturas reales de la app para los manuales (Fase 5).
 * Arranca MongoDB en memoria + `next start`, inicia sesión SIWE por API
 * (wallet admin efímera en allowlist) y recorre las pantallas reales con
 * Chromium headless guardando PNG en `docs/imagenes/capturas/`.
 *
 * Uso: npm run build && npm run capturas
 */

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ethers } from "ethers";

const PORT = Number(process.env.CAPT_PORT ?? 3108);
const BASE = `http://localhost:${PORT}`;
const NEXT_BIN = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const OUT = resolve(fileURLToPath(new URL("../../docs/imagenes/capturas", import.meta.url)));

function log(...args) {
  console.log("[capturas]", ...args);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const PANTALLAS = [
  { nombre: "01-portada-app", ruta: "/", fullPage: false },
  { nombre: "02-login-admin", ruta: "/login", fullPage: false },
  { nombre: "03-login-suite", ruta: "/suite/login", fullPage: false },
  { nombre: "04-admin-resumen", ruta: "/admin", fullPage: false },
  { nombre: "05-admin-empleados", ruta: "/admin/empleados", fullPage: true },
  { nombre: "06-admin-proyectos", ruta: "/admin/proyectos", fullPage: true },
  { nombre: "07-admin-flujos", ruta: "/admin/flujos", fullPage: true },
  { nombre: "08-admin-jobs", ruta: "/admin/jobs", fullPage: true },
  { nombre: "09-admin-auditoria", ruta: "/admin/auditoria", fullPage: true },
  { nombre: "10-admin-sistema", ruta: "/admin/sistema", fullPage: true },
];

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
    assert(ready, "Next no arrancó");
    log("app levantada");

    // Sesión admin vía SIWE por API (simulando MetaMask desde el runner).
    const nonceRes = await fetch(`${BASE}/api/auth/nonce`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: admin.address, purpose: "admin" }),
    });
    const nonceJson = await nonceRes.json();
    const signature = await admin.signMessage(nonceJson.data.message);
    const verifyRes = await fetch(`${BASE}/api/auth/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: nonceJson.data.message, signature }),
    });
    assert(verifyRes.ok, `login: ${verifyRes.status}`);
    const cookies = verifyRes.headers.getSetCookie().map((raw) => {
      const [pair] = raw.split(";");
      const [name, ...rest] = pair.split("=");
      return {
        name,
        value: rest.join("="),
        domain: "localhost",
        path: "/",
        httpOnly: name === "sf_session",
        sameSite: "Strict",
      };
    });

    mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    try {
      const anon = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      const anonPage = await anon.newPage();
      for (const pantalla of PANTALLAS.filter((p) => !p.ruta.startsWith("/admin"))) {
        await anonPage.goto(`${BASE}${pantalla.ruta}`);
        await anonPage.waitForLoadState("networkidle");
        await anonPage.screenshot({
          path: `${OUT}/${pantalla.nombre}.png`,
          fullPage: pantalla.fullPage,
        });
        log(`${pantalla.nombre}.png (${pantalla.ruta})`);
      }
      await anon.close();

      const context = await browser.newContext({
        viewport: { width: 1280, height: 860 },
      });
      await context.addCookies(cookies);
      const page = await context.newPage();
      for (const pantalla of PANTALLAS.filter((p) => p.ruta.startsWith("/admin"))) {
        await page.goto(`${BASE}${pantalla.ruta}`);
        await page.waitForLoadState("networkidle");
        await page.screenshot({
          path: `${OUT}/${pantalla.nombre}.png`,
          fullPage: pantalla.fullPage,
        });
        log(`${pantalla.nombre}.png (${pantalla.ruta})`);
      }
      await context.close();
    } finally {
      await browser.close();
    }
    log("TODO OK");
  } finally {
    await stopNext();
    await mongo.close().catch(() => undefined);
    await mongod.stop().catch(() => undefined);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("[capturas] FALLO:", error);
  process.exit(1);
});
