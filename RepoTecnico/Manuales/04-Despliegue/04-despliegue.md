# 04 · Despliegue

## Entornos

### Práctica (actual)
#### Besu Codecrypto 81234

- RPC `https://besu.alumnos.codecrypto.academy` · gas price 1.000 wei · bloques ~5 s.
- `sc/.env`: `ADMIN_PRIVATE_KEY` (wallet del deploy `0x3477…07EA9`), `BRLT_ADDRESS`,
  `BRLTX_ADDRESS`, `ADMIN_ADDRESS`, `DEPLOY_BLOCK` (cuenta bloque 6.412.104).
- Estado del último verificado: escrow 0, `brltBacking == supply BrltX`.

## Despliegue de contratos

### Script Foundry
#### Comandos

```bash
cd sc
forge build
forge test                      # 44/44
forge coverage                  # Brlt 100% / BrltX 94,42% líneas
forge script script/DeployAll.s.sol --rpc-url $RPC --broadcast --legacy --with-gas-price 1000
forge script script/CheckDeployment.s.sol --rpc-url $RPC
```

El script escribe `sc/deployments/81234.json` (`chainId`, `deployBlock`, addresses).

## Despliegue de la app

### Local
#### Modo desarrollo

- `npm run dev:mem` (Mongo en memoria + `next dev`) — no hace falta `mongod` instalado.
- `npm run seed` — allowlist admin + `system_config` inicial.
- `web/.env.local`: ver `web/.env.example` (MongoDB, SIWE_DOMAIN, `NEXT_PUBLIC_*`,
  `ADMIN_BOOTSTRAP_WALLET`, `DISABLE_JOBS`).

### Cloud Run (H7)
#### Artefacto y pasos

1. `npm run build && npm run verify:standalone` (binario standalone verificado).
2. `./gcp/deploy.sh` (o `gcloud builds submit --config gcp/cloudbuild.yaml`).
3. Variables de runtime desde `web/gcp/env.yaml` (`SIWE_DOMAIN` = dominio exacto).
4. Sonda: `/api/health` (200 ok / 503 degradado).
5. Runbook de cutover y rollback: `web/gcp/README.md`.

## Verificación operativa

### Saluds y smokes
#### Comandos de comprobación

- `npm run smoke` (H3) · `smoke:h4` · `smoke:h5` · `smoke:h6` — todos contra Besu real.
- `npm run e2e:ui` — Panel/Suite headless con Chromium.
- `npm run capturas` — regenera pantallazos de manuales.
- Panel `/admin/jobs` — estado de los jobs y ejecución manual.
