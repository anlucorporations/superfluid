// helpers/navegadores.ts — FASE 3
// Lanzamiento de Playwright 1.55 por plataforma con perfil DEDICADO y wallet cargada.
// Playwright está disponible en /home/lucci/workspace/superfluid/web/node_modules (no se reinstala).

import { createRequire } from 'node:module';
import type { Plataforma, Navegador, Wallet } from './catalogo-wallets.ts';
import { ENV_BUILD_POR_WALLET } from './catalogo-wallets.ts';

const require = createRequire(import.meta.url);
const PW = require('/home/lucci/workspace/superfluid/web/node_modules/playwright/index.js');

export interface Lanzamiento {
  context: {
    newPage: () => Promise<unknown>;
    pages: () => unknown[];
    close: () => Promise<void>;
    addInitScript: (s: string) => Promise<void>;
  };
  cerrar: () => Promise<void>;
}

/** Directorio de perfil dedicado por (plataforma, navegador, wallet) para no contaminar perfiles reales. */
export function dirPerfil(dirE2e: string, plataforma: Plataforma, navegador: Navegador, wallet: Wallet): string {
  return `${dirE2e}/perfiles/${plataforma}_${navegador}_${wallet}`;
}

/** Ruta del build descomprimido de la wallet (E2E_WALLET_BUILD_<WALLET>). */
export function rutaBuildWallet(wallet: Wallet, navegador: Navegador): string | null {
  const v = process.env[ENV_BUILD_POR_WALLET[wallet]];
  if (v && v.trim()) return v.trim();
  // build específico por navegador (p. ej. XPI de MetaMask para Firefox)
  if (navegador === 'firefox') {
    const vf = process.env[ENV_BUILD_POR_WALLET[wallet] + '_FIREFOX'];
    if (vf && vf.trim()) return vf.trim();
  }
  return null;
}

/**
 * Lanza el navegador para una combinación plataforma × navegador × wallet.
 *  - extension-chrome  → Chromium con --load-extension (y --disable-extensions-except).
 *  - extension-edge    → Chromium channel 'msedge' con --load-extension.
 *  - @navegador:brave  → Chromium channel 'brave' (Brave Wallet es NATIVA del navegador: no se "carga" build).
 *  - extension-firefox → Firefox: Playwright NO soporta --load-extension en Firefox stock.
 *                        Se exige perfil preparado (extensión instalada a mano una vez) mediante
 *                        E2E_FIREFOX_PROFILE; sin él → BLOCKED (documentado en README).
 *  - desktop           → Chromium plano SIN extensión: la wallet se inyecta SIMULADA
 *                        (wallet-mock.ts). La automatización GUI de wallets de escritorio
 *                        (Rabby/Phantom/OKX Desktop) queda como OPCIÓN MANUAL (documentado).
 * E2E_HEADLESS=false por defecto: las extensiones requieren ventana visible en Chromium clásico.
 */
export async function lanzarPlataforma(opc: {
  plataforma: Plataforma;
  navegador: Navegador;
  wallet: Wallet;
  dirE2e: string;
  headless: boolean;
}): Promise<Lanzamiento> {
  const { plataforma, navegador, wallet, dirE2e, headless } = opc;
  const perfil = dirPerfil(dirE2e, plataforma, navegador, wallet);
  const args: string[] = [];
  let lib = PW.chromium;
  let canal: string | undefined;

  if (plataforma === 'extension-chrome' || plataforma === 'extension-edge') {
    const build = rutaBuildWallet(wallet, navegador);
    if (plataforma === 'extension-edge') canal = 'msedge';
    if (navegador === 'brave') canal = 'brave'; // Brave Wallet nativa
    if (build) {
      args.push(`--disable-extensions-except=${build}`, `--load-extension=${build}`);
    }
  } else if (plataforma === 'desktop') {
    // Chromium plano; wallet simulada inyectada por wallet-mock.ts (ver instalarWalletMock)
  } else if (plataforma === 'extension-firefox') {
    const perfilPreparado = process.env.E2E_FIREFOX_PROFILE;
    if (!perfilPreparado) {
      throw new Error('BLOCKED: Playwright no soporta carga de extensiones en Firefox stock; prepara E2E_FIREFOX_PROFILE (ver README)');
    }
    const contexto = await PW.firefox.launchPersistentContext(perfilPreparado, { headless });
    return { context: contexto, cerrar: () => contexto.close() };
  }

  const contexto = await lib.launchPersistentContext(perfil, {
    headless,
    channel: canal,
    viewport: { width: 1280, height: 800 },
    args,
  });
  return { context: contexto, cerrar: () => contexto.close() };
}
