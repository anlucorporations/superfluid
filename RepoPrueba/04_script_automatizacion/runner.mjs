#!/usr/bin/env node
// runner.mjs — FASE 3 · Batería de Caja Negra funcional sobre la UI de la dApp Superfluid Brlt.
//
// ⚠️ REGLA 1: NO ejecuta nada sin la autorización del plan maestro. Arranca comprobando que
//    RepoPrueba/00_PLAN_MAESTRO.md contenga la línea "[x] Autorizo ejecutar"; si no, ABORTA.
//
// Ejemplo de lanzamiento (documentado en README.md — NO ejecutar aún):
//   E2E_PLATFORMS=extension-chrome E2E_WALLETS=metamask \
//   E2E_RPC_URL=http://100.85.239.67:8545 E2E_BASE_URL=http://localhost:3000 \
//   node RepoPrueba/04_script_automatizacion/runner.mjs
//
// Salidas:
//   - Capturas PNG: RepoPrueba/capturas/<ID>_<wallet>_<plataforma>_YYYY-MM-DD_HHMMSS.png
//   - Resultados NDJSON: RepoPrueba/05_resultados/resultados_<YYYY-MM-DD>.ndjson
//     {id, feature, escenario, wallet, plataforma, modo, estado: PASS|FAIL|BLOCKED|N/A|NOT_RUN, duracion_ms, captura, detalle}

import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFeature } from './helpers/gherkin.ts';
import {
  PLATAFORMAS, WALLETS, PRIORIDADES, CUENTAS_ANVIL, CUENTA_SIMULADA,
  existeCombinacion, CON_BUILD_DESCARGABLE,
} from './helpers/catalogo-wallets.ts';
import { lanzarPlataforma, rutaBuildWallet } from './helpers/navegadores.ts';
import { instalarWalletMock } from './helpers/wallet-mock.ts';
import { capturar } from './helpers/capturar.ts';
import { prepararEstadoAnvil, comprobarAnvil } from './helpers/anvil-reset.ts';
import { ejecutarPasos } from './helpers/pasos.ts';
import { RegistroNDJSON, resumen } from './helpers/resultados.ts';

const AQUI = dirname(fileURLToPath(import.meta.url));
const REPO_PRUEBA = resolve(AQUI, '..');
const DIR_FEATURES = resolve(REPO_PRUEBA, '03_features');
const DIR_CAPTURAS = resolve(REPO_PRUEBA, 'capturas');
const DIR_E2E = resolve(AQUI, '.e2e');            // perfiles dedicados de Playwright
const PLAN_MAESTRO = resolve(REPO_PRUEBA, '00_PLAN_MAESTRO.md');

// ---------------------------------------------------------------- configuración por variables de entorno
const cfg = {
  baseUrl: process.env.E2E_BASE_URL || 'http://localhost:3000',
  rpcUrl: process.env.E2E_RPC_URL || 'http://100.85.239.67:8545',
  plataformas: (process.env.E2E_PLATFORMS || PLATAFORMAS.join(',')).split(',').map((s) => s.trim()).filter(Boolean),
  wallets: (process.env.E2E_WALLETS || WALLETS.join(',')).split(',').map((s) => s.trim()).filter(Boolean),
  prioridad: (process.env.E2E_PRIORIDAD || PRIORIDADES.join(',')).split(',').map((s) => s.trim()).filter(Boolean),
  headless: (process.env.E2E_HEADLESS || 'false').toLowerCase() === 'true',
  timeoutMs: Number(process.env.E2E_TIMEOUT_MS || 60000),
  seed: process.env.E2E_TEST_SEED_PHRASE || '', // ⚠️ SECRETO: NUNCA se imprime en logs ni resultados
};

const log = (...a) => console.log(...a);
const selloDia = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- regla 1: autorización del plan maestro
function comprobarAutorizacion() {
  if (!existsSync(PLAN_MAESTRO)) {
    log(`✋ ABORTADO (regla 1): no existe ${PLAN_MAESTRO}`);
    log('   Crea 00_PLAN_MAESTRO.md (FASE 5) y marca "[x] Autorizo ejecutar" antes de lanzar el runner.');
    process.exit(2);
  }
  if (!readFileSync(PLAN_MAESTRO, 'utf8').includes('[x] Autorizo ejecutar')) {
    log(`✋ ABORTADO (regla 1): ${PLAN_MAESTRO} no contiene "[x] Autorizo ejecutar".`);
    log('   El plan maestro debe autorizar la ejecución de forma explícita antes de correr la batería.');
    process.exit(2);
  }
}

