# sfh-sim — Entorno de pruebas MikroTik emulado

Implementación de la propuesta [`SFhostpot/propuesta_entorno_pruebas_mikrotik.md`](../SFhostpot/propuesta_entorno_pruebas_mikrotik.md):
emula el gateway **RouterOS v7 REST** y el **NAS/hotspot**, de forma que la plataforma ejerza su
operatividad real sin hardware.

## Componentes

| Ruta | Qué hace |
|---|---|
| `server.mjs` | Arranque del emulador RouterOS (servicio Cloud Run / contenedor) |
| `src/routeros-emulator.mjs` | Contrato REST que consume `MikrotikRestAdapter` + inyección de fallos + estado |
| `nas-sim.mjs` / `src/nas-sim.mjs` | NAS/hotspot simulado: bind HMAC (D45) → redirección al portal con `bind_token` |
| `scenario-runner/run.mjs` | Escenarios E2E contra la plataforma real (API → adaptador → emulador → BD) |
| `test/` | 17 tests `node:test` (emulador + NAS) |
| `prototipo/` | Spike original de la propuesta (validador del adaptador real, 12/12) |
| `Dockerfile` / `cloudbuild.yaml` | Imagen única (`sim`) para Cloud Run service o Job |

## Endpoints del emulador

RouterOS REST (Basic auth): `POST /rest/ip/hotspot/active/login`,
`GET /rest/ip/hotspot/active?mac-address=…`, `DELETE /rest/ip/hotspot/active/{id}`,
`PUT /rest/ip/firewall/address-list` (crear; `POST` devuelve 400 como RouterOS real),
`GET /rest/ip/firewall/address-list`, `GET /rest/system/resource`.
Administración de pruebas: `POST /__admin/mode` (`ok|login-fail|error|timeout|slow`),
`GET /__admin/state`, `POST /__admin/reset` (cabecera `x-admin-token`).
Health propio: `GET /health`.

## NAS simulado

```bash
API_URL=http://127.0.0.1:8080 PORTAL_URL=http://localhost:3000 \
SFH_GATEWAY_ID=<uuid> SFH_GATEWAY_SECRET=<secreto> node nas-sim.mjs
# POST /associate {mac,ip}  ·  GET /login?mac=&ip=  (302 al portal)  ·  GET /health
```

## Escenarios E2E (`scenario-runner`)

Comprueba contra la **plataforma real** (no mocks): bind HMAC + portal session, siembra de sesión,
`POST /v1/session/pause` → adaptador → emulador → actualización de estado en Cloud SQL, y
fail-closed con gateway 5xx / timeout.

Salida esperada: **10/10 PASS** (exit 0). Evidencia:
[`SFhostpot/pruebas/h7_entorno_mikrotik_emulado.log`](../SFhostpot/pruebas/h7_entorno_mikrotik_emulado.log).

## Local (docker compose)

```bash
docker compose -f sfh-infra/docker-compose.yml -f sfh-infra/docker-compose.sim.yml \
  --profile sim up -d --build
docker compose -f sfh-infra/docker-compose.yml -f sfh-infra/docker-compose.sim.yml \
  --profile sim run --rm scenario-runner
```

El overlay configura el orquestador con `GATEWAY_RUNTIME_CONFIGS` apuntando al emulador
(gateway fijo `11111111-1111-4111-8111-111111111111`).

## Cloud (preview `truekeate-main`)

| Recurso | Valor |
|---|---|
| Servicio | `sfh-sim-routeros` → `https://sfh-sim-routeros-m33mjctj4a-rj.a.run.app` (privado, IAM) |
| Job | `sfh-sim-scenarios` (scenario-runner; `PLATFORM_AUTH=cloudrun`) |
| Imagen | `europe-west1-docker.pkg.dev/truekeate-main/sfhostpot/sim:<tag>` |
| Auth plataforma | ID token del metadata server en `x-serverless-authorization` (el `Authorization: Basic` queda para RouterOS) |

```bash
gcloud builds submit sfh-sim --project=truekeate-main \
  --config=sfh-sim/cloudbuild.yaml --substitutions=_TAG=<tag>
gcloud run jobs execute sfh-sim-scenarios --project=truekeate-main \
  --region=southamerica-east1 --wait
```

## Tests locales

```bash
(cd sfh-orchestrator && npm run build)
npm test                 # 17 tests (node:test)
npm run spike            # 12/12 contra el adaptador real
```

## Límites

No emula el firmware RouterOS ni radios WiFi: es un **emulador de contrato**. La validación de
fidelidad contra RouterOS real queda para la fase D (CHR/router, ventana P-07).
