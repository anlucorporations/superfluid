# Plan de Desarrollo Vertical — Fase 3 (SFhostpot v1)

> **Objetivo:** construir SFhostpot en **6 hitos verticales**, cada uno una entrega **100 % operativa**
> y verificable. Base normativa: [`requerimientos.md`](requerimientos.md) (27 RF · 27 RNF · 12 RT ·
> D1–D56), [`casos_uso.md`](casos_uso.md) (19 CU), [`documento_tecnico.md`](documento_tecnico.md) y
> [`registro_decisiones.md`](registro_decisiones.md).
> **Duración (D39):** Fase 3 = **4 semanas** · Fase 4 = 1 semana · Fase 5 = 1 semana.
> **Repositorio (D19):** nuevo e independiente; código en `sfh-*`, docs en `SFhostpot/`.
> **Propietario:** agente `@asistente-proyecto`, con validación del Director al cierre de cada hito.

---

## 0. Reglas del plan

1. **Vertical, no por capas:** cada hito termina con algo que se puede usar de punta a punta.
2. **Sin hito abierto:** un hito no se cierra con tests rojos, deuda de seguridad o criterios sin evidencia.
3. **Trazabilidad:** cada tarea cita CU y RF/RNF/RT; ningún requisito MUST queda sin test (RNF-15).
4. **Datos primero:** si un hito cambia el modelo, se actualizan en el mismo turno
   `diccionario_datos.md`, `diagrama_er.md` y `base_datos.sql`, y se revalida con
   [`tools/validar_sql_gcp.py`](tools/validar_sql_gcp.py).
5. **CI documental:** [`tools/validador_artefactos.py`](tools/validador_artefactos.py) en verde en cada PR.
6. **Secretos:** nunca en repo; solo referencias (`*_ref`) y Secret Manager (RNF-18).
7. **Entorno:** sin Docker en el host; BD se valida contra **Cloud SQL** (`truekeate-db-dev`); el
   `docker compose` completo se verifica en Fase 4 (ENV-01).
8. **Definición de Hecho (DoD) de cada hito:** código + tests verdes + evidencia (log/reporte) +
   documentación sincronizada + criterios del hito demostrados + sin hallazgos altos abiertos.

---

## 1. Resumen de hitos

| Hito | Entrega operativa | Duración | Depende de | CUs principales |
|---|---|---|---|---|
| **H1** | Contratos BRLT/BRLTx/BarloventoFactory desplegados en Besu de desarrollo, con Forge/fuzz verdes | 4 días | H0 | CU-02, CU-03, CU-06, CU-10 |
| **H2** | Orquestador + PostgreSQL + API v1 + indexador/health (Jobs 1 min) + Cloud Tasks | 6 días | H1 | CU-01, CU-04, CU-11, CU-14, CU-16, CU-19 |
| **H3** | Adaptadores MikroTik REST + RADIUS CoA/PoD + mock; comandos idempotentes y fallback | 4 días | H2 | CU-09, CU-12, CU-17, CU-18 |
| **H4** | Portal cautivo Web3 completo (bind HMAC, aviso, wrap, stream, vouchers, pausa/cierre) | 5 días | H1, H2 | CU-01…CU-08, CU-13, CU-15 |
| **H5** | Integración E2E con mock + 100 sesiones (k6) + BD dedicada + caos/fallos | 4 días | H2, H3, H4 | Todos |
| **H6** | Endurecimiento, observabilidad, RGPD (purga), backup/restore, preview y runbook | 3 días | H5 | CU-11, CU-15 |

> Total ≈ 26 días laborables (4 semanas con buffer), alineado con D39.

---

## 2. H0 — Preparación (1 día, dentro de H1)

| # | Tarea | Detalle | Criterio de aceptación |
|---|---|---|---|
| H0-1 | Crear repositorio nuevo (D19) | `sfh-sc/`, `sfh-orchestrator/`, `sfh-portal/`, `sfh-infra/`, `sfh-sim/`, `SFhostpot/` | Repo creado, rama `main` y `develop`, README raíz |
| H0-2 | CI base | GitHub/GitLab Actions o pipeline local: lint, typecheck, tests, validador de artefactos, grep de secretos | Pipeline rojo si falla cualquiera |
| H0-3 | Entornos | `.env.example` de cada módulo; Secret Manager para JWT/RADIUS/MikroTik/DB | Sin secretos en repo (RNF-18) |
| H0-4 | Tablero de tareas | Volcar H1–H6 con sus tareas | Estado visible y trazable |

