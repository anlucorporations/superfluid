# Despliegue en GCP — cuenta y proyecto de txbarlovento (verificado 2026-11-07 02:45 UTC)

## A. Cuenta y proyecto

| Dato | Valores |
|---|---|
| Cuenta activa | `txbarlovento@gmail.com` (configuración `txbarlovento`) |
| Proyecto | `opencode-txbarlovento` (número de proyecto `60268155592`) |
| Billing | **activo** (cuenta `01E9E1-5892F8-EC5643`) |
| Servicios globales habilitados | Cloud Run, Cloud Build, Artifact Registry, Secret Manager, VPC Access, Cloud Scheduler, Cloud Build, Compute Engine, Cloud Storage, Logging |

## B. Cloud Run

| Servicio | Zona | URL | Uso |
|---|---|---|---|
| `brltv2` | europe-west1 | **https://brltv2-crx2qw5whq-ew.a.run.app** | App Superfluid Brlt Streaming v2 (panel admin + Suite del Empleado) |
| `opencode-server` | (preexistente, no la app v2) | https://opencode-server-crx2qw5whq-ew.a.run.app | (Servicio previo de OpenCode Server) |
| `webmcp` | (preexistente, no la app v2) | https://webmcp-crx2qw5whq-ew.a.run.app | (Servicio previo de Web MCP) |

### Desglose de brltv2 (versión en producción)

| Atributo | Valor |
|---|---|
| Revisión activa | `brltv2-00009-s7x` (Ready + Active, MinInstancesProvisioned OK) |
| Imagen | `europe-west1-docker.pkg.dev/opencode-txbarlovento/superfluidv2/web:latest` |
| Recursos | 1 CPU / 512Mi por instancia |
| Min/Max instancias | 1 (mínimo), 2 (máximo) |
| Timeout | 120 s |
| Healthcheck | `GET /api/health` (200 ok · 503 degradado) |
| VPC Connector | `brltv2-connector` (europe-west1) |
| VPC egress | `all-traffic` (vía red privada) |
| Acceso | público (IAM invocador `allUsers`) |

Verificaciones de salud en línea (2026-11-07 02:45 UTC):

```bash
curl https://brltv2-crx2qw5whq-ew.a.run.app/api/health
# {"data":{"status":"ok","db":true,"rpc":true,"chainId":81234}}
```

## C. Cloud Run Job y Scheduler nocturno

| Recurso | Valor |
|---|---|
| **Cloud Run Job** | `brltv2-mongo-backup` |
| Imagen del job | `europe-west1-docker.pkg.dev/opencode-txbarlovento/superfluidv2/mongo-backup:latest` (mongodump + python3 + google-cloud-storage) |
| Job Secret | `brltv2-mongo-uri` |
| Job env | `GCS_BUCKET` (`opencode-txbarlovento-mongo-backups`) |
| **Resultado de ejecución** | `succeededCount: 1` (dump 18.4 KiB comprimido gz) |
| **Objeto de backup** | `gs://opencode-txbarlovento-mongo-backups/brltv2-mongo/2026-11-07T122915Z.archive.gz` (18.4 KiB) |
| **Cloud Scheduler** | `brltv2-nocturno-dump` · cron `0 4 * * *` (diario, las 04:00 UTC) · OAuth detrás de la cuenta de servicio (SA) `60268155592-compute@…` con `roles/run.invoker` |

## D. Almacenamiento (Cloud Storage)

| Bucket | Location | Uso |
|---|---|---|
| `opencode-txbarlovento-mongo-backups` | EUROPE-WEST1 | Backup nocturno de MongoDB · **Life cycle** Delete age=90 d |
| `opencode-txbarlovento_cloudbuild` | U.S. (global) | Artefactos de Cloud Build |

## E. Compute Engine (también su VM de mongo)

| Instancia | Zona | Tipo | IPv4 interna | Estado |
|---|---|---|---|---|
| `mongo-brltv2` | europe-west1-d | e2-small | `10.132.0.3` | Running |
| `opencode-vm` (preexistente del mismo proyecto) | europe-west1-b | — | `10.132.0.2` | Running |
| `test-net` (machina de diagnóstico — borrable) | europe-west1-d | e2-micro | `10.132.0.4` | Running |

