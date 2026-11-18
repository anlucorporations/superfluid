// helpers/anvil-reset.ts — FASE 3
// Estado DETERMINISTA del Anvil de pruebas (vm-blockchain, chainId 31337) antes de cada escenario.
// RPC por defecto: http://100.85.239.67:8545 (local/VM) — Cloud Run: http://10.140.0.4:8546 (E2E_RPC_URL).
//
// ⚠️ SECRETO: la semilla E2E_TEST_SEED_PHRASE **nunca se imprime en logs ni en resultados**.
//    Este helper NO la necesita: solo llama a los RPC admin_* / anvil_* con direcciones públicas.
//    Las claves privadas de las cuentas viven SOLO en RepoTecnico/ANVIL_CUENTAS_CLAVES.md (no commitear)
//    y se importan en la wallet manualmente o vía E2E_TEST_SEED_PHRASE cuando FASE 5 la defina.

export interface OpcionesAnvil {
  rpcUrl: string;            // E2E_RPC_URL
  cuentas: string[];         // direcciones públicas a reponer
  ethPorCuenta?: number;     // por defecto 100 ETH
  bloqueMineria?: number;    // si > 0 → anvil_setIntervalMining(n); si 0/undefined → auto-mine
}

/** JSON-RPC genérico contra Anvil (sin dependencias externas, usa fetch nativo). */
export async function rpcLlamar(rpcUrl: string, metodo: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Anvil RPC ${metodo} HTTP ${res.status}`);
  const cuerpo = await res.json();
  if (cuerpo.error) throw new Error(`Anvil RPC ${metodo} → ${JSON.stringify(cuerpo.error)}`);
  return cuerpo.result;
}

const WEI_100_ETH = '0x56bc75e2d63100000'; // 100e18

/** Reaporta el saldo de una cuenta sin tocar su nonce (aísla el escenario del histórico). */
async function fijarSaldo(opc: OpcionesAnvil, cuenta: string): Promise<void> {
  const wei = '0x' + BigInt(Math.round((opc.ethPorCuenta ?? 100) * 1e18)).toString(16);
  await rpcLlamar(opc.rpcUrl, 'anvil_setBalance', [cuenta, wei]);
}

/**
 * Prepara el estado del Anvil para un escenario:
 *  1. Saldo determinista en las cuentas de prueba (anvil_setBalance).
 *  2. Minería determinista: anvil_setIntervalMining(n) si se pide, o desactivada para anvil_mine manual.
 *  3. (Opcional, según flujo) avanza bloques con anvil_mine para estados de devengo/liquidación.
 */
export async function prepararEstadoAnvil(opc: OpcionesAnvil, opciones?: { minarBloques?: number }): Promise<void> {
  for (const cuenta of opc.cuentas) {
    await fijarSaldo(opc, cuenta);
  }
  if (opc.bloqueMineria && opc.bloqueMineria > 0) {
    await rpcLlamar(opc.rpcUrl, 'anvil_setIntervalMining', [opc.bloqueMineria]);
  } else {
    await rpcLlamar(opc.rpcUrl, 'anvil_setIntervalMining', [0]); // minado manual determinista
  }
  if (opciones?.minarBloques) {
    await rpcLlamar(opc.rpcUrl, 'anvil_mine', [opciones.minarBloques, 0]); // n bloques, instantáneos
  }
}

/** Comprueba conectividad con Anvil (eth_chainId debe devolver 0x7a69 = 31337). */
export async function comprobarAnvil(rpcUrl: string): Promise<boolean> {
  try {
    const chainId = (await rpcLlamar(rpcUrl, 'eth_chainId')) as string;
    return chainId?.toLowerCase() === '0x7a69';
  } catch {
    return false;
  }
}
