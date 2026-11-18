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
#### brltv2-00041-87c (2026-11-18)

| Dato | Valor |
|---|---|
| Revisión de Cloud Run | `brltv2-00041-87c` |
| Commit | `83f54e4` (reinicio de BD + simulación operativa + fix del tope 80%) · cadena `d3b0776 → 7da4a76 → fb59f40 → 1d5aeb6 → bc9ba01 → 83f54e4` |
| URL | `https://brltv2-szrmcf2hja-ew.a.run.app` |
| Sonda `/api/health` | **Verificada en vivo 2026-11-18 23:13 UTC**: 200 — `{"status":"ok","db":true,"rpc":true,"chainId":31337}` |
| Región / proyecto | `europe-west1` / `plataforma-txbarlovento` (`web/gcp/deploy.sh:11-16`) |
| Runtime | 1 instancia mínima, 2 máx., 512 Mi, VPC connector `brltv2-connector` (`web/gcp/deploy.sh:30-42`) |
| RPC proxy (Anvil) | `https://hotel-anvil-proxy-szrmcf2hja-ew.a.run.app` (chainId 31337; VPC interno `http://10.140.0.4:8546`) |
| MongoDB | `superfluid_anvil` @ `10.140.0.2` · secreto `brltv2-mongo-uri` |

- El entorno desplegado usa `web/gcp/env.yaml` con `NEXT_PUBLIC_CHAIN_ID=31337` (Anvil)
  y RPC proxy; el código mantiene 81234 (Besu) como valor por defecto
  (`web/src/lib/rpc.ts:3-5`, `web/src/lib/env.ts:27`); la red real la fija el entorno.
  **Pendiente de decisión del usuario:** SIWE firma chainId 81234
  (`web/src/lib/siwe.ts:6`) vs red 31337 — funciona porque ambos lados validan 81234;
  documentado como pendiente, sin cambio inmediato.
- Cambios incluidos en las revisiones desde `00033-dmn`: clear signing (statements SIWE
  + componente `FirmaResumen`), batería de pruebas `RepoPrueba/`, informe final
  `RepoTecnico/INFORME_ENTREGA_FINAL.md` y scripts operativos
  (`scripts/inyectar_datos_operativos.py`, `scripts/simular_actividades.py`).
- **Integridad de ramas verificada 2026-11-18:** `gh-integra` = `main` = `superfluidv2`
  = `83f54e4`, sincronizadas en los 3 remotos (`origin` GitLab, `github`, `codecrypto`).

### Estado de datos actual (post-reinicio + simulación del 2026-11-18)
#### Contenido vivo de la plataforma

- 5 empleados activos: Uno/Dos/Tres (cuentas #2..#4, 100 BRLT/30 d) + Cuatro (#5,
  mantenimiento 50/15 d) + Cinco (#6, proyecto_mvp 80/6 d).
- 2 proyectos: `Nomina ANLU` y `Mantenimiento Infraestructura`.
- Flujos canónicos: **#12** (300/30 d activo), **#13** (600/6 d activo), **#15**
  (360/6 d activo), **#14** terminado; 11 flujos históricos terminados (incluida la
  corrección de los fantasma #3..#11) y 2 flujos programados en estado «proximo».
- Cuentas Anvil en uso: #0 super admin (owner/minter), #1 admin de sistema, #2..#4
  empleados, #5/#6 empleados nuevos (antes reservas).
- Detalle y trazabilidad de la ejecución:
  `RepoTecnico/BaseOperaciones/estado_inyeccion.md`; respaldos JSON en
  `RepoTecnico/BaseOperaciones/respaldo_20261118T173426Z/`.

## Verificación operativa

### Saluds y smokes
#### Comandos de comprobación

- `curl https://brltv2-szrmcf2hja-ew.a.run.app/api/health` — comprobar `db`, `rpc` y el
  chainId del entorno antes y después de cada cutover (verificado 2026-11-18: ok/31337).
- `npm run smoke` (H3) · `smoke:h4` · `smoke:h5` · `smoke:h6` — todos contra la red real.
- Batería Web3 (`RepoPrueba/`): runner con aprobación bloqueante; primera pasada
  2026-11-18 (3 PASS · 0 FAIL · 54 BLOCKED · 43 NOT_RUN · 25 N/A), informe en
  `RepoPrueba/05_informe_anomalias.md`.
- Panel `/admin/jobs` — estado de los jobs y ejecución manual.
- Datos operativos: `python3 scripts/simular_actividades.py --dry-run --leer-secreto`
  (simulación sin escritura) — ver `RepoTecnico/BaseOperaciones/estado_inyeccion.md`.

---

*Actualizado 2026-11-18 · análisis completo v2 (revisión `brltv2-00041-87c`, commit
`83f54e4`; health verificada en vivo el 2026-11-18)*
