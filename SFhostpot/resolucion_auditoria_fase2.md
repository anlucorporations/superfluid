# Resolución de la Auditoría de Fase 2 — SFhostpot ("Fase 2-bis")

> Decisiones D42–D56 aprobadas por el director (entrevista de 15 preguntas, 2026-10-17) tras
> [`INFORME_AUDITORIA_FASE2_V1.md`](INFORME_AUDITORIA_FASE2_V1.md) (41 hallazgos: 2 CRÍTICA,
> 14 ALTA, 19 MEDIA, 6 BAJA). Estado: **aplicado a documentación y artefactos de datos**.

---

## 1. Decisiones por bloque

### Bloque 1 — Modelo de ejecución y SLA

| # | Hallazgos | Decisión |
|---|---|---|
| **D42** | H2-01 | Se mantiene **Jobs + Scheduler con cadencia mínima de 1 minuto** (sin always-on). Se corrigen cron (`* * * * *`) y unidades; el provisional de 60 s se confirma con `eth_getTransactionReceipt` + `getFlow` al vencer la ventana, no con el indexador. Se reescriben RNF-03/05/07 y RB-05. |
| **D43** | H2-07 | **Doble métrica**: `revocation_command_latency_ms` p95 **< 10 s desde la detección**; `service_cutoff_latency_ms` p95 **< 75 s end-to-end** desde el inicio de la insolvencia. Los casos sin ACK se miden aparte y disparan corte de emergencia por address-list. |
| **D44** | H2-24, H2-10 | `/session/authorize` responde **202 Accepted** (validación en worker): `authorize_validation_latency` p95 **< 10 s**. Health-check agrupa lecturas por cuenta, concurrencia máx 8, ciclos incompletos como métrica; prueba k6 con **100 sesiones** antes de H5. |

### Bloque 2 — Identidad de red y anti-spoofing

| # | Hallazgos | Decisión |
|---|---|---|
| **D45** | H2-02 | MAC/IP provienen del portal servido por el **hotspot MikroTik** (`$(mac)`/`$(ip)`) y el orquestador **verifica la terna contra `ip/hotspot/active` del NAS vía RouterOS REST** antes de vincular. RF-17 se reformula sobre esta verificación. |
| **D46** | H2-22 | RF-21 (accounting RADIUS) se mantiene **SHOULD**; no exige camino FreeRADIUS→Cloud SQL. |
| **D47** | H2-16 | Ante conflicto de MAC se **mantiene el binding legítimo** y se rechaza el intento nuevo con **HTTP 409**; auditoría, alerta al titular y cooldown. Se corrige EX-01.3 (no revocar al válido). |

### Bloque 3 — Contrato, datos y criterios de prueba

| # | Hallazgos | Decisión |
|---|---|---|
| **D48** | H2-03 | **OpenAPI v1 congelado al inicio de H2** con prefijo `/v1/...`, `/v1/session/pause` y `/v1/session/resume`, catálogo cerrado de `reason`. Gherkin alineados. |
| **D49** | H2-04, H2-05 | `operator_role` pasa a **5 valores** (`admin, operator, readonly, auditor, dpo`); API keys persistidas en **columnas de `operators`** (`api_key_hash`, `api_key_prefix`, `api_key_scopes`, `api_key_expires_at`, `api_key_last_used_at`, `api_key_revoked_at`). |
| **D50** | H2-06 | Rendimiento a **spec k6 versionado**; en los CU solo criterios deterministas con **un único resultado** por escenario (p. ej. cierre con ACK = `closed`). |

### Bloque 4 — Datos, RGPD e infraestructura

| # | Hallazgos | Decisión |
|---|---|---|
| **D51** | H2-13 | Producción en **`truekeate-db-dev` (southamerica-east1)** con **base de datos dedicada `sfhostpot`** dentro de la instancia; residencia LatAm aceptada y documentada. |
| **D52** | H2-14, H2-27 | Borrado RGPD ampliado a `flow_events`/`flow_subscriptions` (seudonimizar wallet, `pseudonymized_at`) y payloads de `access_commands`; matriz de retención: **PII 30 días**, `audit_log` de seguridad **12 meses** con MAC/IP seudonimizadas, logs con PII cifrados; **aviso antes** de capturar MAC/IP. |
| **D53** | H2-33 | **`registro_decisiones.md`** con propietario/fecha para P-01…P-08 y RB-31…RB-35; BD verificada por **Cloud SQL**; `docker compose` completo pasa a Fase 4. |

### Bloque 5 — Economía on-chain y cupos

| # | Hallazgos | Decisión |
|---|---|---|
| **D54** | H2-11 | `BarloventoTx` cambia para que la apertura requiera **1 h de tarifa** (depósito = `rate × 3600`, sin tramo extra); se revalidan invariantes con Forge/fuzz. |
| **D55** | H2-19, H2-20 | Cupo de hijos **por sesión viva** (se libera al desconectarse, permite reconexión); `max_children`=2 por voucher; **`max_children_per_parent`** (default 5) en tarifa. |
| **D56** | H2-09, H2-12 | **Unicidad flow ↔ sesión** (un flow activo = una sesión padre; el resto por voucher). Verificar mempool en Besu 81234 en H2; si no es visible, provisional confirmado por receipt y revocado a los 60 s sin receipt. |

---

## 2. Cambios de esquema aplicados (sincronizados y validados)

| Cambio | Decisión |
|---|---|
| `operator_role` → 5 valores (`auditor`, `dpo`) | D49 |
| `operators.api_key_hash/prefix/scopes/expires_at/last_used_at/revoked_at` | D49 |
| `gateway_tariffs.max_children_per_parent` (default 5) | D55 |
| `flow_events.pseudonymized_at` y `flow_subscriptions.pseudonymized_at` | D52 |
| Índice único parcial `uq_hotspot_sessions_active_flow` | D56 |

Resultado: **20 tablas · 16 enums · 25 entidades ER**; validado con `tools/validador_artefactos.py`.
Se re-ejecutó el DDL contra Cloud SQL tras los cambios (ver `pruebas/`).

---

## 3. Correcciones documentales aplicadas (H2-01…H2-41)

- Modelo de ejecución y cadencias (D42), SLA doble (D43), authorize 202 (D44).
- Identidad de red por NAS (D45), conflicto de MAC 409 (D47).
- OpenAPI v1 (D48), RBAC 5 roles (D49), criterios deterministas/k6 (D50).
- RGPD ampliado (D52), BD dedicada (D51), registro de decisiones (D53).
- Contrato a 1 h (D54), cupo vivo (D55), unicidad flow↔sesión (D56).
- Ciclo de vida canónico de `hotspot_session`; enums y `disconnect_reason` cerrados; alerta canónica;
  reorg compensado; rate-limit con almacén compartido; `/readyz` y `/metrics` protegidos;
  re-autenticación por deriva; trazabilidad §7.2 regenerada; arista CU-18→CU-17; soporte/actor
  "Titular de los datos"; etc.

---

## 4. Criterio de cierre

Se considera cerrada la Fase 2 cuando:
1. Los 2 CRÍTICA y 14 ALTA quedan resueltos o registrados como decisión aceptada con criterio.
2. Los artefactos de datos pasan el validador **y** el DDL real en Cloud SQL.
3. Los tres documentos de Fase 2 son coherentes entre sí (casos_uso ↔ diagramas ↔ doc técnico).
4. Se emite una re-auditoría corta de verificación (Fase 2-bis) sin hallazgos CRÍTICA/ALTA abiertos.
