import { spawn } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Arranca un MongoDB efímero en memoria y lanza `next dev` contra él.
 * Útil para desarrollo local cuando no hay mongod instalado.
 *
 * Uso: npm run dev:mem
 */

const PORT = Number(process.env.MEM_MONGO_PORT ?? 27017);

const mongod = await MongoMemoryServer.create({
  instance: { port: PORT, dbName: "superfluid" },
  binary: { version: process.env.MEM_MONGO_VERSION ?? "7.0.14" },
});

const uri = mongod.getUri("superfluid");
console.log(`[dev:mem] MongoDB en memoria: ${uri}`);

const child = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "dev"],
  {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, MONGODB_URI: uri, MONGODB_DB: "superfluid" },
  },
);

async function shutdown(code = 0) {
  child.kill("SIGTERM");
  await mongod.stop().catch(() => undefined);
  process.exit(code);
}

child.on("exit", (code) => {
  void shutdown(code ?? 0);
});
process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));
