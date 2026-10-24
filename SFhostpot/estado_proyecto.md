# Estado del Proyecto — SFhostpot (Superfluid Hotspot v1)

## Fase actual: **FASE 3 — Desarrollo cerrada** ✅ (2026-10-19); siguiente: **Fase 4 — Pruebas**

Última actualización: 2026-10-19
Carpeta de documentación: `SFhostpot/` (separada de `RepoTecnico/` del proyecto v1).

### Fase 2 — hito 1: auditoría V1 del paquete de Fase 1 ✅

- [x] `@audita` (7 lentes + verificación adversarial + síntesis) → [`INFORME_OPTIMIZACION_V1.md`](INFORME_OPTIMIZACION_V1.md).
- **Resultado: 38 hallazgos (2 CRÍTICA, 12 ALTA, 19 MEDIA, 5 BAJA).**
- **Veredicto: la Fase 1 no es apta para pasar a Fase 3 tal cual**; requiere un ciclo corto
  **“Fase 1-bis”** que cierre H-01 y H-02 más los ALTA bloqueantes (H-03…H-13 y H-14).
- Hallazgos clave: **H-01** solvencia sin predicado operable (buffer 1 h vs 4 h del brief);
  **H-02** provisional de 60 s concedido solo por ver la tx en mempool (vía de acceso gratuito);
  H-03 SLA sin métrica; H-04 reintentos/gracia/`degraded` sin parámetros; H-05 “50 %” sin ancho de
  banda base; H-06 conteos/referencias cruzadas erróneos; H-07 sin backup/RTO/RPO; H-08 secretos
  RADIUS en claro; H-09 RGPD sin purga; H-10 RPC sin failover; H-11 Cloud Run vs procesos vivos;
  H-12 MAC spoofing no cuantificado; H-13 `pauseFlow` conserva `flowRate > 0`.

### Fase 2 — hito 2: resolución de la auditoría ("Fase 1-bis") ✅

- [x] Entrevista P14–P34 (una a una) y decisiones D20–D41 → [`resolucion_auditoria_v1.md`](resolucion_auditoria_v1.md).
- [x] **H-01…H-38 cerrados** (los 38 hallazgos) con cambio aplicado en requerimientos y/o en los
      tres artefactos de datos (payout único en tarifa, bandwidth base, `secret_ref`, lease/version,
      XOR de bindings, UK voucher+MAC, nuevas RNF-17…RNF-27).
- [x] **Validador de artefactos** creado y verde: [`tools/validador_artefactos.py`](tools/validador_artefactos.py)
      (20 tablas · 16 enums · columnas 1:1 · ER 100 % · conteos correctos).
- [x] **H-35 CERRADO con validación real** contra el **PostgreSQL global de GCP**
      (`truekeate-main:southamerica-east1:truekeate-db-dev`, **PG 15.18**) en esquema aislado:
      **130 sentencias × 2 pasadas sin errores**, 20 tablas + 16 enums + 1 vista, trigger OK y esquema
      eliminado sin residuo. Evidencia: [`pruebas/validacion_base_datos_gcp.log`](pruebas/validacion_base_datos_gcp.log).
      Herramienta: [`tools/validar_sql_gcp.py`](tools/validar_sql_gcp.py).
- [x] `casos_uso.md` — **19 CU** con Gherkin/EARS (116 escenarios + 133 restricciones), pre/postcondiciones,
      flujos FA/EX y trazabilidad **27/27 RF · 27/27 RNF · 12/12 RT**.
- [x] `diagramas_casos_uso.md` — 6 bloques Mermaid (casos de uso, secuencias CU-03/CU-08/CU-18, estados,
      despliegue); los 6 parsean OK.
- [x] `documento_tecnico.md` — 10 secciones (arquitectura, API, datos, lógica crítica, seguridad,
      trazabilidad, entornos, riesgos, hitos H1–H6); trazabilidad sin huérfanos.
- [x] **Auditoría de Fase 2** (7 lentes + verificación adversarial) → [`INFORME_AUDITORIA_FASE2_V1.md`](INFORME_AUDITORIA_FASE2_V1.md):
      **41 hallazgos (2 CRÍTICA, 14 ALTA, 19 MEDIA, 6 BAJA)** y 15 preguntas al director.
