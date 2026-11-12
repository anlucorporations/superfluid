# Hito H8 — Despliegue en `plataforma-txbarlovento` (cuenta sa-dsh-dev)

> Estado: ✅ Desplegado y verificado. Fecha: 2026-11-11.
> Alcance: adaptación del despliegue de Superfluid Brlt v2 al proyecto `plataforma-txbarlovento`
> (cuenta de servicio `sa-dsh-dev`). Prefijo `brltv2-` para todos los recursos nuevos.
> No se modificaron los recursos `hotel-*`, `vm-*` ni los secretos de terceros.
> Backup nocturno de Mongo: **diferido** (decisión del usuario).

## Entorno

| Dato | Valor |
|---|---|
| Proyecto | `plataforma-txbarlovento` (número 173076294289) |
| Región | `europe-west1` |
| Red / subred | `plataforma-vpc` / `subnet-euw1` (10.140.0.0/20) |
| Servicio Cloud Run | `brltv2` · revisión `brltv2-00003-dxf` (100 % tráfico) |
| URL pública | https://brltv2-szrmcf2hja-ew.a.run.app |
| Health | `GET /api/health` → `{"status":"ok","db":true,"rpc":true,"chainId":81234}` (200) |

## Recursos creados (todos con prefijo `brltv2-`)

| Recurso | Nombre | Detalle |
|---|---|---|
| Artifact Registry | `superfluidv2` | Docker, europe-west1 |
| VPC connector | `brltv2-connector` | CIDR `10.8.0.0/28`, e2-micro, 2–3 instancias |
| Reserva IP interna | `brltv2-mongo-ip` | `10.140.0.10` (estática) |
| VM | `mongo-brltv2` | e2-small, COS, **sin IP externa**, MongoDB 7.0.14 en contenedor |
| Firewall | `allow-brltv2-mongo` | tcp:27017 desde `10.8.0.0/28` (connector) y `10.140.0.0/20` (subred) · target tag `brltv2-mongo` |
| Secret Manager | `brltv2-mongo-uri` | URI de conexión (valor no documentado aquí) |
| Secret Manager | `brltv2-mongo-pass` | contraseña root de Mongo (valor no documentado aquí) |

Permisos: la cuenta de servicio de Compute (`173076294289-compute@developer.gserviceaccount.com`)
recibió `roles/secretmanager.secretAccessor` sobre ambos secretos.

## Incidencias y corrección

1. **Permission denied al secreto** en el primer deploy → se concedió `secretAccessor` a la SA de
   Compute y se redesplegó.
2. **`allUsers` no aplicado** en el primer intento (error de IAM) → se reaplicó en el redespliegue.
3. **`SIWE_DOMAIN` provisional** (número de proyecto) → corregido al host real del servicio
   (`brltv2-szrmcf2hja-ew.a.run.app`), porque SIWE valida el dominio exacto.

## Archivos del repo modificados

- `web/gcp/deploy.sh`: proyecto `plataforma-txbarlovento`, servicio `brltv2`, conector y secreto parametrizados.
- `web/gcp/cloudbuild.yaml`: sustitución `_CONNECTOR` y cabecera con el nuevo proyecto.
- `web/gcp/env.yaml` (**local, gitignored**): variables runtime sin secretos.
- `.gitignore`: añadido `web/gcp/env.yaml`.

## Pendientes

- Backup nocturno de Mongo (bucket GCS + Cloud Run Job + Scheduler), diferido.
- Smoke E2E completo contra la URL (login SIWE admin, alta de empleado, flujo en Besu): pendiente de ejecutar.
- La VM `mongo-brltv2` no tiene snapshot ni backup automático todavía.
