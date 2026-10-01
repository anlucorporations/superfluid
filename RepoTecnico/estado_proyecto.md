# Estado del Proyecto — Superfluid EUR Streaming

## Fase actual: **FASE 4 — Pruebas ✅ COMPLETADA** (pendiente `/siguiente_fase` → Fase 5 Manuales)

Última actualización: 2026-10-01

### Hitos FASE 4 (agente de pruebas + orquestador)
- [x] Forge 37/37 + invariantes fuzz 5 actores (runs=1000, 712 s) — logs en `pruebas/`.
- [x] vitest 32/32 (ui-logic extraída sin cambio de comportamiento + máquina de backoff del poller con fake timers).
- [x] E2E nuevos lifecycle (7 pasos UI reales on-chain) + pagination (siembra 12 flujos); suite completa **16/16 limpios en 2 corridas consecutivas**.
- [x] Slither 0 High/Medium; integración live 5/5; cobertura 88.8 % líneas EuroX.
- [x] Correcciones P4: D1 gasLimit explícito (estimateGas QBFT inestable — hallazgo real de infra), D2 parseEur estricto, D3 humanizeError strings, D5 waits por aria-label, siembra tolerante con pasadas. 2 issues documentados como decisión de producto (§5.3 informe).
- [x] `INFORME_PRUEBAS.md` §7 consolidado con la entrega del agente (48 verdes propios; bug de paginación clamp corregido; lecciones CI: workers:1 obligatorio).
- [x] Preview con fixes F4 desplegada: revisión **00004-knl** smoke OK.

### Riesgos abiertos para el director (sin cambio)
- Allow-list IPs curso en la preview; ratificación first-mover D17; disponibilidad del RPC académico.

### Contexto de origen
- Repo GitLab `anlucorporations/superfluid`, rama `superfluid-DSH-GCP`.
- Documento guía: `RepoTecnico/BRIEF_SUPERFLUID.md` (adaptado a Foundry global + red Besu Codecrypto).
- Mandato del usuario: v1 **estrictamente lo pedido en el brief**, subsanando ambigüedades y
  problemas de seguridad; objetivo = sistema estable con mínima superficie para **beta**.

### Hitos completados
- [x] Verificación del entorno: Foundry global 1.8.3 (`~/.foundry/bin`), Node 22, Chromium headless.
- [x] Verificación de la red Besu en vivo: chainId 81234, RPC activo, gasPrice 1 gwei, faucet disponible.
- [x] Extracción de requerimientos → `requerimientos.md` (RF-01..14, RNF-01..13, RT-01..08,
      decisiones D1..D16 que subsanan ambigüedades, alcance/exclusiones v1).
- [x] Artefactos de datos sincronizados: `diccionario_datos.md`, `diagrama_er.md` (Mermaid ER del
      modelo lógico on-chain), `base_datos.sql` (placeholder condicional — sin BD relacional en v1).
- [x] `entornos_globales.md` con variables, comandos y referencias de secretos.

### Decisiones clave CONFIRMADAS (entrevistas Fase 1 + Bloques 1–7 auditoría, 2026-09-29/30)
- **D1**: Opción B — Super Token propio `EuroX.sol` (CFA simplificado). BRIEF §8 enmendado in situ.
- **D11**: deployer/owner = cuenta **#0 Anvil** `0xf39F…2266` (pk pública del curso), balance verificado 89 CC ✔.
  Cuenta generada `0xFFf3…12b9` retirada y su archivo local eliminado (pk expuesta en chat).
- **D9**: liquidación `settle()` permissionless on-chain. **D10**: depósito agregado por cuenta; pausa retiene, cerrar libera.
- **D12**: EuroxFactory conservada MUST. **D13**: límite de flows solo UI. **D14**: vista receptor RF-12.
- **D15**: aviso irrevocabilidad. **D16**: disclaimer + MIT + RGPD no-aplicable documentado.
- **P3**: sin BD relacional · **P4**: remotos GitLab.com + gitlab.codecrypto.academy · **P5**: preview Cloud Run SÍ.
- Polling 5 s + backoff (block time QBFT medido = 2 s; RNF-04 reformulado a percentiles).

### Hitos completados FASE 2
- [x] Auditoría @audita V1 sobre documentación Fase 1 → `INFORME_OPTIMIZACION_V1.md`
      (32 hallazgos: 4 críticos / 13 altos / 11 medios / 4 bajos; 27 descartes Anexo A).
- [x] Entrevista de resolución: 21 preguntas en 7 bloques, TODAS respondidas por el usuario.
- [x] Quick wins aplicados: BRIEF §8 enmendado, D9–D16, RF-12..14, RNF-08..13, `.gitignore`,
      `LICENSE.md` con disclaimer, métricas de red reales en entornos_globales.md.
