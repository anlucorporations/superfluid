# Redespliegue completo de brltv2 — H11 (documento consolidado)

> Fecha: 2026-11-16 · Estado: ✅ **desplegado y verificado en vivo**.
> Cuenta GCP: `txbarlovento@gmail.com` · SA operativa: `sa-dsh-dev@plataforma-txbarlovento`
> · Proyecto: **`plataforma-txbarlovento`** (nº `173076294289`) · Región: `europe-west1`.
> Rama: `gh-integra` · Últimos commits desplegados: `a060126` (inyección operativa),
> `ec1b87d` (verify del backup), `c37f0bf` (doc H11).
> Este documento consolida: despliegue, verificación, contratos, MongoDB, backup
> nocturno, **cuentas de Anvil con toda su información** y pendientes.

---

## 1. Despliegue

### 1.1 Pre-flight (repo local)

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` (tsc --noEmit) | ✅ limpio |
| `npm test` (Vitest, 5 suites) | ✅ **43/43** |

### 1.2 Proceso

```bash
bash web/gcp/deploy.sh    # Cloud Build (Dockerfile multi-stage) + Cloud Run (env desde web/gcp/env.yaml)
```

| Dato | Valor |
|---|---|
| Cloud Build | `1eceb4e0-3f47-43ab-b18c-4cc8d08499c0` · 3M59S · SUCCESS · logs en Cloud Logging |
| Imagen | `europe-west1-docker.pkg.dev/plataforma-txbarlovento/superfluidv2/web:latest` |
| **Revisión activa** | **`brltv2-00023-7j8`** (100 % del tráfico) |
| Rollback inmediato | `brltv2-00022…`/`brltv2-00021-k96` y anteriores retenidas (`gcloud run services update-traffic brltv2 --to-revisions brltv2-00021-k96=100`) |
| URL pública | **https://brltv2-szrmcf2hja-ew.a.run.app** |
| URL alternativa | https://brltv2-173076294289.europe-west1.run.app (misma revisión) |

### 1.3 Configuración de la revisión

| Componente | Valor |
|---|---|
| Recursos | 1 CPU / 512Mi · min 1 / max 2 instancias · timeout 120 s · healthcheck `GET /api/health` |
| Acceso | `--allow-unauthenticated` (guardas de sesión en la app) |
| VPC connector | `brltv2-connector` (CIDR 10.8.0.0/28) · egress **`all-traffic`** |
| Secret | `MONGODB_URI` ← `brltv2-mongo-uri:latest` (v2) |
| `MONGODB_DB` | `superfluid_anvil` |
| `SIWE_DOMAIN` | `brltv2-szrmcf2hja-ew.a.run.app` |
| `NEXT_PUBLIC_RPC_URL` | `https://hotel-anvil-proxy-szrmcf2hja-ew.a.run.app` (proxy del Anvil de `vm-blockchain`) |
| `NEXT_PUBLIC_CHAIN_ID` | `31337` |
| `NEXT_PUBLIC_BRLT_ADDRESS` | `0x020a699264d9f9caed6f0b65c1c25F000E7d6b56` |
| `NEXT_PUBLIC_BRLTX_ADDRESS` | `0x6080788bc70756dD3c73b4AF2936D0eeA135bE71` |
| `NEXT_PUBLIC_FAUCET_URL` | `https://faucet.codecrypto.academy/` |
| `ADMIN_BOOTSTRAP_WALLET` | `0xb4eCE9a93c2d400e4322EfFF9Ae9dA284aD200DF` |
| `DISABLE_JOBS` | `0` (cron activo) |
| `SESSION_TTL_ADMIN/EMPLOYEE` | 7200 s / 28800 s · rate limit 5/900 s |

---

## 2. Verificación en vivo (2026-11-16)

| Comprobación | Resultado |
|---|---|
| `GET /api/health` | ✅ `{"status":"ok","db":true,"rpc":true,"chainId":31337}` |
| `/` (portada corporativa) | ✅ 200 |
| `/entrar` | ✅ 200 |
| `/admin` | ✅ 200 |
| `GET /api/system` sin sesión | ✅ 401 `no_autenticado` (guarda activa) |
| On-chain vía proxy | ✅ chainId 31337 · supply **10.000.000 BRLT** · owner = minter = `0xb4eC…00DF` · `BrltX.brlt()` → Brlt |
| Cron (jobs internos) | ✅ `job_runs` creciendo (1.539 → 1.615 durante la sesión) |

---

## 3. Contratos on-chain (Anvil compartido, chainId 31337)