- [x] **Entrevista P35–P49 resuelta** (una a una) y decisiones **D42–D56** → [`resolucion_auditoria_fase2.md`](resolucion_auditoria_fase2.md).
- [x] **Correcciones aplicadas**: cadencia 1 min (Jobs+Scheduler), SLA doble, `/authorize` 202 + Cloud
      Tasks, canal autenticado hotspot→API, MAC/IP verificada en el NAS, OpenAPI v1, 5 roles + API keys,
      k6, RGPD ampliado, contrato a 1 h, cupo vivo, unicidad flow↔sesión, aviso de privacidad previo.
- [x] **Esquema actualizado y validado** (v1.6): índice de flow solo para `wallet_stream`, redención
      con `released_at` + índice parcial vivo + trigger de cupo, `notice_version/notice_accepted_at`,
      5 roles, `api_key_*`, `max_children_per_parent`, `pseudonymized_at`.
- [x] **Re-auditoría V2** → [`INFORME_AUDITORIA_FASE2_V2.md`](INFORME_AUDITORIA_FASE2_V2.md):
      14 residuales (1 CRÍTICA, 4 ALTA) y bloqueos B1–B5, todos corregidos en la **Fase 2-ter**.
- [x] **Validación real del DDL v1.6** contra Cloud SQL: **143 sentencias × 2 pasadas, 0 errores**,
      20 tablas + 16 enums + 1 vista, y pruebas funcionales **B3**: padre+2 hijos coexisten,
      reconexión tras liberación OK, unicidad flow↔sesión rechazada. Evidencia:
      [`pruebas/validacion_base_datos_gcp_fase2.log`](pruebas/validacion_base_datos_gcp_fase2.log).
- [x] **Registro de decisiones** [`registro_decisiones.md`](registro_decisiones.md) (P-01…P-08 cerradas,
      RB-31…RB-37 ratificadas).
- [x] Re-verificación corta final y checklist B1–B5 en verde (sin contradicciones prohibidas).

### Fase 3 — hito 0: plan de desarrollo vertical ✅

- [x] [`plan_desarrollo.md`](plan_desarrollo.md): 6 hitos verticales (H1–H6) con tareas, dependencias,
      trazabilidad CU/RF/RNF/RT, criterios de aceptación, riesgos y DoD; duración 4 semanas (D39).
- [x] **Aprobación del Director para iniciar H1** (contratos BRLT/BRLTx + tests + deploy a Besu).

### Fase 3 — hito H1: contratos + tests + deploy ✅ (2026-10-17)

- [x] Scaffold local `sfh-sc/` (repo nuevo; URL remota pendiente P-08): `foundry.toml` (solc 0.8.28,
      OZ 5.1.0, `via_ir`), `src/`, `test/`, `script/`, `deployments/`, `.env.example`, `.gitignore`.
- [x] `BarloventoToken.sol` (BRLT, 18 dec, hard-cap 10.000.000, mint/burn owner) — D2/P10.
- [x] `BarloventoTx.sol` (BRLTx) adaptado de `EuroX.sol`: **`ReentrancyGuard` + CEI** en 9 funciones
      (D34/D40) y **gate de apertura de 1 h** = `rate×3600` (D54).
- [x] `BarloventoFactory.sol` (par BRLT→BRLTx) y `DeployAll.s.sol` con preflight chainId 81234.
- [x] **Suite Forge: 44/44 verdes** (41 unitarios + 4 invariantes fuzz con 128.000 llamadas) +
      test de frontera **1 h** (`test_create_flow_one_hour_boundary`).
- [x] **Slither: 0 high/medium** (solo informacionales: complejidad de `settle`, assembly de
      `getOpenOutflows`, `block.timestamp`).
- [x] **Despliegue real en Besu 81234** (blockchain Codecrypto): BRLT
      `0x99aA73dA6309b8eC484eF2C95e96C131C1BBF7a0`, Factory `0x98721EFD3D09A7Ae662C4D63156286DF673FC50B`,
      BRLTx `0x6540b8f49168c6896d85f05b5ca8AdAaaEB65be0`. Registro en `sfh-sc/deployments/codecrypto.json`.
- [x] **Smoke en vivo**: approve 1000 BRLT → wrap 1:1 → `createFlow` rate 0.0005/s (garantía
      **1,8 BRLT = rate×3600**) → `getAccountInfo` correcto → `closeFlow` (estado `Closed`, devengo 1e15).