- [x] `casos_uso.md`: 13 CU + matriz completa (14 RF + 13 RNF + 8 RT) con Gherkin/EARS RE-nn.
- [x] Auditoría de casos de uso (3 lentes + verificación adversarial): errata DEP_3 corregida
      (canónico: 8_333_333_333_333_323_200 = 3×RATE×3600), modelo de dos tasas
      (netFlowRate solo activos / netOutflowGarantizado activos+pausados), reglas contables del
      devengo (earnedUnclaimed, pendingDeficit, pendingPool), settle por ESTADO no reloj (RE-07c),
      política única de escasez (prorrateo proporcional; orden solo para residuos), RNF-08 reformulada.
- [x] `diagramas_casos_uso.md`: diagrama UML de casos + 2 secuencias + stateDiagram + componentes (Mermaid).
- [x] `documento_tecnico.md` con nota comparativa CFA real vs envoltorio (§5, P21 ✅).
- [x] Auditoría del documento técnico (3 lentes + adversarial) y aplicación de hallazgos:
      invariantes core con forma canónica, trazabilidad §2.1–2.3 completa (RT/CU huérfanos
      asignados), comando deploy unificado (ruta autoritativa entornos_globales), lista cerrada
      de eventos RNF-10, registro canónico `sc/out/deployments/codecrypto.json`, erratas
      corregidas (foundry.toml, nombres Flow, decimals, glosa 1:1, settledUpTo inicial).

### FASE 3 — hitos completados
- [x] **H1 Contratos+tests**: `sc/` con foundry.toml (via-IR), Euro/EuroX/EuroxFactory.
      Suite: 4 Euro + 22 EuroX + invariantes fuzz (custodia 1:1, real≥dep, fórmula depósito)
      = **27/27 verdes**. Greps estáticos delegatecall/selfdestruct = 0.
      Descubrimiento del fuzz: materialización sin respaldo → se endureció createFlow
      (deps + buffer 1h) y downgrade (undercollateralization guard). `tools/constants-check.mjs` OK.
- [x] **H2 Deploy a Besu**: DeployAllScript con preflight (chainId+saldo CC). Dos corridas
      broadcast (RNF-07): EUR 0x9E54…3042, FACTORY 0xa82f…CFC9, EURx 0x6A35…93E2 (vivos y verificados).
      Smoke en vivo completo: wrap 100 EUR ✓, createFlow 2000/mes ✓ (+40 s devengo exacto),
      closeFlow ✓ libera deps, claimSettled por receptor ✓ (3.24e16 EURx).
      Registro canónico `sc/out/deployments/codecrypto.json`; `tools/check-deployments.mjs` OK.
- [x] **H3 Scaffolding web**: Next 15.5.4 + TS(ES2020) + Tailwind + ethers 5.7.2.
      `tools/sync-abi.mjs` → ABIs en `web/src/abi/`; `config/web3.ts` con addresses del registro
      canónico (sobrescribibles por NEXT_PUBLIC_*); `lib/superfluid.ts` con las 6 firmas del brief
      + pause/resume/close/settle/claimSettled/getAccountInfo/incomingUnclaimed + humanizeError(D7);
      `lib/polling.ts` RE-04 serializado/backoff 15→30 s/timeout 25 s/recuperación 3 éxitos.
      Criterios: tsc --noEmit OK · npm run build OK · grep pk en bundle = 0 (RNF-02) ·
      lecturas live desde Besu vía la capa web OK (real deployer 99.97e18, r1 3.24e16).
      Registro canónico reapuntado a la corrida 1 (la del smoke verificado; nota RNF-07 conservada).

- [x] **H4 Dashboard completo**: `components/Dashboard.tsx` con disclaimer sin scroll (RNF-12),
      connect/guard de red (RE-09a), wrap/unwrap validados (D7→humanizeError), modal irrevocabilidad
      (D15), tabla streams paginada 10/página (RE-03b), pestaña Recibidos vía eventos FlowCreated
      (CU-08, sin índice inverso global), settle/claim keeper (CU-07), aria-labels/tabular-nums (RNF-09).
      Fix WCAG real detectado por axe: contraste botón Pausar 2.93→amber-800 AA. tsc+build OK.