| Contrato | Dirección | Estado |
|---|---|---|
| **Brlt** (ERC-20, 18 dec, cap 50M) | `0x020a699264d9f9caed6f0b65c1c25F000E7d6b56` | owner `0xb4eC…00DF` · minter `0xb4eC…00DF` · supply 10M |
| **BrltX** (wrapper CFA) | `0x6080788bc70756dD3c73b4AF2936D0eeA135bE71` | `brlt()` = Brlt · owner `0xb4eC…00DF` |
| Bloque de despliegue (`system_config`) | `56395` | flujos y eventos espejados desde ahí |

> **No se redesplegaron contratos en este hito**: el owner/minter ya era la cuenta #0
> y la reconciliación mantiene el espejo Mongo ↔ eventos.

---

## 4. Cuentas de Anvil — información completa

Derivadas del mnemónico del Anvil compartido (secreto
`blockchain-anvil-mnemonic` de Secret Manager, formato `ANVIL_MNEMONIC=<12 palabras>`;
**la frase nunca se registra en el repo**). Derivación BIP-44 estándar
(`m/44'/60'/0'/0/<índice>`, `cast wallet derive --accounts N`).

### 4.1 Tabla completa (saldos al 2026-11-16 tras la inyección operativa)

| # | Índice | Wallet | ETH | Nonce | BRLT | Rol asignado |
|---|---|---|---|---|---|---|
| 1 | 0 | `0xb4eCE9a93c2d400e4322EfFF9Ae9dA284aD200DF` | 9.899,9994 | 40 | **10.009.990** | **Owner del despliegue + Super Admin** (owner y minter de Brlt/BrltX; `ADMIN_BOOTSTRAP_WALLET`) |
| 2 | 1 | `0x9423e32e170E36dD5B33819629fB33bdaAA15cEF` | 9.999,9999 | 3 | **100** | **Administrador de sistema** (ficha demo eliminada; alta en `admin_allowlist`) |
| 3 | 2 | `0x89Dd06d6f8b0CC425Eff702fE7b026e829AB4eBe` | 10.000 | 0 | **100** | **Empleado de la empresa** (Empleado Uno ANLU) |
| 4 | 3 | `0xc4d47529Cf91Fab4dF069D2014C9B11065FdFB41` | 10.000 | 0 | **100** | **Empleado de la empresa** (Empleado Dos ANLU) |
| 5 | 4 | `0xf100d77F47B9ffF6a42C8b69Fe28295100B2C828` | 10.000 | 0 | **100** | **Empleado de la empresa** (Empleado Tres ANLU) |

### 4.2 Cómo obtener las cuentas (operador autorizado)

```bash
# Mnemónico (no se imprime en el repo ni en el log)
M=$(gcloud secrets versions access latest --secret=blockchain-anvil-mnemonic \
  --project plataforma-txbarlovento | sed 's/^ANVIL_MNEMONIC=//' | tr -d '\r\n')

# Derivar las 5 cuentas con sus índices
cast wallet derive --accounts 5 "$M"

# Balance ETH / BRLT / nonce de una cuenta
RPC=https://hotel-anvil-proxy-szrmcf2hja-ew.a.run.app
cast balance <WALLET> --rpc-url $RPC
cast call 0x020a699264d9f9caed6f0b65c1c25F000E7d6b56 'balanceOf(address)(uint256)' <WALLET> --rpc-url $RPC
cast nonce <WALLET> --rpc-url $RPC
```

### 4.3 Claves privadas y custodia

- Cada clave privada se deriva con `cast wallet private-key "$M" <índice>`.
  **Nunca** escribirla en el repo, el chat ni los logs.
- La cuenta #0 firma todo el ciclo de nómina on-chain (owner/minter) y es la
  wallet de bootstrap del panel (`ADMIN_BOOTSTRAP_WALLET`).
- El mnemónico es compartido por la plataforma (otros proyectos lo usan): su
  rotación es una decisión de plataforma, no de este proyecto.
- Riesgo documentado en H9: si `vm-blockchain` se reinicia, los contratos se
  pierden y hay que redesplegarlos + restaurar el demo (procedimiento H9 §11).
  En este hito **no se reinició ni se tocó el Anvil**.

### 4.4 Saldo de gas (ETH)

Todas las cuentas conservan el saldo inicial del despliegue de Anvil
(10.000 ETH); la #0 gastó ≈100 ETH en gas del deploy y pruebas. No se requirió
el faucet y no se movió ningún balance de ETH.

---

## 5. MongoDB compartido (vm-databases · 10.140.0.2:27017)

| Dato | Valor |
|---|---|
| Base | `superfluid_anvil` (contenedor `mongo` compartido; binding `10.140.0.2:27017`) |
| Usuario | `brltv2` (rol `readWrite` sobre `superfluid_anvil`; contraseña solo en el secreto v2) |
| Acceso | Cloud Run vía `brltv2-connector` + regla `allow-brltv2-mongo` |

