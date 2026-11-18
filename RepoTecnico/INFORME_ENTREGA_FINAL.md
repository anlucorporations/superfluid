# Informe Final de Entrega — Superfluid Brlt (ANLU corporations)

> Fecha: 2026-11-18 · Rama `gh-integra` · Commit final: `1d5aeb6`
> Alcance: núcleo de contratos (H1), despliegue (H2), identidad/datos (H3),
> ciclo de nómina (H4), suite de cobro (H5), operación (H6), GCP (H7–H11),
> Anvil (H9), UI corporativa (H12), Portal del Empleado + downgrade tope 80%
> (H13), clear signing y batería de pruebas (H14).

---

## 1. Datos técnicos de desarrollo y despliegue

### 1.1 Stack

| Capa | Tecnología | Versión |
|---|---|---|
| Contratos | Solidity + Foundry (`forge`/`cast`) | `sc/foundry.toml` |
| Frontend/Backend | Next.js (App Router) + React + TypeScript | 15.5.29 / 19 / 5.7 |
| Web3 cliente | ethers.js + siwe (SIWE EIP-4361, EIP-712) | 5.7.2 / 2.3.2 |
| Base de datos | MongoDB (driver 6.x) + `mongodb-memory-server` para dev/test | — |
| Estilos | Tailwind CSS (tokens AdminLTE y Portal del Empleado) | 3.4 |
| Pruebas | Vitest (50 unitarias) · Playwright 1.55 (batería E2E) | — |
| Despliegue | Cloud Build (Dockerfile multi-stage) + Cloud Run | — |

### 1.2 Coordenadas de despliegue (GCP)

| Componente | Coordenada |
|---|---|
| Proyecto GCP | `plataforma-txbarlovento` (nº `173076294289`) |
| SA operativa | `sa-dsh-dev@plataforma-txbarlovento.iam.gserviceaccount.com` |
| Región | `europe-west1` |
| Servicio Cloud Run | `brltv2` — **revisión activa `brltv2-00039-b4z`** (100 % tráfico) |
| URL pública | **https://brltv2-szrmcf2hja-ew.a.run.app** (alt: `https://brltv2-173076294289.europe-west1.run.app`) |
| Imagen | `europe-west1-docker.pkg.dev/plataforma-txbarlovento/superfluidv2/web:latest` |
| Cloud Build (último) | `66b59218-…` (3M41S SUCCESS) · despliegues previos: `00033-dmn`, `00035-h26`, `00037-xqf` |
| Proxy RPC (Anvil) | `https://hotel-anvil-proxy-szrmcf2hja-ew.a.run.app` (chainId 31337; VPC interno `http://10.140.0.4:8546`) |
| MongoDB | `superfluid_anvil` @ `10.140.0.2` (compartida) · secreto `brltv2-mongo-uri:latest` (v2) |
| Backup nocturno | Cloud Run Job `brltv2-mongo-backup` + Scheduler `brltv2-nocturno-dump` (04:00 UTC) → bucket `brltv2-mongo-backups` (retención 90 días, verificación `mongorestore --dryRun`) |
| Repositorios | `origin` GitLab.com, `github` GitHub, `codecrypto` GitLab Codecrypto — todos con `gh-integra` sincronizada |
| Config de sesión | `SIWE_DOMAIN=brltv2-szrmcf2hja-ew.a.run.app` · admin 7200 s · empleado 28800 s · rate limit 5/900 s |
| Red | Besu Codecrypto · **chainId 31337** (`0x7a69`) · faucet `https://faucet.codecrypto.academy/` |
| Salud | `GET /api/health` → `{"status":"ok","db":true,"rpc":true,"chainId":31337}` |

### 1.3 Contratos desplegados (Anvil compartido, no se redesplegaron)

| Contrato | Dirección | Estado |
|---|---|---|
| **Brlt** (ERC-20, 18 dec, cap 50M) | `0x020a699264d9f9caed6f0b65c1c25F000E7d6b56` | owner = minter = `0xb4eC…00DF` · supply ≈ 10.001.040 BRLT |
| **BrltX** (wrapper CFA de flujos) | `0x6080788bc70756dD3c73b4AF2936D0eeA135bE71` | `brlt()` = Brlt · owner `0xb4eC…00DF` · bloque de despliegue 56395 |

---

## 2. Estructura lógica del proyecto y flujo de trabajo

### 2.1 Estructura

