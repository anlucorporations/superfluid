# Observabilidad, SLO y Alertas — SFhostpot (H6)

> Fuente de métricas: `sfh-orchestrator/src/metrics.ts` (`GET /metrics`, Prometheus, protegido por API key)
> y consultas a PostgreSQL. Referencia: RNF-03, RNF-08, RNF-17, RNF-19, RNF-22, D43/D44.

## 1. Métricas expuestas

| Métrica | Tipo | Descripción | Umbral/alerta |
|---|---|---|---|
| `sfh_uptime_seconds` | gauge | Tiempo desde el arranque | — |
| `sfh_bind_requests_total{result}` | counter | Altas firmadas por el NAS (ok/errores) | error rate > 1 % en 10 min |
| `sfh_portal_sessions_total` | counter | Sesiones de portal creadas | caída > 50 % vs media 1 h |
| `sfh_authorize_requests_total` | counter | Solicitudes 202 de autorización | — |
| `sfh_vouchers_created_total` | counter | Vouchers generados | — |
| `sfh_vouchers_redeemed_total` | counter | Canjes de voucher | errores 409 > 5 % |
| `sfh_gateway_commands_total{result,transport}` | counter | Comandos a gateway (planificado en H6+) | fallos > 5 % en 5 min |
| `sfh_uptime_seconds` | gauge | — | reinicio inesperado |

### Métricas derivadas de BD/SLO (a exportar desde el Job de health)

| Métrica | Cálculo | Objetivo |
|---|---|---|
| `revocation_command_latency_ms` | detección → ACK | **p95 < 10 s** (D43) |
| `service_cutoff_latency_ms` | inicio insolvencia → corte | **p95 < 75 s** (D43) |
| `authorize_validation_latency_ms` | 202 → resolución | **p95 < 10 s** (D44) |
| `indexer_lag_blocks` | `blockNumber − last_processed_block` | < 5 bloques |
| `active_sessions` | `count(*)` no terminales | informativo |
| `pending_access_commands` | `status in (pending,retrying,failed)` | 0 sostenido |
| `purge_last_success_age_h` | edad del último job | < 26 h |

## 2. SLO y error budget

- **Disponibilidad** (RNF-08): **99,5 % mensual** del orquestador y la API, medida por sonda sintética
  cada minuto (`/healthz`). Error budget mensual ≈ 3 h 39 min.
- **Latencia de revocación** (D43): p95 de los comandos < 10 s desde la detección; el end-to-end
  (insolvencia → corte) < 75 s p95.
- **Validación de autorización** (D44): p95 < 10 s.
- **Índice** (RNF-05): 100 % de eventos confirmados a 2 bloques, con reorg de 12 bloques.

## 3. Alertas propuestas (Cloud Monitoring)

| # | Condición | Severidad | Acción |
|---|---|---|---|
| A1 | `revocation_command_latency_ms` p95 > 10 s (15 min) | CRÍTICA | Runbook R3 |
| A2 | `service_cutoff_latency_ms` p95 > 75 s | ALTA | Runbook R3 |
| A3 | `authorize_validation_latency_ms` p95 > 10 s | ALTA | R2 |
| A4 | `sfh_bind_requests_total{result!="ok"}` > 1 % | MEDIA | R4 |
| A5 | `active_access_commands` pendientes > 10 durante 5 min | ALTA | R5 |
| A6 | `indexer_lag_blocks` > 10 durante 10 min | ALTA | R2 |
| A7 | Sonda `/healthz` fallida 3 veces seguidas | CRÍTICA | R1 |
| A8 | Job de purga sin éxito > 26 h | MEDIA | R6 |
| A9 | Conexiones Cloud SQL > 80 % del máximo | ALTA | R7 |
| A10 | Errores 5xx API > 1 % (10 min) | ALTA | R1 |
| A11 | Backups deshabilitados o último backup > 24 h | **CRÍTICA** | R8 |

## 4. Dashboard mínimo

1. Disponibilidad y latencia por endpoint (p50/p95/p99).
2. Sesiones activas / provisionales / degradadas.
3. Revocaciones por motivo (`flow_deleted`, `insolvent`, `admin`, `timeout`).
4. Comandos al gateway por transporte y resultado (REST vs CoA/PoD).
5. Lag del indexador y reorgs compensados.
6. Errores de purga/backup y antigüedad del último backup.

## 5. MTTR objetivo

| Escenario | Detección | Respuesta | MTTR objetivo |
|---|---|---|---|
| Caída del orquestador | sonda 1 min | redeploy automático | < 15 min |
| RPC degradado | A6/A2 | modo degradado + cache | < 30 min |
| Gateway sin ACK | A5 | fallback de transporte + alerta | < 20 min |
| BD caída | A9/A7 | failover/restore | < 4 h (RTO) |
| Fuga de datos/purga fallida | A8 | ejecución manual + revisión | < 4 h |
