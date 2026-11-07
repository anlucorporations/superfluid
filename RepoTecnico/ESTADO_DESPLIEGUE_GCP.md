# Estado post-despliegue GCP (txbarlovento) — 2026-11-07

## Resumen

| Ítem | Resultado |
|---|---|
| URL de producción | **https://brltv2-crx2qw5whq-ew.a.run.app** (`/api/health` → 200 ok, db:true, rpc:true, chainId:81234) |
| Cloud Run service | `brltv2` (europe-west1, min 1 inst, 512Mi, connector `brltv2-connector`, vpc-egress `all-traffic`) |
| Secret | `brltv2-mongo-uri` (v2 con `authSource=admin` + directConnection) |
| Mongo GCE | `mongo-brltv2` (e2-small, COS, sin IP externa), contenedor Mongo **con volumen /var/lib/mongo** |
| Firestore de reglas de red | `allow-mongo-subnet` + `allow-mongo-conn2` (27017 desde 10.132/20 y 10.8/28) + `allow-mongo-iamnet` (22 vía IAP) |
| **Bootstrap de allowlist** | `ADMIN_BOOTSTRAP_WALLET` se auto-materializa en la colección `admin_allowlist` al arrancar (feature añadida a `web/src/lib/db.ts`) |
| **Backup nocturno** | Job `brltv2-mongo-backup` (Cloud Run Job, imágen mínima mongo-tools + python3 + google-cloud-storage en el bucket **opencode-txbarlovento-mongo-backups**) |
| **Scheduler nocturno** | `brltv2-nocturno-dump` (cron 04:00 UTC vía cloud scheduler, run.jobs.run con oauth SA compute) |
| **Retención de backups** | Policy de ciclo de vida: **90 días** (regla Delete) |

## Commits

| Remoto | Branch | Último |
|---|---|---|
| GitHub | `superfluidv2` | ✅ `83c02b4` |
| GitLab.com | `superfluidv2` | ✅ `83c02b4` |
| GitLab CodeCrypto | `superfluidv2` | ✅ `5c87b15` |

## Próximos pasos

- Dry-run de 24 h revisando `/admin/jobs`, `/api/health` y Logs de Cloud Run sin errores no gestionados.
- Backup nocturno automático de Mongo (ya creado y con política de retención 90d).
