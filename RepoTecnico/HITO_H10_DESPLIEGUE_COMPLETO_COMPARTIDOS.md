# Hito H10 — Despliegue completo en `plataforma-txbarlovento` con servicios compartidos

> Fecha: 2026-11-15 (20:06–20:12 UTC) · Estado: ✅ **desplegado y verificado**.
> Cuenta: `txbarlovento@gmail.com` · Proyecto: `plataforma-txbarlovento` (nº 173076294289) ·
> Región: `europe-west1`. Continúa H8 (plataforma) y H9 (Anvil 31337).
> Decisión cumplida: **todo el despliegue reusa los servicios globales compartidos** de la
> plataforma (`PlataformaGlobal/PARAMETROS_GLOBALES.md`); no se creó ningún recurso dedicado.

## 1. Servicios compartidos usados

| Componente | Recurso compartido | Uso en este despliegue |
|---|---|---|
| Red VPC | `plataforma-vpc` / `subnet-euw1` (10.140.0.0/20) | egreso privado de Cloud Run |
| VPC connector | `brltv2-connector` (CIDR 10.8.0.0/28) | `all-traffic` hacia Mongo compartido |
| MongoDB global | `vm-databases` (10.140.0.2:27017, contenedor `mongo` compartido) | base `superfluid_anvil` vía secreto `brltv2-mongo-uri` v2 |
| Blockchain global | Anvil de `vm-blockchain` (chainId 31337) vía proxy público `hotel-anvil-proxy` | RPC on-chain (`NEXT_PUBLIC_RPC_URL`) y verificación `cast` |
| Artifact Registry | repositorio `superfluidv2` (europe-west1) | imagen `web:latest` |
| Cloud Build / Secret Manager / Cloud Run | plataforma | build, secreto `brltv2-mongo-uri`, servicio `brltv2` |

Verificación previa de la plataforma: `plataforma-env.sh --check` → **15/15 OK**
(Anvil chainId 31337, Mongo, PG, gateway LLM, Coolify…).

## 2. Pre-flight (repo local, rama `gh-integra`)

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` (tsc --noEmit) | ✅ limpio |
| `npm test` (Vitest) | ✅ 43/43 |

## 3. Despliegue

```bash
bash web/gcp/deploy.sh    # Cloud Build + Cloud Run, env desde web/gcp/env.yaml
```

| Dato | Valor |
|---|---|
| Build de Cloud Build | `7280d2a5-fc87-4e97-ba77-d611c2148a49` (3M48S, SUCCESS) |
| Imagen | `europe-west1-docker.pkg.dev/plataforma-txbarlovento/superfluidv2/web@sha256:789072e94758…91f61` |
| Revisión activa | **`brltv2-00021-k96`** (100 % tráfico; `00020-bxq` del paso interno de Cloud Build, misma imagen) |
| URL | https://brltv2-szrmcf2hja-ew.a.run.app |
| Recursos | 1 CPU / 512Mi · min 1 / max 2 · timeout 120 s · healthcheck `GET /api/health` |
| Secreto | `MONGODB_URI=brltv2-mongo-uri:latest` (v2 → Mongo compartido 10.140.0.2) |
| Rollback inmediato | `brltv2-00019-r5d` / `00018-b2w` / `00017-2sd` retenidas |

## 4. Verificación en vivo (2026-11-15, tras el despliegue)

| Comprobación | Resultado |
|---|---|
| `GET /api/health` | ✅ `{"status":"ok","db":true,"rpc":true,"chainId":31337}` |
| Páginas `/`, `/entrar`, `/admin` | ✅ 200 / 200 / 200 |
| Env de la revisión | ✅ `MONGODB_DB=superfluid_anvil`, `SIWE_DOMAIN=brltv2-szrmcf2hja-ew.a.run.app`, `NEXT_PUBLIC_*` = Anvil 31337 + `0x020a…6b56` / `0x6080…Be71`, `ADMIN_BOOTSTRAP_WALLET=0xb4eC…00DF`, `DISABLE_JOBS=0` |
| VPC | ✅ anotaciones `vpc-access-connector: brltv2-connector`, `vpc-access-egress: all-traffic` |
| On-chain (`cast` vía proxy) | ✅ chainId 31337 · bloque 111734 · `totalSupply()` 10.000.000 BRLT · `owner()`=`minter()`=`0xb4eC…00DF` · `BrltX.brlt()`→Brlt |
| Mongo compartido (secreto en memoria, nunca impreso) | ✅ 13 colecciones; `system_config` (chainId 31337, rpc proxy, deployBlock 56395) · `admin_allowlist`=1 · `employees`=1 (Empleado Prueba Anvil 0x9423…) · `flows`=1 (Flujo #1, 10 BRLT) · `flows_history`=2 · `audit_events`=6 · `job_runs`=1507 |

## 5. No reproducible desde aquí (por diseño de custodia)

- **Login SIWE con la wallet owner**: la clave no está en Secret Manager
  (`blockchain-anvil-mnemonic` no deriva `0xb4eC…00DF`, documentado en H9) y no se expone en
  chat. El recorrido con navegador + MetaMask queda al responsable en local (H9 §7/§10).
- El smoke `npm run smoke` del repo es pre-deploy (Mongo en memoria + servidor local); ya
  cubierto por Vitest 43/43 y por las verificaciones en vivo de §4.

## 6. Pendientes conocidos (sin cambiar en este hito)

- Backup nocturno de Mongo (bucket GCS + Cloud Run Job + Scheduler): **diferido por decisión
  del usuario** en H8. En `opencode-txbarlovento` existía; en `plataforma-txbarlovento` no se
  ha creado. Si se quiere, es crear bucket + job + scheduler con prefijo `brltv2-`.
- Riesgo Anvil compartido (H9 §11): si `vm-blockchain` reinicia, hay que redesplegar contratos
  y restaurar demo (procedimiento documentado ahí).