---

## 3. H1 — Contratos + tests (4 días)

**Entrega:** contratos adaptados y desplegados en la red de desarrollo, suite Forge verde y ABI sincronizada.

| # | Tarea | Detalle / trazabilidad |
|---|---|---|
| H1-1 | Scaffold `sfh-sc/` | Foundry global (`~/.foundry/bin`), `foundry.toml` (solc 0.8.28, OZ 5.1.0, `[rpc_endpoints] besu`). RT-01, RT-04 |
| H1-2 | `BarloventoToken.sol` | ERC20 OZ, 18 dec, name "Barlovento Token", symbol BRLT, hard-cap 10.000.000, mint/burn owner hasta cap (D2, P10). CU-02 |
| H1-3 | `BarloventoTx.sol` | Super Token CFA adaptado de `EuroX.sol`: wrap/unwrap 1:1, flows, aggregator, settle/claim, `ReentrancyGuard` + CEI (D34/D40), **gate de apertura = rate×3600 (1 h)** (D54). CU-02/03/05/06 |
| H1-4 | `BarloventoFactory.sol` | Registro de par BRLT→BRLTx (D2). CU-10 |
| H1-5 | `DeployAll.s.sol` | Preflight chainId 81234 + saldo, broadcast, registro `sfh-sc/deployments/` versionado. RT-02, RNF-07 |
| H1-6 | Tests unitarios | `BarloventoToken.t.sol` (cap, mint/burn), `BarloventoTx.t.sol` (wrap/unwrap, create/pause/resume/close, settle pull, claim, 1 h, pausa=revoca). RNF-01/03 |
| H1-7 | Invariantes fuzz | Custodia 1:1, depósito = garantía×3600, conservación, reentrancia; `--fuzz-runs 1000`. RNF-08, RNF-27 |
| H1-8 | Estático | Slither 0 high/medium; grep `delegatecall`/`selfdestruct` = 0. RNF-01 |
| H1-9 | ABI + registro | `sync-abi` → `sfh-orchestrator/src/abi/` y `sfh-portal/src/abi/`; `check-deployments`. RT-05/RT-09 |
| H1-10 | Deploy a Besu dev | EUR/BRLT/BRLTx vivos, smoke `wrap → createFlow → close` on-chain. |

**Criterios de aceptación H1**
- [ ] `forge test` 100 % verde, incluidos invariantes fuzz.
- [ ] Apertura de flow requiere **≥ rate×3600** y falla por debajo (test de frontera).
- [ ] `pauseFlow` deja la sesión sin devengo y la lógica de autorización exige `Active` (RNF-21).
- [ ] Slither 0 high/medium; ABI generada y consumida por un test TS de lectura.
- [ ] Contratos desplegados en Besu 81234 con registro versionado y smoke en vivo.

---

## 4. H2 — Orquestador + PostgreSQL + API v1 (6 días)

**Entrega:** API v1 operativa con sesiones, flujos y vouchers; indexador y health-check como Jobs de 1 min; validación asíncrona durable.

