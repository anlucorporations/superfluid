# Resolución de la Auditoría V1 — SFhostpot ("Fase 1-bis")

> Registro de decisiones y cambios aplicados tras
> [`INFORME_OPTIMIZACION_V1.md`](INFORME_OPTIMIZACION_V1.md) (38 hallazgos: 2 CRÍTICA, 12 ALTA,
> 19 MEDIA, 5 BAJA). Entrevista de resolución P14–P34 con el director (2026-10-16).
> Estado: **aplicado en documentación y validado en motor real** (H-35 cerrado contra el PostgreSQL
> global de GCP, ver §4).

---

## 1. Decisiones por hallazgo

| H | Sev. | Decisión del director | Cambio aplicado |
|---|---|---|---|
| **H-01** | CRÍTICA | Predicado por estado + garantía de **1 h** (se mantiene el DDL; desviación respecto a las "4 h" del brief documentada como decisión de producto) | `is_solvent := (status == Active) ∧ (flowRate >= tarifa) ∧ (virtualBalanceOf(sender) > 0)`; `buffer_seconds` = 3600 s; nota de convención de `virtualBalanceOf` (int256) y `pendingDeficit` |
| **H-02** | CRÍTICA | Validar la tx del mempool + cuota anti-reincidencia + auditoría | RF-12 ampliado: `from == wallet del binding`, `to == Super Token`, método `createFlow`, `receiver == payout_wallet`, `flowRate >= tarifa`, saldo/nonce ejecutables; 1 provisional por MAC+wallet / 15 min; intentos fallidos en `audit_log`; bloqueo del dispositivo ante abuso |
| **H-03** | ALTA | Medir desde la detección, p95 < 10 s, ciclo 15 s | RNF-03 reformulado: métrica `revocation_command_latency_ms`, inicio en la detección; `HEALTHCHECK_MS=15000` en `entornos_globales.md`; escenario de carga declarado |
| **H-04** | ALTA | 3 intentos + fallback CoA↔REST + ACK verificado | Política fija: backoff 1/2/4 s + jitter, timeout 2 s/intento, gracia 30 s → `degraded`, fallback automático entre transports, `revoked` solo con ACK; sin ACK → corte de emergencia (address-list) + alerta (RNF-19) |
| **H-05** | ALTA | Plan 50 Mbps down / 10 Mbps up; hijo 50 % | `gateway_tariffs.bandwidth_down_bps`/`bandwidth_up_bps` (defaults 50/10 Mbps); conversión a `WISPr-Bandwidth-Max-Down/Up` (bps) y `rate-limit` MikroTik; RF-26 con magnitud absoluta y test contra mock RADIUS |
| **H-06** | ALTA | Corregir y prevenir | Conteos corregidos (27 RF / 16 RNF / 12 RT / D1–D19 / P1–P13 / 16 enums); citas cruzadas corregidas (eventos → RF-07; token → D2); **validador** [`tools/validador_artefactos.py`](tools/validador_artefactos.py) añadido al CI documental (QW-2) |
| **H-07** | ALTA | Backup diario 30 días, sin HA, RTO ≤ 4 h / RPO ≤ 24 h | RNF-17 nueva: backup automático diario con 30 días, RTO/RPO objetivo y prueba de restauración documentada |
| **H-08** | ALTA | Secretos por referencia | `nas.secret` → `nas.secret_ref`; diccionario/ER alineados; `radcheck` documentado; verificación de secretos en CI (RNF-02 ampliado) |
| **H-09** | ALTA | Borrado físico a los 30 días | RNF-12 ampliado: job de purga diario a 30 días, borrado en orden dentro de transacción para resolver la FK `RESTRICT`, test de supresión |
| **H-10** | ALTA | Un solo RPC + modo degradado aceptado | Riesgo aceptado y documentado; backoff/anti-solapamiento/monotonicidad por `blockNumber`; `eth_getLogs` ≤ 5.000 bloques (RNF-20) |
| **H-11** | ALTA | Jobs + Scheduler, sin always-on | Modelo de ejecución: indexador y health-check como **Cloud Run Jobs** con **Cloud Scheduler**; `indexer_checkpoints` gana `leased_by`, `lease_expires_at`, `version` (lease + CAS) |
| **H-12** | ALTA | Detectar y acotar + residuo documentado | RF-17 con detección verificable (misma MAC con wallets/IP distintas), bloqueo por reincidencia, port-security si el AP lo permite; riesgo residual cuantificado |
| **H-13** | ALTA | Pausar = revocar | Validador y health-check exigen `status == Active`; `pauseFlow` revoca padre e hijos; reanudar reautoriza (RNF-21, test con `pauseFlow`) |
| **H-14** | ALTA | Incluir huésped sin wallet | Nuevo stakeholder con aviso de privacidad y vía de derechos propia |
| **H-15** | MEDIA | Aceptar propuesta | RNF-08 reformulado: SLO 99,5 % **mensual** medido por sonda sintética, con alcance y fuente; degradación por escenarios (chain/gateway/BD) |
| **H-16** | MEDIA | Aceptar propuesta | RNF-05: evento "confirmado" = **2 bloques** (finalidad QBFT) y política de reorg de 12 bloques |
| **H-17** | MEDIA | Aceptar propuesta | RNF-22: métricas nombradas + umbrales + alertas + retención de logs + runbook/MTTR |
| **H-18** | MEDIA | Aceptar propuesta | RNF-11: cobertura mínima **80 %** en orquestador medida en CI |
| **H-19** | MEDIA | Aceptar propuesta | RNF-13: **0 violaciones axe A/AA**, alcance del portal, i18n es/en y matriz de navegadores |
| **H-20** | MEDIA | Canje atómico y `redeemed` = cupo agotado | Transacción con `SELECT ... FOR UPDATE`; `redeemed` al alcanzar `max_children`; `UNIQUE (voucher_id, mac_address)` |
| **H-21** | MEDIA | Exclusividad estricta | `chk_device_bindings_owner` pasa a XOR real (wallet XOR voucher) |
| **H-22** | MEDIA | Corregir checklist | Criterios de cierre §6.3/§2.3/§10 actualizados; credenciales pasan a "pendiente: repositorio nuevo (D19)" |
| **H-23** | MEDIA | Reescribir rutas | `entornos_globales.md` opera sobre `sfh-*/` (no `sc/`, `web/` de v1) |
| **H-24** | MEDIA | La tarifa manda | `payout_wallet` eliminado de `gateways`; autoridad única en `gateway_tariffs`; diccionario/ER/SQL alineados |
| **H-25** | MEDIA | Aceptar propuesta | RNF-23: 100 sesiones concurrentes (incl. 50 hijos), 10 gateways, 5 eventos/s; prueba k6 como criterio |
| **H-26** | MEDIA | API keys + MFA opcional | RNF-24: API keys por operador, MFA opcional, bloqueo por intentos y login auditado |
| **H-27** | MEDIA | Endurecer contratos | D40: `ReentrancyGuard` (OZ 5.1) + CEI + re-ejecución de Slither y fuzz como criterio de cierre |
| **H-28** | MEDIA | Aceptar propuesta | RNF-25: inventario de PII ampliado, decisión sobre EIPD documentada, `SameSite`, CSRF y rotación/revocación de JWT |
| **H-29** | MEDIA | Roles | Soporte/atención con canal de reclamación y reemisión de vouchers (asumido por el Director, equipo pequeño) |
| **H-30** | MEDIA | Roles | DPO/cumplimiento asumido por el Director; independencia limitada registrada como riesgo aceptado |
| **H-31** | MEDIA | Roles | Custodia de claves en el Director; separación mínima documentada; separación real antes de mainnet |
| **H-32** | MEDIA | Roles | Moderación con causales, plazo, registro y apelación |
| **H-33** | MEDIA | Roles | RBAC añade `auditor` y `dpo`; responsable de revisión de `audit_log` |
| **H-34** | BAJA | Aceptar propuesta | RNF-02/RNF-16 con patrones, rutas y herramientas del grep; convención `RE-xx` retirada |
| **H-35** | BAJA | Validar contra el PostgreSQL global de GCP | **CERRADO** (ver §4): ejecutado contra **Cloud SQL `truekeate-main:southamerica-east1:truekeate-db-dev` (PostgreSQL 15.18)** en esquema aislado `sfhostpot`: **130 sentencias, 0 errores, doble pasada idempotente**, 20 tablas + 16 enums + 1 vista, trigger `updated_at` OK, esquema eliminado sin residuo. Evidencia: [`pruebas/validacion_base_datos_gcp.log`](pruebas/validacion_base_datos_gcp.log) |
| **H-36** | BAJA | 4+1+1 semanas | Hoja de ruta con duración y propietario (agente + validación del Director en cada cierre) |
| **H-37** | BAJA | Unificar NAS en el ER | NAS aparece una sola vez por bloque con `secret_ref` (H-08) |
| **H-38** | BAJA | audit_log + rate-limit | RNF-26: 5 intentos por IP+MAC cada 15 min, bloqueo temporal, alerta; sin tablas nuevas |

