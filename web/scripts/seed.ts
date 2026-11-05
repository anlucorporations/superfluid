import { utils } from "ethers";
import { ensureIndexes, closeMongo } from "../src/lib/db";
import { serverEnv } from "../src/lib/env";
import { EXPECTED_CHAIN_ID, fallbackConfig } from "../src/lib/rpc";
import type { AllowlistDoc } from "../src/lib/types";

/**
 * Bootstrap de MongoDB (H3):
 *  - crea índices y colecciones,
 *  - registra la wallet ADMIN_BOOTSTRAP_WALLET en `admin_allowlist` (AC-15),
 *  - deja una `system_config` inicial si no existe.
 *
 * Uso: npm run seed
 */
async function main(): Promise<void> {
  const db = await ensureIndexes();
  const now = new Date();

  const rawWallet = serverEnv.adminBootstrapWallet.trim();
  let bootstrapWallet: string | null = null;

  if (rawWallet) {
    if (!utils.isAddress(rawWallet)) {
      throw new Error(`ADMIN_BOOTSTRAP_WALLET no es una address válida: ${rawWallet}`);
    }
    bootstrapWallet = utils.getAddress(rawWallet);
    await db.collection<AllowlistDoc>("admin_allowlist").updateOne(
      { walletLower: bootstrapWallet.toLowerCase() },
      {
        $setOnInsert: {
          wallet: bootstrapWallet,
          walletLower: bootstrapWallet.toLowerCase(),
          rol: "admin",
          estado: "activo",
          creadoPor: null,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    console.log(`[seed] allowlist: ${bootstrapWallet}`);
  } else {
    console.warn(
      "[seed] ADMIN_BOOTSTRAP_WALLET vacío: no se creó ningún admin. " +
        "Sin una wallet en la allowlist nadie podrá entrar al panel.",
    );
  }

  const existing = await db.collection("system_config").findOne({ _id: "system" as never });
  if (!existing) {
    await db.collection("system_config").insertOne({
      _id: "system",
      chainId: EXPECTED_CHAIN_ID,
      rpcUrl: fallbackConfig.rpcUrl,
      brltAddress: fallbackConfig.brltAddress,
      brltXAddress: fallbackConfig.brltXAddress,
      deployBlock: fallbackConfig.deployBlock,
      tasaRefrescoMs: fallbackConfig.tasaRefrescoMs,
      faucetUrl: fallbackConfig.faucetUrl,
      updatedAt: now,
    } as never);
    console.log("[seed] system_config creada");
  } else {
    console.log("[seed] system_config ya existe (sin cambios)");
  }

  const [employees, projects, admins] = await Promise.all([
    db.collection("employees").countDocuments(),
    db.collection("projects").countDocuments(),
    db.collection("admin_allowlist").countDocuments({ estado: "activo" }),
  ]);

  console.log(
    `[seed] listo · empleados=${employees} proyectos=${projects} admins_activos=${admins}`,
  );
}

main()
  .catch((error) => {
    console.error("[seed] error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongo();
  });
