# Superfluid EUR Streaming — v1 beta (CodeCrypto Academy)

Aplicación educativa de **money streaming** con el protocolo Superfluid adaptado: un token ERC20
de prueba `EUR` se envuelve como Super Token propio `EURx` y permite enviar flujos continuos de
**2000 EUR/mes** a múltiples destinatarios sobre la red privada **Hyperledger Besu Codecrypto**
(chainId 81234), gestionada con **Foundry global** del servidor.

> ⚠️ **Limitaciones y aviso legal**: EUR/EURx son tokens de prueba **sin respaldo, valor ni
> conversión posible** a moneda real. Operan solo en la red QBFT educativa. Está prohibido usar
> este sistema para pagos reales (nóminas, alquileres, etc.). Ver [LICENSE.md](LICENSE.md).

## Estructura

```
sc/            Smart contracts (Solidity 0.8.28, Foundry, OpenZeppelin 5.1.0)
  src/Euro.sol           ERC20 hard-cap 10M
  src/EuroX.sol          Super Token con CFA simplificado (flows, settle pull)
  src/EuroxFactory.sol   Registro de pares underlying→superToken
  script/DeployAll.s.sol Despliegue completo con preflight + registro JSON
web/           Dashboard Next.js 15 + React 19 + ethers 5.7.2 + Tailwind
tools/         scripts CI: constants-check, coverage-check, rpc-latency, sync-abi…
RepoTecnico/   Documentación completa (brief, requerimientos, casos de uso, auditorías…)
```

## Requisitos previos

- Foundry global: `export PATH="$HOME/.foundry/bin:$PATH"` (forge/cast 1.8.3 verificados).
- Node ≥ 22.
- Cuenta con fondos CC: solicita en https://faucet.codecrypto.academy/ (máx 100 CC/solicitud).
  Para desarrollo educativo puede usarse la cuenta #0 pública del curso (`0xf39F…2266`).

## 1 · Contratos: compilar, testear, desplegar

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd sc
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git
cp .env.example .env        # NO versionar; ajusta DEPLOYER_PRIVATE_KEY si usas otra cuenta
forge build
forge test                  # suite unitaria (Euro + EuroX)
forge test --match-contract EuroXInvariants   # fuzz de invariantes RNF-08 (~1-2 min)

# Preflight automático: chainId 81234 y saldo CC ≥ 5
source .env
forge script script/DeployAll.s.sol:DeployAllScript \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast
```

El script escribe el registro canónico versionado en `sc/deployments/codecrypto.json`
(networkId + timestamp; re-ejecuciones generan registros nuevos sin corromper — RNF-07).
Verifica en vivo:

```bash
cast call <EURx> "totalSupplyX()(uint256)" --rpc-url $RPC_URL
cd .. && node tools/check-deployments.mjs   # anclado a la raíz del repo
```

### Direcciones activas (red Codecrypto, corridas verificadas)

| Contrato | Dirección |
|---|---|
| EUR | `0x36C02dA8a0983159322a80FFE9F24b1acfF8B570` |
| EuroxFactory | `0x809d550fca64d94Bd9F66E60752A544199cfAC3D` |
| EURx | `0x7046717d32AfcA450DC5D6e75724D4282DFAd16E` |

**Modelo contable V3 (reserva):** el devengo es pasivo dentro del saldo del emisor;
`claimSettled` transfiere saldo real (sin acuñación) y `settle()` reparte proporcionalmente
si hay insolvencia. Limitación aceptada en beta: entre mutaciones, el primer reclamo puede
adelantarse (el mecanismo equitativo es `settle`). Ver `RepoTecnico/casos_uso.md` §0.

Smoke V3 verificado on-chain: wrap → createFlow → pause → resume → close → claimSettled con conservación exacta de `totalSupplyX`.

## 2 · Frontend

```bash
cd web
npm install --legacy-peer-deps
node ../tools/sync-abi.mjs      # regenera src/abi/*.json tras cambios en sc/
npm run dev                     # http://localhost:3000
```

Conecta MetaMask a la red Codecrypto (el botón ofrece switch/add automático):
Chain ID 81234 · RPC `https://besu.alumnos.codecrypto.academy` · nativa CC.
Sin wallet la app funciona en modo solo lectura (nunca hay claves privadas en el bundle).

