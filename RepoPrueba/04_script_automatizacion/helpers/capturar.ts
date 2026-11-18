// helpers/capturar.ts — FASE 3
// Captura PNG por escenario (regla 5 de la batería):
//   RepoPrueba/capturas/<ID>_<wallet>_<plataforma>_YYYY-MM-DD_HHMMSS.png
// Ej.: ESC-001_metamask_extension-chrome_2026-11-18_143012.png
// Si un escenario genera varias capturas se sufija _02, _03, … (convención de la matriz §5).

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Playwright ya instalado en el proyecto web (no se reinstala ni se declara dependencia nueva).
export const { chromium, firefox } = require('/home/lucci/workspace/superfluid/web/node_modules/playwright/index.js');

export interface ContextoCaptura {
  id: string;            // ESC-NNN
  wallet: string;        // metamask | rabby | ...
  plataforma: string;    // desktop | extension-chrome | ...
}

/** Fecha local en formato YYYY-MM-DD_HHMMSS (sin dependencias). */
export function selloFecha(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Construye el nombre del PNG según la convención. */
export function nombreCaptura(ctx: ContextoCaptura, fecha = new Date(), sufijo = ''): string {
  const suf = sufijo ? `_${sufijo}` : '';
  return `${ctx.id}_${ctx.wallet}_${ctx.plataforma}_${selloFecha(fecha)}${suf}.png`;
}

/**
 * Guarda la captura del escenario en RepoPrueba/capturas/.
 * Acepta cualquier Page de Playwright (Page | null). Si page es null (escenario no ejecutado)
 * no se genera PNG y devuelve null — N/A y NOT_RUN no requieren captura (matriz §5).
 */
export async function capturar(page: { screenshot: (o: { path: string; fullPage: boolean }) => Promise<void> } | null,
  dirCapturas: string, ctx: ContextoCaptura, contador: number): Promise<string | null> {
  if (!page) return null;
  const fs = await import('node:fs/promises');
  await fs.mkdir(dirCapturas, { recursive: true });
  const sufijo = contador > 1 ? String(contador).padStart(2, '0') : '';
  const ruta = `${dirCapturas}/${nombreCaptura(ctx, new Date(), sufijo)}`;
  await page.screenshot({ path: ruta, fullPage: true });
  return ruta;
}
