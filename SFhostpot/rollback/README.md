# Rollback + despliegue del preview SFhostpot

Procedimiento y evidencia del **punto de rollback** creado antes de desplegar la
nueva versión del stack SFhostpot en GCP.

| Elemento | Valor |
|---|---|
| Proyecto / región | `truekeate-main` · `southamerica-east1` |
| Servicios Cloud Run | `sfh-orchestrator`, `sfh-portal`, `sfh-sim-routeros` |
| Jobs Cloud Run | `sfh-smoke`, `sfh-sim-scenarios`, `sfh-demo`, `sfh-k6-load` |
| Artefactos | `europe-west1-docker.pkg.dev/truekeate-main/sfhostpot/*` |
| BD | Cloud SQL `truekeate-main:southamerica-east1:truekeate-db-dev` (BD `sfhostpot`) |
| Snapshot de rollback | `20261024T0207Z` (ver `state.json`) |
| Backup on-demand BD | `1792807815047` — `rollback-point-20261024T0207Z-predeploy-sfh` (SUCCESSFUL) |

## 1. Contenido del snapshot

```
rollback/<TIMESTAMP>/
├── state.json                  # servicio → revisión + digest + tráfico (fuente del script)
├── sfh-orchestrator.service.yaml   # export íntegro del servicio (spec)
├── sfh-portal.service.yaml
├── sfh-sim-routeros.service.yaml
├── job-sfh-smoke.yaml          # export íntegro de cada job
├── job-sfh-sim-scenarios.yaml
├── job-sfh-demo.yaml
└── job-sfh-k6-load.yaml
```

Además, el snapshot **pineó las imágenes vivas** en Artifact Registry:

| Repositorio | Tag de rollback | Digest |
|---|---|---|
| `sfhostpot/orchestrator` | `rollback-20261024T0207Z` | `sha256:53ebd015…a55056c` |
| `sfhostpot/portal` | `rollback-20261024T0207Z` | `sha256:3ccb458e…3a356e9` |
| `sfhostpot/sim` | `rollback-20261024T0207Z` | `sha256:0c1f9a98…c7036e3cb` |

Y un **backup on-demand de Cloud SQL** inmediatamente anterior al despliegue
(`gcloud sql backups create --instance=truekeate-db-dev`) por si hiciera falta
rollback de datos. Las migraciones de esta entrega son aditivas, pero el backup
elimina ese riesgo.

## 2. Ejecutar el rollback

```bash
cd SFhostpot/rollback

./rollback.sh --dry-run                  # ver qué haría
./rollback.sh                            # restore del snapshot más reciente
./rollback.sh 20261024T0207Z             # snapshot concreto
./rollback.sh --service sfh-orchestrator # solo un servicio
./rollback.sh --tag                      # re-despliega la imagen pineada
                                         # rollback-<snapshot> (si la revisión
                                         # antigua ya no existiera)
```

Qué hace: mueve el **100 % del tráfico** a la revisión registrada
(`gcloud run services update-traffic --to-revisions=<rev>=100`), comprueba que
la revisión está Ready y valida `GET /health` (orquestador) y `GET /` (portal)
con un ID token, porque los servicios son privados (org policy
`iam.allowedPolicyMemberDomains` bloquea `allUsers`).

> Las revisiones de Cloud Run son inmutables y se conservan, así que el rollback
> es **instantáneo** (solo tráfico) y no requiere rebuild. `--tag` cubre el caso
> extremo de que la revisión antigua se hubiera borrado.

## 3. Rollback de datos (si fuese necesario)

```bash
# localizar el backup del snapshot
gcloud sql backups list --instance=truekeate-db-dev --project=truekeate-main --limit=5

# restaurar a una instancia NUEVA (nunca sobre la compartida en caliente)
gcloud sql backups restore 1792807815047 --restore-instance=truekeate-db-dev \
  --backup-instance=truekeate-db-dev --project=truekeate-main
```

La instancia `truekeate-db-dev` es compartida: la restauración requiere
autorización del operador y debe hacerse fuera de ventana de demo. Con PITR
activado (retención 7 días) y backups diarios de 30 días, hay margen.

## 4. Despliegue de la nueva versión (posterior al rollback)