```
superfluid/
├── sc/                     # Contratos Solidity + tests Foundry (Brlt, BrltX)
├── web/                    # Next.js: /admin (AdminLTE) · /suite (Portal del Empleado)
│   ├── src/app/            # App Router: entrar, login, suite, admin, api/*
│   ├── src/lib/            # auth, siwe, eip712, downgrade-limit, repositories, contracts
│   ├── src/components/     # LoginFlow, EntryLogin, FirmaResumen (clear signing)
│   ├── gcp/                # deploy.sh, cloudbuild.yaml, env.yaml, mongo-backup/
│   └── public/ayuda        # Sección de Ayuda (manual navegable + PDF)
├── RepoTecnico/            # Casos de uso, hitos, diccionario, manuales técnicos, CLEAR_SIGNING
├── RepoPrueba/             # Batería de pruebas E2E (Fases 0–5)
├── docs/                   # Manuales literales, imágenes, PDFs
└── scripts/                # inyectar_datos_operativos.py
```

### 2.2 Flujo de trabajo (operación de nómina)

```
DESPLEGADOR ── deploy Brlt/BrltX (CU-12) ──► registra addresses en system_config (CU-11)
ADMIN (#0/#1) ── SIWE ──► /admin: empleados, proyectos, finanzas, flujos, auditoría, jobs
   │  mint/burn BRLT (CU-02) · allowlist (CU-11) · programar flujos (CU-05)
   │  aprobar flujos programados → wrapAndCreateFlow on-chain (CU-06) hacia la wallet del empleado
   ▼
EMPLEADO (#2–#4) ── /entrar (wallet decide portal) ──► /suite (Portal del Empleado)
   ├── consulta flujos segundo a segundo (CU-14, reconciliación on-chain cada 5 s)
   ├── downgrade de flujos con tope 80% (CU-17) / cobro autónomo (CU-16)
   └── perfil, consentimiento y borrado de datos (CU-15)
ADMIN SISTEMA ── jobs (H6): reconciliación, espejo de eventos, GDPR, flujos programados
BACKUP ── 04:00 UTC ── mongodump → GCS (retención 90 días)
```

**Regla de oro:** la verdad es el contrato; MongoDB guarda espejo reconciliado
para listado rápido, historial y auditoría. La app nunca custodia claves: todas
las firmas salen de la wallet del usuario.

---

## 3. Estructura de BD y contratos

### 3.1 MongoDB (`superfluid_anvil`) — colecciones

| Colección | Función |
|---|---|
| `system_config` | Config única: RPC, chainId, addresses Brlt/BrltX, `deployBlock`, faucet |
| `admin_allowlist` | Wallets admin con rol (`super_admin`/`admin`/`operador`) y estado |
| `employees` | Fichas: wallet, nombre, proyecto, concepto, periodo, `montoPeriodo`, estado, datos personales (GDPR), consentimiento |
| `projects` | Proyectos de la empresa |
| `flows` | Espejo reconciliado de flujos on-chain (flowId, rate, depositado, pagado, estado, txHash) |
| `flows_history` | Espejo idempotente de eventos on-chain (`txHash-logIndex`) |
| `scheduled_flows` | Flujos programados off-chain (CU-05): fecha, estado, ejecución |
| `batches` | Lotes de envío múltiple (≤ 10 flujos, CU-09) |
| `audit_events` | Auditoría: alta, edición, cambio de wallet, config, flujo, **cobros del empleado (fuente del tope 80%)** |
| `nonces` | Nonces SIWE/EIP-712 de un solo uso (5 min) |
| `job_runs` | Ejecuciones del cron interno |

### 3.2 Contratos (`sc/src/`)

**Brlt.sol** — ERC-20 de 18 decimales, cap 50M: `mint`/`burn` (solo minter),
punto de valor real de la plataforma.

**BrltX.sol** — wrapper 1:1 con flujos de streaming (CFA):
- `upgrade(amount)` / `downgrade(amount)` — envolver BRLT↔BrltX; el downgrade **quema BrltX y entrega BRLT en la misma tx** (cobro del empleado, disponible siempre, incluso con contrato pausado).
- `wrapAndCreateFlow(amount, receiver, duration)` — financia un flujo: `flowRate = amount/duration`, residuo en escrow.
- `updateFlow` (pausa/reanudar/cambiar tasa, solo emisor), `deleteFlow` (termina y devuelve remanente al admin), `settleFlow` (liquida flujo vencido — **público y sin permiso**).
- `changeReceiver` (atómico: liquida al antiguo y reabre hacia el nuevo).
- Consultas: `getFlow`, `getPending`, `getRealtimeBalance` (BrltX + devengo), `brltBacking`.
- Duraciones permitidas: 6/15/30/90 días · pausa global que **no** bloquea cobros.

---

## 4. Estructura de cuentas principales (Anvil compartido, chainId 31337)

