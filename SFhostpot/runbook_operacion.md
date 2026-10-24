# Runbook de Operación — SFhostpot (H6)

> Operación del orquestador, portal, BD y gateways. Complementa
> [`observabilidad.md`](observabilidad.md) y [`entornos_globales.md`](entornos_globales.md).

## 1. Despliegue

| Componente | Servicio | Notas |
|---|---|---|
| API | Cloud Run `sfh-orchestrator` | `node dist/main.js`, `min-instances=0`, Cloud SQL conectado |
| Indexador | Cloud Run Job `sfh-indexer` + Cloud Scheduler `* * * * *` | `node dist/main.js indexer` |
| Health-check | Cloud Run Job `sfh-health` + Cloud Scheduler `* * * * *` | `node dist/main.js health` |
| Purga RGPD | Cloud Run Job `sfh-purge` + Cloud Scheduler `0 3 * * *` | `node dist/main.js purge` |
| Portal | Cloud Run `sfh-portal` | Next standalone |
| BD | Cloud SQL `truekeate-db-dev` · BD `sfhostpot` | **Backups 30 d + PITR habilitados** (2026-10-19) |
| Job smoke | Cloud Run Job `sfh-smoke` | Smoke E2E del preview (`sfh-infra/smoke/`) |

Pipeline: `sfh-infra/cloudbuild-orchestrator.yaml` y `sfh-infra/cloudbuild-portal.yaml` (Artifact Registry
`europe-west1-docker.pkg.dev/truekeate-main/sfhostpot/*`). Migraciones: `npm run migrate` como paso previo
al deploy.

### 1.1 Preview desplegado (2026-10-19)

| Servicio | URL | Revisión | Acceso |
|---|---|---|---|
| API | `https://sfh-orchestrator-m33mjctj4a-rj.a.run.app` | `sfh-orchestrator-00004-vvn` | **Autenticado** (`roles/run.invoker`) |
| Portal | `https://sfh-portal-m33mjctj4a-rj.a.run.app` | `sfh-portal-00001-dql` | **Autenticado** (`roles/run.invoker`) |

- Región `southamerica-east1`; Cloud SQL adjunto con `--add-cloudsql-instances`.
- **El acceso público está bloqueado por la org policy `iam.allowedPolicyMemberDomains`**
  (`allUsers`/`allAuthenticatedUsers` no se pueden añadir). Para un preview público hace falta una
  excepción del operador de la organización (o IAP con load balancer).
- Smoke E2E: `gcloud run jobs execute sfh-smoke --region=southamerica-east1 --wait`
  (7/7 PASS; evidencia en [`pruebas/h6_preview_smoke.log`](pruebas/h6_preview_smoke.log)).
- **`/healthz` no es alcanzable desde fuera**: el frontend de Cloud Run (GFE) responde 404 para esa ruta
  en `*.run.app`. Usar el alias externo **`GET /health`** (el orquestador expone ambos).
- Rate limit del preview: `RATE_LIMIT_MAX=1000`, `RATE_LIMIT_WINDOW_MS=60000` (el smoke hace varias
  llamadas desde la misma IP; revisar estos valores en producción).

### 1.3 Entorno MikroTik emulado (`sfh-sim`)

| Elemento | Valor |
|---|---|
| Servicio | `sfh-sim-routeros` → `https://sfh-sim-routeros-m33mjctj4a-rj.a.run.app` (privado, IAM) |
| Job escenarios | `sfh-sim-scenarios` (plataforma real → adaptador → emulador → Cloud SQL) |
| Imagen | `europe-west1-docker.pkg.dev/truekeate-main/sfhostpot/sim:<tag>` |
| Config API | `GATEWAY_RUNTIME_CONFIGS` con `platformAuth: "cloudrun"` (ID token en `x-serverless-authorization`) |
| Evidencia | [`pruebas/h7_entorno_mikrotik_emulado.log`](pruebas/h7_entorno_mikrotik_emulado.log) · **10/10 PASS** |

Comandos:

