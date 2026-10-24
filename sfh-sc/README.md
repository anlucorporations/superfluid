# sfh-sc — Contratos SFhostpot (H1)

Contratos del Super Token propio **BarloventoTx (BRLTx)** sobre **BarloventoToken (BRLT)**,
adaptados del proyecto v1 (`Euro`/`EuroX`/`EuroxFactory`) con:
- Renombrado a BRLT/BRLTx/BarloventoFactory (D2/P2).
- `ReentrancyGuard` + CEI en todas las funciones que mutan estado (D34/D40).
- **Gate de apertura de 1 h**: `createFlow` exige `rate × 3600` (D54).
- Eventos y semántica CFA conservados (wrap 1:1, pause/resume/close, settle pull, claim).

## Comandos

```bash
export PATH="$HOME/.foundry/bin:$PATH"
forge build
forge test                 # 44 tests (incl. invariantes fuzz)
cp .env.example .env       # NO versionar
forge script script/DeployAll.s.sol:DeployAllScript \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast
```

## Despliegue H1 (Besu 81234, 2026-10-17)

| Contrato | Dirección |
|---|---|
| BRLT | `0x99aA73dA6309b8eC484eF2C95e96C131C1BBF7a0` |
| BarloventoFactory | `0x98721EFD3D09A7Ae662C4D63156286DF673FC50B` |
| BRLTx | `0x6540b8f49168c6896d85f05b5ca8AdAaaEB65be0` |

Registro canónico: [`deployments/codecrypto.json`](deployments/codecrypto.json).
Smoke en vivo: wrap 1000 BRLT, `createFlow` rate 0.0005/s (garantía 1.8 BRLT = 1 h),
`closeFlow` → estado Closed con devengo 1e15. Transacciones en `broadcast/`.
