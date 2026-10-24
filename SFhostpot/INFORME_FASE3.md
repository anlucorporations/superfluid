# Informe de Fase 3 — Desarrollo (SFhostpot v1)

> Fecha: 2026-10-19 · Fase 3 (Desarrollo) · Duración planificada: 4 semanas (D39).
> Base: [`plan_desarrollo.md`](plan_desarrollo.md) · Requisitos: [`requerimientos.md`](requerimientos.md) ·
> Casos de uso: [`casos_uso.md`](casos_uso.md).

## 1. Resumen ejecutivo

**Estado: Fase 3 ejecutada y con B1/B2/B3 resueltos (2026-10-19).** Todo el software (contratos,
orquestador, adaptadores, portal) está construido, tipado y con suites verdes; la BD dedicada está
creada y migrada; **los backups/PITR de Cloud SQL están habilitados y verificados** y el **preview está
desplegado en Cloud Run + Cloud SQL con smoke E2E real 7/7**. Quedan riesgos residuales de entorno
(drill de restauración bloqueado por org policy, sin hardware de gateway real) y deuda de Fase 4
(cobertura ≥80 %, reorg de `Settled`).

## 2. Hitos y evidencia

| Hito | Entrega | Evidencia | Estado |
|---|---|---|---|
| **H1** | Contratos `BarloventoToken`/`BarloventoTx`/`BarloventoFactory` (ReentrancyGuard, gate 1 h) | Forge **44/44**, Slither 0 high/medium, deploy Besu 81234 + smoke | ✅ |
| **H2** | Orquestador + API v1 + indexador/health + Cloud Tasks + migraciones | 46 tests Vitest, OpenAPI v1, build limpio | ✅ (integración real BD resuelta en H6) |
| **H3** | MikroTik REST + RADIUS CoA/PoD + fallback | Tests contra HTTP/UDP reales; 0 high/medium | ✅ (hardware real pendiente) |
| **H4** | Portal cautivo Web3 (aviso, SIWE, wrap, stream, vouchers) | 14 tests + `next build` OK | ✅ |
| **H5** | BD dedicada, E2E, k6 100 VUs, caos | 143×2 DDL, E2E 2/2, k6 401 req/s 0 % fallos, caos 3/3 | ✅ (API↔BD real resuelta en H6) |
| **H6** | Observabilidad, purga RGPD, runbook, infra Docker/Cloud Build | `/metrics`, purga 5/5 tests, runbook, Dockerfiles, preview Cloud Run + SQL, smoke 7/7 | ✅ (drill de restore bloqueado) |

### Despliegue H1 en Besu 81234

| Contrato | Dirección |
|---|---|
| BRLT | `0x99aA73dA6309b8eC484eF2C95e96C131C1BBF7a0` |
| BarloventoFactory | `0x98721EFD3D09A7Ae662C4D63156286DF673FC50B` |
| BRLTx | `0x6540b8f49168c6896d85f05b5ca8AdAaaEB65be0` |

Registro: `sfh-sc/deployments/codecrypto.json`.

## 3. Suites de verificación

| Suite | Resultado |
|---|---|
| Forge (contratos + invariantes fuzz) | **44/44** |
| Vitest orquestador (dominio, auth, API, gateways, health, purga) | **51/51** |
| Vitest portal (lógica) | **14/14** |
| Playwright E2E (CU-01 + negativo) | **2/2** |
| k6 (100 VUs, 20 s) | 401 req/s · 0 % fallos · p95 528 ms |
| DDL Cloud SQL (BD dedicada `sfhostpot`) | 143 × 2 · 20 tablas · 16 enums · B3 OK |
| **Smoke E2E preview** (Cloud Run ↔ Cloud SQL) | **7/7 PASS** (health, readyz BD, bind HMAC, firma inválida 403, portal_session en BD, aislamiento 404, HTML portal+disclaimer) |

Evidencia consolidada: [`pruebas/h5_resumen.md`](pruebas/h5_resumen.md),
[`pruebas/validacion_bd_dedicada_sfhostpot.log`](pruebas/validacion_bd_dedicada_sfhostpot.log),
[`pruebas/h6_backup_check.log`](pruebas/h6_backup_check.log),
[`pruebas/h6_restore_drill.log`](pruebas/h6_restore_drill.log),
[`pruebas/h6_preview_smoke.log`](pruebas/h6_preview_smoke.log).

### 3.1 Preview desplegado

| Componente | URL / evidencia |
|---|---|
| API `sfh-orchestrator` | `https://sfh-orchestrator-m33mjctj4a-rj.a.run.app` (rev. `00004-vvn`) |
| Portal `sfh-portal` | `https://sfh-portal-m33mjctj4a-rj.a.run.app` (rev. `00001-dql`) |
| Job smoke `sfh-smoke` | ejecución `sfh-smoke-64b4w` → 7/7 PASS |
| Cloud SQL | `truekeate-db-dev` / BD `sfhostpot`, socket adjunto al servicio |

Acceso **autenticado** (`roles/run.invoker`): la org policy `iam.allowedPolicyMemberDomains` impide
`allUsers`/`allAuthenticatedUsers`. Detalle y comandos en [`runbook_operacion.md`](runbook_operacion.md) §1.1.
Hallazgo: `/healthz` es interceptado por el GFE de Cloud Run (404); se añadió el alias **`/health`**.

## 4. Bloqueos y riesgos residuales

| # | Estado | Descripción | Acción |
|---|---|---|---|
| B1 | ✅ **Resuelto** | Backups 30 d + PITR habilitados; backup `1792411464542` SUCCESSFUL | — (evidencia `h6_backup_check.log`) |
| B1b | ⚠️ **Residual** | Drill de restauración en clon bloqueado por org policy `sql.restrictPublicIp` (sin red privada/PSA) | Excepción temporal del operador o clon con IP privada (runbook §3) |
| B2 | ✅ **Resuelto** | Preview Cloud Run + Cloud SQL desplegado; smoke E2E 7/7 | — (evidencia `h6_preview_smoke.log`) |
| B2b | ⚠️ **Residual** | Preview no público: org policy de dominios impide `allUsers` | Excepción de org policy o IAP/LB (runbook §1.1) |
| B3 | ✅ **Resuelto** | API↔Cloud SQL real vía socket (`/readyz` + escrituras `portal_sessions`) | — |
| B4 | ⚠️ Residual | Sin hardware de gateway | Ventana con router/NAS (P-07) |
| B5 | ⚠️ Residual | `Settled` revertidos por reorg no compensados | Deuda Fase 4 |
| B6 | ⚠️ Residual | Cobertura ≥80 % no medida (RNF-15) | `@vitest/coverage-v8` en CI (Fase 4) |

## 5. Veredicto

**Fase 3: CERRADA** (2026-10-19). B1 (backups/PITR), B2 (preview + smoke) y B3 (API↔Cloud SQL) están
resueltos con evidencia. Los riesgos residuales son de **entorno/operador** (drill de restauración por
org policy, preview no público, hardware de gateway) y deuda planificada de Fase 4 (cobertura, reorg).
Se puede abrir **Fase 4 (Pruebas)** con el plan de [`plan_desarrollo.md`](plan_desarrollo.md) §Fase 4
(Forge + Vitest + Playwright + k6 + cobertura).
