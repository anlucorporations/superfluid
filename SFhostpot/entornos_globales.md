# Entornos Globales — SFhostpot (Superfluid Hotspot v1)

> Reutiliza el entorno global del workspace verificado en el proyecto v1. **Sin secretos en este
> documento**: solo nombres de variables y referencias a Secret Manager / `.env` local no versionado.

## 1. Red blockchain (reutiliza v1, D1)

| Variable | Valor | Verificado en v1 |
|---|---|---|
| `CHAIN_ID` | Dev/test: **81234** (`0x13d52`) Besu Codecrypto | `eth_chainId` ✔ |
| `RPC_URL` | Dev/test: `https://besu.alumnos.codecrypto.academy` | `web3_clientVersion` = besu/v24.12.0 ✔ |
| `NATIVE_CURRENCY` | CC (18 dec) | faucet ✔ |
| `GAS_PRICE` | 1 gwei (`0x3e8`) | `eth_gasPrice` ✔ |
| `FAUCET` | `https://faucet.codecrypto.academy/` (máx 100 CC/solicitud) | ✔ |
| `SUPER_TOKEN_ADDRESS` | `BRLTx` (`BarloventoTx.sol`) desplegado por `DeployAll.s.sol` | registro `sc/deployments/` |
| `UNDERLYING_ADDRESS` | `BRLT` (`BarloventoToken.sol`) desplegado | registro `sc/deployments/` |
| Producción | L2 EVM configurable (Polygon/Base/Arbitrum) por `gateways.chain_id` — **P1 confirmada**: dev en Besu, prod L2 | — |

> `eth_subscribe`/WS **no** disponible en Besu v1 → el indexador usa polling con checkpoint (D8).

## 2. Herramientas globales del servidor

| Herramienta | Ruta / comando | Versión |
|---|---|---|
| forge / cast / anvil | `~/.foundry/bin` | 1.8.3 |
| node / npm | sistema | v22.23.2 / 10.9.8 |
| chromium headless | `source /home/dsh/workspace/herramientas-env.sh` | 153.x |
| psql | no presente en el host; se usa el conector Python | PostgreSQL 15+ (validado 15.18) |
| docker / docker compose | **a verificar en Fase 3** (requerido RNF-14 / RT-11) | — |

```bash
export PATH="$HOME/.foundry/bin:$PATH"
```

## 3. Variables de entorno del proyecto

### 3.1 `orchestrator/.env` (NO versionar)

```bash
# --- Base de datos ---
DATABASE_URL=postgresql://sfhostpot:<PASSWORD>@localhost:5432/sfhostpot

# --- Blockchain ---
RPC_URL=https://besu.alumnos.codecrypto.academy
RPC_URLS_BY_CHAIN={"81234":"https://besu.alumnos.codecrypto.academy"}  # H2-23: data-driven
CHAIN_ID=81234
SUPER_TOKEN_ADDRESS=<BRLTx deploy>
UNDERLYING_ADDRESS=<BRLT deploy>
INDEXER_START_BLOCK=0
INDEXER_CONFIRMATIONS=2          # H-16: finalidad QBFT
INDEXER_REORG_WINDOW=12          # H-16: bloques de reorg tolerados
REVOCATION_SLA_MS=10000          # D43: p95 desde la detección hasta el ACK
SERVICE_CUTOFF_SLA_MS=75000      # D43: p95 desde el inicio de la insolvencia al corte
EXECUTION_MODEL=cloudrun-jobs    # D29/D42: Jobs + Scheduler (sin always-on)
SCHEDULER_CRON_INDEXER=* * * * *   # D42: cada 1 min (cadencia mínima real)
SCHEDULER_CRON_HEALTH=* * * * *    # D42: cada 1 min
TASKS_QUEUE_AUTHORIZE=authorize-validation       # D44/V2-05: tarea durable del 202
TASKS_QUEUE_EXPIRY=provisional-expiry            # D44/V2-05: confirmación a los 60 s
TASKS_OIDC_AUDIENCE=<audiencia Cloud Run>        # OIDC de las llamadas internas
TASKS_MAX_ATTEMPTS=5                             # reintentos con backoff
MEMPOOL_MODE=receipt                             # D56/ENV-02: visible|receipt (un solo oráculo)

# --- API ---
API_PORT=8080
JWT_SECRET=<Secret Manager: sfhostpot-jwt-secret>
SESSION_TTL_SECONDS=900
CORS_ORIGIN=http://localhost:3000

# --- Gateway por defecto (mock en desarrollo; D16) ---
DEFAULT_GATEWAY_VENDOR=mock

# --- MikroTik (Opción A; solo si aplica) ---
MIKROTIK_BASE_URL=https://<router-ip>
MIKROTIK_USERNAME=<usuario-dedicado>
MIKROTIK_SECRET_REF=sfhostpot-mikrotik-password

# --- RADIUS (Opción B; solo si aplica) ---
RADIUS_NAS_IP=<ip-nas>
RADIUS_AUTH_PORT=1812
RADIUS_ACCT_PORT=1813
RADIUS_COA_PORT=3799
RADIUS_SECRET_REF=sfhostpot-radius-secret

# --- Observabilidad ---
LOG_LEVEL=info
METRICS_PORT=9100
```

