# sfh-k6 — Carga 100 VUs (NAS→portal + comandos de gateway)

Cloud Run Job que siembra 120 sesiones activas (y sus sesiones en el emulador MikroTik) y ejecuta dos
escenarios k6 contra el preview:

| Escenario | Qué mide |
|---|---|
| `k6/nas_portal.js` | bind HMAC (`POST /v1/internal/hotspot/bind`) + `POST /v1/portal/sessions` |
| `k6/gateway_pause.js` | `POST /v1/session/pause` → adaptador MikroTik → emulador → BD (`gateway_ack_ms`) |

Umbrales: 0 % fallos, checks 100 %, p95 global < 1.000 ms, p95 ACK gateway < 500 ms.

## Ejecutar

```bash
gcloud builds submit sfh-k6 --project=truekeate-main \
  --config=sfh-k6/cloudbuild.yaml --substitutions=_TAG=<tag>
gcloud run jobs execute sfh-k6-load --project=truekeate-main \
  --region=southamerica-east1 --wait
```

Variables: `API_URL`, `SFH_SIM_URL`, `SFH_GATEWAY_ID`, `PLATFORM_AUTH=cloudrun`, `K6_VUS=100`,
`K6_DURATION=20s`, `K6_SEED_COUNT=120`, `GCS_BUCKET`, `GCS_PREFIX`.
Secretos: `DATABASE_URL`, `SFH_GATEWAY_SECRET`, `SFH_SIM_PASSWORD`, `SFH_SIM_ADMIN_TOKEN`.

Resultado de referencia (**ambos escenarios superados**, exit 0):
[`SFhostpot/pruebas/h7_demo_y_k6.md`](../SFhostpot/pruebas/h7_demo_y_k6.md) y resúmenes en
[`SFhostpot/pruebas/k6/`](../SFhostpot/pruebas/k6/).
