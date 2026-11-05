# Entornos globales — Superfluid Brlt Streaming v2

> Configuración, rutas, variables de entorno y comandos importantes. Se actualiza de forma incremental.

## Red Besu Codecrypto (datos oficiales, verificados por JSON-RPC)

| Parámetro | Valor |
|-----------|-------|
| Portal / Faucet | https://faucet.codecrypto.academy/ |
| Nombre de red | Codecrypto |
| Chain ID | 81234 (`0x13d52`) |
| RPC URL | https://besu.alumnos.codecrypto.academy |
| Cliente | Hyperledger Besu v24.12.0 |
| Moneda nativa | CC (18 decimales) |
| Consenso | QBFT (multi-node) |

## Verificación de conectividad

```bash
curl -s -X POST https://besu.alumnos.codecrypto.academy \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
# → {"result":"0x13d52"} (81234)
```

## Herramientas (globales del servidor — NO son dependencias del repo)

```bash
forge --version     # compilar, testear, desplegar
cast --version      # consultas, transacciones, conversión de unidades
chisel              # REPL de Solidity (opcional)
```

## Variables de entorno — `sc/.env` (NO versionar la clave privada)

```env
RPC_URL=https://besu.alumnos.codecrypto.academy
CHAIN_ID=81234
ADMIN_PRIVATE_KEY=0x...          # wallet admin (owner y minter finales)
DEPLOYER_PRIVATE_KEY=0x...       # opcional: clave efímera de despliegue
INITIAL_HOLDER=0x...             # opcional: receptor del supply inicial

# Verificación de despliegues existentes
BRLT_ADDRESS=0x750508AD02404a30dF030466FBb3a29D9EE0482F
BRLTX_ADDRESS=0xCE5E017599073f60b3518Cf2f86fFdd49bc6e52F
ADMIN_ADDRESS=0x347789cf559a68262e4A444bc251AF8d0bE07EA9
DEPLOY_BLOCK=6412104
```

Plantilla completa en `sc/.env.example`. `.gitignore` excluye `.env` y `.env.*`
(excepto `.env.example`), `out/`, `cache/`, `broadcast/` y `lib/`.
Foundry carga `sc/.env` automáticamente al ejecutar `forge script` desde `sc/`.

## Comandos del ciclo Blockchain

```bash
# Compilar y testear (EVM interno de forge, sin red)
cd sc && forge build && forge test

# H2 — Despliegue gobernado en Besu 81234 (H2)
#   propone ownership con la clave efímera y acepta con la wallet admin en la misma sesión
cd sc
forge script script/DeployAll.s.sol \
  --rpc-url https://besu.alumnos.codecrypto.academy \
  --legacy --with-gas-price 1000 --broadcast

# Verificación de solo lectura del despliegue (no firma)
BRLT_ADDRESS=0x... BRLTX_ADDRESS=0x... ADMIN_ADDRESS=0x... \
  forge script script/CheckDeployment.s.sol \
  --rpc-url https://besu.alumnos.codecrypto.academy

# Smoke test real: crea un flujo de 10 BRLT/6 días y lo termina en la misma sesión
BRLT_ADDRESS=0x... BRLTX_ADDRESS=0x... EMPLOYEE_ADDRESS=0x... \
  forge script script/Smoke.s.sol \
  --rpc-url https://besu.alumnos.codecrypto.academy \
  --legacy --with-gas-price 1000 --broadcast

# Debug contra red remota (ejemplos cast)
cast chain-id --rpc-url https://besu.alumnos.codecrypto.academy
cast block-number --rpc-url https://besu.alumnos.codecrypto.academy    # medir block time en bucle
cast gas-price --rpc-url https://besu.alumnos.codecrypto.academy       # 1000 wei (2026-11-03)
```

Notas de la red: `eth_gasPrice` = **1000 wei**; se usan transacciones legacy
(`--legacy --with-gas-price 1000`) para evitar problemas de estimación EIP-1559 en Besu
QBFT. Los scripts escriben las addresses en `sc/deployments/81234.json`.

### Despliegue real (2026-11-04)

| Dato | Valor |
|---|---|
| `Brlt` | `0x750508AD02404a30dF030466FBb3a29D9EE0482F` |
| `BrltX` | `0xCE5E017599073f60b3518Cf2f86fFdd49bc6e52F` |
| Owner / minter | `0x347789cf559a68262e4A444bc251AF8d0bE07EA9` |
| Bloque del deploy | `6412104` |
| Supply | 10.000.000 BRLT (18 decimales) |
| Coste deploy + smoke | ≈ 0,0000000044 CC |

Detalle de tx hashes, gas y verificación en `HITO_H2_DESPLIEGUE.md`.

## Frontend (`web/`)

