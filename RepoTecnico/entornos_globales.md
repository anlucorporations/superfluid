# Entornos Globales — Superfluid EUR Streaming

## Red blockchain (destino de despliegue)

| Variable | Valor | Verificado |
|---|---|---|
| NETWORK_NAME | Codecrypto | faucet portal |
| CHAIN_ID | 81234 (`0x13d52`) | `eth_chainId` ✔ |
| RPC_URL | https://besu.alumnos.codecrypto.academy | `web3_clientVersion` = besu/v24.12.0 ✔ |
| NATIVE_CURRENCY | CC (18 dec) | faucet portal |
| GAS_PRICE | 1 gwei (`0x3e8`) | `eth_gasPrice` ✔ |
| FAUCET | https://faucet.codecrypto.academy/ (máx 100 CC/solicitud) | portal ✔ |

## Herramientas globales del servidor (no por proyecto)

| Herramienta | Ruta / comando | Versión verificada |
|---|---|---|
| forge | `~/.foundry/bin/forge` | 1.8.3 (2026-09-15) |
| cast | `~/.foundry/bin/cast` | 1.8.3 |
| anvil | `~/.foundry/bin/anvil` | 1.8.3 (uso: tests locales si hiciera falta) |
| chisel | `~/.foundry/bin/chisel` | 1.8.3 |
| node / npm | sistema | v22.23.2 / 10.9.8 |
| chromium headless | `/home/dsh/tools` + `source /home/dsh/workspace/herramientas-env.sh` | 153.x (E2E Fase 4) |
| psql | global | 16.2 (sin uso en v1 on-chain) |

> Añadir a PATH o usar wrappers: `export PATH="$HOME/.foundry/bin:$PATH"`.

## Variables de entorno del proyecto

### sc/.env (NO versionar; `.gitignore` obligatorio)

```bash
RPC_URL=https://besu.alumnos.codecrypto.academy
CHAIN_ID=81234
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# ^ pk PÚBLICA del curso = cuenta #0 Anvil (D11): 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
# Balance verificado en Besu: 89 CC ✔. Asumible solo en red educativa privada.
```

> La cuenta generada `0xFFf3…12b9` fue **retirada** (pk expuesta en chat); su archivo local
> `RepoTecnico/.deployer_wallet.local.json` fue eliminado (2026-09-30).

### web/.env.local

```next
NEXT_PUBLIC_RPC_URL=https://besu.alumnos.codecrypto.academy
NEXT_PUBLIC_CHAIN_ID=81234
NEXT_PUBLIC_EUR_ADDRESS=<post-deploy>
NEXT_PUBLIC_EURX_ADDRESS=<post-deploy>
```

## Secretos / referencias globales existentes

- Cargador general: `source /home/dsh/workspace/gcp-env.sh` (proyecto GCP `mcc-ecommerce`).
- Secret Manager: `ADMIN_PRIVATE_KEY` (pk cuenta #0 Anvil documentada en
  `/home/dsh/workspace/CUENTAS-ANVIL-GCP.md`) — **solo válida en la red MCC-Anvil, no en Besu**;
  en Besu las cuentas deben financiarse por faucet.
- RPC alterno global: `MCC_ANVIL_RPC_URL=https://mcc-foundry-anvil-1095249147821.europe-west1.run.app`
  (no usado en este proyecto salvo decisión alternativa).

## Comandos clave

```bash
# Conectividad
curl -s -X POST $RPC_URL -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'

# Build & test contratos
cd sc && forge build && forge test -vvv

# Deploy a Besu
source sc/.env
forge --version >/dev/null || export PATH="$HOME/.foundry/bin:$PATH"
forge script sc/script/DeployAll.s.sol:DeployAllScript \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast

# Balance nativa
cast balance <address> --rpc-url $RPC_URL

# Frontend
cd web && npm install && npm run dev   # http://localhost:3000
```

## Datos de red medidos en vivo (auditoría V1, 2026-09-29)

| Métrica | Valor | Implicación |
|---|---|---|
| Block time QBFT | **2 s exactos** (40 bloques consecutivos) | polling 5 s = 2.5 bloques ✔ |
| Latencia RPC secuencial (n=200) | p50 0.21 s · p90 4.45 s · p95 ~20 s · timeouts ~3.5 % | RNF-04 + backoff |
| Latencia concurrente (8 hilos) | 47.9 % fallos | preview con allow-list (RNF-13) |
| `eth_subscribe` / ws | no habilitado (-32604 / 404) | polling es la única vía ✔ |

## Repositorios

- GitLab (origen): https://gitlab.com/anlucorporations/superfluid.git · rama `superfluid-DSH-GCP`
- GitLab institucional: https://gitlab.codecrypto.academy/anlucorporations/superfluid.git · rama `superfluid-DSH-GCP` (rama existente verificada vía `git ls-remote`)
- Sin GitHub. Política: push solo con orden explícita `/push`.

## Despliegue preview (aprobado P5)

- Cloud Run en proyecto GCP `mcc-ecommerce`, región de servicios `europe-west1`
  (`source /home/dsh/workspace/gcp-env.sh`). Frontend Next.js standalone → imagen Docker → Cloud Run.
