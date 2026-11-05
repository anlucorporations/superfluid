# Estado del proyecto — Superfluid Brlt Streaming v2

> Memoria de trabajo. Última actualización: **Proyecto programado y documentado** — Fases 1..5 cerradas (2026-11-04). Único pendiente operacional: el despliegue real de H7 (credenciales GCP) y el push a repos (solo por orden del usuario).

## Fase actual

**FASE 5 — Manuales** ✅ Cerrada · **Proyecto listo para entrega** (falta el paso operacional de despliegue H7 y el `/push` si se ordena)

## Progreso por fase

| Fase | Estado | Detalle |
|------|--------|---------|
| 1. Concepto | ✅ Cerrada | Brief analizado, 18 RF + 6 RNF + 8 RT, entrevista completa en 3 bloques, repos y GCP registrados. |
| 2. Auditoría | ✅ Cerrada | `INFORME_OPTIMIZACION_V1.md` (37 H-*) y `INFORME_AUDITORIA_CASOS_USO_V1.md` (25 AC-*) resueltos en 3 bloques. `casos_uso.md`: CU-01..CU-16 con Gherkin/EARS, máquina de estados y matriz sin huérfanos. **Bloque 1**: AC-01 → CU-16/RF-21; AC-02 → `settleFlow` público; AC-06 → ownership atómico en deploy. **Bloque 2**: AC-05 → enum de programados + `flows_history`; AC-03 → `changeReceiver` + step-up + auditoría; AC-23 → flujos solapados con confirmación. **Bloque 3**: AC-07 → guardas/pausa/shortfall; AC-08 → sesiones y CSRF; AC-10 → GDPR determinista. **MEDIAS** documentadas en el doc técnico §12. Generados los gráficos Mermaid (`casos_uso/`) y auditado `documento_tecnico.md` (`INFORME_AUDITORIA_DOCUMENTO_TECNICO_V1.md`, veredicto apto con reservas menores). Pendiente menor: pasada ortotipográfica (AC-24). |
| 3. Desarrollo | ✅ Cerrada | Plan vertical en `plan_desarrollo.md` (H1..H7). **H1 cerrado (2026-11-01)**: `sc/src/Brlt.sol` + `sc/src/BrltX.sol` con 44 tests verdes (10 + 33 + invariantes 128×64) y cobertura de líneas 100 % / 94,42 %. **H2 cerrado (2026-11-04)**: `Brlt` `0x750508AD02404a30dF030466FBb3a29D9EE0482F` y `BrltX` `0xCE5E017599073f60b3518Cf2f86fFdd49bc6e52F` desplegados en Besu 81234 (bloque 6412104), owner/minter en la wallet admin y supply de 10.000.000 BRLT; `CheckDeployment` y smoke real (crear/terminar flujo) OK. **H3 cerrado (2026-11-04)**: `web/` Next.js 15 + MongoDB con SIWE admin/empleado, sesiones opacas, CSRF, rate limit, CRUD de empleados/proyectos, cambio de wallet con doble firma EIP-712, allowlist, configuración validada y auditoría; 27 tests Vitest + smoke E2E verdes. **H4 cerrado (2026-11-04)**: ciclo de nómina completo (crear, pausar, reanudar, cambiar receptor, terminar, liquidar, programados, lotes de 10, mint/burn y tesorería) firmado con MetaMask y reconciliado con `eth_call`; 39 tests Vitest, build de 34 rutas y `npm run smoke:h4` real en Besu (flujos #3/#4, escrow 0). **H5 cerrado (2026-11-04)**: Suite del empleado con balances on-chain (`getRealtimeBalance`), cobro autónomo por `downgrade` verificado contra el recibo (`Downgraded`/`FlowSettled`, tx falsos → 422), liquidación de vencidos, perfil/consentimiento GDPR con borrado inmediato y ventana de retiro de 90 días tras la baja; 41 tests Vitest, build de 36 rutas y `npm run smoke:h5` real en Besu. **H6 cerrado (2026-11-04)**: jobs internos con cron de proceso (`reconcile_flows`, `flows_history`, `anonymize_pii`, `mark_scheduled_due`) y panel `/admin/jobs`; deriva provocada corregida en la Besu real, espejo de eventos idempotente (`flows_history` con clave `txHash-logIndex`), anonimización GDPR a 30 días y hardening de gas por la subestimación de `eth_estimateGas` en Besu; 43 tests Vitest, build de 38 rutas y `npm run smoke:h6` real. |
| 4. Pruebas | ✅ Cerrada | `INFORME_PRUEBAS_F4.md` (2026-11-04): Forge 44/44 (Brlt 100 % líneas, BrltX 94,42 %), Vitest 43/43, E2E headless Chromium (13 pasos, 8 pantallazos en `pruebas/`), smokes H3..H6 reales en Besu 81234 y `verify:standalone`, todo verde. Analizado: hallazgo de gas en Besu (fix), reconciliación vs guardas, entorno Playwright. |
| 5. Manuales | ✅ Cerrada | `INFORME_MANUALES_F5.md` (2026-11-04): técnicos en `RepoTecnico/Manuales/` (6 temas), literales en `docs/Manuales/` (8 archivos), 10 capturas reales Chromium, 4 SVG, 3 PDF y **Ayuda integrada** en `/ayuda/` con descargas. |
| 5. Manuales | ⬜ Pendiente | |

### Hitos de Fase 3

| Hito | Estado | Evidencia |
|---|---|---|
| H1 — Núcleo de contratos | ✅ Cerrado | `HITO_H1_NUCLEO_CONTRATOS.md` · `forge test` 44/44 verde |
| H2 — Despliegue gobernado | ✅ Cerrado | `HITO_H2_DESPLIEGUE.md` · Besu 81234 bloque 6412104 · `CheckDeployment` + smoke real |
| H3 — Identidad y datos | ✅ Cerrado | `HITO_H3_IDENTIDAD_DATOS.md` · 27 tests Vitest + smoke E2E (`npm run smoke`) |
| H4 — Ciclo de nómina | ✅ Cerrado | `HITO_H4_CICLO_NOMINA.md` · 39 tests Vitest + build 34 rutas + `npm run smoke:h4` real en Besu 81234 |
| H5 — Suite y cobro | ✅ Cerrado | `HITO_H5_SUITE_COBRO.md` · 41 tests Vitest + build 36 rutas + `npm run smoke:h5` real en Besu 81234 |
| H6 — Operación y reconciliación | ✅ Cerrado | `HITO_H6_OPERACION.md` · 43 tests Vitest + build 38 rutas + `npm run smoke:h6` real (deriva corregida, cron verificado) |
| H7 — Preview GCP y cutover | 🟡 Preparado | `HITO_H7_PREVIEW_GCP.md` · Dockerfile standalone verificado (`verify:standalone`) + runbook de cutover/rollback; deploy real pendiente de credenciales |

## Resumen de la Fase 1 (2026-10-30)

- Brief `BRIEF_SUPERFLUID.md` analizado íntegramente; requerimientos clasificados y trazados al brief.
- Plataforma v1 en producción analizada (Cloud Run europe-west1, tokens EURBETA, faucet, refresco 5 s).
- Entrevista en 3 bloques con estas decisiones:
  1. Opción B (brief §8): envoltorio propio `BrltX.sol` con CFA simplificado.
  2. Panel admin 100% on-chain con wallet + MongoDB para lo administrativo.
  3. Suite del Empleado con acceso solo por wallet.
  4. Repos existentes (GitHub/GitLab.com/GitLab-CodeCrypto), rama `superfluidv2`.
  5. GCP: reutilizar plataforma Cloud Run existente.
  6. BRLT con **18 decimales**.
  7. Flujos programados: aviso + firma manual del admin.
  8. Una sola organización; montos configurables por empleado/periodo.

## Archivos RepoTecnico/

- [x] `BRIEF_SUPERFLUID.md` (entrada del proyecto, ya existente)
- [x] `requerimientos.md` (v Borrador-1, creado 2026-10-30)
- [x] `diccionario_datos.md` (v Borrador-1, creado 2026-10-30)
- [x] `entornos_globales.md` (v Borrador-1, creado 2026-10-30)
- [x] `estado_proyecto.md` (memoria de trabajo, actualizada al día)
- [x] `INFORME_OPTIMIZACION_V1.md` (auditoría de documentación, 37 hallazgos H-*)
- [x] `casos_uso.md` (CU-01..CU-16 con auditoría aplicada y Bloque 1 de decisiones; creado 2026-10-30)
- [x] `INFORME_AUDITORIA_CASOS_USO_V1.md` (auditoría de casos de uso, 25 hallazgos AC-*)
- [x] `documento_tecnico.md` (borrador completo, 13 secciones; actualizado 2026-11-01)
- [x] `casos_uso/` (gráficos Mermaid: diagrama de CUs, máquina de estados y secuencias)
- [x] `INFORME_AUDITORIA_DOCUMENTO_TECNICO_V1.md` (auditoría del documento técnico, 2026-11-01)
- [x] `plan_desarrollo.md` (plan vertical H1..H7, creado 2026-11-01)
- [x] `HITO_H1_NUCLEO_CONTRATOS.md` (cierre de H1: diseño, tests, cobertura y gas, 2026-11-01)
- [x] `HITO_H2_DESPLIEGUE.md` (cierre de H2: addresses, tx hashes, verificación y smoke, 2026-11-04)
- [x] `HITO_H3_IDENTIDAD_DATOS.md` (cierre de H3: panel + Suite, SIWE, MongoDB y E2E, 2026-11-04)
- [x] `HITO_H4_CICLO_NOMINA.md` (cierre de H4: ciclo de nómina on-chain, lotes y tesorería, 2026-11-04)
- [x] `HITO_H5_SUITE_COBRO.md` (cierre de H5: Suite con cobro autónomo, GDPR y ventana de retiro, 2026-11-04)
- [x] `HITO_H6_OPERACION.md` (cierre de H6: jobs, reconciliación, GDPR y hardening, 2026-11-04)
- [x] `HITO_H7_PREVIEW_GCP.md` (H7 preparado: imagen standalone verificada, cutover/rollback, 2026-11-04)
- [x] `INFORME_PRUEBAS_F4.md` (cierre de Fase 4: detalle por suite, errores resueltos y evidencia headless, 2026-11-04)
- [x] `INFORME_MANUALES_F5.md` + `docs/Manuales/**` + `docs/imagenes/**` + `web/public/ayuda/**` (Fase 5 completa, 2026-11-04)
- [x] `pruebas/` (pantallazos E2E Chromium: guardas de sesión y panel admin completo)

## Workspace

- `sc/` (Foundry): `src/Brlt.sol`, `src/BrltX.sol`, tests en `test/`, scripts de deploy en
  `script/` y dependencias en `lib/` (no versionadas). `forge test` verde (44/44).
- `web/` (Next.js 15): panel admin + Suite del Empleado con SIWE, MongoDB y auditoría;
  ciclo de nómina H4 reconciliado, Suite H5 con cobro autónomo, jobs H6 con panel y
  assets de despliegue H7 (`Dockerfile`, `verify:standalone`, `gcp/`).
  `npm run typecheck`, `npm test` (43/43) y `npm run build` (38 rutas) limpios;
  `npm run smoke` (H3), `smoke:h4`, `smoke:h5` y `smoke:h6` (Besu real) OK;
  `npm run verify:standalone` OK; Ayuda pública en `/ayuda/`.
- No es repo git todavía; nada commiteado ni subido.

## Decisiones registradas

| # | Decisión | Fecha | Fuente |
|---|----------|-------|--------|
| 1 | Opción B: envoltorio mínimo propio `BrltX.sol` con CFA simplificado (no framework Superfluid soberano) | 2026-09-29 | Brief §8 |
| 2 | Panel admin 100% on-chain con wallet + MongoDB para lo administrativo | 2026-10-30 | Entrevista Bl. 1 |
| 3 | Suite del Empleado: portal aparte con acceso solo por wallet (flujos activos/próximos/terminados, proyecto, perfil) | 2026-10-30 | Entrevista Bl. 1 |
| 4 | Repos: GitHub + GitLab.com + gitlab.codecrypto.academy (anlucorporations/superfluid), rama `superfluidv2` | 2026-10-30 | Entrevista Bl. 2 |
| 5 | GCP: reutilizar plataforma Cloud Run existente (europe-west1) con faucet on-chain + MongoDB off-chain | 2026-10-30 | Entrevista Bl. 2 |
| 6 | Cobro del empleado: CU-16 / RF-21 (`downgrade` BrltX→BRLT a su wallet; retiro tras baja) | 2026-11-01 | Auditoría AC-01 |
| 7 | Fin de flujo: `settleFlow` público/sin permiso y estado «vencido pendiente de liquidación» | 2026-11-01 | Auditoría AC-02 |
| 8 | Ownership: Ownable2Step completado dentro de la sesión de deploy (sin diferido) | 2026-11-01 | Auditoría AC-06 |
| 9 | `flujos_programados`: enum próximo/ejecutado/cancelado/fallido; terminados desde eventos + `flows_history` | 2026-11-01 | Auditoría AC-05 |
| 10 | Cambio de wallet atómico: `changeReceiver` + EIP-712 ligado + step-up admin + auditoría | 2026-11-01 | Auditoría AC-03 |
| 11 | Flujos solapados por empleado permitidos con confirmación y total agregado | 2026-11-01 | Auditoría AC-23 |
| 12 | BrltX robusto: ReentrancyGuard + CEI, Pausable que no atrapa saldos, shortfall explícito | 2026-11-01 | Auditoría AC-07 |
| 13 | Sesiones: admin 2 h / empleado 8 h, nonce 5 min, rate-limit 5/15, revocación inmediata, CSRF | 2026-11-01 | Auditoría AC-08 |
| 14 | GDPR: borrado inmediato, anonimización a 30 días, retención anónima 5 años | 2026-11-01 | Auditoría AC-10 |

## Pendientes (para siguientes fases)

1. `MONGODB_URI` de producción y política de backups (el resto de la conexión ya está
   resuelto: base `superfluid` e índices creados por `npm run seed`).
2. Confirmar `project_id` textual de GCP y método de autenticación (gcloud ADC o JSON de servicio).
3. Formalizar owner/minter (wallet admin desplegante) en el documento técnico de Fase 2.

## Criterios de aceptación Fase 1 — verificación

| Criterio | Estado |
|----------|--------|
| 3 archivos .md en RepoTecnico/ (`requerimientos`, `diccionario_datos`, `entornos_globales`) | ✅ |
| Preguntas de la entrevista respondidas | ✅ (3 bloques) |
| URLs de repositorios + rama almacenadas | ✅ (rama `superfluidv2`) |
| Credenciales/información GCP almacenadas | ✅ parcial (proyecto 1095249147821, región, URL de la plataforma v1; pendiente `project_id` textual + credenciales explícitas) |

> El punto parcial se valida durante Fase 3 (despliegue/preview). Fase 1 dada por cerrada salvo
> confirmación del director del proyecto.
