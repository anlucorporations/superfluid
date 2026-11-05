import { ensureIndexes } from "../db";
import { ApiError } from "../http";
import {
  assertExpectedChain,
  EXPECTED_CHAIN_ID,
  fallbackConfig,
  hasContractCode,
  serverRpcUrl,
} from "../rpc";
import type { SystemUpdateInput } from "../validation";
import { recordAudit } from "./audit";
import type { SystemConfigDoc } from "../types";

export interface SystemConfigDto {
  chainId: number;
  rpcUrl: string;
  brltAddress: string;
  brltXAddress: string;
  deployBlock: number;
  tasaRefrescoMs: number;
  faucetUrl: string;
  updatedAt: string | null;
}

let cache: { value: SystemConfigDto; at: number } | null = null;
const CACHE_MS = 5_000;

function fromDoc(doc: SystemConfigDoc): SystemConfigDto {
  return {
    chainId: doc.chainId,
    rpcUrl: doc.rpcUrl,
    brltAddress: doc.brltAddress ?? "",
    brltXAddress: doc.brltXAddress ?? "",
    deployBlock: doc.deployBlock ?? 0,
    tasaRefrescoMs: doc.tasaRefrescoMs ?? 5_000,
    faucetUrl: doc.faucetUrl ?? fallbackConfig.faucetUrl,
    updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : null,
  };
}

/** Lee la configuración persistida con una caché corta (RT-07: sin reinicio). */
export async function getSystemConfig(force = false): Promise<SystemConfigDto> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const db = await ensureIndexes();
  const doc = await db.collection<SystemConfigDoc>("system_config").findOne({ _id: "system" });
  const value: SystemConfigDto = doc
    ? fromDoc(doc)
    : { ...fallbackConfig, updatedAt: null };

  cache = { value, at: Date.now() };
  return value;
}

export function invalidateSystemCache(): void {
  cache = null;
}

/** Valida red y contratos antes de persistir (CU-11 pasos 3-4 y A1-A3). */
export async function validateSystemConfig(patch: SystemUpdateInput): Promise<void> {
  const current = await getSystemConfig(true);
  const rpcUrl = patch.rpcUrl ?? current.rpcUrl ?? serverRpcUrl();

  try {
    await assertExpectedChain(rpcUrl);
  } catch (error) {
    throw new ApiError(
      422,
      "red_invalida",
      `El RPC no responde con chainId ${EXPECTED_CHAIN_ID}: ${(error as Error).message}`,
    );
  }

  for (const [label, address] of [
    ["BRLT", patch.brltAddress],
    ["BrltX", patch.brltXAddress],
  ] as const) {
    if (!address) continue;
    let ok = false;
    try {
      ok = await hasContractCode(rpcUrl, address);
    } catch {
      ok = false;
    }
    if (!ok) {
      throw new ApiError(
        422,
        "contrato_no_accesible",
        `${label}: no hay contrato accesible en ${address} con el RPC configurado`,
      );
    }
  }
}

export async function updateSystemConfig(
  patch: SystemUpdateInput,
  actorWallet: string,
): Promise<SystemConfigDto> {
  await validateSystemConfig(patch);

  const db = await ensureIndexes();
  const current = await getSystemConfig(true);
  const now = new Date();
  const $set: Record<string, unknown> = {
    chainId: EXPECTED_CHAIN_ID,
    rpcUrl: patch.rpcUrl ?? current.rpcUrl,
    brltAddress: patch.brltAddress ?? current.brltAddress,
    brltXAddress: patch.brltXAddress ?? current.brltXAddress,
    deployBlock: patch.deployBlock ?? current.deployBlock,
    tasaRefrescoMs: patch.tasaRefrescoMs ?? current.tasaRefrescoMs,
    faucetUrl: patch.faucetUrl ?? current.faucetUrl,
    updatedAt: now,
  };

  await db
    .collection<SystemConfigDoc>("system_config")
    .updateOne({ _id: "system" }, { $set }, { upsert: true });

  invalidateSystemCache();

  await recordAudit({
    actorWallet,
    accion: "config",
    meta: {
      entidad: "system_config",
      operacion: "edicion",
      cambios: Object.keys(patch),
    },
  });

  return getSystemConfig(true);
}

export async function healthcheck(): Promise<{
  db: boolean;
  chainId: number | null;
  rpc: boolean;
}> {
  let db = false;
  try {
    const database = await ensureIndexes();
    await database.command({ ping: 1 });
    db = true;
  } catch {
    db = false;
  }

  const config = await getSystemConfig();
  let chainId: number | null = null;
  try {
    const { fetchChainId } = await import("../rpc");
    chainId = await fetchChainId(config.rpcUrl);
  } catch {
    chainId = null;
  }

  return { db, rpc: chainId === EXPECTED_CHAIN_ID, chainId };
}
