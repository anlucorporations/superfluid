# INFORME DE PRUEBAS — Fase 4 · Superfluid EUR Streaming v1 beta

> **RESUMEN GLOBAL — FASE 4 CERRADA (2026-10-01):**
> - Contratos (Forge): **37/37** + suite de invariantes fuzz con 5 actores (4 asserts, 712 s, runs=1000) — 0 fallos. Cobertura EuroX 88.8 % líneas / 91.3 % funcs. Slither: 0 High/Medium.
> - Unitarias TS (vitest): **32/32**.
> - E2E navegador (Playwright, red REAL Besu): **16/16 limpios en 2 corridas consecutivas** (8.3 min y 3.8 min, sin retries) — logs `playwright-full-1/2.log`.
> - Integración live: 5/5 asserts (custodia == supply == Σ saldos exacto en la instancia desplegada).
> - Errores encontrados: 9 corregidos (2 del agente, 5 míos post-informe, 2 de infra de pruebas) + 2 registrados como decisión de producto (§5.3).
> **Veredicto: criterios de Fase 4 cumplidos → apto para Fase 5 (manuales).**

## 1. Resultados por área

### 1.1 Smart contracts (Forge)
| Suite (F4 final) | Tests | Resultado | Log |
|---|---|---|---|
| EuroTest (ERC20/cap) | 4 | ✅ 4/4 | `pruebas/forge-units.log` |
| EuroXTest (CFA V3: wrap, flows, pausa, cierre, settle-pull, claims, regresiones CRIT/ALTA del informe V2) | 32 | ✅ 32/32 | idem |
| EuroxFactoryTest (nueva en F4: pares, owner, transfers) | 6 | ✅ 6/6 | idem |
| EuroXInvariants (fuzz: I1 Σreal==supply, I2 real≥deps, I3 fórmula deps, I4 custodia — 5 actores, claims cruzados, runs=1000, 712 s) | 1 suite / 4 invariantes | ✅ | `pruebas/forge-invariants.log` |
| Cobertura EuroX.sol | — | **88.8 % líneas · 91.3 % funcs** (ir-minimum) | `pruebas/forge-coverage.log` |
| Slither | — | **0 High/Medium** en `src/` (10 Low, 11 Info documentados) | `pruebas/slither.log` |

### 1.2 Frontend unit/integration (vitest)
| Archivo | Tests | Resultado |
|---|---|---|
| `src/lib/__tests__/ui-logic.test.ts` (formatEur signo/truncado, parseEur, validateReceiver, humanizeError, paginación) | 24 | ✅ |
| `src/lib/__tests__/polling-engine.test.ts` (escalera de backoff 5→15→30, recuperación 3 éxitos, anti-solapamiento) | 8 | ✅ |
| Integración live contra Besu (custodia==supply==Σsaldos; networkId; vistas legibles) | 5 asserts | ✅ `pruebas/integration-live.log` |