## F. VPC / Redes

| Recurso | Configuración |
|---|---|
| Red VPC | `default` (AUTO / regional) |
| Subred usada | `10.132.0.0/20` (europe-west1) |
| **VPC Connector** | `brltv2-connector` · CIDR `10.8.0.0/28` · estado **READY** |
| **Cloud Router** | `nat-router` (europe-west1) |
| **Cloud NAT** | `brltv2-nat` · `ALL_SUBNETWORKS_ALL_IP_RANGES` · tier `PREMIUM` (econfigura internet en el `mongo ~mongo-brltv2`) |

## G. Firewall (proyecto)

| Regla | Red | Prioridad | ALLOW | Dirección target |
|---|---|---|---|---|
| `allow-mongo-conn2` | default | 1000 | tcp:27017 | `mongo-internal` |
| `allow-mongo-connector` | default | 1000 | tcp:27017 | `mongo-internal` |
| `allow-mongo-subnet` | default | 1000 | tcp:27017 | `mongo-internal` |
| `allow-mongo-iamnet` | default | 1000 | tcp:22 | `mongo-internal` |
| `default-allow-internal` | default | 65534 | tcp/udp/icmp full | todas las instancias (usuario previo) |
| `default-allow-ssh` | default | 65534 | tcp:22 *(no las todas instancias, política derivada de IAP)* | — |
| `default-allow-icmp` | default | 65534 | icmp | — |
| `default-allow-rdp` | default | 65534 | tcp:3389 | — |

## H. Artifact Registry

| Repositorio | Formato | Ubicación |
|---|---|---|
| `superfluidv2` | Docker | europe-west1 |
| `opencode` (preexistente) | Docker | (global – proyecto) |

## I. Secret Manager (no mostramos valores)

| Secret | Uso |
|---|---|
| `brltv2-mongo-uri` | URI de conexión de Mongo (Auth* admin · directConnection=true) · binding `SecretAccessor` a la SA del Compute del proyecto en este recurso |
| Otros (preexistente en el mismo proyecto) | `deepseek-api-key`, `gemini-api-key`, `moonshot-api-key`, `opencode-api-key`, `pg-*`, `qwen-api-key` etc. — pertenecen a otros servicios de la misma cuenta y no fueron modificados. |

## K. Limpieza operativa (2026-11-07 02:55 UTC)

| Acción | Resultado |
|---|---|
| VM de diagnóstico `test-net` eliminada | ✅ (quedan `mongo-brltv2` y `opencode-vm`) |
| Revisiones retiradas de `brltv2` eliminadas (`00001..00005`) | ✅ (quedan `00006..00009`; la activa es `00009-s7x`) |
| Health post-limpieza | ✅ 200 ok / db:true / rpc:true / chainId:81234 |

### Instancias GCP activas tras la limpieza
| Instancia | Zona | Estado | Rol |
|---|---|---|---|
| `mongo-brltv2` | europe-west1-d | Running | MongoDB 7.0.14 (producción) |
| `opencode-vm` | europe-west1-b | Running | preexistente de otro proyecto |

### Revisiones Cloud Run activas tras la limpieza
| Revisión | Estado |
|---|---|
| `brltv2-00009-s7x` | 🟢 activa (servicio de tráfico) |
| `brltv2-00008-xm6` · `00007-rn2` · `00006-pb5` | 🟪 retiradas, retenidas para rollback inmediato |

## J. Estado actual del sistema en producción

- `/api/health` en línea: `{"data":{"status":"ok","db":true,"rpc":true,"chainId":81234}}` (2026-11-07 02:45 UTC)
- Última revisión `brltv2-00009-s7x` (aprobada y healthy)
- Backup más reciente: `gs://opencode-txbarlovento-mongo-backups/brltv2-mongo/2026-11-07T122915Z.archive.gz`
- Cron nocturno programado a las 04:00 UTC (Scheduler)
- `escrow` on-chain en 0 (`brltX.totalEscrow()` = 0 · clean-generate)
- Sin llaves privadas en secretos del proyecto (ninguna wallet en el aplicativo)
- Staging磨合 en `superfluidv2/web@latest` y mongo-backup@latest, imágenes Docker de Cloud Runs.