### 3.2 `portal/.env.local` (NO versionar)

```next
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_RPC_URL=https://besu.alumnos.codecrypto.academy
NEXT_PUBLIC_CHAIN_ID=81234
NEXT_PUBLIC_SUPER_TOKEN_ADDRESS=<BRLTx deploy>
NEXT_PUBLIC_UNDERLYING_ADDRESS=<BRLT deploy>
```

### 3.3 `sc/.env` (reutilizado de v1)

```bash
RPC_URL=https://besu.alumnos.codecrypto.academy
CHAIN_ID=81234
DEPLOYER_PRIVATE_KEY=<pk cuenta #0 Anvil pública del curso — solo red educativa>
```

## 4. Secretos y referencias

| Secreto | Uso | Almacenamiento |
|---|---|---|
| `sfhostpot-jwt-secret` | firma de JWT de sesión portal | Secret Manager / `.env` local |
| `sfhostpot-mikrotik-password` | API RouterOS v7 | Secret Manager (referencia en `gateways.mgmt_secret_ref`) |
| `sfhostpot-radius-secret` | shared secret RADIUS | Secret Manager (referencia en `gateways.radius_secret_ref` / `nas.secret`) |
| `sfhostpot-db-password` | PostgreSQL | Secret Manager |
| pk deployer | despliegue de contratos | `sc/.env` local (v1); cuenta #0 red educativa |

- Cargador global GCP: `source /home/dsh/workspace/gcp-env.sh` (proyecto `mcc-ecommerce`).
- Reglas: nunca versionar `.env*`; nunca loguear secretos ni firmas completas; logs con MAC/IP
  tratados como dato personal (RNF-12).

## 5. Infraestructura local (RT-11)

`docker-compose` previsto (Fase 3) con:

| Servicio | Imagen / rol | Puerto |
|---|---|---|
| `postgres` | PostgreSQL 15+ (imagen `postgres:16` en local) | 5432 |
| `freeradius` | FreeRADIUS 3.x (auth/acct/CoA) | 1812/udp, 1813/udp, 3799/udp |
| `mock-mikrotik` | simulador REST RouterOS (`sfh-sim/`) | 8728/8729 |
| `orchestrator` | Node 22 + TS | 8080, 9100 |
| `portal` | Next.js 15 | 3000 |

## 6. Comandos clave

```bash
# Conectividad chain (reutiliza v1)
curl -s -X POST "$RPC_URL" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'

# Contratos (reutilizados de v1)
cd sfh-sc && forge build && forge test -vvv

# Base de datos
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ../SFhostpot/base_datos.sql

# Stack local completo (Fase 3)
docker compose -f sfh-infra/docker-compose.yml up -d --build

# Orquestador
cd sfh-orchestrator && npm ci && npm run build && npm test

# Portal
cd sfh-portal && npm ci && npm run dev     # http://localhost:3000
```

