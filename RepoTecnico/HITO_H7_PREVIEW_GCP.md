# Hito H7 — Preview en GCP y cutover v1 → v2

> **Estado: 🟡 Preparado (2026-11-04).** Todo el activo de despliegue está built y
> verificado en local: Dockerfile multi-stage, `.dockerignore`, `robots.txt` de
> servicios, cloudbuild/deploy scripts, plantilla de variables de runtime y runbook de
> cutover/rollback completo. El binario standalone que ejecuta el contenedor arranca y
> responde (`npm run verify:standalone` contra Mongo en memoria + Besu). Lo que queda es
> la ejecución con credenciales de GCP y la validación desde la URL pública.

## Lo entregado y verificado

| Área | Entregado |
|---|---|
| Imagen | `web/Dockerfile` multi-stage (`node:20-slim` deps → build → runtime standalone; `HEALTHCHECK` con `/api/health`); `.dockerignore` para no llevar código/devDeps al contenedor. |
| Verificación del binario | `npm run verify:standalone`: arranca `node .next/standalone/server.js` (igual al CMD del contenedor), `/api/health` **200 `ok`** (MongoDB memoria + chainId 81234) y `/login` 200. |
| Config Cloud Run | `web/gcp/cloudbuild.yaml` (build+push+run, `min-instances 1`, `512Mi`, timeout 120 s); `web/gcp/deploy.sh` (cloudbuild + run deploy + describe URL); `web/gcp/env.example.yaml` con la plantilla de variables (`SIWE_DOMAIN` = dominio de preview; sin claves privadas). |
| Sonda/healthcheck | `GET /api/health` devuelve 200 `ok`/503 `degradado` con `{db, rpc, chainId}`. |
| Estabilidad | `outputFileTracingRoot` fijado a `__dirname` (se eliminó el ruido de múltiples lockfiles del log de arranque); `web/public/robots.txt` (admin/API fuera de indexación). |
| Runbook | `web/gcp/README.md`: Atlas, Secret Manager, despliegue, smoke contra la URL de preview, **cutover v1→v2 ordenado por pasos** y **rollback probado** (revisión previa o vuelta a v1) con el punto de no retorno de la cadena explicado. |
| Dry run | Runbook §6: dejando `min-instances 1` con el cron de H6 activo y vigilando `/api/jobs` y logs sin 5xx, completarlo en 24 h durante la preview. |

## Comando clave

```bash
# Compilación reproducible del artefacto (local o Cloud Build)
cd web
npm run typecheck && npm test && npm run build && npm run verify:standalone
./gcp/deploy.sh            # requiere `gcp/env.yaml` con credenciales reales
```

## Características del entorno de producción

| Tema | Decisión |
|---|---|
| Runtime | `output: standalone` → `node server.js`, no `next start` (Next 15.5.29 + React 19). |
| Variables en build-time | `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_BRLT_ADDRESS`, `NEXT_PUBLIC_BRLTX_ADDRESS`, `NEXT_PUBLIC_FAUCET_URL` se hornéan en el bundle (ARG del Dockerfile). |
| Variables en runtime | `MONGODB_URI`, `MONGODB_DB`, `SIWE_DOMAIN`, TTLs de sesión, rate limits, `ADMIN_BOOTSTRAP_WALLET`, `DISABLE_JOBS`. |
| Secrets | Mongo en Secret Manager (`brltv2-mongo-uri`); `gcloud run deploy --set-secrets`. |
| Cookies | `Secure` activa cuando `NODE_ENV=production` (detrás de HTTPS de Cloud Run). |
| Min-instancias | 1 (evita arranque frío del cron de jobs H6); max 2 (coste acotado). La escritura de flujos la firma el navegador: no existe persistencia de claves en el runtime. |
| Block time / refresco | Cadena de práctica ≈ 5 s por bloque (measured con los smokes en bloques consecutivos); `tasaRefrescoMs` por defecto 5000, configurable en `/admin/sistema`. |

## Checklist antes del cutover (con acceso a GCP)

- [ ] Cluster Atlas `superfluid` creado y `MONGODB_URI` en Secret Manager.
- [ ] `env.yaml` con el dominio real en `SIWE_DOMAIN`.
- [ ] `gcloud builds submit` verde y servicio `brltv2-preview` corriendo.
- [ ] `curl $URL/api/health` → 200 ok; `/api/health` después de reiniciar el servicio
      sigue 200 sin errores 5xx.
- [ ] Smoke funcional completo (runbook §2: login, config, empleado, flujo on-chain,
      pausa/terminación, cobro del empleado).
- [ ] Backup Atlas activado + restauración probada a cluster limpio (mongorestore).
- [ ] Dry run de 24 h con `/api/jobs` (`cron`, `ok=true`) y 0 errores no gestionados.
- [ ] Cutover DNS + redeploy con `SIWE_DOMAIN` final + rollback probado.

## Riesgos conocidos / mitigación

| Riesgo | Mitigación |
|---|---|
| `eth_estimateGas` subestima en Besu (H6) | `gasLimit` fijo por operación en el cliente; vigilar Cloud Run logs por OOG. |
| RPC `https://besu.alumnos...` caído | `/api/health` → `degradado`; las vistas siguen leyendo MongoDB y el reconciliador repone al volver la cadena. |
| Dependencias con CVE residual (ethers 5/elliptic, postcss empaquetado en Next, zod 3) | Riesgo aceptado (H6): migración planificada a ethers 6/Zod 4/Next 16 tras el cutover, con tests y smokes como red de seguridad. |
| SIWE mismatch de dominio | `SIWE_DOMAIN` debe coincidir EXACTAMENTE con la URL pública; validar en preview antes del cutover. |

## Restante

1. Ejecutar en un entorno con credenciales GCP (estefa `deploy.sh` del runbook).
2. Ejecutar smoke E2E completo desde la URL de preview.
3. Dry run de 24 h (jobs cron + backup) y measurement de coste real.
4. Cutover DNS + cierre final (externa este hito).