- [ ] H1-9: `sync-abi` a `sfh-orchestrator`/`sfh-portal` (se hará al crear esos módulos en H2/H4).

### Fase 3 — hito H2: orquestador + API v1 (core entregado) 🚧

- [x] Scaffold `sfh-orchestrator/` (Node 22 + TS + Fastify 5 + ethers 6 + pg + zod + jose).
- [x] Config tipada (zod) y secretos por entorno; `.env.example`.
- [x] **Dominio puro con tests**: solvencia (H-01/D43), tarifa/QoS (RF-09/RF-26), voucher (D55),
      provisional con **oráculo único `MEMPOOL_MODE`** (D56), garantía de apertura 1 h (D54).
- [x] **Auth**: HMAC del NAS + `bind_token` JWT (D45/V2-01), nonces anti-replay, API keys hasheadas (D49).
- [x] Capa `pg` con transacciones; cliente de cadena `ethers` con ABI de BarloventoTx.
- [x] **Indexador con lease/CAS** (D42), **health-check** con muestras/revocación (D43) y
      **job durable de autorización** (validator + gateway + expiración) (D44).
- [x] **Cloud Tasks** con fallback en memoria para dev/test.
- [x] **API v1** (OpenAPI congelado): bind, portal sessions (aviso previo), `/session/authorize` **202**,
      pausa/reanudación, consulta, vouchers (crear/canjear atómico), admin y jobs internos.
- [x] Migración `0001_base_datos.sql` (DDL v1.6), `openapi.yaml` y **runner de migraciones**
      (`npm run migrate`).
- [x] **Build `tsc` limpio y 42/42 tests Vitest verdes** (dominio, auth, API, gateways).
- [ ] H2 pendiente: scopes RBAC finos, integración real Cloud SQL en Node y cobertura ≥80 % medida.

### Fase 3 — hito H3: adaptadores de gateway (core entregado) 🚧

- [x] `GatewayAdapter` + `MockGatewayAdapter` (D16).
- [x] **MikroTik REST** (Opción A): login hotspot, fallback address-list, DELETE por MAC, health,
      timeouts y QoS best-effort (`rate-limit`).
- [x] **RADIUS CoA/PoD** (Opción B): CoA-Request y Disconnect-Request por UDP con
      `Message-Authenticator`, verificación de Response Authenticator, `Calling-Station-Id`,
      `Framed-IP-Address` y **WISPr-Bandwidth-Max-Down/Up**.
- [x] **Fallback CoA↔REST** con 3 intentos 1/2/4 s + jitter; `revoked` solo con ACK (D24).
- [x] Registro por `vendor`/`fallbackVendor` desde `GATEWAY_RUNTIME_CONFIGS`.
- [x] **Tests: 42/42** (MikroTik contra HTTP real, RADIUS contra UDP real, fallback).
- [ ] H3 pendiente: FreeRADIUS en `sfh-infra` y verificación **VPC Connector + UDP 3799** (P-06).

### Fase 3 — hito H4: portal cautivo Web3 (core entregado) 🚧

- [x] Scaffold `sfh-portal/` (Next.js 15.5.28 + React 19 + TS + Tailwind + **viem directo**).
- [x] Aviso de privacidad previo → `portal_session` con `bind_token` (D45/V2-01).
- [x] Wallet inyectada + **firma SIWE** → nuevo endpoint `POST /v1/portal/bindings` en el orquestador
      (verificado con firma real en test).
- [x] Wrap BRLT→BRLTx 1:1 (approve + upgradeTo) con refresco de saldos.
- [x] Stream con `rate >= tarifa` y **garantía de apertura 1 h** (D54) + `/session/authorize` **202**.
- [x] Estado de sesión con polling, **pausa (revoca)** y reanudación; vouchers (generar/canjear).
- [x] **14/14 tests** de lógica pura, `tsc --noEmit` limpio y `next build` OK.
- [x] Nota de seguridad: Next actualizado a **15.5.28** (corrige CVE-2025-66478).
- [ ] H4 pendiente: i18n es/en y axe completo (H6), usar la terna del bind_token del hijo en el canje.

### Fase 3 — hito H5: integración, carga, BD dedicada y caos ✅ (core)

- [x] **BD dedicada `sfhostpot` creada** en Cloud SQL (PG 15.18) y DDL v1.6 migrado: 143 sentencias ×2,
      20 tablas · 16 enums · 1 vista, B3 OK. Cierra **V2-09**. Log:
      [`pruebas/validacion_bd_dedicada_sfhostpot.log`](pruebas/validacion_bd_dedicada_sfhostpot.log).
