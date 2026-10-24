# sfh-demo — Demo CU-01 scripted (Playwright + wallet real)

Cloud Run Job que recorre el portal real de SFhostpot con una wallet real en Besu y el gateway
MikroTik emulado (`sfh-sim`), generando **capturas + vídeo + log JSON** como evidencia.

## Flujo que ejecuta

NAS simulado (bind HMAC) → aviso de privacidad → wallet → firma SIWE → wrap BRLT→BRLTx →
`createFlow` on-chain → `authorize` 202 → worker de validación → adaptador → emulador →
pausa/revocación → verificación en emulador y Cloud SQL.

## Ejecutar

```bash
gcloud builds submit sfh-demo --project=truekeate-main \
  --config=sfh-demo/cloudbuild.yaml --substitutions=_TAG=<tag>
gcloud run jobs execute sfh-demo --project=truekeate-main \
  --region=southamerica-east1 --wait
```

Secretos requeridos (Secret Manager): `sfhostpot-demo-wallet-key`, `sfhostpot-sim-gateway-secret`,
`sfhostpot-sim-admin-token`, `sfhostpot-internal-secret`, `sfhostpot-database-url`.
Variables: `PORTAL_URL`, `API_URL`, `SFH_SIM_URL`, `RPC_URL`, direcciones de contratos, `PAYOUT_WALLET`,
`SFH_GATEWAY_ID`, `PLATFORM_AUTH=cloudrun`, `GCS_BUCKET`, `GCS_PREFIX`.

Salida esperada: **13/13 PASS**. Evidencia de referencia:
[`SFhostpot/pruebas/h7_demo_y_k6.md`](../SFhostpot/pruebas/h7_demo_y_k6.md).

## Re-ejecución

El script cierra el flujo previo account→payout si existe, siembra la tarifa idempotente y resetea el
emulador; usa MAC/IP aleatorios por ejecución para evitar conflictos de binding.