Next.js 15 (App Router) + React 19 + MongoDB. Configuración por variables de entorno
(`web/.env.local`, plantilla en `web/.env.example`); las addresses de los contratos se
guardan en MongoDB (`system_config`) y se editan desde «Sistema» sin re-desplegar.

```bash
cd web
npm install
cp .env.example .env.local       # MONGODB_URI, SIWE_DOMAIN, ADMIN_BOOTSTRAP_WALLET
npm run seed                     # índices + allowlist + system_config
npm run dev                      # http://localhost:3000
npm run dev:mem                  # alternativa: MongoDB en memoria + next dev
npm run typecheck && npm test    # TypeScript + 27 tests Vitest
npm run build && npm run smoke   # build + E2E (SIWE, CRUD, cambio de wallet)
```

Producción: `output: standalone` (`node .next/standalone/server.js`), cookies `Secure`
servidas por HTTPS y `SIWE_DOMAIN` igual al dominio público de Cloud Run. Detalle de la
API y de las guardas de seguridad en `web/README.md` y `HITO_H3_IDENTIDAD_DATOS.md`.

## Financiación (faucet)

1. Abrir https://faucet.codecrypto.academy/
2. Seleccionar «Moneda Nativa», pegar la dirección de la cuenta de despliegue.
3. Solicitar fondos (máx. **100 CC** por solicitud; para deployments pesados, varias solicitudes).
4. Cuenta principal objetivo: **100 CC + 10.000 BRLT**.

## Custodia de claves y sucesión (H2)

- **Wallet admin:** es `owner` de `Brlt`/`BrltX` y `minter` de `Brlt`. Debe custodiar su
  clave/seed en un gestor de contraseñas y una copia física; nunca en el repositorio.
- **Clave efímera de despliegue:** `DEPLOYER_PRIVATE_KEY` solo despliega. `DeployAll` propone
  el ownership a la wallet admin y la admin lo acepta en la misma sesión; además reasigna el
  `minter` al admin y el script aborta si `owner`/`minter` no acaban en la wallet admin. La
  clave efímera queda sin privilegios (AC-06). En el despliegue del 2026-11-04 se usó
  directamente la wallet admin (sin clave efímera separada) para no duplicar secretos; el
  flujo de dos claves sigue soportado y probado en anvil.
- **Ubicación actual del secreto:** `sc/.env` (ignorado por git, solo en el equipo local).
  Antes de producción debe migrarse a un gestor de contraseñas con copia física.
- **Responsable alterno (AC-13):** wallet secundaria en `admin_allowlist` y fondos de gas de
  respaldo para no bloquear operaciones si la wallet principal se queda sin CC.
- **Sucesión:** `transferOwnership(nueva)` (Ownable2Step) + `acceptOwnership()` desde la
  nueva wallet; el contrato no cambia de owner sin aceptación explícita. Registrar el cambio
  en `audit_events` (disponible desde H3).

## Pendientes de registrar

- Estimación del block time real de Besu (para `tasa_refresco_ms`).
- `MONGODB_URI` real de producción (Cloud Run) y política de backups. En local el valor por
  defecto es `mongodb://127.0.0.1:27017`, base `superfluid`; las colecciones e índices los
  crea `npm run seed` / `ensureIndexes`.

## Repositorios remotos (registrados 2026-10-30)

| Origen | URL | Rama de trabajo |
|--------|-----|-----------------|
| GitHub | https://github.com/anlucorporations/superfluid.git | `superfluidv2` |
| GitLab.com | https://gitlab.com/anlucorporations/superfluid.git | `superfluidv2` |
| GitLab CodeCrypto (self-hosted) | https://gitlab.codecrypto.academy/anlucorporations/superfluid.git | `superfluidv2` |

## GCP (registrado 2026-10-30)

- Plataforma existente (v1): Cloud Run `https://superfluid-dashboard-1095249147821.europe-west1.run.app/`
- Proyecto GCP: `1095249147821` (extraído del subdominio) · Región: `europe-west1`.
- v2 se despliega sobre esta plataforma; on-chain vía faucet y off-chain vía MongoDB.
- Pendiente: confirmar `project_id` textual y credenciales (gcloud ADC / archivo de servicio).

## Referencia de la plataforma v1 (analizada 2026-10-30)

- Dashboard Web3 «Superfluid EURBETA educativa»: solo lectura hasta conectar MetaMask
  (Codecrypto 81234); balances EUR/EURx, wrap/unwrap, streams de 2000/mes, refresco 5 s.
- Tokens v1 en producción: EUR `0x36C02dA8…F8B570` · EURx `0x7046717d…FAd16E`.
- v2 migrará a BRLT/BrltX y añade panel administrativo + Suite del Empleado.
