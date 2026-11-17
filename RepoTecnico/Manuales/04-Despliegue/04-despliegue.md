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
2. `./gcp/deploy.sh` (o `gcloud builds submit --config gcp/cloudbuild.yaml`): build con
   Cloud Build → habilitación idempotente de servicios → `gcloud run deploy` con vars de
   `web/gcp/env.yaml` y secreto `brltv2-mongo-uri` → imprime la URL del servicio
   (`web/gcp/deploy.sh:18-48`).
3. Variables de runtime desde `web/gcp/env.yaml` (`SIWE_DOMAIN` = dominio exacto).
4. Sonda: `/api/health` (200 ok / 503 degradado).
5. Runbook de cutover y rollback: `web/gcp/README.md`.

### Revisión vigente
#### brltv2-00033-dmn (2026-11-17)

| Dato | Valor |
|---|---|
| Revisión de Cloud Run | `brltv2-00033-dmn` |
| Cloud Build | `66b59218` · commit `aab670e` |
| URL | `https://brltv2-szrmcf2hja-ew.a.run.app` |
| Sonda `/api/health` | 200 ok — `db` ok, `rpc` ok, chainId informado por el RPC **31337** |
| Región / proyecto | `europe-west1` / `plataforma-txbarlovento` (`web/gcp/deploy.sh:11-16`) |
| Runtime | 1 instancia mínima, 2 máx., 512 Mi, VPC connector `brltv2-connector` (`web/gcp/deploy.sh:30-42`) |

- El entorno desplegado usa `web/gcp/env.yaml` con `NEXT_PUBLIC_CHAIN_ID=31337` (Anvil)
  y RPC proxy `https://hotel-anvil-proxy-szrmcf2hja-ew.a.run.app`, base MongoDB
  `superfluid_anvil`. El código mantiene 81234 (Besu) como valor por defecto
  (`web/src/lib/rpc.ts:3-5`, `web/src/lib/env.ts:27`); la red real la fija el entorno.
- Cambios incluidos en esta revisión: Portal del Empleado `/suite` rediseñado (tokens
  `empleado.*`), entrada única `/entrar` con validación de wallet y validación continua
  en `/suite`, y **downgrade de flujos con tope acumulado del 80%**
  (`web/src/lib/downgrade-limit.ts`).

## Verificación operativa

### Saluds y smokes
#### Comandos de comprobación

- `npm run smoke` (H3) · `smoke:h4` · `smoke:h5` · `smoke:h6` — todos contra la red real.
- `npm run e2e:ui` — Panel/Suite headless con Chromium.
- `npm run capturas` — regenera pantallazos de manuales.
- Panel `/admin/jobs` — estado de los jobs y ejecución manual.
- `GET /api/health` del servicio desplegado — comprobar `db`, `rpc` y el chainId del
  entorno antes y después de cada cutover.

---

*Actualizado 2026-11-17 · commit aab670e*