---

## 2. Nuevas decisiones (D20–D41)

| # | Tema | Decisión |
|---|---|---|
| D20 | Solvencia | Predicado por estado + garantía 1 h (H-01) |
| D21 | Acceso provisional | Validación de tx + cuota 1/15 min + auditoría + bloqueo (H-02) |
| D22 | Pausa | `pauseFlow` revoca; reanudar reautoriza (H-13) |
| D23 | SLA de revocación | `revocation_command_latency_ms`, p95 < 10 s desde detección, ciclo 15 s (H-03) |
| D24 | Reintentos | 3 intentos 1/2/4 s + jitter, timeout 2 s, gracia 30 s, fallback CoA↔REST, ACK obligatorio (H-04) |
| D25 | QoS | Plan 50/10 Mbps; hijo 50 % (25/5); WISPr + rate-limit (H-05) |
| D26 | Recuperación | Backup diario 30 días; RTO ≤ 4 h / RPO ≤ 24 h; restauración probada (H-07) |
| D27 | RGPD | Borrado físico a 30 días con job y orden transaccional (H-09) |
| D28 | RPC | Un solo RPC con modo degradado; riesgo aceptado (H-10) |
| D29 | Procesos de fondo | Cloud Run Jobs + Scheduler; lease + version en checkpoint (H-11) |
| D30 | MAC spoofing | Detección + acotación + residuo documentado (H-12) |
| D31 | Voucher | Canje atómico; `redeemed` = cupo agotado; UK voucher+MAC (H-20) |
| D32 | Payout | Autoridad única en la tarifa (H-24) |
| D33 | Admin | API keys + MFA opcional + RBAC `auditor`/`dpo` (H-26/H-33) |
| D34 | Reentrancia | `ReentrancyGuard` + CEI + Slither/fuzz (H-27) |
| D35 | PII/sesión | Inventario + decisión EIPD + CSRF/SameSite/rotación JWT (H-28) |
| D36 | Anti-fuerza-bruta vouchers | 5 intentos/IP+MAC/15 min vía `audit_log` (H-38) |
| D37 | Capacidad | 100 sesiones, 10 gateways, 5 ev/s (H-25) |
| D38 | Roles | Los asume el Director (equipo pequeño); separación mínima; revisión externa antes de mainnet (H-14/H-29..H-33) |
| D39 | Plazos | Fase 3 4 sem · Fase 4 1 sem · Fase 5 1 sem (H-36) |
| D40 | Seguridad de contratos | `ReentrancyGuard` + CEI (mismo que D34) |
| D41 | Validación SQL | Contra el PostgreSQL global de GCP (`truekeate-db-dev`, PG 15.18); **validada** con doble pasada e idempotencia (H-35) |

