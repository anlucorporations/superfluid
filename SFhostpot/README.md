# SFhostpot — Superfluid Hotspot (Pay-As-You-Go WiFi)

Nueva versión del proyecto `superfluid` adaptada al brief
[`BRIEF_SUPERFLUID_HOSTPOT.md`](../RepoTecnico/BRIEF_SUPERFLUID_HOSTPOT.md): acceso a internet
medido en tiempo real con un **Constant Flow Agreement (CFA)** de Superfluid y control del router
(MikroTik RouterOS y/o RADIUS).

> **Estado**: Fase 1 — Concepto **cerrada**. Entrevista **P1–P13 resuelta** (2026-10-15): token
> propio **BarloventoToken (BRLT)** y Super Token **BRLTx**, adaptadores MikroTik REST + RADIUS,
> **vouchers padre/hijo** (wallet padre abre stream → hasta 2 hijos sin wallet al 50 %), retención
> RGPD de 30 días, despliegue en cloud y **repositorio nuevo independiente**.
> Ver [`propuesta_adaptacion.md`](propuesta_adaptacion.md) §12.

## Índice de documentos

| Documento | Contenido |
|---|---|
| [`propuesta_adaptacion.md`](propuesta_adaptacion.md) | **Documento principal**: análisis del brief, diagnóstico del proyecto actual, mapa de reutilización/adaptación/nuevo, arquitectura, alcance, decisiones, riesgos, hoja de ruta y preguntas abiertas |
| [`requerimientos.md`](requerimientos.md) | RF / RNF / RT extraídos del brief + decisiones D1–D56 + alcance + stakeholders |
| [`casos_uso.md`](casos_uso.md) | 19 casos de uso con Gherkin/EARS, pre/postcondiciones, flujos FA/EX y matriz de trazabilidad |
| [`diagramas_casos_uso.md`](diagramas_casos_uso.md) | Diagramas Mermaid: casos de uso, secuencias CU-03/CU-08/CU-18, estados y despliegue |
| [`documento_tecnico.md`](documento_tecnico.md) | Documento técnico: arquitectura, contratos de API, modelo de datos, lógica crítica, seguridad, trazabilidad y hitos H1–H6 |
| [`plan_desarrollo.md`](plan_desarrollo.md) | Plan de desarrollo vertical Fase 3: H1–H6 con tareas, criterios de aceptación, trazabilidad y riesgos |
| [`diccionario_datos.md`](diccionario_datos.md) | Diccionario de datos: estructuras on-chain BRLT/BRLTx + 20 tablas PostgreSQL (nuevas, incl. vouchers) |
| [`diagrama_er.md`](diagrama_er.md) | Diagrama Entidad-Relación completo en Mermaid, por dominio |
| [`base_datos.sql`](base_datos.sql) | Script PostgreSQL 15+ ejecutable e idempotente (16 enums, 20 tablas, índices, triggers, seeds) |
| [`entornos_globales.md`](entornos_globales.md) | Entornos, variables, secretos y comandos clave |
| [`estado_proyecto.md`](estado_proyecto.md) | Memoria de trabajo y criterios de cierre de fase |
| [`INFORME_OPTIMIZACION_V1.md`](INFORME_OPTIMIZACION_V1.md) | Auditoría `@audita` de la Fase 1 (38 hallazgos: 2 CRÍTICA, 12 ALTA, 19 MEDIA, 5 BAJA) |
| [`resolucion_auditoria_v1.md`](resolucion_auditoria_v1.md) | Resolución de la auditoría ("Fase 1-bis"): decisiones H-01…H-38 y cambios aplicados |
| [`INFORME_AUDITORIA_FASE2_V1.md`](INFORME_AUDITORIA_FASE2_V1.md) | Auditoría de Fase 2 (41 hallazgos: 2 CRÍTICA, 14 ALTA, 19 MEDIA, 6 BAJA) y 15 preguntas al director |
| [`resolucion_auditoria_fase2.md`](resolucion_auditoria_fase2.md) | Resolución de la Fase 2 ("Fase 2-bis"): decisiones D42–D56 y cambios aplicados |
| [`INFORME_AUDITORIA_FASE2_V2.md`](INFORME_AUDITORIA_FASE2_V2.md) | Re-auditoría de verificación (Fase 2-ter): 14 residuales y bloqueos B1–B5 corregidos |
| [`registro_decisiones.md`](registro_decisiones.md) | Registro único de decisiones (D1–D56, P-01…P-08, RB-31…RB-37) con propietario y fecha |
| [`tools/validador_artefactos.py`](tools/validador_artefactos.py) | Validador CI de sincronía de los tres artefactos de datos + cobertura CU→RF/RNF/RT |
| [`tools/validar_sql_gcp.py`](tools/validar_sql_gcp.py) | Ejecuta `base_datos.sql` contra el PostgreSQL global de GCP (esquema aislado) + pruebas funcionales B3 |
| [`pruebas/validacion_base_datos_gcp.log`](pruebas/validacion_base_datos_gcp.log) | Evidencia de la validación inicial: 130 sentencias × 2 pasadas (H-35) |
| [`pruebas/validacion_base_datos_gcp_fase2.log`](pruebas/validacion_base_datos_gcp_fase2.log) | Evidencia de la validación v1.6: 143 sentencias × 2 pasadas + B3 (padre+hijos, reconexión, unicidad) |
| [`pruebas/validacion_bd_dedicada_sfhostpot.log`](pruebas/validacion_bd_dedicada_sfhostpot.log) | Migración real a la BD dedicada `sfhostpot` (143 × 2, 20 tablas, B3 OK) — H5 |
| [`pruebas/h5_resumen.md`](pruebas/h5_resumen.md) | Evidencia H5: BD dedicada, k6 100 VUs, E2E Playwright, caos y suites |
| [`pruebas/h5_k6_summary.json`](pruebas/h5_k6_summary.json) | Resumen crudo de k6 (100 VUs, 0 % fallos, p95 528 ms) |
| [`observabilidad.md`](observabilidad.md) | Métricas, SLO, alertas A1–A11, dashboard y MTTR (H6) |
| [`runbook_operacion.md`](runbook_operacion.md) | Despliegue, secretos, backup/restore, purga e incidentes R1–R10 (H6) |
| [`INFORME_FASE3.md`](INFORME_FASE3.md) | Informe de cierre de Fase 3 con evidencia, suites y bloqueos B1–B6 (B1/B2/B3 resueltos el 2026-10-19) |
| [`propuesta_entorno_pruebas_mikrotik.md`](propuesta_entorno_pruebas_mikrotik.md) | Propuesta de entorno de pruebas con MikroTik emulado (`sfh-sim`): opciones, arquitectura, contrato, escenarios, plan y costes |
| [`pruebas/h6_backup_check.log`](pruebas/h6_backup_check.log) | Evidencia de backups Cloud SQL: 30 días + PITR habilitados y backup SUCCESSFUL |
| [`pruebas/h6_restore_drill.log`](pruebas/h6_restore_drill.log) | Drill de restauración: bloqueo por org policy `sql.restrictPublicIp` y procedimiento |
| [`pruebas/h6_preview_smoke.log`](pruebas/h6_preview_smoke.log) | Smoke E2E del preview: Cloud Run API + portal + Cloud SQL, 7/7 PASS |
| [`pruebas/h7_emulador_mikrotik_spike.log`](pruebas/h7_emulador_mikrotik_spike.log) | Spike del emulador MikroTik: 12/12 PASS contra el adaptador real |
| [`pruebas/h7_entorno_mikrotik_local.log`](pruebas/h7_entorno_mikrotik_local.log) | Verificación local del entorno emulado: 17 tests + 55 tests orquestador + spike 12/12 |
| [`pruebas/h7_entorno_mikrotik_emulado.log`](pruebas/h7_entorno_mikrotik_emulado.log) | Despliegue cloud del entorno emulado y escenarios E2E: 10/10 PASS |
| [`pruebas/h7_demo_y_k6.md`](pruebas/h7_demo_y_k6.md) | Demo CU-01 scripted (13/13) y carga k6 100 VUs (ambos flujos superados) |
| [`INFORME_FASE_D_CHR.md`](INFORME_FASE_D_CHR.md) | Fase D: validación del adaptador contra RouterOS real (CHR) — matriz de fidelidad y correcciones |
| [`pruebas/h7_fase_d_chr.log`](pruebas/h7_fase_d_chr.log) | Probe del adaptador real contra CHR 7.16.2: **19/19 PASS** |
| [`pruebas/fase_d_chr_console.png`](pruebas/fase_d_chr_console.png) | Captura de consola RouterOS del laboratorio CHR |
| [`../sfh-chr/`](../sfh-chr/) | Laboratorio CHR reproducible (QEMU TCG sin root) + probe de fidelidad |
| [`pruebas/demo/`](pruebas/demo/) | Capturas, vídeo y log JSON de la demo del portal |
| [`pruebas/k6/`](pruebas/k6/) | Resúmenes JSON de las dos pruebas de carga k6 |
| [`../sfh-sim/`](../sfh-sim/) | Implementación del emulador (`server`, `nas-sim`, `scenario-runner`, tests) |
| [`../sfh-infra/smoke/`](../sfh-infra/smoke/) | Imagen, script y Cloud Build del smoke E2E (`preview_smoke.mjs`) |

## Relación con el proyecto anterior (`superfluid` v1 beta)

SFhostpot **reutiliza y adapta** el núcleo blockchain ya probado (`sc/src/Euro.sol`, `EuroX.sol`,
`EuroxFactory.sol`, que pasan a ser `BarloventoToken`/`BarloventoTx`/`BarloventoFactory`) y **añade**
la capa que el brief HOSTPOT exige y v1 no
tenía: portal cautivo Web3, orquestador/middleware, base de datos de sesión y control de gateway
(MikroTik REST / RADIUS CoA y Disconnect-Request). Ver la tabla de reutilización en
[`propuesta_adaptacion.md`](propuesta_adaptacion.md) §3.

## Sincronía de artefactos

`diccionario_datos.md`, `diagrama_er.md` y `base_datos.sql` forman una **única fuente de verdad**:
toda edición en uno obliga a actualizar los otros dos en el mismo turno.
