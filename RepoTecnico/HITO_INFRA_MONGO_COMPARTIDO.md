# Migración de MongoDB de brltv2 al Mongo compartido de `vm-databases`

> Fecha: 2026-11-12 · Estado: ✅ migrado y verificado en vivo (`brltv2-00019-r5d`).
> Decisión del responsable: **migrar** al Mongo compartido de `vm-databases` en lugar de
> recrear la VM dedicada.

## Motivo

A las **19:41 UTC** se eliminó la VM `mongo-brltv2` (10.140.0.10, IP reservada
`brltv2-mongo-ip`) desde una sesión externa de `gcloud` (`agent-name/open_code`, Windows),
y su disco se borró con ella. La VM no tenía snapshot ni backup automático (ya advertido en
`HITO_H8`); los objetos de `gs://plataforma-txbarlovento-backups/db/` son de 30 bytes
(vacíos). Consecuencia: `GET /api/health` → 500 y todas las APIs con Mongo caídas
(panel admin y suite). La portada `/` siguió sirviendo por ser estática.

## Infraestructura resultante

| Componente | Antes | Después |
|---|---|---|
| MongoDB | VM `mongo-brltv2` (10.140.0.10), dedicada | Contenedor `mongo` de `vm-databases` (10.140.0.2), compartido |
| Puerto VPC | regla `allow-brltv2-mongo` → tag `brltv2-mongo` | mismo tag añadido a `vm-databases`; bind 10.140.0.2:27017 |
| Base de datos | `superfluid_anvil` | `superfluid_anvil` (nueva, en Mongo compartido) |
| URI | secreto `brltv2-mongo-uri` v1 → 10.140.0.10 | secreto v2 → `10.140.0.2:27017/superfluid_anvil` |
| App | Cloud Run `brltv2-00016` | Cloud Run `brltv2-00019-r5d` |

## Cambios ejecutados

1. **`vm-databases` · `/srv/compose/docker-compose.yml`**: se añadió el binding
   `- "10.140.0.2:27017:27017"` al servicio `mongo` (se conserva
   `100.89.28.1:27017` de Tailscale). Copia de seguridad: `docker-compose.yml.bak-20261112`.
2. **`docker compose up -d mongo`**: recreación del contenedor (downtime de segundos).
   Verificado: escucha en `10.140.0.2:27017` y `100.89.28.1:27017`.
3. **Tag de red**: `brltv2-mongo` en `vm-databases`, de modo que la regla
   `allow-brltv2-mongo` (origen `10.8.0.0/28` [conector VPC] y `10.140.0.0/20`, tcp:27017)
   permite el acceso desde Cloud Run.
4. **Usuario Mongo** `brltv2` con rol `readWrite` sobre `superfluid_anvil` y contraseña
   aleatoria de 48 hex (la contraseña no se registra en el repo).
5. **Secreto `brltv2-mongo-uri` v2**:
   `mongodb://brltv2:<pass>@10.140.0.2:27017/superfluid_anvil?authSource=admin&directConnection=true`.
6. **Seed + registro del despliegue** contra la base nueva:
   - `npm run seed`: índices, allowlist (`0xb4eC…00DF`) y `system_config`.
   - `npm run register:deploy`: valida chainId 31337 y código de contratos, y persiste
     `system_config` con BRLT `0x8Df5…9492`, BrltX `0x777C…c974` y bloque 87174.
7. **Cloud Run**: `gcloud run services update brltv2 --update-secrets MONGODB_URI=brltv2-mongo-uri:2`
   → revisión `brltv2-00019-r5d` con 100 % de tráfico.

## Verificación en vivo (2026-11-12)

| Comprobación | Resultado |
|---|---|
| `GET /api/health` | ✅ 200 `{"status":"ok","db":true,"rpc":true,"chainId":31337}` |
| `POST /api/auth/role` · owner | ✅ `admin` → `/admin` |
| `POST /api/auth/role` · wallet sin alta | ✅ `ninguno` |
| Login SIWE admin (owner, firma real) | ✅ 200, cookies `sf_session`/`sf_csrf` |
| `/api/auth/me` con sesión | ✅ 200 role `admin` |
| `/admin`, `/admin/empleados`, `/admin/flujos`, `/admin/sistema`, `/admin/auditoria` | ✅ 200 |
| APIs de lectura admin | ✅ 200 (`system`, `employees`, `flows`, `projects`, `audit`, `jobs`, `scheduled-flows`) |
| Flujo on-chain #1 | ✅ reaparece en `/api/flows` (reconciliación desde eventos) |
| `GET /` (portada corporativa) | ✅ 200 |

