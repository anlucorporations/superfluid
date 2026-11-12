import { publicEnv } from "./env";

/**
 * Chain esperada del RPC. Se toma de NEXT_PUBLIC_CHAIN_ID (81234 Besu por
 * defecto; 31337 para Anvil), en lugar de estar fijada en el código.
 */
export const EXPECTED_CHAIN_ID = publicEnv.chainId;

export interface RpcResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

export async function rpc<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { result?: T; error?: { message?: string } };
    if (payload.error) throw new Error(payload.error.message ?? "error JSON-RPC");
    return payload.result as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchChainId(rpcUrl: string): Promise<number> {
  const hex = await rpc<string>(rpcUrl, "eth_chainId");
  return Number.parseInt(hex, 16);
}

/** Comprueba que el RPC responde 81234 (CU-11 paso 3 / A1). */
export async function assertExpectedChain(rpcUrl: string): Promise<void> {
  const chainId = await fetchChainId(rpcUrl);
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`chainId ${chainId} inesperado; se espera ${EXPECTED_CHAIN_ID}`);
  }
}

/** `eth_getCode` distinto de `0x` = contrato accesible (CU-11 / A3). */
export async function hasContractCode(rpcUrl: string, address: string): Promise<boolean> {
  if (!address) return false;
  const code = await rpc<string>(rpcUrl, "eth_getCode", [address, "latest"]);
  return typeof code === "string" && code !== "0x" && code.length > 2;
}

export function defaultRpcUrl(): string {
  return publicEnv.rpcUrl;
}

export function serverRpcUrl(): string {
  return process.env.RPC_URL ?? publicEnv.rpcUrl;
}

export const fallbackConfig = {
  chainId: EXPECTED_CHAIN_ID,
  rpcUrl: serverRpcUrl(),
  brltAddress: publicEnv.brltAddress,
  brltXAddress: publicEnv.brltXAddress,
  deployBlock: 0,
  tasaRefrescoMs: 5_000,
  faucetUrl: publicEnv.faucetUrl,
};