---

## 3. Cambios en los tres artefactos de datos (sincronizados y validados)

| Cambio | Origen |
|---|---|
| `gateways.payout_wallet` **eliminado** | H-24 |
| `gateway_tariffs.bandwidth_down_bps` / `bandwidth_up_bps` añadidos (50/10 Mbps) | H-05 |
| `nas.secret` → `nas.secret_ref` | H-08 |
| `indexer_checkpoints.leased_by` / `lease_expires_at` / `version` añadidos | H-11 |
| `chk_device_bindings_owner` a XOR estricto | H-21 |
| `uq_voucher_redemptions_mac` (voucher_id, mac_address) | H-20 |

Resultado del validador tras los cambios: **20 tablas · 16 enums · 25 entidades ER · columnas 1:1 ·
cobertura ER 100 % · OK**.

---

## 4. H-35 cerrado — validación real contra el PostgreSQL global de GCP ✅

**Servicio identificado:** el único PostgreSQL global disponible es
**`truekeate-main:southamerica-east1:truekeate-db-dev`** (Cloud SQL **PostgreSQL 15.18**,
IP pública `34.39.180.101`, base `truekeate`, usuario `app`). El proyecto `mcc-ecommerce` **no**
tiene instancias Cloud SQL; su endpoint `mcc-postgres-*.run.app` responde 503.

