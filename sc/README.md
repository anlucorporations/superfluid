# `sc/` — Contratos de Superfluid Brlt Streaming v2

Foundry + OpenZeppelin 5.1.0 + Solidity 0.8.28 (EVM `cancun`).

## Contratos

| Contrato | Responsabilidad | RF |
|---|---|---|
| `src/Brlt.sol` | Token de nómina ERC-20 «CriptoPeso» (BRLT), 18 decimales, supply inicial 10 M, tope 50 M, minter explícito, `Ownable2Step`. | RF-01 |
| `src/BrltX.sol` | Super Token 1:1 y motor de flujos continuos: `upgrade/downgrade`, `wrapAndCreateFlow`, `updateFlow`, `changeReceiver`, `deleteFlow`, `settleFlow`, `getFlow`, `getRealtimeBalance`. | RF-02, RF-03, RF-04, RF-12, RF-21 |

## Instalación (dependencias no versionadas)

```bash
cd sc
forge install foundry-rs/forge-std --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git
```

## Comandos

```bash
forge build                       # compila
forge test                        # 44 tests (unitarios + fuzz + invariantes)
forge test --gas-report           # informe de gas
forge coverage --report summary   # cobertura
forge fmt --check                 # estilo
```

## Modelo de flujo (resumen)

- `flowRate = amount / durationSeconds` con **floor al wei**. El residuo queda en
  escrow y se devuelve al admin al liquidar/terminar.
- Cada par `(sender, receiver)` puede tener **varios flujos** (AC-23); el
  identificador global es `flowId`.
- Pausa = `updateFlow(flowId, 0)`; al reanudar, `endsAt` se prolonga por el tiempo
  pausado (el empleado no pierde devengo).
- Fin de flujo (AC-02): al vencer queda «vencido pendiente de liquidación» y
  **cualquier cuenta** puede llamar `settleFlow`.
- `Pausable` de emergencia bloquea crear/actualizar/cambiar receptor, pero **no**
  `settleFlow`, `deleteFlow` ni `downgrade` (AC-07).
- Invariante: `brlt.balanceOf(BrltX) == BrltX.totalSupply() + BrltX.totalEscrow()`.

## Deploy

Scripts en `script/`:

| Script | Función |
|---|---|
| `DeployAll.s.sol` | Despliega BRLT + BrltX, propone y acepta el ownership en la misma sesión, reasigna el minter al admin, valida y escribe `deployments/<chainId>.json`. |
| `DeployBrlt.s.sol` | Solo el token BRLT con el mismo traspaso gobernado. |
| `CheckDeployment.s.sol` | Verificación de solo lectura (owner, minter, supply, link, respaldo). |
| `Smoke.s.sol` | Crea un flujo pequeño y lo termina en la misma sesión (prueba de humo real). |

```bash
cp .env.example .env    # rellenar ADMIN_PRIVATE_KEY y, si se usa, DEPLOYER_PRIVATE_KEY
forge script script/DeployAll.s.sol \
  --rpc-url https://besu.alumnos.codecrypto.academy \
  --legacy --with-gas-price 1000 --broadcast
```

Detalle del runbook, custodia y sucesión en `RepoTecnico/entornos_globales.md`.
