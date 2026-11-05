/**
 * Verifica el binario standalone debump que ejecuta Cloud Run/Docker:
 * `node .next/standalone/server.js`. Equivalente al CMD del Dockerfile.
 * Comprueba /api/health y /login, y then lo desconecta limpio.
 * Uso: npm run verify:standalone   (requiere npm run build previo)
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";

const PORT = Number(process.env.PORT ?? 3105);
const BASE = `http://localhost:${PORT}`;
const SERVER = fileURLToPath(new URL("../.next/standalone/server.js", import.meta.url));

function log(...args) {
  console.log("[verify:standalone]", ...args);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Mongo en memoria (binario 7.0.14 fijado): la sonda /api/health exige DB viva.
const mongod = await MongoMemoryServer.create({
  binary: { version: process.env.MEM_MONGO_VERSION ?? "7.0.14" },
});

const child = spawn(
  process.execPath,
  [SERVER],
  {
    env: {
      ...process.env,
      MONGODB_URI: mongod.getUri("superfluid"),
      MONGODB_DB: "superfluid",
      SIWE_DOMAIN: process.env.SIWE_DOMAIN ?? `localhost:${PORT}`,
      ADMIN_BOOTSTRAP_WALLET: process.env.ADMIN_BOOTSTRAP_WALLET ?? "",
      DISABLE_JOBS: "1",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "inherit", "inherit"],
  },
);

let exited = false;
child.on("exit", () => {
  exited = true;
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const response = await fetch(`${BASE}/api/health`);
      const payload = await response.json().catch(() => null);
      ready = response.ok && payload?.data?.status === "ok";
      log(`intento ${attempt}: /api/health → ${response.status}`);
    } catch {
      ready = false;
    }
  }
  assert(ready, "El servidor standalone no está a tiempo");

  const login = await fetch(`${BASE}/login`);
  assert(login.ok, `GET /login → ${login.status}`);
  const text = await login.text();
  // La versión portable prerenderizada del cliente sirve la pantalla admin.
  assert(text.includes("html"), "respuesta HTML inesperada");
  log("GET /login OK");

  log("TODO OK: el binario standalone arranca y responde.");
} finally {
  if (!exited) {
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  await mongod.stop().catch(() => undefined);
}
process.exit(0);