## 6.1 PostgreSQL global de GCP (analizado y validado)

Análisis de los servicios PostgreSQL globales disponibles en el workspace:

| Servicio | Estado / datos | Uso |
|---|---|---|
| **Cloud SQL `truekeate-main:southamerica-east1:truekeate-db-dev`** | **PostgreSQL 15.18**, `RUNNABLE`, IP pública `34.39.180.101`, base `truekeate` (el aislamiento validado es el **esquema `sfhostpot`**, no una base separada), usuario `app` | **Único PostgreSQL global real**; usado para validar `base_datos.sql`. La base dedicada `sfhostpot` se crea al inicio de Fase 3 (D51) |
| Proyecto `mcc-ecommerce` | **Sin instancias Cloud SQL** (`gcloud sql instances list` vacío) | — |
| `MCC_POSTGRES_URL` (`mcc-postgres-*.run.app`) | Cloud Run responde **503** | No usable |
| `MCC_PGADMIN_URL` | pgAdmin en Cloud Run | Administración web, no ejecución de scripts |
| `hotel-mcp-pg` | Cloud SQL privado vía túnel SSH IAP (puerto 5434) | Otro proyecto; no es la BD global del workspace |

**Cómo conectar en este entorno (verificado):**

1. `gcloud` **snap está roto** (`snap-confine`); usar el **SDK nativo**:
   `export PATH="/home/dsh/google-cloud-sdk/bin:$PATH"`.
2. `source /home/dsh/workspace/gcp-env.sh` exporta `DATABASE_URL` (vía proxy local 127.0.0.1:5433)
   y el token de usuario autentica contra la Admin API.
3. El **Cloud SQL Auth Proxy** falla con 403 si usa ADC sin permiso; la vía que funciona es el
   **Cloud SQL Python Connector** (`google.cloud.sql.connector`) con el token de
   `gcloud auth print-access-token` y driver `pg8000`.

```bash
source /home/dsh/workspace/gcp-env.sh
export PATH="/home/dsh/google-cloud-sdk/bin:$PATH"
PYTHONPATH=/tmp/sfpylibs python3 SFhostpot/tools/validar_sql_gcp.py \
  --instance "truekeate-main:southamerica-east1:truekeate-db-dev" \
  --schema sfhostpot --sql SFhostpot/base_datos.sql \
  --log SFhostpot/pruebas/validacion_base_datos_gcp.log
```

> **Prueba realizada (2026-10-17, Fase 2):** **137 sentencias × 2 pasadas sin errores**, 20 tablas,
> 16 enums, 1 vista, trigger `updated_at` OK y `DROP SCHEMA ... CASCADE` al final (sin residuo);
> `base=truekeate | esquema=sfhostpot` (esquema aislado, no base dedicada; D51). Evidencia en
> [`pruebas/validacion_base_datos_gcp_fase2.log`](pruebas/validacion_base_datos_gcp_fase2.log).
> La instancia es **PostgreSQL 15**; el script es compatible con 14+ (objetivo Cloud SQL 15/16).

## 7. Repositorios

- **D19 confirmada (P13)**: SFhostpot vive en un **repositorio nuevo e independiente**; no se
  reutiliza la historia de `superfluid` v1. Esta carpeta `SFhostpot/` es la semilla de su
  documentación; el código irá en `sfh-*/`.
- v1 queda como referencia (lectura): `gitlab.com/anlucorporations/superfluid` y espejo institucional.
- Política heredada: **push solo con orden explícita `/push`**; URLs/rama definitivas las fija el
  director al crear el repositorio nuevo.

## 8. Despliegue (P9 confirmada: todo en cloud)