| # | Tarea | Detalle / trazabilidad |
|---|---|---|
| H2-1 | Scaffold `sfh-orchestrator/` | Node 22 + TS + Fastify + `ethers` v6 + `pg`/Drizzle; estructura `src/{api,db,indexer,validator,sessions,vouchers,jobs,gateways}`. RT-03 |
| H2-2 | Migraciones + esquema | `base_datos.sql` v1.6 como migración 0001; runner idempotente; validación en Cloud SQL. RT-04, RNF-14 |
| H2-3 | OpenAPI v1 congelado | `openapi.yaml` con `/v1/session/*`, `/v1/flows`, `/v1/vouchers`, `/v1/admin/*`, `/v1/internal/*`; `/pause`, `/resume`; catálogo `reason`; cliente tipado. D48 |
| H2-4 | Config y secretos | Carga `.env`/Secret Manager, validación de esquema de config, `*_ref`. RT-08, RNF-18 |
| H2-5 | Indexador (Job 1 min) | `eth_getLogs` por ventanas ≤5.000, checkpoint + lease 60 s/renovación 20 s + CAS, confirmaciones 2, reorg 12, idempotencia. CU-16, RNF-05 |
| H2-6 | Validador de flujos | Predicado `status==Active ∧ flowRate≥tarifa ∧ virtualBalanceOf>0`; tarifa/payout/token desde BD; mapping eventos v1. CU-16, RF-09, RNF-21 |
| H2-7 | Health-check (Job 1 min) | Solvencia por lote (concurrencia ≤8), ciclos incompletos, acción (degrade/disconnect), doble métrica. CU-18/19, RNF-03/07/23 |
| H2-8 | Cloud Tasks | Colas `authorize-validation` y `provisional-expiry` + endpoints internos OIDC; idempotencia por `access_commands.idempotency_key`. D44, RF-12 |
| H2-9 | Sesiones + provisional | `POST /v1/portal/sessions` (bind_token), `POST /v1/session/authorize` 202, confirmación por receipt/getFlow, cuota 1/15 min, auditoría. CU-01/03, RF-12 |
| H2-10 | Vouchers | Generar/canjear atómico (FOR UPDATE), cupo vivo por trigger, `released_at`, límites. CU-07/08/13, RF-25/26, RNF-26 |
| H2-11 | RBAC + API keys | 5 roles, columnas `api_key_*`, endpoints admin, bloqueo por intentos, `audit_log`. CU-14, D49, RNF-24 |
| H2-12 | Rate-limit compartido | BD/Redis, clave MAC observada del NAS + IP, 5/15 min. RNF-26, H2-28 |
| H2-13 | Trazabilidad/observabilidad base | logs JSON con `session_id`/`tx_hash`, métricas nombradas, `audit_log`. RNF-09/22 |
| H2-14 | Tests (Vitest) | unitarios + integración con BD real (Cloud SQL) y mock de chain; cobertura ≥80 %. RNF-15/18 |

**Criterios de aceptación H2**
- [ ] OpenAPI v1 generado, cliente tipado y contract test en verde (D48).
- [ ] 202 en `/authorize` siempre deja tarea durable; apagar la instancia no pierde la validación (D44).
- [ ] Indexador y health corren como Jobs con cadencia de 1 min; checkpoint con lease y reorg probados.
- [ ] Segunda sesión `wallet_stream` con el mismo flow se rechaza; padre + 2 hijos conviven (D56/D55).
- [ ] RBAC de 5 roles y API keys probados; rate-limit 5/15 min verificado.
- [ ] Cobertura ≥80 %; validador de artefactos y migraciones verdes.

---

## 5. H3 — Adaptadores de gateway (4 días)

**Entrega:** autorización/revocación real contra MikroTik REST y RADIUS CoA/PoD, con `mock` para CI y fallback.

| # | Tarea | Detalle / trazabilidad |
|---|---|---|
| H3-1 | Interfaz `GatewayAdapter` | `authorize/confirm/disconnect/healthcheck` con contrato tipado y errores normalizados. RT-06/07, CU-17 |
| H3-2 | Adaptador MikroTik REST | Login/DELETE hotspot active + address-list; TLS y credenciales por `*_ref`; allow-list de origen. RT-06, RNF-18 |
| H3-3 | Adaptador RADIUS | Access-Accept + CoA + Disconnect-Request UDP 3799; `Message-Authenticator`; atributos WISPr (25/5 Mbps). RT-07, RF-26 |
| H3-4 | `mock` determinista | Emula ambos transports y estados (ACK/timeout/error); usado en CI. D16 |
| H3-5 | Comandos idempotentes | `access_commands` con `idempotency_key`, reintentos 1/2/4 s + jitter, timeout 2 s, gracia 30 s → `degraded`, ACK verificado. RNF-19 |
| H3-6 | Fallback y corte de emergencia | CoA/PoD ↔ REST; sin ACK → address-list denegada + alerta. D24 |
| H3-7 | QoS aplicada | `WISPr-Bandwidth-Max-Down/Up` y `rate-limit` MikroTik desde `bandwidth_*` × `bandwidth_percent`. RF-26 |
| H3-8 | Reconciliación | Comparar router ↔ BD cada 1 min; corregir divergencias. CU-19, RNF-07 |
| H3-9 | VPC Connector / red | Verificar alcance UDP 3799 desde Cloud Run; si no, documentar solo-REST (P-06). D17 |
| H3-10 | Tests | integración contra mock; contract tests de payloads; test de fallback y de ACK. |