Uso: envolver EUR→EURx → crear stream (modal de irrevocabilidad antes de firmar) →
ver balances live (polling 5 s con backoff) → pausar/reanudar/cerrar → pestaña Recibidos
para reclamar devengos. Si tu saldo virtual se agota, cualquier cuenta puede llamar `settle()`.

## 3 · Pruebas E2E

```bash
cd web && npx playwright test          # 8 tests en 4 specs: wallet (incl. guard de red negativa), dashboard live-balance, recibidos, axe WCAG
node tools/rpc-latency.mjs 200         # presupuesto RNF-04 (percentiles RPC)
node tools/coverage-check.mjs          # meta-test RNF-03 (RF-MUST ↔ tests existentes)
node tools/constants-check.mjs         # constantes §0 sincronizadas con los docs
```

## 4 · Preview GCP (Cloud Run)

```bash
# build remoto (no requiere docker local)
tar -czf /tmp/cb-src.tgz web cloudbuild-superfluid.yaml
gcloud builds submit /tmp/cb-src --project=mcc-ecommerce --config=cloudbuild-superfluid.yaml
gcloud run deploy superfluid-dashboard --region=europe-west1 --platform=managed \
  --image=europe-west1-docker.pkg.dev/mcc-ecommerce/superfluid/dashboard:<BUILD_ID> \
  --allow-unauthenticated
bash tools/preview-policy-check.sh     # gate RNF-13
```

URL actual: https://superfluid-dashboard-1095249147821.europe-west1.run.app
(acceso abierto = riesgo aceptado documentado; allow-list de IPs del curso pendiente de lista del operador).

## 5 · Custodia de claves (checklist RNF-11)

- [ ] `.env`, keystore y `*.local.json` están cubiertos por `.gitignore` (verificar antes de cada `/push`).
- [ ] La pk usada es SOLO la pública del curso (válida únicamente en la red educativa).
- [ ] Cualquier pk propia nueva: generar fuera del repo, financiar vía faucet, guardar copia cifrada
      del mnemonic en bóveda del titular, y probar restauración importándola en una wallet limpia.
- [ ] Al cierre de beta: considerar `renounceOwnership()` del token EUR (opcional, decisión del owner).

## Limitaciones conocidas de la beta

- Preview abierta (sin allow-list de IPs aún: riesgo aceptado; el RPC académico puede degradar bajo concurrencia — el polling hace backoff automático).
- **El `eth_estimateGas` de la red QBFT académica es intermitente** (relojes de validadores desincronizados inflan el devengo simulado en la estimación). La app lo evita firmando con `gasLimit` explícito por operación (`web/src/lib/superfluid.ts`, objeto `GAS`).
- `deleteFlow(receiver)`: el alias histórico con argumento de receptor quedó como `closeFlow/deleteFlow`; la documentación original del brief usaba deleteFlow como pausa — resuelto a favor de "cerrar" (decisión D10).
- Los créditos pendientes entre mutaciones siguen la regla first-mover descrita arriba.
- Tras cerrar un flujo, la deuda viva del receptor no se ofrece en la UI del emisor (se reclama por la pestaña Recibidos o vía `settle`).

## Documentación técnica

Todo el proceso (brief, requerimientos RF/RNF/RT, decisiones D1–D16, casos de uso Gherkin/EARS,
diagramas Mermaid, documento técnico con nota comparativa CFA real vs envoltorio propio, e
informes de auditoría V1/V2) vive en [`RepoTecnico/`](RepoTecnico/).

## Licencia

MIT © CodeCrypto Academy / anlucorporations — ver [LICENSE.md](LICENSE.md).