- [x] **H5 E2E automatizados**: Playwright 1.49 + chromium headless global + mock EIP-1193 que firma
      con la pk pública del curso (solo test). Specs: wallet(4) · dashboard::live_balance_monotonic ·
      received::list_incoming · axe::dashboard_contrast = **7/7 verdes en 2 corridas consecutivas**
      (criterio H5). Herramientas nuevas: `tools/rpc-latency.mjs` (RNF-04: hoy p50 9 ms, 100 % válidas)
      y `tools/coverage-check.mjs` (RNF-03: 13 RF-MUST con tests existentes ✔).

- [x] **H5b Preview Cloud Run**: `next.config.ts output:"standalone"` + Dockerfile multi-stage.
      Build remoto vía Cloud Build (sin docker local): imagen `superfluid/dashboard:0eff1c4f…` SUCCESS.
      Servicio `superfluid-dashboard` en europe-west1 desplegado; smoke HTTP 200 con disclaimer visible.
      Gate RNF-13: `tools/preview-policy-check.sh` OK — estado actual allUsers = riesgo ACEPTADO y
      documentado (Bloque 4 Q12); la allow-list de IPs del curso queda como acción pendiente del
      operador humano (requiere lista de IPs que solo el director puede proporcionar).

### Progreso H6 — Cierre beta (en curso, retomado tras pausa del usuario)
- [x] README.md raíz end-to-end (run/deploy/disclaimer/checklist custodia RNF-11) → RNF-06.
- [x] slither 0.11.6 instalado (pip --user) y ejecutado: **0 hallazgos high/medium en src/**
      tras corregir: incorrect-equality (status por rango) y 3 uninitialized-local.
- [x] Fix funcional detectado en vivo: getOpenOutflows no persistía el registro de emisores
      (UI Recibidos vacía). Corrección: registro outflowList on-chain + reactivación
      Closed→Active conservando earnedUnclaimed + test nuevo `test_reopen_closed_flow_keeps_credit`.
- [x] **Contratos V2** desplegados y smoke en vivo completo (wrap/flow/pause/resume/close/claim ✔).
      Registro canónico `sc/out/deployments/codecrypto.json` con historial de las 3 corridas;
      web3.ts/README/cloudbuild sincronizados a V2 (EUR 0xf505…6f36, EURx 0x3fA4…50F2, FAC 0x9540…3778).
- [x] Gates: forge 28/28 · playwright 7/7 · coverage-check OK · constants-check OK ·
      check-deployments OK · preview Cloud Run revision 00002 sirviendo V2 (HTTP 200 ✔).
- [x] **Re-auditoría @audita V2 sobre código** (workflow 3 lentes + verificación adversarial):
      destapó defectos REALES que mi V2 aún tenía — 2 CRÍTICOS (sobre-emisión vía
      claimSettled sin respaldo; BigNumber-vs-bigint con cifras falsas en la UI) y 5 ALTOS
      (doble conteo de depósitos en settle, lockout de retirada tras 1 h, deuda perpetua
      tras close, índices sin poda, etc.).
- [x] **Reescritura contable V3 (modelo de reserva)**: earnedUnclaimed como pasivo dentro de
      real; claim = débito+crédito; gate create deps+owed+buffer; insolvencia owed>real;
      prorateo nominal con recorte; poda swap-and-pop; motor de polling reescrito (backoff
      real, epoch, reset por cuenta); coerción BigNumber→bigint en toda la frontera de
      lectura; guard de red en requireSigner. Decisión **D17** registrada + §0/CU/diagramas
      actualizados. 5 tests de regresión nuevos nombrados por hallazgo.
- [x] **V3 desplegada y verificada en vivo** (EURx 0x7046…D16E): smoke completo con
      conservación exacta; registro canónico versionado `sc/deployments/` con fs_permissions
      (hallazgo H2-11 cerrado); preview revision 00003; slither 0 high/medium post-lint;
      ABI idéntico tras fixes de estilo (no se requirió redeploy, nota §6 del informe).
- [x] Suite final: **forge 31/31 · E2E 8/8 en 2 corridas consecutivas · gates OK**
      (coverage/constants/check-deployments). `INFORME_OPTIMIZACION_V2.md` con registro de
      revisión firmada (§4) — falta solo la ratificación humana de 3 riesgos (§7 del informe).
- [x] Estado → **BETA OPERATIVA**. Pendientes del director: allow-list IPs curso;
      riesgo RPC académico aceptado; limitación first-mover D17.

### Pendientes para cerrar Fase 2

### Pendientes para cerrar Fase 2
- [x] Confirmación del usuario (`/siguiente_fase`) recibida; Fase 3 iniciada.

### Próximos pasos (Fase 3, hitos verticales aprobados al iniciar)
H1 contracts+tests · H2 deploy a Besu · H3 scaffolding web+config · H4 dashboard full ·
H5 E2E · H5b preview Cloud Run · beta.