- [x] **k6 100 VUs** (20 s): 4.063 iteraciones · 8.126 req · **~401 req/s** · **0 % fallos** ·
      checks 100 % · p95 **528 ms**. Script `sfh-orchestrator/pruebas/k6/bind_and_health.js`;
      resumen en [`pruebas/h5_k6_summary.json`](pruebas/h5_k6_summary.json).
- [x] **E2E Playwright 2/2** (CU-01 aviso→wallet→SIWE y caso negativo) con wallet mockeada,
      API interceptada y Chromium headless.
- [x] **Caos**: 3/3 Vitest de health-check (RPC caído no revoca; insolvencia revoca; solvente sin acción).
- [x] Suites: Forge 44/44 · Vitest orquestador **46/46** · Vitest portal 14/14 · Playwright 2/2.
- [x] Evidencia consolidada: [`pruebas/h5_resumen.md`](pruebas/h5_resumen.md).
- [ ] H5 pendiente: integración real orquestador↔Cloud SQL (requiere proxy/ADC o despliegue Cloud Run) y
      compensación explícita de reorg de `Settled` (H6).

### Fase 3 — hito H6: endurecimiento y operación (parcial) 🚧

- [x] **Observabilidad**: `src/metrics.ts` + `GET /metrics` (Prometheus, protegido por API key) y
      [`observabilidad.md`](observabilidad.md) con métricas, SLO, alertas A1–A11, dashboard y MTTR.
- [x] **Purga RGPD** (`src/jobs/purge.ts`): lotes de 1.000, retención 30 días / audit 12 meses, orden
      que respeta FK RESTRICT y seudonimización de `flow_events`; **5/5 tests**.
- [x] **Runbook de operación** [`runbook_operacion.md`](runbook_operacion.md): despliegue, secretos,
      backup/restore, purga, incidentes R1–R10 y checklist de cierre.
- [x] **Infra de despliegue**: `sfh-orchestrator/Dockerfile`, `sfh-portal/Dockerfile`,
      `sfh-infra/docker-compose.yml` (Postgres + FreeRADIUS + orquestador + portal),
      `sfh-infra/freeradius/*`, `cloudbuild-orchestrator.yaml`, `cloudbuild-portal.yaml` y
      `sfh-infra/smoke/` (imagen + script + Cloud Build del smoke).
- [x] **B1 RESUELTO — backups 30 días + PITR habilitados** en `truekeate-db-dev`
      (`enabled=true`, `retainedBackups=30`, `pointInTimeRecoveryEnabled=true`, `startTime=03:00`,
      retención de logs 7 días) y **backup automático SUCCESSFUL** verificado
      (`1792411464542`, 2026-10-19T12:04:24Z). Evidencia:
      [`pruebas/h6_backup_check.log`](pruebas/h6_backup_check.log). Comando en `runbook_operacion.md` §3.
      - [ ] Drill de restauración en clon: **bloqueado** por org policy `sql.restrictPublicIp`
        (la instancia nueva nacería con IP pública) y sin Service Networking/PSA para IP privada.
        Evidencia del bloqueo y procedimiento: [`pruebas/h6_restore_drill.log`](pruebas/h6_restore_drill.log)
        y `runbook_operacion.md` §3.
- [x] **B2 RESUELTO — preview desplegado en Cloud Run + Cloud SQL** (`southamerica-east1`):
      API `sfh-orchestrator`, portal `sfh-portal`, imágenes en Artifact Registry y secretos en
      Secret Manager. **Smoke E2E real 7/7 PASS** (health, `/readyz` contra la BD, bind HMAC,
      rechazo de firma inválida, `portal_session` persistida en Cloud SQL, aislamiento portal/hotspot y
      HTML del portal con disclaimer). Evidencia:
      [`pruebas/h6_preview_smoke.log`](pruebas/h6_preview_smoke.log).
      - Acceso del preview: **solo autenticado** (la org policy `iam.allowedPolicyMemberDomains`
        impide `allUsers`/`allAuthenticatedUsers`); el smoke se ejecuta como Cloud Run Job con
        `roles/run.invoker`. Ver `runbook_operacion.md` §1.1.
      - Hallazgo operativo: `/healthz` es interceptado por el frontend de Cloud Run (GFE 404);
        se añadió el alias externo **`/health`** al orquestador.