| # | Wallet | Función | ¿Quién la opera? |
|---|---|---|---|
| 0 | `0xb4eCE9a93c2d400e4322EfFF9Ae9dA284aD200DF` | **Owner + minter de Brlt/BrltX y Super Admin** (`ADMIN_BOOTSTRAP_WALLET`). Firma: deploy, mint/burn, creación/pausa/terminación de flujos, changeReceiver, alta de flujos programados | El administrador propietario (persona física con MetaMask; la clave vive en el navegador, nunca en servidores) |
| 1 | `0x9423e32e170E36dD5B33819629fB33bdaAA15cEF` | **Administrador de sistema** (allowlist): gestión de empleados, proyectos, configuración, auditoría | Segundo administrador humano |
| 2 | `0x89Dd06d6f8b0CC425Eff702fE7b026e829AB4eBe` | **Empleado Uno ANLU** — receptor de nómina streaming (100 BRLT/30 d) | Empleado humano; solo firma `downgrade` (cobro) y opcionalmente `settleFlow` |
| 3 | `0xc4d47529Cf91Fab4dF069D2014C9B11065FdFB41` | **Empleado Dos ANLU** — ídem | Empleado humano |
| 4 | `0xf100d77F47B9ffF6a42C8b69Fe28295100B2C828` | **Empleado Tres ANLU** — ídem | Empleado humano |
| 5–9 | `0x2AeC…1f40`, `0xcE6E…C7EC`, `0x4d84…8E3a`, `0x63D6…EbFe6`, `0x7fE1…EA51` | **Reserva** para futuras altas de empleados/admins | — (derivadas del mnemónico de la plataforma; claves en `ANVIL_CUENTAS_CLAVES.md`, no commiteado) |

Derivación: mnemónico `blockchain-anvil-mnemonic` (Secret Manager,
`plataforma-txbarlovento`), BIP-44 `m/44'/60'/0'/0/<i>`. Todas conservan
≈10.000 ETH iniciales; #0 gastó ~100 ETH de gas. Claves solo para chainId 31337.

---

## 5. Estructura de inyección de datos (operatividad)

Documento y script: `RepoTecnico/BaseOperaciones/` + `scripts/inyectar_datos_operativos.py`
(`--dry-run` primero, confirmación interactiva s/n, log en `inyeccion_datos.log` sin secretos).

**Restricciones del responsable (aprobadas 2026-11-15/16):**
1. #0 = owner del despliegue **y** Super Admin. 2. #1 = Administrador de sistema.
3. #2–#4 = empleados de la empresa. 4. Ingresar todos los datos necesarios.
5. Saldo admin: 10.000 BRLT. 6. Saldo de cada empleado: 100 BRLT.
7. ETH: sin faucet (saldo inicial del Anvil). 8. No reiniciar el Anvil ni redesplegar contratos.

**Plan aprobado y EJECUTADO (2026-11-16 01:29 UTC):**