```bash
# construir/publicar el emulador
gcloud builds submit sfh-sim --project=truekeate-main \
  --config=sfh-sim/cloudbuild.yaml --substitutions=_TAG=<tag>
# ejecutar escenarios E2E contra el preview
gcloud run jobs execute sfh-sim-scenarios --project=truekeate-main \
  --region=southamerica-east1 --wait
# demo CU-01 (capturas + vídeo + log JSON)
gcloud run jobs execute sfh-demo --project=truekeate-main \
  --region=southamerica-east1 --wait
# carga k6 100 VUs (NAS→portal + comandos de gateway)
gcloud run jobs execute sfh-k6-load --project=truekeate-main \
  --region=southamerica-east1 --wait
```

El emulador expone `/__admin/{mode,state,reset}` (token `x-admin-token`) para inyectar fallos
(`ok|login-fail|error|timeout|slow`). `/rest/*` usa Basic auth. En local: overlay
`sfh-infra/docker-compose.sim.yml` (servicio + NAS + runner). Límite: es un emulador de contrato, no
valida firmware RouterOS (fase D/P-07). Detalle en [`../sfh-sim/README.md`](../sfh-sim/README.md).

**RouterOS real (Fase D):** crear entradas de `address-list` requiere **`PUT`** (no `POST`), y
`disconnect` debe borrar también las entradas `sfh:<sessionId>` de la address-list (el adaptador ya lo
hace). Si no se usa el hotspot nativo, configurar `preferAddressList: true`. Validación completa:
[`INFORME_FASE_D_CHR.md`](INFORME_FASE_D_CHR.md).

| Job de evidencia | Resultado | Evidencia |
|---|---|---|
| `sfh-sim-scenarios` | 10/10 PASS | [`pruebas/h7_entorno_mikrotik_emulado.log`](pruebas/h7_entorno_mikrotik_emulado.log) |
| `sfh-demo` | 13/13 PASS (capturas + vídeo) | [`pruebas/h7_demo_y_k6.md`](pruebas/h7_demo_y_k6.md) |
| `sfh-k6-load` | 100 VUs, ambos flujos superados | [`pruebas/k6/`](pruebas/k6/) |

### 1.2 Secretos del preview (Secret Manager, proyecto `truekeate-main`)

`sfhostpot-jwt-secret`, `sfhostpot-internal-secret`, `sfhostpot-api-key-pepper`,
`sfhostpot-gateway-hmac`, `sfhostpot-database-url` y `sfhostpot-preview-api-key` (API key del operador
de smoke). Rotación según §2.

## 2. Secretos (Secret Manager)

| Secreto | Uso | Rotación |
|---|---|---|
| `sfhostpot-jwt-secret` | tokens de sesión/bind | 90 días |
| `sfhostpot-internal-secret` | jobs internos | 90 días |
| `sfhostpot-api-key-pepper` | hash API keys | 180 días |
| `sfhostpot-gateway-hmac` | firma NAS→API | 90 días |
| `sfhostpot-mikrotik-password` | REST RouterOS | 90 días |
| `sfhostpot-radius-secret` | RADIUS/RadSec | 90 días |
| `sfhostpot-database-url` | DSN completo a `sfhostpot` vía socket Cloud SQL | 90 días |
| `sfhostpot-preview-api-key` | API key del operador de smoke/preview | solo preview |

Rotación: crear nueva versión → redesplegar con referencia → invalidar la anterior. Nunca en repo/logs.

## 3. Backup y recuperación

**Estado (2026-10-19): ✅ RESUELTO.** `truekeate-db-dev` tiene:
`enabled = true`, `retainedBackups = 30`, `pointInTimeRecoveryEnabled = true`,
`backupStartTime = 03:00`, `transactionLogRetentionDays = 7`. Cumple RNF-17
(backup diario, 30 días, RTO 4 h / RPO 24 h). El cambio se aplicó con autorización del operador
(instancia compartida). Evidencia: [`pruebas/h6_backup_check.log`](pruebas/h6_backup_check.log) y
backup `1792411464542` (SUCCESSFUL, 2026-10-19T12:04:24Z).

Verificación:

```bash
gcloud sql instances describe truekeate-db-dev --project truekeate-main \
  --format="yaml(settings.backupConfiguration)"
gcloud sql backups list --instance truekeate-db-dev --project truekeate-main --limit 5
```

Crear un backup on-demand antes de cambios grandes:

```bash
gcloud sql backups create --instance=truekeate-db-dev --project=truekeate-main \
  --description="antes de <cambio>" --async
```

### Drill de restauración (trimestral) — **pendiente, bloqueado por org policy**

