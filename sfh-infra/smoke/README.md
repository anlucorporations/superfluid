# Smoke E2E del preview — SFhostpot (H6)

Verifica el preview real **Cloud Run API ↔ Cloud SQL** y el portal, sin mocks:

| # | Comprobación |
|---|---|
| 1 | `GET /health` (liveness; `/healthz` lo intercepta el GFE con 404) |
| 2 | `GET /readyz` con API key → round-trip real a Cloud SQL |
| 3 | `POST /v1/internal/hotspot/bind` firmado con HMAC → `bind_token` |
| 4 | `POST /v1/internal/hotspot/bind` con firma inválida → 403 |
| 5 | `POST /v1/portal/sessions` con `bind_token` → fila en `portal_sessions` |
| 6 | `GET /v1/session/:id` con id de portal → 404 `session_not_found` (aislamiento) |
| 7 | `GET <portal>/` → HTML con disclaimer |

El script se ejecuta como **Cloud Run Job** (`sfh-smoke`) porque el preview es privado
(`roles/run.invoker`) y el token de identidad se obtiene del metadata server. La autenticación de
plataforma va en `x-serverless-authorization` para no chocar con el `Authorization` de la app
(`bind_token`).

## Ejecutar

```bash
# 1) Imagen del smoke
gcloud builds submit sfh-infra/smoke --project=truekeate-main \
  --tag=europe-west1-docker.pkg.dev/truekeate-main/sfhostpot/smoke:latest

# 2) Job (una vez) con URL de API/portal y secretos
gcloud run jobs create sfh-smoke --project=truekeate-main --region=southamerica-east1 \
  --image=europe-west1-docker.pkg.dev/truekeate-main/sfhostpot/smoke:latest \
  --service-account=593453426217-compute@developer.gserviceaccount.com \
  --set-env-vars=API_URL=<api-url>,PORTAL_URL=<portal-url> \
  --set-secrets=API_KEY=sfhostpot-preview-api-key:latest,HMAC_RAW=sfhostpot-gateway-hmac:latest \
  --max-retries=0 --task-timeout=300s

# 3) Ejecutar y leer logs
gcloud run jobs execute sfh-smoke --project=truekeate-main --region=southamerica-east1 --wait
```

Requisitos IAM (ya aplicados): el build SA y el job SA necesitan `roles/run.invoker` sobre ambos
servicios, `roles/secretmanager.secretAccessor` y (el job) `roles/cloudsql.client` si se consulta la BD.

Salida esperada: `passed: 7, failed: 0` (exit 0).
