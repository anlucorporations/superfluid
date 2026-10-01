// RT-06: configuración centralizada de red y contratos.
// Addresses leídos del registro canónico sc/out/deployments/codecrypto.json
// (sobrescribibles por NEXT_PUBLIC_* para el build Docker de Cloud Run, RT-08).

export const CHAIN = {
  name: 'Codecrypto',
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 81234),
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? 'https://besu.alumnos.codecrypto.academy',
  currency: 'CC',
  explorer: null as string | null, // red privada sin explorador
} as const;

export const CONTRACTS = {
  EUR: process.env.NEXT_PUBLIC_EUR_ADDRESS ?? '0x36C02dA8a0983159322a80FFE9F24b1acfF8B570',
  EURx: process.env.NEXT_PUBLIC_EURX_ADDRESS ?? '0x7046717d32AfcA450DC5D6e75724D4282DFAd16E',
  FACTORY: process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? '0x809d550fca64d94Bd9F66E60752A544199cfAC3D',
} as const;

// Constantes económicas canónicas — espejo exacto de RepoTecnico/casos_uso.md §0.
// Reevaluadas por tools/constants-check.mjs en CI (proceso post-auditoría).
export const RATE_WEI_PER_SEC = BigInt("771604938271604"); // floor(2000e18 / 2_592_000); mes = 30 días
export const MONTH_SECONDS = BigInt("2592000");
export const DEPOSIT_HOURS = BigInt("3600");

// Fase 4 (pruebas): formatEur/DECIMALS son lógica pura y viven en lib/ui-logic.ts para
// poder testarse sin React; se reexportan aquí para no tocar los import de la UI.
export { DECIMALS, formatEur } from '@/lib/ui-logic';
