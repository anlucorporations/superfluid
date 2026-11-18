// helpers/catalogo-wallets.ts — FASE 3
// Catálogo de plataformas × wallets confirmado por el usuario (alcance FASE 3).
// Fuente: matriz_trazabilidad.md §0 y 02_requisitos_ears.md §12.
//
// Reglas del catálogo:
//  - Las combinaciones INEXISTENTES (Trust/Firefox, Trust/Edge, Phantom/Edge,
//    Coinbase/Edge, Brave solo en navegador Brave, MetaMask/Coinbase/Trust/Brave en desktop)
//    se marcan N/A — nunca FAIL (el tag @na del .feature ya lo declara; esto sirve de segunda comprobación).
//  - @modo:real  → build descargable e instalable con --load-extension (o navegador nativo para Brave).
//  - @modo:simulada → solo instalación manual desde tienda (Phantom, Coinbase, Trust, OKX):
//    el runner inyecta el proveedor EIP-1193 mock de wallet-mock.ts.
//  - @wallet:<proyecto> NO APLICA: el proyecto es una dApp web sin wallet propia (documentado).

export type Plataforma = 'desktop' | 'extension-chrome' | 'extension-firefox' | 'extension-edge';
export type Navegador = 'chrome' | 'firefox' | 'edge' | 'brave' | 'desktop';
export type Modo = 'real' | 'simulada';
export type Wallet = 'metamask' | 'phantom' | 'rabby' | 'coinbase' | 'trust' | 'okx' | 'brave';

/** Plataformas en alcance (sin Android/iOS, confirmado por el usuario). */
export const PLATAFORMAS: Plataforma[] = ['desktop', 'extension-chrome', 'extension-firefox', 'extension-edge'];

/** Wallets del mercado en alcance (selección representativa completa). */
export const WALLETS: Wallet[] = ['metamask', 'phantom', 'rabby', 'coinbase', 'trust', 'okx', 'brave'];

/** Prioridades admitidas en los tags @prioridad:*. */
export const PRIORIDADES = ['alta', 'media', 'baja'] as const;

/** Navegadores que atiende cada plataforma. */
export const NAVEGADOR_POR_PLATAFORMA: Record<Plataforma, Navegador[]> = {
  desktop: ['desktop'],
  'extension-chrome': ['chrome', 'brave'], // Brave Wallet se ejecuta dentro del navegador Brave (channel 'brave')
  'extension-firefox': ['firefox'],
  'extension-edge': ['edge'],
};

/** Variable de entorno con la ruta del build descomprimido de cada wallet (modo real). */
export const ENV_BUILD_POR_WALLET: Record<Wallet, string> = {
  metamask: 'E2E_WALLET_BUILD_METAMASK',
  rabby: 'E2E_WALLET_BUILD_RABBY',
  phantom: 'E2E_WALLET_BUILD_PHANTOM',
  coinbase: 'E2E_WALLET_BUILD_COINBASE',
  trust: 'E2E_WALLET_BUILD_TRUST',
  okx: 'E2E_WALLET_BUILD_OKX',
  brave: 'E2E_BRAVE_PATH', // Brave no se "carga": es el propio navegador Brave (ejecutable o channel)
};

/** Wallets con build descargable (automatizables con --load-extension). Las demás: solo tienda → simulada. */
export const CON_BUILD_DESCARGABLE: Wallet[] = ['metamask', 'rabby'];

/** Plataformas donde existe la wallet según el catálogo oficial. */
export const DISPONIBILIDAD: Record<Wallet, Plataforma[]> = {
  metamask: ['extension-chrome', 'extension-firefox', 'extension-edge'], // sin app de escritorio
  rabby: ['extension-chrome', 'extension-firefox', 'extension-edge', 'desktop'],
  phantom: ['extension-chrome', 'extension-firefox'], // sin extensión Edge
  coinbase: ['extension-chrome'], // sin extensión Edge, sin escritorio
  trust: ['extension-chrome'], // solo Chromium: ni Firefox ni Edge, sin escritorio
  okx: ['extension-chrome', 'extension-firefox', 'extension-edge', 'desktop'],
  brave: ['extension-chrome'], // solo como navegador Brave nativo (@navegador:brave)
};

/**
 * Clasifica una combinación plataforma × wallet contra el catálogo.
 * Devuelve 'existe' | 'inexistente'. El runner marca N/A las inexistentes aunque falte el tag @na.
 */
export function existeCombinacion(wallet: Wallet, plataforma: Plataforma): boolean {
  return DISPONIBILIDAD[wallet]?.includes(plataforma) ?? false;
}

/** cuentas de prueba de Anvil (solo direcciones públicas; las claves NUNCA van en scripts ni logs). */
export const CUENTAS_ANVIL = {
  admin0: '0xb4eCE9a93c2d400e4322EfFF9Ae9dA284aD200DF',
  admin1: '0x9423e32e170E36dD5B33819629fB33bdaAA15cEF',
  empleado2: '0x89Dd06d6f8b0CC425Eff702fE7b026e829AB4eBe',
  empleado3: '0xc4d47529Cf91Fab4dF069D2014C9B11065FdFB41',
  empleado4: '0xf100d77F47B9ffF6a42C8b69Fe28295100B2C828',
} as const;

/** Cuenta por defecto usada por el proveedor simulado (empleado #2, presente en la mayoría de escenarios). */
export const CUENTA_SIMULADA = CUENTAS_ANVIL.empleado2;
