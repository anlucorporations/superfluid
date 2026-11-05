import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { utils } from "ethers";
import { closeMongo, ensureIndexes } from "../src/lib/db";
import { publicEnv } from "../src/lib/env";
import { EXPECTED_CHAIN_ID, fetchChainId, hasContractCode } from "../src/lib/rpc";
import type { AllowlistDoc, SystemConfigDoc } from "../src/lib/types";

/**
 * Registra en MongoDB el despliegue real de `sc/deployments/<chainId>.json`:
 *   - valida chainId contra el RPC y que ambas addresses tengan código,
 *   - hace upsert de `system_config` (RT-07: el panel no necesita re-desplegar),
 *   - opcionalmente añade el owner a `admin_allowlist` como admin activo.
 *
 * Uso:
 *   npm run register:deploy
 *   DEPLOYMENTS_FILE=../sc/deployments/81234.json RPC_URL=... npm run register:deploy
 */

interface DeploymentFile {
  chainId: number;
  deployBlock?: number;
  brlt: string;
  brltX: string;
  owner: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const defaultFile = resolve(here, "..", "..", "sc", "deployments", `${EXPECTED_CHAIN_ID}.json`);

function log(...args: unknown[]): void {
  console.log("[register]", ...args);
}

function assertAddress(label: string, value: string): string {
  if (!value || !utils.isAddress(value)) {
    throw new Error(`${label} no es una address válida: ${value}`);
  }
  return utils.getAddress(value);
}

async function main(): Promise<void> {
  const file = process.env.DEPLOYMENTS_FILE ?? defaultFile;
  const raw = JSON.parse(await readFile(file, "utf8")) as DeploymentFile;
  log(`leyendo ${file}`);

  const brlt = assertAddress("brlt", raw.brlt);
  const brltX = assertAddress("brltX", raw.brltX);
  const owner = assertAddress("owner", raw.owner);
  const rpcUrl = process.env.RPC_URL ?? publicEnv.rpcUrl;

  const chainId = await fetchChainId(rpcUrl);
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`el RPC responde chainId ${chainId}; se espera ${EXPECTED_CHAIN_ID}`);
  }
  if (raw.chainId && raw.chainId !== chainId) {
    throw new Error(`el JSON declara chainId ${raw.chainId} pero el RPC responde ${chainId}`);
  }

  for (const [label, address] of [
    ["Brlt", brlt],
    ["BrltX", brltX],
  ] as const) {
    if (!(await hasContractCode(rpcUrl, address))) {
      throw new Error(`${label}: no hay código en ${address} con ${rpcUrl}`);
    }
  }
  log(`chainId ${chainId} y contratos accesibles ✓`);

  const db = await ensureIndexes();
  const now = new Date();
  const deployBlock = raw.deployBlock ?? Number(process.env.DEPLOY_BLOCK ?? 0);

  await db.collection<SystemConfigDoc>("system_config").updateOne(
    { _id: "system" },
    {
      $set: {
        chainId,
        rpcUrl,
        brltAddress: brlt,
        brltXAddress: brltX,
        deployBlock,
        tasaRefrescoMs: 5_000,
        faucetUrl: publicEnv.faucetUrl,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
  log(`system_config: BRLT=${brlt} BrltX=${brltX} bloque=${deployBlock}`);

  if (process.env.SKIP_ALLOWLIST !== "1") {
    await db.collection<AllowlistDoc>("admin_allowlist").updateOne(
      { walletLower: owner.toLowerCase() },
      {
        $setOnInsert: {
          wallet: owner,
          walletLower: owner.toLowerCase(),
          rol: "admin",
          estado: "activo",
          creadoPor: null,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    log(`admin_allowlist: ${owner}`);
  }

  log("listo");
}

main()
  .catch((error) => {
    console.error("[register] error:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongo();
  });