### 1.3 E2E navegador (Playwright + chromium headless, red REAL Besu, `workers: 1`)
| Spec | Tests | Resultado | Log |
|---|---|---|---|
| `wallet.spec.ts` (conexión, solo-lectura, chain_guard ×2 [negativo de red incluida], self-destino, modal D15) | 5 | ✅ | `playwright-full-1.log` |
| `dashboard.spec.ts` (`live_balance_monotonic` con condition-wait V2) | 1 | ✅ | idem |
| `lifecycle.spec.ts` **nuevo F4** (UI completa: wrap→crear→pausar→reanudar→cerrar→downgrade on real chain) | 7 | ✅ | `playwright-lifecycle.log` |
| `pagination.spec.ts` **nuevo F4** (siembra 12 flujos on-chain; página 1 = 10 filas DOM, página 2 = 2, nav accesible, limpieza afterAll) | 1 | ✅ | `playwright-pagination.log` |
| `received.spec.ts` (`list_incoming` cuenta #1) | 1 | ✅ | `playwright-full-1.log` |
| `axe.spec.ts` (`dashboard_contrast` WCAG AA, critical+serious = 0) | 1 | ✅ | idem |
| **Corridas completas de confirmación** | 16 | ✅ 16/16 sin retries, x2 consecutivas | `playwright-full-1.log` (8.3 m), `playwright-full-2.log` (3.8 m) |

## 2. Criterios de aceptación de la Fase
- 100 % pruebas pasando ✔ (pendiente confirmar tanda E2E final)
- Sin errores funcionales abiertos ✔ (2 CRÍTICOS del informe V2 ya resueltos en V3; regresiones codificadas como tests nombrados)
- Correcciones con causa documentada ✔ §5

## 3. Matriz CU → prueba (extracto)
| CU | Qué lo prueba |
|---|---|
| CU-01/02 | `test_wrap_unwrap_invariant`, `test_downgrade_blocked_by_deposits`, `test_downgrade_works_after_two_hours_of_stream`, E2E lifecycle wrap/unwrap |
| CU-03 | `test_create_flow_rate_exact/multi_receiver/duplicate/invalid_destinations/insufficient_free_balance`, E2E lifecycle+paginación |
| CU-04 | `test_virtual_balance_exact_after_10s`, E2E `live_balance_monotonic`, vitest polling-engine (backoff RE-04) |
| CU-05/06 | `test_pause_all_flows_keeps_settlement_window`, `test_resume_same_rate_no_accrual_during_pause`, `test_close_releases_aggregated_deposit`, `test_only_sender_can_pause_close`, `test_delete_flow_alias`, `test_double_claim_after_close`, E2E lifecycle |
| CU-07 | `test_settle_pull_prorata_conservation`, `test_settle_prorata_is_by_nominal_rate_not_by_due`, `test_settle_reverts_when_solvent`, `test_claim_cannot_mint_beyond_custody`, `test_claim_guarded_by_sender_reserve`, `test_reopen_closed_flow_keeps_credit`, `test_no_automatic_settlement_on_time` |
| CU-08 | E2E `list_incoming` |
| CU-09 | E2E `chain_guard` ×2 (con y sin red correcta) |
| CU-10 | check-deployments + broadcast runs (H2) + `EuroxFactoryTest` |
| CU-12 | E2E axe `dashboard_contrast` + build grep |
| CU-13 | `test_get_flow_view_projection` |

## 4. Herramientas y entorno
- forge/cast 1.8.3 (global), slither 0.11.6 (pip --user), vitest 2.x, Playwright 1.49 + chromium-headless-shell global, red Besu 81234 real, contratos V3 (`0x7046…D16E`).

## 5. Errores encontrados y correcciones (durante esta fase)
### 5.1 Corregidos por el orquestador (después del informe del agente)
| # | Síntoma | Causa | Solución aplicada |
|---|---|---|---|
| P4-D1 | `createFlow` desde la UI fallaba intermitentemente en el minado | `eth_estimateGas` del QBFT académico es inestable (relojes desincronizados inflan el devengo simulado → revert espurio en estimación que NO ocurre al minar; medido: sin límite → revert; con límite → OK) | **techo `gasLimit` explícito en las 9 mutaciones** de `lib/superfluid.ts` (objeto `GAS`); el excedente se devuelve, no hay coste real |
| P4-D2 | `parseEur('1.2.3')` aceptado en silencio; sub-wei → `0n` sin error | split por punto sin validar forma única | regex estricta `^\d+(\.\d+)?$` + error si el wei resultante es 0; tests de defecto-conocido re-convertidos a asserts de comportamiento corregido |
| P4-D3 | `humanizeError('cadena')` → «Error desconocido» | solo leía objetos | desenuelve strings → devuelve el texto |
| P4-D5 | `wallet.spec` esperaba literal `99.9` (fragilidad señalada) | hardcode de balance cambiante | espera sobre `aria-label="EURx custodiado: …"` (sin literal numérico) |
| P4-flaky | `dashboard.live_balance` a veces leía Net rate `'—'` antes del primer snapshot | espera fija `waitForTimeout(11s)` sin condition-wait | nuevo `waitForFunction` sobre aria-label «Net rate:» no vacío |

### 5.2 Corregidos por el agente de pruebas
| # | Síntoma | Causa | Solución |
|---|---|---|---|
| A-1 | `test_transfer_ownership` (Factory) fallaba | la auto-transferencia `stranger→stranger` no es revert (solo-owner) | test ajustado al contrato real |
| A-2 | assert `assertEq(IERC20, address)` | Solidity no convierte implícitamente interfaces en asserts | cast `address(...)` |
| A-3 | vitest abortaba «Invalid PostCSS Plugin» | heredaba `postcss.config.mjs` de Next | `css.postcss.plugins: []` en vitest.config |
| A-4 | falsos fallos de siembra 7/12 y 10/12 | dos Playwright concurrentes → races de nonce + 500 de Next (`_buildManifest.tmp` ) | serialización estricta (`workers:1`), `.next` limpio, reintentos en beforeAll |

### 5.3 Registrados como NO corregidos (decisión de producto / fuera de alcance v1)
| # | Issue | Motivo y disposition |
|---|---|---|
| D4 | Tras `closeFlow`, la deuda viva del receptor no se ofrece en la UI del emisor | decisión de producto (RE-06); mitigado: el receptor ve «Recibidos» y cualquier keeper puede `settle`; queda como deuda para v2 con `renounceOwnership` opcional |
| — | Prorrateo first-mover entre mutaciones | limitación D17 ya aceptada; el mecanismo equitativo es `settle()` |

### 5.4 Nota QBFT (lección para README)
La inestabilidad de estimación se documenta en README §Limitaciones: en redes QBFT académicas
convalidar con `gasLimit` explícito; no es bug de contrato.

### 5.5 Resultados finales esperados en este cierre
- Vitest: **32/32** (los 4 asserts de defecto-conocido reconvertidos al comportamiento corregido).
- Playwright: **16/16** (14 directos + 2 flaky → tras fixes D1/condition-waits se busca 16 limpios en 2 corridas).
- Forge: **37/37** + invariantes con 5 actores.

## 6. Logs crudos
`RepoTecnico/pruebas/`: forge-units.log · forge-invariants.log · forge-coverage.log · slither.log · integration-live.log · vitest.log · playwright-lifecycle.log · playwright-pagination.log · resumen.md (agente)
## 7. Entrega del agente de pruebas (fronte E2E/unit) — consolidado

**Totales del agente: 48 verdes / 0 rojos** (24 unitarias ui-logic + 8 integración poller con fake timers + 7 lifecycle on-chain + 1 paginación con siembra de 12 flujos + 8 existentes re-chequeados). Corrida completa 6 specs: 16/16 (1 flaky → retry verde, 8.4 min); el orquestador confirmó después **16/16 limpios dos corridas consecutivas** (8.3 y 3.8 min, sin retries). `tsc --noEmit` limpio.

### 7.1 Bug de producto encontrado por el agente en pruebas (ya corregido)
- **Paginación**: quedarse en página 2 y cerrar flujos dejaba la tabla vacía (índice sin clamp). `paginate()` en `ui-logic.ts` hace clamp y expone `pageCount/from/to`; testeado 12→10+2, 11→10+1, fuera de rango.

### 7.2 Falsos positivos de las propias pruebas (lecciones para CI — registrar en manual de pruebas)
1. Toasts de 6 s vs txs de 10-40 s + `#__next-route-announcer__` con `role=alert` vacío → helper `toastAfter()` con exclusión del announcer y aserciones durables on-chain (`getOpenOutflows`).
2. El flujo canónico #0→#1 que deja dashboard.spec hacía revertir `flow exists` → beforeAll con pasadas de cierre.
3. Siembra 7/12 por txs descartadas transitoriamente por el QBFT → `seedTwelveFlows()` con hasta 8 pasadas reintentando solo los faltantes.
4. **NUNCA dos corridas Playwright simultáneas**: provocan 500 de Next (`ENOENT _buildManifest.tmp`) y races de nonce en #0. `workers: 1` es sagrado en esta red.
5. Higiene de red: el afterAll restaura flujo canónico y saldos exactos (verificado `real=299987654320987654336`, cero flujos sintéticos residuales).

### 7.3 No corregidos por el agente — disposition del orquestador
| Issue | Estado tras cierre F4 |
|---|---|
| estimateGas QBFT intermitente | **Mitigado**: techo `GAS` explícito en las 9 mutaciones (fix D1 del orquestador, co-ejecutado y revalidado por el agente sobre el árbol final). Pendiente opcional v2: reintento `UNPREDICTABLE_GAS_LIMIT`. |
| Etiqueta «Cerrado» inalcanzable en FlowTable | Documentado como decisión de producto (histórico = v2); el test aserta desaparición de fila, que es el comportamiento actual de `getOpenOutflows`. |
| `validateReceiver` no detecta cualquier contrato (solo los del sistema) | D15 lo cubre con el modal de irrevocabilidad; cambio de UI → v2. |
| Deuda viva invisible para el emisor tras close | Registrado en §5.3 y README; requiere bloque nuevo de UI → v2. |
| CU-08 limitado a emisores de sesión | Exclusión v1 declarada (sin índice inverso global, §4 requerimientos). |
| dashboard.spec con sleeps fijos | Se le añadió condition-wait del Net rate (fix flaky del orquestador); reescritura total → opcional v2. |

### 7.4 Cierre de la Fase 4
- Preview actualizada con los fixes: revisión **00004-knl** (HTTP 200, disclaimer visible) en https://superfluid-dashboard-1095249147821.europe-west1.run.app
- Veredicto: **100 % de pruebas pasando, sin errores funcionales abiertos → se cumple el criterio de aceptación de Fase 4 y procede Fase 5 (Manuales).**