```bash
# 1) imágenes desde el código actual (HEAD)
gcloud builds submit sfh-orchestrator --project=truekeate-main \
  --config=sfh-infra/cloudbuild-orchestrator.yaml --substitutions=_TAG=<TAG>
gcloud builds submit sfh-sim --project=truekeate-main \
  --config=sfh-sim/cloudbuild.yaml --substitutions=_TAG=<TAG>

# 2) nueva revisión preservando env/secrets/Cloud SQL del servicio
gcloud run services update sfh-orchestrator --project=truekeate-main \
  --region=southamerica-east1 \
  --image=europe-west1-docker.pkg.dev/truekeate-main/sfhostpot/orchestrator:<TAG>
gcloud run services update sfh-sim-routeros --project=truekeate-main \
  --region=southamerica-east1 \
  --image=europe-west1-docker.pkg.dev/truekeate-main/sfhostpot/sim:<TAG>

# 3) verificación
gcloud run jobs execute sfh-smoke --project=truekeate-main --region=southamerica-east1 --wait
gcloud run jobs execute sfh-sim-scenarios --project=truekeate-main --region=southamerica-east1 --wait
```

`gcloud run services update --image` reutiliza el resto de la configuración de la
revisión vigente (variables, secretos, `--add-cloudsql-instances`, service
account, ingress), por lo que no hay que reconstruir el servicio a mano.

## 5. Resultado del despliegue y evidencia (2026-10-24)

**Rollback creado y probado antes del deploy:**

| Paso | Resultado |
|---|---|
| Snapshot `20261024T0207Z` | `state.json` + exports de 3 servicios y 4 jobs |
| Tags de rollback en Artifact Registry | `rollback-20261024T0207Z` en `orchestrator`, `portal` y `sim` (verificados) |
| Backup on-demand Cloud SQL | `1792807815047` — SUCCESSFUL (2026-10-24T02:10:15Z) |
| Prueba real de rollback | `./rollback.sh --service sfh-orchestrator` movió el 100 % del tráfico a `sfh-orchestrator-00010-ql2`; `GET /health` → 200 y portal → 200; después se devolvió el tráfico a la revisión nueva |

**Despliegue de la nueva versión (Fase D — adaptador CHR):**

| Componente | Imagen nueva | Revisión | Tráfico |
|---|---|---|---|
| `sfh-orchestrator` | `orchestrator:preview-20261024-v1` (`sha256:2485e943…`) | `sfh-orchestrator-00011-ktj` | 100 % |
| `sfh-sim-routeros` | `sim:preview-20261024-v1` (`sha256:52c5d1fd…`) | `sfh-sim-routeros-00004-jps` | 100 % |
| `sfh-portal` | sin cambios (`portal:preview-20261023-demo2`) | `sfh-portal-00003-dcq` | 100 % |

**Verificación posterior:**

| Comprobación | Resultado |
|---|---|
| `GET /health` orquestador (con ID token) | **HTTP 200** `{"ok":true,"service":"sfh-orchestrator"}` |
| `GET /` portal (con ID token) | **HTTP 200** |
| Job `sfh-smoke` (E2E API↔Cloud SQL↔portal) | **7/7 PASS** (ejecución `sfh-smoke-xk288`) |
| Job `sfh-sim-scenarios` (plataforma → adaptador → emulador → Cloud SQL) | **10/10 PASS** (ejecución `sfh-sim-scenarios-6wx5t`) |
| Tests locales orquestador (antes del build) | **57/57 PASS** + `tsc --noEmit` limpio |

**Hallazgo colateral corregido durante la verificación:** el par de checks de `bind` del smoke
fallaba con 403 por un bug preexistente del propio smoke (tomaba el *primer* par `gid=secret` de
`sfhostpot-gateway-hmac`; desde la versión 4 del secreto hay dos gateways). Se corrigió
`sfh-infra/smoke/preview_smoke.mjs` (parseo por `GATEWAY_ID`, por defecto
`11111111-1111-4111-8111-111111111111`), se reconstruyó la imagen `smoke:preview-20261024-v1` y se
actualizó el job. No era una regresión del despliegue: la revisión antigua (`00010`) daba el mismo
4/7 antes del fix.

**Corrección de pipeline:** `sfh-infra/cloudbuild-orchestrator.yaml` tenía el `push` en *flow
sequence* con `${_REPO}`/`${_TAG}` sin comillas, lo que rompía el parseo YAML de Cloud Build
(`expected ',' or ']', but got '{'`). Se citó el argumento; el build remoto funciona.