| Entorno | Orquestador + BD | Portal | Gateway |
|---|---|---|---|
| Local | docker compose (Postgres + FreeRADIUS + mock) | docker compose | mock / FreeRADIUS local |
| Dev cloud | Cloud Run (`sfh-orchestrator`) + **Cloud SQL PostgreSQL 15+** | Cloud Run (`sfh-portal`) | mock |
| Producción | Cloud Run + Cloud SQL, VPC Connector a la red del operador | Cloud Run | MikroTik / FreeRADIUS real |

Requisitos de red para el control real del gateway desde cloud:

- **RADIUS CoA / Disconnect (UDP 3799)** y auth/acct (UDP 1812/1813) exigen **Serverless VPC
  Connector** hacia la red del NAS **o** VPN/Interconnect, con firewall que permita UDP 3799.
  Sin ese alcance, la revocación RADIUS no es viable y solo funcionaría la Opción A (REST MikroTik).
- **MikroTik REST** requiere HTTPS alcanzable desde Cloud Run (IP pública del router o túnel).
- Secretos (shared secret RADIUS, password MikroTik, JWT, BD) en **Secret Manager**; Cloud SQL con
  IP privada + conexión segura.
- Sin hardware real (P3b), producción no se valida end-to-end hasta disponer de router/NAS; el
  `mock` cubre CI y demos.

### 8.1 Preview desplegado (2026-10-19)

| Elemento | Valor |
|---|---|
| Proyecto / región | `truekeate-main` · `southamerica-east1` |
| API Cloud Run | `sfh-orchestrator` → `https://sfh-orchestrator-m33mjctj4a-rj.a.run.app` |
| Portal Cloud Run | `sfh-portal` → `https://sfh-portal-m33mjctj4a-rj.a.run.app` |
| Imágenes | `europe-west1-docker.pkg.dev/truekeate-main/sfhostpot/{orchestrator,portal,smoke,sim}` |
| Emulador MikroTik | `sfh-sim-routeros` → `https://sfh-sim-routeros-m33mjctj4a-rj.a.run.app` (privado, IAM) |
| Escenarios E2E sim | Cloud Run Job `sfh-sim-scenarios` (`PLATFORM_AUTH=cloudrun`) · 10/10 PASS |
| Demo CU-01 | Cloud Run Job `sfh-demo` (Playwright + wallet real) · 13/13 PASS |
| Carga k6 | Cloud Run Job `sfh-k6-load` (100 VUs, dos flujos) · umbrales superados |
| Evidencias | `gs://truekeate-main-sfh-evidence/{demo,k6}/2026-10-23/` y `SFhostpot/pruebas/` |
| Cloud SQL | `truekeate-main:southamerica-east1:truekeate-db-dev` (socket) · BD `sfhostpot` |
| Secretos | `sfhostpot-jwt-secret`, `-internal-secret`, `-api-key-pepper`, `-gateway-hmac`, `-database-url`, `-preview-api-key`, `-sim-password`, `-sim-admin-token`, `-sim-gateway-secret` |
| Service account API | `sfh-orchestrator@truekeate-main.iam.gserviceaccount.com` (Cloud SQL client + Secret Accessor) |
| Smoke | Cloud Run Job `sfh-smoke` (7/7 PASS) · evidencia [`pruebas/h6_preview_smoke.log`](pruebas/h6_preview_smoke.log) |
| Acceso | **Autenticado** (`roles/run.invoker`): org policy `iam.allowedPolicyMemberDomains` impide `allUsers` |
| Liveness externo | **`GET /health`** (el GFE de Cloud Run intercepta `/healthz` con 404) |

Build/deploy reproducible: `gcloud builds submit sfh-orchestrator` (o `sfh-portal` con
`--config=sfh-portal/cloudbuild.yaml`) y `gcloud run deploy ... --add-cloudsql-instances ...`.
El orquestador apunta su gateway emulado con `GATEWAY_RUNTIME_CONFIGS` y `platformAuth: "cloudrun"`
(ID token en `x-serverless-authorization`). Detalle operativo en [`runbook_operacion.md`](runbook_operacion.md)
§1.1 y §1.3.
