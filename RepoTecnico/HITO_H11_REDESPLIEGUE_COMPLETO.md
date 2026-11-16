# Hito H11 — Redespliegue completo de brltv2 (2026-11-16)

> Estado: ✅ **desplegado y verificado en vivo** · Rama `gh-integra` (commits
> `ec1b87d`/`a060126` y anteriores) · Proyecto `plataforma-txbarlovento` ·
> Región `europe-west1`. Misma URL pública; sin cambios de infraestructura.

## Pre-flight

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | ✅ limpio |
| `npm test` (Vitest) | ✅ 43/43 |

## Despliegue

| Dato | Valor |
|---|---|
| Cloud Build | `1eceb4e0-3f47-43ab-b18c-4cc8d08499c0` (3M59S, SUCCESS) |
| Revisión activa | **`brltv2-00023-7j8`** (100 % tráfico) |
| URL | https://brltv2-szrmcf2hja-ew.a.run.app |
| Secreto | `MONGODB_URI=brltv2-mongo-uri` (v2, Mongo compartido 10.140.0.2) |
| VPC | `brltv2-connector` · egress `all-traffic` |
| Env | `MONGODB_DB=superfluid_anvil` · `SIWE_DOMAIN=brltv2-szrmcf2hja-ew.a.run.app` · `NEXT_PUBLIC_CHAIN_ID=31337` · `DISABLE_JOBS=0` |

## Verificación en vivo (2026-11-16)

| Comprobación | Resultado |
|---|---|
| `GET /api/health` | ✅ `{"status":"ok","db":true,"rpc":true,"chainId":31337}` |
| `/`, `/entrar`, `/admin` | ✅ 200/200/200 |
| `GET /api/system` sin sesión | ✅ 401 `no_autenticado` (guarda activa) |
| On-chain (`cast` vía proxy) | ✅ chainId 31337 · supply 10.000.000 BRLT · owner `0xb4eC…00DF` |
| Mongo compartido | ✅ `admin_allowlist`=1 · `employees`=1 · `flows`=1 · `flows_history`=2 · `audit_events`=6 · `job_runs`=1615 (cron corriendo) · `system_config` 31337/bloque 56395 |

## Novedades incluidas en esta imagen (respecto a H10)

- Backup nocturno de Mongo operativo en la plataforma: bucket `brltv2-mongo-backups`
  (retención 90 d), Cloud Run Job `brltv2-mongo-backup` + Scheduler
  `brltv2-nocturno-dump` (04:00 UTC) y `verify.py` de integridad (restore en seco).
- Script controlado de inyección operativa `scripts/inyectar_datos_operativos.py`
  (validado con `--dry-run`; ejecución pendiente del responsable).

## Pendientes conocidos (sin cambio)

- Rotar la contraseña del usuario Mongo `brltv2` (apareció en logs del job de
  verificación del backup; registrada como incidente de esta sesión).
- Ejecutar la inyección operativa (`python3 scripts/inyectar_datos_operativos.py`).
- Recorrido SIWE con MetaMask desde navegador local (custodia del owner, H9 §7).