Intento ejecutado el 2026-10-19 y **bloqueado**:

```bash
gcloud sql instances clone truekeate-db-dev sfhostpot-restore-test --project=truekeate-main
# HTTPError 400: Organization Policy check failure: the external IP of this instance
# violates the constraints/sql.restrictPublicIp enforced at the 593453426217 project.
```

Motivo: la org policy `constraints/sql.restrictPublicIp` está **enforced** y no hay
Service Networking/PSA habilitado para crear una instancia con **IP privada**. Evidencia completa:
[`pruebas/h6_restore_drill.log`](pruebas/h6_restore_drill.log).

Para ejecutar el drill (requiere una de estas dos vías, con visto bueno del operador de la org):

1. **Excepción temporal** de `sql.restrictPublicIp` en un proyecto de pruebas → clon con IP pública:
   `gcloud sql instances clone truekeate-db-dev sfhostpot-restore-test`,
   validar y borrar la instancia (nunca dejar el clon encendido).
2. **IP privada**: habilitar `servicenetworking.googleapis.com`, crear rango + peering PSA, clonar con
   `--network default` (sin IP pública) y validar desde un Cloud Run Job con Direct VPC egress.

Validación del clon (cualquiera de las dos vías): contar tablas de `sfhostpot`, comparar filas de
`operators`/`gateways`/`portal_sessions` con el origen y ejecutar
`SFhostpot/tools/validar_sql_gcp.py --instance <clon> --schema sfhostpot --sql <migración> --keep`.
Registrar tiempo total (RTO) y antigüedad del backup restaurado (RPO).

## 4. Purga RGPD (RNF-12/D52)

Ejecución diaria 03:00 UTC. Manual:

```bash
# Cloud Run Job
gcloud run jobs execute sfh-purge --region europe-west1
# Local
node dist/main.js purge
```

Verificación: `sfh_uptime` no aplica; revisar logs del job (`flowEventsPseudonymized`,
`hotspotSessionsDeleted`, …) y consultas:

```sql
select count(*) from devices where created_at < now() - interval '30 days';
select count(*) from flow_events where pseudonymized_at is null and observed_at < now() - interval '30 days';
select count(*) from audit_log where created_at < now() - interval '365 days';
```

Si falla: relanzar; si persiste, revisar bloqueos (`pg_stat_activity`) y espacio.

## 5. Incidentes

| # | Síntoma | Diagnóstico | Acción |
|---|---|---|---|
| R1 | API 5xx / sonda falla | logs Cloud Run, `/readyz` | redeploy; si BD no responde → R7 |
| R2 | Lag del indexador / validación lenta | RPC latency, `indexer_checkpoints` | backoff; verificar RPC; el modo degradado está aceptado (D28) |
| R3 | Revocación lenta | `access_commands` fallidos, ACK | fallback CoA↔REST; corte de emergencia por address-list; alerta |
| R4 | Altas bind fallidas | firma HMAC, reloj del NAS | sincronizar NTP; revisar secreto/ventana ±60 s |
| R5 | Comandos pendientes acumulados | gateway offline | healthcheck del gateway; fail-closed para nuevas (D14) |
| R6 | Purga fallida | logs job, locks | relanzar; revisar FK/espacio |
| R7 | BD caída | Cloud SQL status | failover/restore (R8); fail-closed |
| R8 | Sin backups | backupConfiguration | habilitar backups + PITR (ver §3) |
| R9 | Spoofing de MAC | alertas RF-17 | bloqueo temporal + cooldown (RB-36/37) |
| R10 | Voucher canjeado masivamente | rate-limit | bloquear código/IP, revisar `audit_log` |

## 6. Comprobaciones de cierre (H6)

- [x] `/metrics` accesible solo con API key y exportando contadores.
- [ ] Alertas A1–A11 creadas en Cloud Monitoring.
- [x] **Backups habilitados con 30 días + PITR** (2026-10-19, backup SUCCESSFUL verificado).
- [ ] Restauración probada en clon (RTO/RPO) — **bloqueada por org policy** (ver §3).
- [ ] Purga ejecutada con evidencia y consultas de verificación en cero.
- [x] **Preview Cloud Run + Cloud SQL con smoke y disclaimer** (smoke 7/7; acceso autenticado, §1.1).
- [ ] Runbook revisado y on-call asignado (Director, D38).
