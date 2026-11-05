# H7 — Runbook: preview en Cloud Run y cutover v1 → v2

Objetivo: publicar v2 (`web/`) en Cloud Run del proyecto **1095249147821** (europe-west1)
y permitir el traspaso controlado desde la plataforma v1 con plan de rollback probado.

## 0) Preparación (una vez)

1. **MongoDB gestionado** — Atlas M0/M10 (cifrado en reposo activo por defecto):
   - Cluster `superfluid-prod` en `europe-west1`, usuario readWrite de la base `superfluid`.
   - Guardar la `MONGODB_URI` en **Secret Manager**: \
     `gcloud secrets create brltv2-mongo-uri --data-file=-` (pega el URI por stdin).
   - Anotar la URI `NEXT_PUBLIC_*` reales de `sc/deployments/81234.json`
     (BRLT `0x750508AD02404a30dF030466FBb3a29D9EE0482F`, BrltX `0xCE5E017599073f60b3518Cf2f86fFdd49bc6e52F`).
2. **Semilla de bootstrap**: la sesión de `ADMIN_BOOTSTRAP_WALLET`
   (`0x347789cf559a68262e4A444bc251AF8d0bE07EA9`) entra por allowlist en el arranque del
   panel tras el primer login SIWE (o ejecuta `npm run seed` contra Atlas una vez).
3. **Variables runtime** — crear `web/gcp/env.yaml` a partir de
   `web/gcp/env.example.yaml`, con el **dominio exacto** de la URL de preview en
   `SIWE_DOMAIN` (el mensaje SIWE falla si no coincide).
4. **No subir claves privadas**: la firma de flujos ocurre en el navegador; el runtime solo
   necesita lecturas (`eth_call`) y Mongo.

## 1) Despliegue

```bash
cd web
npm run typecheck && npm test && npm run build && npm run verify:standalone
./gcp/deploy.sh          # o: gcloud builds submit . --config gcp/cloudbuild.yaml
```

- `cloudbuild.yaml` reconstruye el Dockerfile multi-stage (deps → build → runtime
  standalone) y lo despliega en Cloud Run (`min-instances 1`, `512Mi`).
- La sonda de Cloud Run es `GET /api/health` (Mongo + chainId 81234):
  200 `ok`/503 `degradado`.

## 2) Smoke E2E contra la URL de preview

```bash
URL=$(gcloud run services describe brltv2-preview --region europe-west1 --format="value(status.url)")

curl -s $URL/api/health | jq .data            # { status:"ok", db:true, rpc:true, chainId:81234 }
curl -s $URL/login | head -c 80               # HTML del panel
SIWE_DOMAIN=localhost   # ⚠ el dominio de SIWE ahora es el de la URL pública: usar el panel
```

Validación funcional (bitácora del admin, mismo flujo de los smokes):

- [ ] Login SIWE admin con la wallet de despliegue (rol `admin`).
- [ ] `PATCH /api/system` con BRLT/BrltX/bloque reales (valida `eth_getCode`).
- [ ] Alta de proyecto y empleado (CSRF activo).
- [ ] Crear flujo con MetaMask (firma en el navegador) y verlo reconciliado.
- [ ] Pausa → reanudación → terminación con escrow 0.
- [ ] Login SIWE empleado y `downgrade` del cobro verificable en su BRLT.

## 3) Cutover v1 → v2

| Orden | Acción | Comando |
|---|---|---|
| 1 | Ventana anunciada (nada bajo escritura) — — |
| 2 | Congelar la plataforma v1 (read-only) — — |
| 3 | Deploy v2 en preview y smoke del paso 2 ✅ — — |
| 4 | Reapuntar el dominio: Google Domains/DNS → Cloud Run | `gcloud beta run domain-mappings create ...` |
| 5 | Actualizar `SIWE_DOMAIN` al dominio real y redeploy | `./gcp/deploy.sh` |
| 6 | Activar smoke completo del paso 2 ✅ en dominio público — — |
| 7 | Cerrar v1 (fuera de traffic) | `gcloud run services delete v1 ...` |

## 4) Rollback (probado)

```bash
# 1) Servir la revisión anterior de v2 (si el problema es de app):
gcloud run services update-traffic brltv2-preview \
  --region europe-west1 --to-revisions <revision_vieja>=100

# 2) Volver a la plataforma v1 (si el problema es del sistema completo):
gcloud run domain-mappings delete <mapping> --region europe-west1
#   reactivar el servicio v1 y restaurar su mapping de dominio; Mongo v1 intacto
#   porque v2 usa su propia base/cluster (no comparte datos).
```

- El rollback **no toca la cadena**: los flujos ya creados quedan on-chain y el estado de
  v2 se reconstruye con el job `reconcile_flows` + `flows_history` tras volver.
- Probar el rollback en preview antes del cutover (10 min) y registrar duración.

## 5) Backup diario (H6/H7)

- Atlas M10+: activar **continuous backup / snapshots diarios** con retención ≥ 5 años
  anónima (AC-10). Probar una restauración a un cluster limpio con `mongorestore`
  antes del cutover (escrito en el checklist del hito).
- Alternativa manual: `mongodump --uri "$URI" -o dump/` cronitado fuera de Cloud Run.

## 6) Dry run 24 h

- Dejar `min-instances 1` con el cron de jobs activado (`DISABLE_JOBS=0`).
- Revisar cada 15/30 min: `/api/jobs` (job_runs con `ok=true`), Cloud Run logs sin
  errores 5xx, coste y latencia del `eth_call` (block time ~5 s).
- Salida esperada: 24 h sin errores no gestionados y deriva 0 (`reconcile_flows`).