**Criterios de aceptación H3**
- [ ] Autorización y revocación funcionan contra el `mock` con ACK verificado.
- [ ] Fallback CoA↔REST probado; sin ACK se emite corte de emergencia y alerta.
- [ ] Comandos idempotentes: repetir no duplica autorización/desconexión.
- [ ] QoS de hijo = 25/5 Mbps verificada en el payload.
- [ ] Alcance UDP 3799 documentado (VPC Connector o decisión solo-REST).

---

## 6. H4 — Portal cautivo Web3 (5 días)

**Entrega:** portal usable de punta a punta: aviso → bind autenticado → wallet → wrap → stream → acceso → vouchers → pausa/cierre.

| # | Tarea | Detalle / trazabilidad |
|---|---|---|
| H4-1 | Scaffold `sfh-portal/` | Next.js 15 + React 19 + TS + Tailwind + wagmi/viem. RT-05 |
| H4-2 | Aviso de privacidad | Mostrar y aceptar antes de cualquier persistencia de MAC/IP; `notice_version`/`notice_accepted_at`. D52, CU-01/15 |
| H4-3 | Bind autenticado | Consumir `bind_token`; sin MAC/IP en el cuerpo; errores 403/409 con mensajes claros. D45/V2-01 |
| H4-4 | Wallet + red | Conectar wallet, guard de chain 81234, modo lectura. RF-09, CU-01 |
| H4-5 | Wrap + stream | `upgradeTo` y `createFlow` con `flowRate >= tarifa`; mostrar mínimo 1 h (D54) y tiempo estimado. CU-02/03 |
| H4-6 | Estado y consumo | Balances, estado de sesión, tiempo restante, `authorize` 202 con polling de estado. CU-04 |
| H4-7 | Pausa/reanudar/cierre | `pauseFlow` (revoca), `resumeFlow` (reautoriza), `closeFlow`; confirmaciones. CU-05/06 |
| H4-8 | Vouchers | Generar código (12 chars), listar canjes, canjear como hijo. CU-07/08/13 |
| H4-9 | A11y + i18n | WCAG AA, 0 violaciones axe, es/en, matriz de navegadores. RNF-13 |
| H4-10 | Tests | unitarios de UI-lógica + Playwright E2E con mock de wallet/API. RNF-15 |

**Criterios de aceptación H4**
- [ ] E2E feliz: aviso → bind → wrap → stream → acceso → cierre, sin errores de consola.
- [ ] Sin MAC/IP en el cuerpo de `/v1/portal/sessions` (test negativo de suplantación → 403).
- [ ] `pauseFlow` revoca y `resumeFlow` reautoriza (RNF-21).
- [ ] Hijo por voucher al 25/5 Mbps y liberación al desconectar (D55).
- [ ] axe 0 violaciones A/AA; i18n es/en.

---

## 7. H5 — Integración E2E y carga (4 días)

**Entrega:** sistema completo probado con mock + BD dedicada + prueba de carga y caos.

| # | Tarea | Detalle / trazabilidad |
|---|---|---|
| H5-1 | BD dedicada `sfhostpot` | Crear base/esquema dedicado en Cloud SQL; migrar y revalidar DDL (cierra V2-09). D51 |
| H5-2 | E2E completo | Playwright: padre, hijo, operador, insolvencia, pausa, cierre, voucher, RGPD. RNF-15 |
| H5-3 | k6 100 sesiones | 100 concurrentes (50 hijos), 10 gateways, 5 ev/s; medir p95 y ciclos incompletos. RNF-23 |
| H5-4 | Caos | RPC caído/lento, gateway sin ACK, Cloud SQL intermitente, reorg simulado. RNF-19/20/27 |
| H5-5 | Reorg | Compensación de sesiones activas y `Settled` revertidos (H2-21). |
| H5-6 | Migraciones | Ida/vuelta + idempotencia del DDL; script de migración versionado. RNF-14 |
| H5-7 | Informe | Resultados, métricas y hallazgos con correcciones. |

**Criterios de aceptación H5**
- [ ] E2E 100 % verde en 2 corridas consecutivas.
- [ ] k6 con 100 sesiones sin degradar los SLA (D43/D44) y sin ciclos incompletos > 5 %.
- [ ] Caos: el sistema degrada y se recupera sin sesiones huérfanas.
- [ ] DDL idempotente contra la BD dedicada (evidencia adjunta).

---

## 8. H6 — Endurecimiento y preview (3 días)

**Entrega:** beta operativa en Cloud Run + Cloud SQL, con observabilidad, RGPD y runbook.