- [x] **B3 RESUELTO**: el orquestador desplegado conecta a Cloud SQL real vía socket
      (`--add-cloudsql-instances`), verificado por `/readyz` (`{"ok":true,"db":true}`) y por escrituras
      en `portal_sessions`.
- [x] Cierre de Fase 3: [`INFORME_FASE3.md`](INFORME_FASE3.md) actualizado con B1/B2/B3 resueltos,
      evidencia y riesgos residuales (drill de restauración, hardware, cobertura, reorg).

### Fase 4 — entorno de pruebas con MikroTik emulado (`sfh-sim`) ✅ (fases A–C)

- [x] **Propuesta completa** [`propuesta_entorno_pruebas_mikrotik.md`](propuesta_entorno_pruebas_mikrotik.md)
      (opciones, arquitectura, contrato, escenarios E2E-01…E2E-13, plan, costes y decisiones D-A…D-F).
- [x] **Fase A — emulador de contrato**: servicio `sfh-sim/` (RouterOS v7 REST + fallos + admin),
      Dockerfile, `cloudbuild.yaml`, overlay `sfh-infra/docker-compose.sim.yml`; **17 tests** `node:test`.
      Evidencia: [`pruebas/h7_entorno_mikrotik_local.log`](pruebas/h7_entorno_mikrotik_local.log).
- [x] **Fase B — NAS + escenarios**: `nas-sim.mjs` (bind HMAC → portal) y `scenario-runner/run.mjs`
      (plataforma real → adaptador → emulador → Cloud SQL).
- [x] **Fase C — cloud**: servicio privado `sfh-sim-routeros` (`southamerica-east1`), job
      `sfh-sim-scenarios`, `GATEWAY_RUNTIME_CONFIGS` del orquestador con `platformAuth: "cloudrun"`;
      **10/10 PASS**. Evidencia: [`pruebas/h7_entorno_mikrotik_emulado.log`](pruebas/h7_entorno_mikrotik_emulado.log).
- [x] **Fix de plataforma descubierto por el entorno**: `POST /v1/session/pause` ahora pasa MAC/IP
      reales al adaptador y `disconnect` distingue error HTTP de "ya desconectado" (fail-closed);
      tests del orquestador **55/55**.
- [x] **Demo CU-01 scripted en cloud** (`sfh-demo`, Playwright + wallet real en Besu): aviso→wallet→SIWE→
      wrap→stream→authorize→emulador→pausa, con **13/13 PASS**, 8 capturas, vídeo y log JSON.
      Evidencia: [`pruebas/h7_demo_y_k6.md`](pruebas/h7_demo_y_k6.md) y [`pruebas/demo/`](pruebas/demo/).
- [x] **Carga k6 100 VUs** (`sfh-k6-load`): NAS→portal y comandos de gateway, **ambos escenarios superados**
      (checks 100 %, 0 % fallos, p95 < 1.000 ms, ACK gateway p95 475 ms < 500 ms).
      Evidencia: [`pruebas/h7_demo_y_k6.md`](pruebas/h7_demo_y_k6.md) y [`pruebas/k6/`](pruebas/k6/).
- [x] **Fixes de plataforma de la demo/carga**: CORS configurable, `parseAbi` en el portal, ABI de
      `createFlow` en `chain.ts`, `DB_POOL_MAX`, tarifa sembrada y manejo de flujo existente.
- [x] **Fase D — validación contra RouterOS real (CHR 7.16.2 sobre QEMU TCG, sin KVM)**: probe
      **19/19 PASS**, matriz de fidelidad y correcciones reales (`PUT` para address-list, limpieza de
      address-list en `disconnect`, `preferAddressList`, sin `rate-limit` en login). Informe:
      [`INFORME_FASE_D_CHR.md`](INFORME_FASE_D_CHR.md) · evidencia:
      [`pruebas/h7_fase_d_chr.log`](pruebas/h7_fase_d_chr.log) · lab: [`../sfh-chr/`](../sfh-chr/).
- [ ] Validación con cliente hotspot real/hardware (P-07): flujo nativo `hotspot/active/login`, QoS y TLS.

## Resumen