| Paso | Operación | Resultado |
|---|---|---|
| 2 | Allowlist Mongo: #0 y #1 como `admin` activos | ✅ 2 admins |
| 4 | Ficha demo del empleado borrada (coherencia de roles) | ✅ |
| 3 | Proyecto `Nomina ANLU` + 3 fichas de empleado (#2–#4, 100 BRLT/30 d) | ✅ 3 activos |
| 5 | Mint 10.000 BRLT → #0 y 100 BRLT → #1–#4 (5 tx `mint` firmadas por #0) | ✅ |
| 6 | Verificación: supply on-chain 10.001.040 BRLT · `/api/health` ok · admins=2 · empleados=3 | ✅ |

Comando reproducible: `export MONGODB_URI=$(gcloud secrets versions access latest --secret=brltv2-mongo-uri …)` →
`python3 scripts/inyectar_datos_operativos.py --dry-run --leer-secreto` y luego sin `--dry-run`.

---

## 6. Estructura de los casos de uso principales

Fuente canónica: `RepoTecnico/casos_uso.md` (CU-01..CU-16) + **CU-17** añadido
esta sesión (documentado en `RepoTecnico/casos_uso/` con diagramas Mermaid).

| CU | Nombre | Actor | Firma |
|---|---|---|---|
| CU-01 | Autenticarse y conectar wallet (panel admin) | ADMIN | SIWE |
| CU-02 | Mint/burn de BRLT | ADMIN | tx |
| CU-03 | Gestionar empleados (alta, edición, cambio de wallet, baja) | ADMIN | tx + EIP-712 doble firma |
| CU-04 | Gestionar proyectos | ADMIN | — |
| CU-05 | Programar flujo (próximo pago en Mongo) | ADMIN | — |
| CU-06 | Iniciar flujo on-chain (`wrapAndCreateFlow`) | ADMIN | tx |
| CU-07 | Pausar y reanudar flujo | ADMIN | tx |
| CU-08 | Terminar o liquidar flujo (`deleteFlow`/`settleFlow`) | ADMIN / cualquiera | tx |
| CU-09 | Envío múltiple (lote ≤ 10 flujos) | ADMIN | tx |
| CU-10 | Monitorear finanzas | ADMIN | lectura |
| CU-11 | Configurar sistema y allowlist | ADMIN SISTEMA | SIWE candidato |
| CU-12 | Desplegar contratos y registrar addresses | DESPLEGADOR | tx |
| CU-13 | Acceder a la Suite del Empleado (SIWE) | EMPLEADO | SIWE |
| CU-14 | Consultar movimientos y flujos en la Suite | EMPLEADO | lectura |
| CU-15 | Gestionar perfil y datos personales | EMPLEADO | — |
| CU-16 | Retirar saldo BrltX (cobro autónomo `downgrade`) | EMPLEADO | tx |
| **CU-17** | **Downgrade de flujo con tope acumulado del 80%** (nuevo) | EMPLEADO | tx (cap servidor) |

Documentación de cada CU con precondiciones, pasos, criterios de aceptación
(AC-01..AC-15) y trazabilidad RF/NFR en `RepoTecnico/casos_uso.md`; diagramas
de contexto, estados y secuencias en `RepoTecnico/casos_uso/`.

---

## 7. Batería de pruebas y resultados

Artefactos: `RepoPrueba/` (análisis, 41 requisitos EARS `REQ-WALLET-01..41`,
8 features Gherkin con **125 escenarios** — 101 ejecutables + 24 N/A de
catálogo —, matriz de trazabilidad bidireccional, runner Playwright con
aprobación bloqueante, plan maestro).

**Primera ejecución autorizada (2026-11-18, entorno simulado):**

| Estado | N | Lectura |
|---|---|---|
| **PASS** | **3** | Detección y conexión de Phantom, Coinbase y Trust en Chrome (modo simulada), con captura verificada |
| **FAIL** | **0** | **Ninguna anomalía de la aplicación** |
| BLOCKED | 54 | Modo "wallet real" sin material de prueba (falta build de MetaMask/Rabby, navegador Brave) |
| NOT_RUN | 43 | Fuera de filtro de la pasada + 8 escenarios con pasos aún sin intérprete |
| N/A | 25 | Combinaciones inexistentes del catálogo (nunca son fallo) |

Anomalías de herramienta (no de la app) y recomendaciones completas en
`RepoPrueba/05_informe_anomalias.md`; estado vivo por escenario en
`RepoPrueba/06_estado_ejecucion.md`. Unitarias: **50/50 Vitest** en verde
(EIP-712, flujos, permisos, jobs, rates, validación).

---

## 8. Mejoras y recomendaciones (priorizadas)

| # | Mejora | Detalle | Prioridad |
|---|---|---|---|
| 1 | **Rotar la contraseña de Mongo** | Incidente registrado: una versión de `verify.py` imprimió la URI en logs del job de backup; falta rotar y actualizar `brltv2-mongo-uri` (v3) | Alta |
| 2 | **Unificar chainId SIWE vs app** | SIWE firma con `81234` (`lib/siwe.ts`) y la app/red usa `31337`; funciona porque ambos lados validan 81234, pero conviene alinear (pendiente de decisión del usuario) | Alta |
| 3 | **Listener `chainChanged`** | Un cambio de red con sesión abierta no se detecta en vivo (gap W10); solo bloquea al operar. Añadir listener en el cliente | Alta |
| 4 | **Tope 80% on-chain (opcional)** | Hoy el tope es backend-only (server exige 80% sobre la auditoría); una extensión del contrato permitiría exigirlo en la propia `downgrade` | Media |
| 5 | **Ampliar intérprete de la batería** | Flujos con sesión (SIWE completo, portales, downgrade 80%, EIP-712) siguen NOT_RUN; añadir pasos para desbloquear ~40 escenarios | Media |
| 6 | **Aportar builds de wallets** | `E2E_WALLET_BUILD_METAMASK`/`_RABBY`, `E2E_BRAVE_PATH` y perfil Firefox desbloquean ~60 escenarios reales | Media |
| 7 | **Verificar métodos `anvil_*` del proxy** | El chequeo interno del runner a veces no alcanza el proxy (H-3); probar RPC directo | Media |
| 8 | **CU-17 en `casos_uso.md`** | El downgrade con tope está en diagramas/código; consolidarlo como sección del documento canónico | Baja |
| 9 | **E2E_TEST_SEED_PHRASE formal** | Definir una seed de prueba permanente en Secret Manager para ejecuciones repetibles | Baja |
| 10 | **Diferencia de variables públicas local** | El build local usa defaults (Red 81234 / besu.alumnos); reconstruir con las variables del cloudbuild o probar contra Cloud Run | Baja |

---

*Informe generado el 2026-11-18 a partir de los hitos H1–H14, el despliegue
activo `brltv2-00039-b4z` y la primera ejecución de la batería de pruebas.*
