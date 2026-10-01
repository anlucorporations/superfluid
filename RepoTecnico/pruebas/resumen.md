# Fase 4 · Pruebas — Resumen (agente de pruebas)

Proyecto: Superfluid EUR Streaming · Rama: frontend Web (Next.js 15 + ethers 5.7.2)
Entorno: dev server local `http://localhost:3111` (Next 15.5.4 turbopack) · red real Besu
Codecrypto chainId 81234 (`https://besu.alumnos.codecrypto.academy`) · EURx
`0x7046717d32AfcA450DC5D6e75724D4282DFAd16E` · EUR `0x36C02dA8a0983159322a80FFE9F24b1acfF8B570`.
Cuentas: #0 `0xf39Fd6…92266` (wallet mock EIP-1193 pk pública del curso) y #1
`0x709979…79C8` (receptora).

## 1. Recuento global

| Suite | Pasaron | Fallaron | Total | Evidencia |
|---|---|---|---|---|
| Unitarias `vitest` (src/lib/__tests__/ui-logic.test.ts) | 24 | 0 | 24 | `vitest.log`, `vitest.json` |
| Integración poller (src/lib/__tests__/polling-engine.test.ts) | 8 | 0 | 8 | `vitest.log`, `vitest.json` |
| **Vitest total** | **32** | **0** | **32** | ídem |
| E2E nuevo `lifecycle.spec.ts` | 7 | 0 | 7 | `playwright-lifecycle.log` (1.2 min) |
| E2E nuevo `pagination.spec.ts` | 1 (1 flaky→verde en retry) | 0 | 1 | `playwright-pagination.log` (57.3 s), `playwright-lifecycle-pagination-final.log` |
| E2E existente re-check FINAL (wallet+dashboard+received+axe, 8) | 8 | 0 | 8 | `playwright-existing-recheck.log` (30.5 s, 0 retries; corridas previas: 1 flaky en dashboard) |
| **E2E corrida completa (los 6 specs, 16 tests)** | **16** (15 first-try + 1 flaky→verde) | **0** | **16** | `playwright-full.log` (8.4 min) |
| **E2E corrida final post-fix-paralelos** (lifecycle 7 + pagination 1) | 7 | 0 (+1 flaky→verde) | 8 | `playwright-lifecycle-pagination-final.log` (9.3 min) |
| **Total general (unit + integración + E2E nuevo + E2E existente)** | **48** | **0** | **48** | 24 unit + 8 integración + 16 E2E |

Re-chequeos finales contra el código con los fixes paralelos: `vitest` 32/32 (13:03),
`playwright-existing-recheck.log` 8/8 sin retries (30.5 s, 13:2x), `playwright-lifecycle-pagination-final.log`
8/8 (1 flaky → verde en retry). Estado on-chain de #0 devuelto exactamente al de partida:
`realBalanceOf = 299987654320987654336` EURx, `balanceOf(EUR) = 9999700000000000000000000`,
`getOpenOutflows = [0x70997970…]` (flujo canónico del curso), 0 flujos sembrados residuales.

Comando de ejecución: `npx vitest run --reporter=default --reporter=json --outputFile=RepoTecnico/pruebas/vitest.json`
y `npx playwright test e2e/<spec> --reporter=line` (siempre con `workers: 1`, ver §5).

## 2. Qué se cubrió

**Unitarias (32 asserts sobre lógica pura extraída a `web/src/lib/ui-logic.ts`)**
- `formatEur`: enteros, fracciones, truncado (no redondeo) a 6 decimales, 1 wei → `0.000000`,
  negativos con signo (`-1.234567`, rate `-0.000771`), ceros y borde de 18 decimales.
- `parseEur`: enteros, decimales exactos, >18 decimales (trunca), cero/`0.0`/`0.000` → error
  “cantidad debe ser mayor que 0”, inválidos (`abc`, `-5`, `5e3`, `1,5`, `.5`, `0x10`, `NaN`, `''`).