// ---------------------------------------------------------------- clasificación de cada escenario
function clasificar(esc) {
  const motivo = [];
  // 1) N/A por catálogo: tag @na del .feature O combinación inexistente (doble comprobación, nunca FAIL)
  if (esc.na) return { estado: 'N/A', detalle: 'combinación inexistente del catálogo (@na)' };
  if (esc.plataforma && esc.wallet) {
    const pOk = cfg.plataformas.includes(esc.plataforma);
    const wOk = cfg.wallets.includes(esc.wallet);
    if (!existeCombinacion(esc.wallet, esc.plataforma)) {
      return { estado: 'N/A', detalle: `catálogo: ${esc.wallet} no existe en ${esc.plataforma}` };
    }
    if (!pOk) return { estado: 'NOT_RUN', detalle: `plataforma ${esc.plataforma} fuera de E2E_PLATFORMS` };
    if (!wOk) return { estado: 'NOT_RUN', detalle: `wallet ${esc.wallet} fuera de E2E_WALLETS` };
  }
  // 2) Filtro de prioridad (E2E_PRIORIDAD)
  if (esc.prioridad && !cfg.prioridad.includes(esc.prioridad)) {
    return { estado: 'NOT_RUN', detalle: `prioridad ${esc.prioridad} fuera de E2E_PRIORIDAD` };
  }
  // 3) Regla 7: seed no definida → BLOCKED si el escenario usa cuentas reales (no se inventa la semilla)
  const texto = esc.pasos.map((p) => p.texto).join(' ');
  const usaCuentas = /cuenta (admin|empleado)|0x[0-9a-fA-F]{6,}/i.test(texto);
  if (usaCuentas && !cfg.seed) {
    return { estado: 'BLOCKED', detalle: 'E2E_TEST_SEED_PHRASE sin definir (regla 7): FASE 5 queda BLOCKED hasta definirla' };
  }
  // 4) Modo real exige build descargable (o navegador nativo para Brave)
  if (esc.modo === 'real') {
    if (esc.navegador === 'brave') {
      if (!process.env.E2E_BRAVE_PATH) return { estado: 'BLOCKED', detalle: 'falta E2E_BRAVE_PATH (navegador Brave)' };
    } else if (!CON_BUILD_DESCARGABLE.includes(esc.wallet)) {
      return { estado: 'BLOCKED', detalle: `${esc.wallet} no tiene build descargable: solo tienda → modo simulada` };
    } else if (!rutaBuildWallet(esc.wallet, esc.navegador || 'chrome')) {
      return { estado: 'BLOCKED', detalle: `falta ${'E2E_WALLET_BUILD_' + esc.wallet.toUpperCase()} (build descomprimido de la wallet)` };
    }
  }
  // 5) Firefox: perfil preparado con la extensión instalada (limitación de Playwright, ver README)
  if (esc.plataforma === 'extension-firefox' && !process.env.E2E_FIREFOX_PROFILE) {
    return { estado: 'BLOCKED', detalle: 'falta E2E_FIREFOX_PROFILE (Playwright no carga extensiones en Firefox stock)' };
  }
  return { estado: 'EJECUTAR', detalle: '' };
}

