# Evidencia H5 — Integración E2E, carga, BD dedicada y caos

> Fecha: 2026-10-19 · Entorno: host de desarrollo (sin Docker), Cloud SQL vía conector Python.

## 1. BD dedicada `sfhostpot` (H5-1, cierra V2-09)

- BD **`sfhostpot` creada** en la instancia Cloud SQL `truekeate-main:southamerica-east1:truekeate-db-dev`
  (PostgreSQL 15.18) con el usuario `app` (tenía `CREATEDB`).
- Migración del DDL v1.6 en `public`: **143 sentencias × 2 pasadas, 0 errores**, **20 tablas · 16 enums ·
  1 vista**, trigger `updated_at` OK.
- Pruebas funcionales B3 en la BD dedicada: padre+2 hijos coexisten (`children_used=2`), reconexión tras
  liberación OK, unicidad flow↔sesión rechazada.
- Log: [`validacion_bd_dedicada_sfhostpot.log`](validacion_bd_dedicada_sfhostpot.log).

## 2. Carga k6 — 100 VUs (H5-3)

Script: [`../../sfh-orchestrator/pruebas/k6/bind_and_health.js`](../../sfh-orchestrator/pruebas/k6/bind_and_health.js)
(ejercita `POST /v1/internal/hotspot/bind` con HMAC real y `GET /healthz`).

| Métrica | Valor |
|---|---|
| VUs | 100 (constant-vus, 20 s) |
| Iteraciones | 4.063 (~200/s) |
| Peticiones HTTP | 8.126 (~401 req/s) |
| Fallos HTTP | **0,00 %** |
| Checks | **12.189 / 12.189 (100 %)** |
| Latencia media / p95 | 242 ms / **528,87 ms** (umbral p95 < 1.000 ms) |

Resumen JSON: [`h5_k6_summary.json`](h5_k6_summary.json).
> La métrica D43 (revocación) se mide aparte (detección→ACK), no con este endpoint.

## 3. E2E Playwright (H5-2)

`sfh-portal/e2e/portal.spec.ts` con wallet inyectada mockeada y API interceptada
(`/v1/portal/sessions`, `/v1/portal/bindings`), Chromium 131 headless.

- **2/2 tests verdes**: CU-01 (aviso previo → wallet auto-detectada → firma SIWE → binding; stream
  deshabilitado sin BRLTx) y caso negativo sin `bind_token`.

## 4. Caos y reorg (H5-4/H5-5)

- Vitest `test/health.test.ts` (3/3): **RPC caído** → ciclo incompleto sin revocar; **insolvencia** →
  muestra + revocación con ACK; **solvente** → sin acciones.
- Reorg: idempotencia garantizada por `UNIQUE (chain_id, tx_hash, log_index)` y validada en B3; la
  compensación explícita de `Settled` revertidos queda como deuda de H6 (documentada).

## 5. Suites

| Suite | Resultado |
|---|---|
| Forge (contratos) | 44/44 |
| Vitest orquestador | **46/46** |
| Vitest portal | 14/14 |
| Playwright E2E | 2/2 |

## Bloqueos de entorno

- El orquestador **Node no puede conectar a Cloud SQL** (el proxy falla con 403 y no hay ADC); por eso el
  E2E usa API mockeada y la carga usa el canal `bind` (sin BD). La integración real API↔BD requiere
  desplegar en Cloud Run con Cloud SQL (VPC/connector) o corregir ADC.