Estado tras el redespliegue (contado en vivo):

| Colección | Documentos | Nota |
|---|---|---|
| `admin_allowlist` | 1 | `0xb4eC…00DF` (admin activo; el bootstrap de arranque es idempotente) |
| `employees` | 1 | ficha demo (wallet `0x9423…5cEF`) |
| `flows` | 1 | Flujo #1 (10 BRLT / 30 d, activo) |
| `flows_history` | 2 | espejo idempotente de eventos (`txHash-logIndex`) |
| `audit_events` | 6 | auditoría |
| `job_runs` | 1.615 | cron operando |
| `system_config` | 1 | chainId 31337 · RPC proxy · `deployBlock` 56395 |

---

## 6. Backup nocturno de Mongo (novedad operativa de este hito)

| Componente | Valor |
|---|---|
| Bucket GCS | `brltv2-mongo-backups` (europe-west1, UBLA, retención **90 días** por regla Delete/age) |
| Cloud Run Job | `brltv2-mongo-backup` (imagen `mongo-backup:latest` = mongodump + `google-cloud-storage`) |
| Scheduler | `brltv2-nocturno-dump` · **04:00 UTC diario** · target
  `https://europe-west1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/plataforma-txbarlovento/jobs/brltv2-mongo-backup:run` (OAuth SA compute) |
| IAM | SA compute: `storage.objectAdmin` en el bucket + `secretAccessor` en `brltv2-mongo-uri` + `run.invoker` del job |
| Verificación de integridad | `verify.py` (descarga el objeto más reciente y hace `mongorestore --dryRun --gzip`); job temporal `brltv2-mongo-backup-verify` |
| Primera copia real | `gs://brltv2-mongo-backups/brltv2-mongo/2026-11-15T222303Z.archive.gz` (32.647 B, 13 colecciones) |

⚠️ Incidente registrado: una versión intermedia de `verify.py` imprimió la URI de
Mongo (con contraseña) en los logs del job. **Pendiente: rotar la contraseña del
usuario `brltv2`** y actualizar el secreto `brltv2-mongo-uri` (v3).

---

## 7. Inyección operativa (✅ ejecutada el 2026-11-16 01:29 UTC)

- Script controlado: `scripts/inyectar_datos_operativos.py` (confirmación
  interactiva, `--dry-run`, log sin secretos en
  `RepoTecnico/BaseOperaciones/inyeccion_datos.log`).
- **Ejecutada en vivo**: allowlist con #0 y #1 como admin · ficha demo borrada ·
  proyecto `Nomina ANLU` · 3 empleados (#2..#4, 100 BRLT/30d) · mint **10.000 BRLT
  → #0** (`0x3a714911…41fc78`) y **100 BRLT → #1..#4** (`0xa2fbeb04…`,
  `0x49cd87c8…`, `0xf95a4890…`, `0x8c014351…`).
- Post-verificación: supply on-chain **10.001.040 BRLT** · `/api/health` ok ·
  admins=2 · empleados=3 · ETH y Anvil compartido sin cambios.

---

## 8. Accesos y ejecución manual (resumen para el responsable)

| Acción | Comando |
|---|---|
| Health / páginas | `curl https://brltv2-szrmcf2hja-ew.a.run.app/api/health` |
| Login SIWE admin | navegador + MetaMask con la cuenta #0 en la URL pública (custodia local, H9 §7) |
| Ejecutar backup ahora | `gcloud run jobs execute brltv2-mongo-backup --project plataforma-txbarlovento --region europe-west1 --wait` |
| Verificar backup | `gcloud storage ls -r gs://brltv2-mongo-backups/brltv2-mongo/` |
| Redesplegar | `bash web/gcp/deploy.sh` (tras `npm run typecheck && npm test`) |
| Rollback | `gcloud run services update-traffic brltv2 --to-revisions brltv2-00021-k96=100` |
| Ver contratos | `cast call 0x020a…6b56 'owner()(address)' --rpc-url https://hotel-anvil-proxy-szrmcf2hja-ew.a.run.app` |

---

## 9. Pendientes conocidos

1. **Rotar contraseña Mongo `brltv2`** (incidente de logs §6) y publicar
   `brltv2-mongo-uri` v3 en la revisión.
2. **Recorrido SIWE con MetaMask** desde navegador local (no reproducible desde
   esta sesión: la clave del owner no se expone). Ahora ambas wallets admin
   (#0 y #1) están en la allowlist y pueden entrar al panel.
3. El flujo #1 queda huérfano de ficha (empleado demo borrado, decisión aprobada);
   puede vincularse después desde `/admin/flujos` si se desea.