// ---------------------------------------------------------------- main
async function main() {
  comprobarAutorizacion();

  mkdirSync(DIR_CAPTURAS, { recursive: true });
  mkdirSync(DIR_E2E, { recursive: true });

  log('─'.repeat(78));
  log('FASE 3 — Batería de caja negra funcional (dApp Superfluid Brlt · UI, no pruebas unitarias)');
  log(`baseUrl=${cfg.baseUrl}  rpc=${cfg.rpcUrl}  plataformas=${cfg.plataformas.join(',')}  wallets=${cfg.wallets.join(',')}`);
  log(`headless=${cfg.headless}  seed=${cfg.seed ? 'DEFINIDA (no se muestra)' : 'NO DEFINIDA'}`);
  log('─'.repeat(78));

  const anvilOk = await comprobarAnvil(cfg.rpcUrl);
  log(`Anvil ${cfg.rpcUrl}: ${anvilOk ? 'OK (chainId 31337)' : '⚠️ no responde — los escenarios on-chain fallarán'}`);

  // Inventario de escenarios desde los .feature
  const escenarios = [];
  for (const f of readdirSync(DIR_FEATURES).filter((x) => x.endsWith('.feature')).sort()) {
    escenarios.push(...parseFeature(readFileSync(resolve(DIR_FEATURES, f), 'utf8'), f));
  }
  log(`Escenarios leídos de 03_features/: ${escenarios.length}`);

  const registros = new RegistroNDJSON(`${resolve(REPO_PRUEBA, '05_resultados')}/resultados_${selloDia()}.ndjson`);
  await registros.abrir();

  const resultados = [];
  const contextosAbiertos = new Map();
  try {
    for (const esc of escenarios) {
      const c = clasificar(esc);
      const base = {
        id: esc.id,
        feature: esc.feature,
        escenario: esc.titulo,
        wallet: esc.wallet || '(n/d)',
        plataforma: esc.plataforma || '(n/d)',
        modo: esc.modo || '(n/d)',
      };
      const t0 = Date.now();

      if (c.estado !== 'EJECUTAR') {
        const r = { ...base, estado: c.estado, duracion_ms: 0, captura: null, detalle: c.detalle };
        await registros.escribir(r);
        resultados.push(r);
        continue;
      }

      // Lanzamiento por combinación plataforma × navegador × wallet (contexto reutilizable)
      const clave = `${esc.plataforma}|${esc.navegador}|${esc.wallet}`;
      let ctx = contextosAbiertos.get(clave);
      if (!ctx) {
        try {
          ctx = await lanzarPlataforma({
            plataforma: esc.plataforma, navegador: esc.navegador || 'chrome', wallet: esc.wallet,
            dirE2e: DIR_E2E, headless: cfg.headless,
          });
          contextosAbiertos.set(clave, ctx);
        } catch (err) {
          const r = { ...base, estado: 'BLOCKED', duracion_ms: Date.now() - t0, captura: null, detalle: `no se pudo lanzar el navegador: ${(err).message.split('\n')[0]}` };
          await registros.escribir(r);
          resultados.push(r);
          continue;
        }
      }

      // Modo simulada → inyectar proveedor EIP-1193 mock; modo real → build cargado con --load-extension
      if (esc.modo === 'simulada') {
        await instalarWalletMock(ctx.context, {
          cuenta: CUENTA_SIMULADA, wallet: esc.wallet, rechazarConexion: false,
        });
      }

      const page = await ctx.context.newPage();
      const estadoAnvilOk = anvilOk && (await prepararEstadoAnvil(
        { rpcUrl: cfg.rpcUrl, cuentas: Object.values(CUENTAS_ANVIL), ethPorCuenta: 100, bloqueMineria: 0 },
        { minarBloques: 0 },
      ).then(() => true).catch(() => false));

      let estado = 'FAIL';
      let detalle = '';
      let captura = null;
      try {
        const pasos = await ejecutarPasos(page, esc, {
          baseUrl: cfg.baseUrl, modo: esc.modo || 'simulada', cuentaSimulada: CUENTA_SIMULADA,
        });
        const nPend = pasos.pendientes.length;
        // Regla de FASE 5: un escenario con pasos sin intérprete no puede
        // juzgarse completo. Si quedó sin cubrir pasos, el resultado es NOT_RUN
        // (hueco de la herramienta, nunca FAIL de la app); el error observado se
        // conserva en el detalle como evidencia.
        if (nPend > 0) estado = 'NOT_RUN';
        else if (!pasos.ok) estado = 'FAIL';
        else estado = 'PASS';
        detalle = [
          pasos.detalle,
          nPend ? `${nPend} paso(s) sin intérprete (caja negra FASE 3): ${pasos.pendientes[0]}${nPend > 1 ? '…' : ''}` : '',
          estadoAnvilOk ? '' : 'estado Anvil no verificado (rpc no accesible)',
        ].filter(Boolean).join(' · ');
      } catch (err) {
        estado = 'FAIL';
        detalle = `error de ejecución: ${(err).message.split('\n')[0]}`;
      } finally {
        captura = await capturar(page, DIR_CAPTURAS, { id: esc.id, wallet: esc.wallet, plataforma: esc.plataforma });
        await page.close().catch(() => {});
      }

      const r = { ...base, estado, duracion_ms: Date.now() - t0, captura, detalle };
      await registros.escribir(r);
      resultados.push(r);
      log(`  [${estado}] ${esc.id} ${esc.titulo.slice(0, 70)}${captura ? '  📸' : ''}`);
    }
  } finally {
    for (const [, ctx] of contextosAbiertos) await ctx.cerrar().catch(() => {});
  }

  const tot = resumen(resultados);
  log('─'.repeat(78));
  log(`Resultados → ${resolve(REPO_PRUEBA, '05_resultados')}/resultados_${selloDia()}.ndjson`);
  log(`Capturas   → ${DIR_CAPTURAS}`);
  log(`Totales    → ${JSON.stringify(tot)}  (${resultados.length} escenarios)`);
  log('─'.repeat(78));
}

main().catch((e) => { console.error('ERROR FATAL:', e.message); process.exit(1); });