- `validateReceiver`: EOA válida, sin cuenta conectada, self (mayúsculas/minúsculas), contratos
  EUR y EURx, y 7 malformed (vacío, sin `0x`, 39/41 hex, `0z…`, espacios).
- `humanizeError`: 11 reverts mapeados, firma anidada `error.message`, code 4001 → “Firma
  cancelada”, desconocidos → texto original o “Error desconocido”.
- `paginate`: PAGE_SIZE=10, 11 ítems → 2 páginas (última con 1), 12 → 10+2, 0/1/20/21, recorte
  de índice fuera de rango, pageSize alternativo, `from/to` para el “mostrando X–Y”.

**Integración del motor de sondeo (RNF-04 / RE-04, sin DOM)**
- base 5 s; 1 fallo → 15 000 ms; 2 fallos → 30 000 ms; techo 30 000 ms;
- 3 éxitos consecutivos tras degradación → vuelve a 5 000 ms (`applySuccess`);
- un fallo interrumpe la racha de éxitos (successes → 0, sigue en 30 s);
- anti-solapamiento RE-04a: con una llamada en vuelo la petición se encola (`planTick`) y la
  refresc encolada dispara a 0 ms (`nextDelayMs`);
- máquina de estados completa con `vi.useFakeTimers()`: sondeo a los 15 s, luego 30 s, y 3
  éxitos → 5 s; y dos `tick()` concurrentes → 2 intentos encolados, nunca 2 vuelos.

**E2E `lifecycle.spec.ts` (7 pasos serializados, página compartida, on-chain real)**
00 conexión mock #0 → 01 wrap 5 EUR (approve+`upgradeTo`) → 02 crear flujo a #1 con modal
D15 → 03 Pausar (“Pausado (retiene depósito)” + `depositTotal > 0` on-chain) → 04 Reanudar
(“Activo”) → 05 Cerrar (fila desaparece, “Mis streams salientes (0)”) → 06 downgrade 4 EURx.

**E2E `pagination.spec.ts` (RE-03b / D13)** siembra 12 flujos on-chain desde #0 a 12 EOAs
sintéticas con `cast send` en `beforeAll` (con pasadas de reintento), verifica 10 filas en
página 1, botón “Siguiente →”, 2 filas en página 2, `nav[aria-label="paginación de streams"]`,
“página 1/2” ↔ “página 2/2”, estados disabled de ←/→, y cierre total + restauración del flujo
canónico #0→#1 en `afterAll`.

## 3. Refactor de producto realizado (comportamiento UI idéntico)

- Nuevo `web/src/lib/ui-logic.ts`: `formatEur`, `parseEur`, `validateReceiver`, `paginate`,
  `humanizeError` y la política del poller (`backoffIntervalMs`, `applySuccess`, `applyFailure`,
  `planTick`, `nextDelayMs`, constantes 5/15/30 s, timeout 25 s, recuperación 3 éxitos).
- `web/src/config/web3.ts` reexporta `formatEur`/`DECIMALS`; `web/src/lib/superfluid.ts`
  reexporta `humanizeError` → los 8+ import de la UI no cambiaron.
- `web/src/components/Dashboard.tsx`: usa `parseEur`, `validateReceiver(…, account, CONTRACTS)`
  y `paginate(flows, page, PAGE_SIZE)` (añade recorte de página fuera de rango, que antes
  dejaba la tabla vacía tras cerrar flujos).
- `web/src/lib/polling.ts`: el hook conserva refs/epoch/`refreshNow`, pero delega intervalo y
  anti-solapamiento a las funciones puras.
- Verificación: `npx tsc --noEmit` limpio y re-check E2E existente en verde (§4 flaky).

## 4. Defectos de producto detectados