| # | Tarea | Detalle / trazabilidad |
|---|---|---|
| H6-1 | Observabilidad | Métricas nombradas + umbrales + alertas + dashboards + runbook/MTTR. RNF-22 |
| H6-2 | Purga RGPD | Job diario 03:00 UTC, 1.000 filas/tx, borrado físico + seudonimización, aviso y derechos. D52, RNF-12 |
| H6-3 | Backup/restore | Backup diario 30 días, RTO 4 h/RPO 24 h, prueba de restauración documentada. RNF-17 |
| H6-4 | Seguridad | Revisión de secretos, rate-limit, `/readyz`/`/metrics` protegidos, allow-list RouterOS, CSRF/SameSite. RNF-02/10/24 |
| H6-5 | Preview | Cloud Run (orquestador + portal) + Cloud SQL; variables y secretos; smoke. D17/D51 |
| H6-6 | Runbook + README | Operación, incidentes, restauración, rotación de claves. RNF-06 |
| H6-7 | Cierre | Informe de H6 con evidencia y riesgos residuales (hardware real, UDP 3799, RPC único). |

**Criterios de aceptación H6**
- [ ] Preview HTTPS operativo con smoke y disclaimer.
- [ ] Alertas y runbook revisados; purga RGPD ejecutada con evidencia.
- [ ] Restauración probada dentro de RTO/RPO.
- [ ] Sin hallazgos CRÍTICA/ALTA abiertos.

---

## 9. Trazabilidad hito → CU / requisitos

| Hito | CUs | RF | RNF | RT |
|---|---|---|---|---|
| H1 | CU-02, CU-03, CU-06, CU-10 | RF-01, RF-02, RF-05, RF-06, RF-09, RF-10 | RNF-01, RNF-08, RNF-21, RNF-27 | RT-01, RT-02, RT-04, RT-05 |
| H2 | CU-01, CU-04, CU-07, CU-08, CU-11, CU-13, CU-14, CU-16, CU-19 | RF-01, RF-07, RF-08, RF-09, RF-12, RF-13, RF-14, RF-15, RF-18, RF-25 | RNF-03, RNF-04, RNF-05, RNF-07, RNF-15, RNF-22, RNF-24, RNF-26 | RT-03, RT-04, RT-08, RT-10 |
| H3 | CU-09, CU-12, CU-17, CU-18 | RF-10, RF-11, RF-16, RF-19, RF-20, RF-21, RF-26 | RNF-18, RNF-19, RNF-23 | RT-06, RT-07, RT-11 |
| H4 | CU-01…CU-08, CU-13, CU-15 | RF-02…RF-06, RF-17, RF-25, RF-27 | RNF-02, RNF-10, RNF-13, RNF-25 | RT-05, RT-09 |
| H5 | Todos | RF-01…RF-27 | RNF-05, RNF-07, RNF-15, RNF-20, RNF-23 | RT-11, RT-12 |
| H6 | CU-11, CU-15 | RF-11, RF-14, RF-18 | RNF-02, RNF-06, RNF-09, RNF-12, RNF-17, RNF-22 | RT-08, RT-12 |

---

## 10. Riesgos del plan y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Sin Docker/PostgreSQL local | Bloquea RNF-14 hasta Fase 4 | Validar BD con Cloud SQL; `docker compose` en Fase 4 (ENV-01) |
| Sin hardware de gateway | Adaptadores sin validación real | `mock` en H3/H5; ventana con router/NAS en H6 (P-07) |
| CoA/PoD desde Cloud Run | RADIUS no alcanzable | VPC Connector + UDP 3799 o solo-REST (P-06) |
| RPC único académico | Degradación/latencia | Backoff, modo degradado aceptado (D28) |
| Mempool Besu desconocido | Provisional condicionado | `MEMPOOL_MODE` visible/receipt (D56/V2-06) |
| Alcance de 4 semanas | Retraso | H5/H6 solapables; hitos verticales priorizados |

---

## 11. Criterio de cierre de la Fase 3

1. H1–H6 entregados con sus criterios demostrados y evidencia adjunta.
2. Suite Forge + Vitest + Playwright + k6 verde; cobertura ≥80 % en orquestador.
3. DDL sincronizado y validado en la BD dedicada.
4. Preview operativo con observabilidad, RGPD y runbook.
5. Informe de cierre `INFORME_FASE3.md` con riesgos residuales y aprobación del Director para Fase 4.