Adaptación del proyecto `superfluid` (v1 beta) al brief
`RepoTecnico/BRIEF_SUPERFLUID_HOSTPOT.md`: WiFi **pay-as-you-go** mediante un *Constant Flow
Agreement* de Superfluid, con control del router (MikroTik RouterOS y/o RADIUS) desde un
orquestador/middleware. Se **reutiliza** el núcleo blockchain ya probado de v1 y se **añade** la
capa off-chain (portal cautivo Web3 + orquestador + PostgreSQL + adaptadores de gateway).

## Hitos de la Fase 1

- [x] Brief HOSTPOT analizado y descompuesto (componentes, flujo, casos límite) →
      `propuesta_adaptacion.md` §2.
- [x] Diagnóstico del proyecto actual y **mapa de reutilización / adaptación / nuevo / retirado**
      → `propuesta_adaptacion.md` §3.
- [x] Arquitectura de 3 planos + 2 diagramas de secuencia (autorización provisional) →
      `propuesta_adaptacion.md` §4.
- [x] `requerimientos.md`: 27 RF + **27 RNF** + 12 RT + decisiones **D1–D41** (ambigüedades del
      brief y de la auditoría resueltas) + alcance + stakeholders.
- [x] Artefactos de datos **sincronizados** (validados con `tools/validador_artefactos.py`: 20 tablas,
      16 enums, columnas 1:1 y cobertura ER 100 %):
      - `diccionario_datos.md` — modelo on-chain BRLT/BRLTx + 20 tablas PostgreSQL.
      - `diagrama_er.md` — ER Mermaid por dominios (on-chain, red, identidad, vouchers, sesión,
        blockchain, comandos/RADIUS).
      - `base_datos.sql` — DDL PostgreSQL (16 enums, 20 tablas, índices, vista,
        triggers, comentarios, seeds de desarrollo).
- [x] `entornos_globales.md`: entornos, variables, secretos (por referencia) y comandos.
- [x] `README.md` de la carpeta como índice.
- [x] **Entrevista P1–P9 resuelta** (2026-10-15): token **BRLT/BRLTx**, ambos adaptadores de gateway,
      sin hardware real, tarifas por plan off-chain, wallet + vouchers, mono-operador preparado,
      RGPD 30 días, SIWE + re-auth, despliegue todo cloud (Cloud Run + Cloud SQL).

## Decisiones confirmadas (entrevista P1–P34, 2026-10-15/16)

> Las decisiones **D20–D41** derivadas de la auditoría V1 están en
> [`resolucion_auditoria_v1.md`](resolucion_auditoria_v1.md).

- **D1 ✅** Red: dev/test en **Besu Codecrypto 81234**; producción configurable a L2.
- **D2 ✅** Token: **`BarloventoToken` (BRLT) + `BarloventoTx` (BRLTx)** adaptados de v1; sin SDK real.
- **D3 ✅** Gateway: interfaz `GatewayAdapter` con **MikroTik REST + RADIUS** (ambos) + `mock`.
- **D4 ✅** Tarifa por segundo **off-chain por plan** (`gateway_tariffs`).
- **D5 ✅** Acceso provisional **60 s** con **validación de tx + cuota anti-reincidencia** (H-02).
- **D6 ✅** Anti-spoofing: **challenge SIWE** + binding `(wallet, MAC, IP, token)` + re-auth.
- **D7 ✅** Sesión: **JWT HS256** en cookie `httpOnly` + fila revocable en servidor.
- **D8 ✅** Indexación por **polling con checkpoint** (`indexer_checkpoints`) con **lease/version** (H-11).
- **D9 ✅** Doble SLA (D43): `< 10 s desde la detección` y `< 75 s end-to-end`, con **health-check cada 1 min** (D42).
- **D10 ✅** **RGPD aplicable** (MAC/IP): aviso, base legal, minimización, **borrado físico a 30 días**.
- **D11 ✅** Un operador en v1; esquema preparado para multi-tenant (`tenant_id`).
- **D12 ✅** `payout_wallet`: **autoridad única en `gateway_tariffs`** (H-24).
- **D13 ✅** Tasas en **wei/s** (`numeric(38,0)` para números grandes).
- **D14 ✅** Fallo de gateway: **fail-closed** en sesiones nuevas; 3 reintentos en activas.
- **D15 ✅** MIT + disclaimer.
- **D16 ✅** Adaptador **mock** obligatorio para CI/E2E (sin hardware real, P3b).
- **D17 ✅** Despliegue **todo cloud**: Cloud Run + **Cloud SQL**; CoA/PoD vía VPC Connector + UDP 3799.
- **D18 ✅** Vouchers **padre/hijo**: la wallet padre abre el stream y genera un código que habilita
  hasta **2 hijos sin wallet** al **50 % de velocidad** mientras dure el stream (revocación en cascada).