## Pérdida de datos

- El disco de `mongo-brltv2` se eliminó y no había backup válido: se perdió el contenido
  histórico de `superfluid_anvil` (empleados, proyectos, auditoría, contadores de login).
- La cadena (Anvil en `vm-blockchain`) **sí se conservó**: contratos, flujo #1 y eventos.
  La reconciliación re-registró el flujo #1; su **ficha de empleado** hay que volver a crearla
  desde `/admin/empleados` con la wallet `0x9423…5cEF`.
- La IP reservada `brltv2-mongo-ip` (10.140.0.10) queda libre; puede borrarse si no se
  reutiliza.

## Observaciones

- El Mongo compartido sirve también a otros proyectos de la plataforma; los cambios
  (binding adicional y tag) no alteran sus rutas por Tailscale (`100.89.28.1:27017`), que
  siguen operativas.
- El secreto `blockchain-anvil-mnemonic` **no deriva** la cuenta owner actual
  (`0xb4eC…00DF`); el mnemónico operativo de Anvil no está en ese secreto. Conviene
  corregirlo para que la recuperación no dependa de un fichero temporal.
- La contraseña del usuario `brltv2` vive solo en el secreto `brltv2-mongo-uri` (v2).

## Auditoría de la IP reservada `brltv2-mongo-ip` (2026-11-15)

Estado de `10.140.0.10`: `RESERVED`, propósito `GCE_ENDPOINT`, región `europe-west1`,
sin etiquetas y **sin usuarios** (la VM `mongo-brltv2` fue su único titular).

| Alcance auditado | Referencias a 10.140.0.10 |
|---|---|
| VMs activas (interfaces de red) | 0 (la subred usa .2/.3/.4/.5; .16/.32 son rangos serverless) |
| Reglas de firewall (reglas y políticas de org) | 0 |
| Rutas de la VPC | 0 |
| Plantillas de instancia | 0 |
| Cloud DNS (zonas privadas) | 0 |
| Cloud Armor | 0 |
| Cloud Run (10 servicios, env actual) | 0 |
| Cloud Run jobs + Cloud Scheduler | 0 |
| Secretos (contenido de cada versión) | 0 activos (v1 de `brltv2-mongo-uri` la contiene, pero es histórica) |
| Repos del workspace (`superfluid`, `RWA`, `ggto`, `hotel-room-mcp-trazable`) | 0 en código/config; solo 4 menciones en docs del incidente |
| Otros proyectos GCP | 0: solo `plataforma-txbarlovento` es accesible y no hay peerings ni VPC compartida |

**Conclusión:** ningún proyecto ni servicio vivo usa la IP. Referencias latentes:
secreto `brltv2-mongo-uri` **v1** (contiene la URI vieja) y las revisiones inactivas
`brltv2-00018-b2w` y anteriores (creadas antes de la v2); borrar v1 solo impediría
rollback de esas revisiones. **Seguro liberar la reserva.**

## Limpieza ejecutada (2026-11-15, 15:24 -04)

Tras la auditoría de cero referencias activas:

1. `gcloud compute addresses delete brltv2-mongo-ip --region=europe-west1` → **reserva liberada**.
2. `gcloud secrets versions destroy 1 --secret=brltv2-mongo-uri` → **v1 destruida** (era la que
   incrustaba `10.140.0.10`). Queda la **v2** (`10.140.0.2`, activa en `brltv2-00019-r5d`).

Verificación post-limpieza: `/api/health` 200 ok (db/rpc/chainId 31337) · `/`, `/entrar`,
`/admin` 200 · flujo #1 on-chain intacto (10 BRLT, receptor `0x9423…5cEF`, sin pausar) ·
bloque 110.422.