**Cómo se resolvió el bloqueo anterior:** el `gcloud` de snap está roto y el proxy fallaba con 403,
pero el **SDK nativo `~/google-cloud-sdk`** sí autentica y la **Cloud SQL Admin API** devuelve el CA
y permite generar un certificado efímero. Se conectó con el **Cloud SQL Python Connector**
(`google.cloud.sql.connector`) + driver `pg8000`, usando el token de `gcloud auth print-access-token`.

**Ejecución (esquema aislado `sfhostpot`, eliminado al final):**

```bash
source /home/dsh/workspace/gcp-env.sh
export PATH="/home/dsh/google-cloud-sdk/bin:$PATH"
PYTHONPATH=/tmp/sfpylibs python3 SFhostpot/tools/validar_sql_gcp.py \
  --instance "truekeate-main:southamerica-east1:truekeate-db-dev" \
  --schema sfhostpot --sql SFhostpot/base_datos.sql \
  --log SFhostpot/pruebas/validacion_base_datos_gcp.log
```

**Resultado (`pruebas/validacion_base_datos_gcp.log`):**

| Comprobación | Resultado |
|---|---|
| Sentencias ejecutadas | **130/130 sin errores** (pasada 1) |
| Idempotencia (pasada 2) | **130/130 sin errores** |
| Tablas creadas | **20** |
| Enums | **16** |
| Vistas | **1** (`v_active_sessions`) |
| Trigger `updated_at` | **OK** (actualiza al modificar) |
| Residuo | esquema `sfhostpot` eliminado (`DROP SCHEMA ... CASCADE`) |

> Nota de versión: la instancia es **PostgreSQL 15.18**; el script es compatible con 14+ y se validó
> en 15. La documentación que decía "PostgreSQL 16" se ajusta a "PostgreSQL 15+ (objetivo Cloud SQL
> 15/16)".

---

## 5. Estado tras la Fase 1-bis

- Cerrados con cambio aplicado y evidencia: **H-01…H-38** (los 38 hallazgos).
- **H-35** cerrado con validación real en el PostgreSQL global de GCP.
- Los tres artefactos de datos pasan el validador estructural **y** el DDL real.
- Siguiente paso: continuar **Fase 2** (casos de uso Gherkin/EARS + auditoría, gráficos y
  `documento_tecnico.md` auditado).
