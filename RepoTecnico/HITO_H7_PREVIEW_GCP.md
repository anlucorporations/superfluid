# Hito H7 — Preview en GCP y cutover v1 → v2

> **Estado: ✅ Desplegado y verificado (2026-11-07).** Servicio **brltv2** corriendo en
> Cloud Run sobre el proyecto **opencode-txbarlovento** (txbarlovento), con MongoDB
> gestionado en la misma cuenta y todos los servicios globales de la cuenta.
> Smoke end-to-end desde la URL pública: TODO OK.

## Arquitectura desplegada

| Servicio | Nombre | Detalle |
|---|---|---|
| Cloud Run | `brltv2` (europe-west1) | Next.js standalone (imagen Docker multi-stage en Artifact Registry). |
| Artifact Registry | `superfluidv2` (europe-west1) | Repositorio Docker de la imagen web. |
| Secret Manager | `brltv2-mongo-uri` | URI de conexión Mongo (roto en SecretAccessor para la cuenta de servicio de Compute del proyecto). |
| Compute Engine | `mongo-brltv2` (e2-small, COS, **sin IP externa**) | MongoDB 7.0.14 en contenedor Docker con `restart=always`. |
| VPC connector | `brltv2-connector` (europe-west1) | Conector Serverless VPC para que Cloud Run alcance Mongo por red privada. |
| Cloud Router + Cloud NAT | `nat-router` / `brltv2-nat` | Egress del contenedor de Mongo (para descargar la imagen al arrancar). |
| APIs globalmente habilitadas | Cloud Build, Cloud Run, Artifact Registry, Secret Manager, VPC Access, Cloud NAT | Todas en el proyecto `opencode-txbarlovento`. |

URL de preview: **https://brltv2-crx2qw5whq-ew.a.run.app**

## Estructura de red (seguridad)

- **MongoDB sin IP externa**: solo la VPC interna. Cloud Run atraviesa `brltv2-connector`
  (`--vpc-egress all-traffic`) para llegar al puerto 27017.
- **Firewall de Compute Engine**: `allow-mongo-subnet` y `allow-mongo-conn2` permiten
  tcp/27017 solo desde `10.132.0.0/20` (subnet `eu-west1`) y `10.8.0.0/28` (rango del
  conector). `allow-mongo-iamnet` mantiene tcp/22 con `35.235.240.0/20` (IAP).
- **Firewall local de COS** (`iptables INPUT`, dentro de la VM): aceptar tcp/27017
  explícitamente (en COS la política base es DROP) → persistente aLETrearranque vía
  metadata `startup-script`.
- **Cloud NAT** para que la imagen de Mongo se descargue del registro público
  (`mongo:7.0.14`) durante el despliegue y las revisiones futuras.

## Autenticidad del gobernio (gobernanza de claves)

- **No se firmó ninguna clave privada en los servidores de GCP.** Todas las firmas de
  flujos y utilizaciones en la blockchain provienen del navegador del administrador
  (MetaMask) conectado a la URL de preview (deploy desde Cloud Run vía Cloudbuild).
- La wallet admin (`ADMIN_BOOTSTRAP_WALLET` en env más `ADMIN_PRIVATE_KEY`
  en `sc/.env` local) solo firmó SIWE y las transacciones del smoke visual.

## Verificación end-to-end

`node scripts/smoke-h4-preview.mjs` (URL de preview real):

| Paso | Resultado |
|---|---|
| Login SIWE admin | ✓ 200 (rol `admin`) |
| `/api/health` | ✓ 200 ok, `db:true, rpc:true, chainId:81234` |
| Alta de empleado | ✓ 201 |
| Flujo real en Besu (`approve` + `wrapAndCreateFlow`) | ✓ flujo #28 |
| Registro reconciliado vía API en la Suite | ✓ (verificado contra RPC) |
| Pausa → estado `pausado` | ✓ |
| Reanudación → estado `activo` | ✓ |
| Cambio de receptor (flujo #28 → #29) | ✓ ac-03 |
| Terminación de #29 con escrow 0 | ✓ |
| Tesorería mysql (escrow) | ✓ cuadrada |
| Auditoría completa (alta, pausa, reanudación, cambio receptor, terminación) | ✓ |

Además: **flujos de prueba limpiados al final (escrow final 0)** y mejoras
`_SIWE_DOMAIN`/`MONGODB_URI` derivadas del smoke, con **authSource=admin** en el
URI (parte esencial para autenticar contra la base `admin` de Mongo).

## Incluidos en el commit

- `web/gcp/*`: runbook, Dockerfile, cloudbuild.yaml con la configuración real del
  proyecto (`_IMAGE`, `_SIWE_DOMAIN`, `_SERVICE`, `_REGION`, `_SIWE_DOMAIN`),
  y deploy.sh para repetir el despliegue (idempotente).
- `web/scripts/smoke-h4-preview.mjs`: smoke genérico "contra la URL de preview".
- `web/scripts/seed-allowlist-gcp.cjs` (mismo código en `node scripts/seed-allowlist-gcp.cjs`
  cuando no está la conectividad por VPC connector para efectos de desarrollo).

## Invariantes operativas (post-smoke)

- Egress de Cloud Run por `--vpc-egress all-traffic` + NAT (Global) → Cloud Run
  **solo** navega redes privadas o Internet a través del `nat-router`.
- La revocación de la cuenta de servicio de Cloud Run permite revocar afirmativamente
  los secretos por el `roles/secretmanager.secretAccessor` limitado al secreto
  `brltv2-mongo-uri`, no al proyecto.

## Pendiente de ejecución diaria (no en la prueba)

- Dry-run de 24 h para el mantenimiento (`/admin/jobs`).
- Backup diario de MongoDB (Mongo manual del sistema de Cloud Run, programado via
  gcloud-scheduler o backup manual utc de `/data/db` en Storage — **pendiente**).