- **D19 ✅** **Repositorio nuevo e independiente** para SFhostpot.

## Mapa rápido de reutilización del proyecto actual

| Activo v1 | Destino en SFhostpot |
|---|---|
| `sc/src/Euro.sol`, `EuroX.sol`, `EuroxFactory.sol` | **Adaptación + renombrado**: `BarloventoToken` (BRLT), `BarloventoTx` (BRLTx), `BarloventoFactory` |
| `sc/test/*` (37 tests + fuzz) | Reutilización + pruebas de integración off-chain |
| `sc/script/DeployAll.s.sol` | Adaptación (payout wallet del gateway) |
| `web/src/lib/superfluid.ts`, `config/web3.ts` | Adaptación → portal y orquestador |
| `web/src/lib/polling.ts` | Reutilización del patrón backoff/timeout en health-check |
| `web/src/components/Dashboard.tsx` | Rediseño como portal cautivo |
| `tools/*` (sync-abi, check-deployments, coverage) | Reutilización |
| `RepoTecnico/*` | Referencia metodológica; no se copia contenido |
| `LICENSE.md` + disclaimer | Adaptación al dominio hotspot |

## Pendientes tras cerrar la Fase 1

- [x] **Entrevista del director** resuelta: **P1–P13** (`propuesta_adaptacion.md` §12).
- [x] Parámetros BRLT, formato de códigos y modelo del voucher definidos (P10–P12b).
- [x] Repositorio: **nuevo e independiente** (P13/D19).
- [ ] Crear el repositorio nuevo y fijar su URL/rama al iniciar Fase 3.
- [ ] Verificar disponibilidad de PostgreSQL 16 y Docker en el host (no presentes hoy) y habilitar
      **Cloud SQL** para el despliegue cloud (D17).

## Criterios de aceptación de la Fase 1 (skill @asistenteProyecto)

| Criterio | Estado |
|---|---|
| Documentos de arranque existen (`requerimientos.md`, `diccionario_datos.md`, `entornos_globales.md`) | ✅ |
| `diagrama_er.md` con ER completo en Mermaid | ✅ |
| `base_datos.sql` de creación PostgreSQL, coherente con el diccionario | ✅ (validación estructural por script; falta ejecución real en un motor PostgreSQL, no disponible en el host) |
| Los tres artefactos de datos sincronizados | ✅ (20 tablas, 16 enums, columnas 1:1, ER 100 %) |
| Preguntas de la entrevista respondidas | ✅ P1–P13 (2026-10-15) |
| URLs de repositorios y credenciales GCP almacenadas | ⏳ repositorio nuevo por crear (D19) |

## Próximos pasos (Fase 2 — Auditoría)

1. Lanzar `@audita` sobre este paquete (coherencia RF/RNF ↔ datos ↔ arquitectura).
2. Generar **casos de uso** Gherkin/EARS con trazabilidad (actores: usuario final, operador ISP,
   gateway/NAS, blockchain) + diagramas.
3. Redactar y auditar `documento_tecnico.md`; resolver dudas antes de Fase 3.

## Riesgos abiertos

- Host sin PostgreSQL ni Docker: habilitarlos para validar el SQL y el stack (RNF-14); en cloud,
  provisionar Cloud SQL.
- **CoA/PoD RADIUS desde Cloud Run**: requiere VPC Connector + firewall UDP 3799 o VPN al NAS (D17);
  sin ello solo es viable la Opción A (REST MikroTik).
- MAC/IP son datos personales → RGPD no es opcional (D10/RNF-12), retención 30 días.
- RPC académico frágil (heredado de v1) → indexador con checkpoint y backoff.
- Sin hardware real (P3b) → dependencia del adaptador `mock`; los adaptadores reales quedan sin
  validación end-to-end hasta disponer de router/NAS.
- Fuerza bruta de códigos de voucher → hash + rate-limit + auditoría (D18).
- Revocación en cascada padre→hijos: riesgo de corte masivo si cae el stream del padre → health-check
  y aviso al padre; diseño aceptado (el hijo depende del stream del padre por definición).