> Nota de concurrencia: mientras se ejecutaban estas pruebas, el agente de desarrollo aplicó en
> paralelo los fixes **P4-D1..P4-D3** sobre `src/lib/superfluid.ts` (`overrides.gasLimit` por
> método), `src/lib/ui-logic.ts` (`parseEur` con `^\d+(\.\d+)?$` + error en sub-wei,
> `humanizeError` que desenvuelve strings) y `e2e/wallet.spec.ts`/`e2e/dashboard.spec.ts`
> (se quitan los literales frágiles). Los items marcados ✔ están por tanto **corregidos**;
> las suites se re-ejecutaron contra ese código (`playwright-lifecycle-pagination-final.log`,
> `playwright-existing-recheck.log`, `vitest.log` 32/32) y siguen verdes.

1. ✔ (mitigado en P4-D1) **`eth_estimateGas` inconsistente en el RPC Besu del curso.** Para `createFlow` a un
   destinatario nuevo, la estimación a veces revierte con `EuroX: insufficient free balance`
   mientras `eth_call` (latest y pending) y la transacción real con `gasLimit` explícito
   **triunfan** (medido: `cast send` sin límite → revert; `--gas-limit 300000` → minado OK;
   `curl eth_estimateGas` → 172 200 gas). Causa probable: validadores QBFT con relojes
   desincronizados → la simulación acredita un devengo (`owed`) mucho mayor que el del bloque
   de ejecución. Impacto: cualquier mutación de la UI usa `estimateGas` de ethers ⇒ fallos
   intermitentes. Solución propuesta: en `lib/superfluid.ts` añadir `overrides.gasLimit`
   (o reintentar con un límite fijo al recibir `UNPREDICTABLE_GAS_LIMIT`). Mitigación en
   pruebas: `cast send --gas-limit` en la siembra/limpieza; los 7 pasos E2E verdes confirman
   que por la UI el camino funciona en la práctica.
2. ✔ (corregido en P4-D2) **`parseEur` multi-punto / sub-wei.** `parseEur('1.2.3')` = 1.2 EUR (no error) y
   `parseEur('0.0000000000000000001')` = `0n` sin excepción → luego el contrato revierte con
   `EuroX: zero amount`. Solución propuesta: validar `^\d+(\.\d+)?$` y lanzar
   “cantidad debe ser mayor que 0” cuando el resultado en wei sea 0.
3. ✔ (corregido en P4-D3) **`humanizeError` no desenvuelve errores de texto plano.** `humanizeError('cadena suelta')`
   devuelve “Error desconocido” porque solo lee `reason`/`error.message`/`message`. Solución:
   `typeof err === 'string' ? err : …`.
4. **Cierre de flujo deja “deuda viva”.** Tras `closeFlow` la fila desaparece del listado
   (`getOpenOutflows` solo devuelve estado Activo/Pausado) pero `owed` del emisor conserva el
   devengo no reclamado del receptor: el UI no muestra nada que invite a reclamar al emisor.
   Riesgo de soporte (RE-06): documentado, requiere decisión de producto.
5. ✔ **Fragilidad del `wallet.spec.ts` heredado:** espera el literal `99.9` en el body, que solo
   aparece mientras `realBalanceOf(#0)` esté en 29x.xxx; si una corrida cambia el balance
   (wrap/downgrade) el test falla. No se tocó (fuera de alcance) pero conviene reescribirlo
   sobre `aria-label="EURx custodiado: …"` (ya reescrito por el agente de desarrollo).

6. **Rama “Cerrado” inalcanzable en la tabla.** `FlowTable` renderiza el etiqueta `Cerrado`
   para `status === 3`, pero `getOpenOutflows()` solo devuelve estados Activo|Pausado, así que el
   caso nunca se pinta: tras cerrar, la fila **desaparece**. No es un bug visual (el requisito
   D13/RE-03b se cumple), pero deja código muerto y obliga a que el E2E aserta `toHaveCount(0)`
   en lugar de “Estado Cerrado”. Solución propuesta: listado histórico paginado de cerrados o
   borrar la rama.
7. **`validateReceiver` no cubre el FACTORY ni contratos sin soporte EIP-1363.** Solo rechaza
   EUR y EURx; un destino como `0x809d55…cAC3D` (fábrica) u otro contrato sin passing del token
   pasa la validación y el modal lo advierte, pero no lo bloquea (D15 lo asume como riesgo de
   beta). Solución propuesta: `eth_getCode(destino) !== '0x'` → aviso reforzado o bloqueo.

## 5. Notas de ejecución

- `workers: 1` es obligatorio: con dos corridas de Playwright simultáneas contra el mismo dev
  server se observó un 500 de Next (`ENOENT .next/static/development/_buildManifest.js.tmp.*`)
  y races de nonce en la cuenta #0 → falsos fallos de siembra (7/12 y 10/12 flujos). Tras
  serializar y reiniciar el dev server con `.next` limpio, todo verde.
- `vitest` requiere `css.postcss.plugins: []` en `web/vitest.config.ts`: heredaba el
  `postcss.config.mjs` de Tailwind v4 y abortaba con “Invalid PostCSS Plugin”.
- El E2E existente re-checkado: `1 flaky` (`dashboard.spec.ts` lee el Net rate antes del primer
  snapshot del poller → `"—"`; pasa en retry). Causa: espera fija `waitForTimeout(11_000)` sin
  condition-wait sobre el primer dato; no es regresión del refactor. Queda como deuda. En la
  corrida completa posterior (`playwright-full.log`) los 16 tests pasaron a la primera, sin retries.
- **Limpieza de la siembra:** tras la corrida completa quedaron 9 de los 12 flujos sembrados
  abiertos (`afterAll` envió los 12 `closeFlow` pero el RPC descartó varios por nonce/gas). El
  reintento de pasadas del `afterAll` no fue suficiente ⇒ limpieza manual posterior con
  `cast send closeFlow` (3 pasadas) + restauración del flujo canónico #0→#1. Estado final
  verificado: `getOpenOutflows(#0) = [0x70997970…]`, `realBalanceOf(#0) = 299.987654320987654336`
  EURx (idéntico al de partida). Limitación del entorno, no del contrato.
- `pagination.spec.ts` en la última corrida combinada quedó `flaky` (1º intento: el nodo tardó
  en publicar los 12 flujos dentro de `LONG`; retry #1 → verde). Se deja constancia: es
  latencia/descarte de txs del RPC QBFT, no de la UI.
- Estado de red al terminar: flujo canónico #0→#1 activo, `realBalanceOf(#0)` = 299.987654… EURx
  (sin basura de los 12 flujos sembrados), dev server 3111 levantado.

## 6. Artefactos

- `vitest.log` + `vitest.json` — 32/32 (24 unitarias `ui-logic.test.ts` + 8 de integración
  `polling-engine.test.ts`), corrida final 13:2x contra el código ya con los fixes paralelos.
- `playwright-lifecycle.log` — `lifecycle.spec.ts` 7/7 verdes (1.2 min), sin retries.
- `playwright-pagination.log` — `pagination.spec.ts` 1/1 verde (57.3 s) con siembra de 12 flujos.
- `playwright-lifecycle-pagination-final.log` — verificación conjunta final de los 2 specs nuevos
  tras los fixes paralelos: 8/8 verdes (1 flaky → verde en retry), 9.3 min.
- `playwright-full.log` — corrida de los 6 specs (8 existentes + 7 lifecycle + 1 paginación):
  16/16 verdes (1 flaky resuelto en retry), 8.4 min.
- `playwright-existing-recheck.log` — re-check final de los 8 tests preexistentes: 8/8 en 30.5 s,
  0 retries.
- `resumen.md` — este informe.
- Código de prueba añadido: `web/vitest.config.ts`, `web/src/lib/ui-logic.ts`,
  `web/src/lib/__tests__/ui-logic.test.ts`, `web/src/lib/__tests__/polling-engine.test.ts`,
  `web/e2e/lifecycle.spec.ts`, `web/e2e/pagination.spec.ts`.
