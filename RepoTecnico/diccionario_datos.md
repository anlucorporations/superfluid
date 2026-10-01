# Diccionario de Datos — Superfluid EUR Streaming (on-chain)

> El sistema no usa BD relacional: el estado vive en contratos Solidity desplegados en Besu
> Codecrypto (chainId 81234). Este diccionario describe las **estructuras lógicas on-chain**
> como equivalente de tablas. Sincronizado con `diagrama_er.md`. Si se aprueba un backend de
> índice/historial (P3), se añadirán sus tablas aquí + `base_datos.sql`.

## Entidades (estructuras de contrato)

### EUR_TOKEN — Token ERC20 base (`Euro.sol`)

| Campo | Tipo solidity | Descripción | Reglas |
|---|---|---|---|
| `totalSupply` | uint256 | Supply total (inicial 10,000,000e18; hard-cap D11) | inmutable salvo mint/burn dentro del cap |
| `decimals` | uint8 | 18 | fijo en constructor; usado por el frontend |
| `owner` | address | Admin con derechos de mint/burn/wrap-control | una cuenta; transferible |
| balanceOf[account] | mapping(address→uint256) | Saldo EUR por cuenta | ≥ 0 |
| allowance[owner][spender] | mapping(2D) | Aprobaciones ERC20 estándar | |

### SUPER_TOKEN — Super Token `EURx` (`EuroX.sol`, envoltorio 1:1 de EUR)

| Campo | Tipo | Descripción | Reglas |
|---|---|---|---|
| underlying | address | Contrato EUR envuelto | inmutable post-deploy |
| decimals | uint8 | 18 | coincide con EUR_TOKEN; usado por el frontend al formatear cifras |
| realBalanceOf[account] | mapping | EUR custodiados POR CUENTA (parte de la reserva 1:1; una fracción puede estar retenida como depositTotal — RE-02) | reserva total == totalSupply(EURx); no es suma agregada |
| virtualBalanceOf[account] | mapping | Balance EURx en tiempo presente (devengo neteado; NO incluye earnedUnclaimed no reclamado) | derivado, no almacenado |
| earnedUnclaimed[receiver][sender] | mapping uint128 | Devengo liquidado y aún no reclamado (§0 reglas contables casos_uso.md) | pasa a realBalanceOf solo en closeFlow/settle+claimSettled |

### FLOW — Stream activo CFA-simplificado (`flows[sender][receiver]` en EuroX)

| Campo | Tipo | Descripción | Reglas |
|---|---|---|---|
| sender | address | Remitente del flujo | PK compuesto 1 |
| receiver | address | Destinatario | PK compuesto 2; ≠ sender y ≠ contrato token (D15) |
| flowRate | int96 | wei/segundo (positivo = emisor paga) | v1 fijo RATE = 771604938271604 (mes=30d, casos_uso §0) |
| status | enum uint8 | Active(0)/Paused(1)/Closed(2) | sustituye al booleano `paused`; pausado retiene garantía y no devenga |
| lastUpdateTimestamp | uint40 | Último liquidado (block.timestamp) | monotónico; uint40 basta hasta año ~36812 |
| accumulatedBalance | uint128 | EURx ya liquidados al receiver | ≥ 0; invariable mientras status=Paused |

> ⚠️ El campo `deposit` **deja de ser por-flow**: el depósito es **agregado por cuenta**
> `(sender)` en `AGGREGATOR.depositTotal = netOutflowGarantizado × 3600`, **sin techo**
> (D10-bis resuelto en auditoría de casos de uso).

### AGGREGATOR — Resumen por cuenta (depósito agregado + liquidación)

| Campo | Tipo | Descripción |
|---|---|---|
| account | address | titular (PK) |
| netFlowRate | int96 | Σ rates **solo activos** (entrantes − salientes) → gobierna devengo presente y saldo virtual |
| netOutflowGarantizado | int96 | Σ rates salientes **activos+pausados** → gobierna depositTotal; T = cota informativa de adelanto (el trigger real de settle es `virtualBalance ≤ 0`, RE-07c) |
| depositTotal | uint256 | `netOutflowGarantizado × 3600`; se libera solo al cerrar flows (D10) |
| settledUpTo | uint40 | timestamp hasta el que el saldo está liquidado (D9). **SOLO marca temporal** — nunca asiento de deuda. Valor inicial: block.timestamp en la primera mutación de la cuenta |
| pendingDeficit | uint256 | wei impagados tras settle por insolvencia (RE-07b) |
| pendingPool | uint128 | bolsa de residuos < 1 wei del prorrateo; nunca se queman ni duplican |

### PROYECCIÓN getFlow (lectura derivada — RF-07/CU-13)

`getFlow(sender, receiver)` → `{flowRate, status, accumulatedBalance, virtualDevengo = A + rate×(now−L)}` desde FLOW + reloj. `getAccountInfo(account)` → `{netFlowRate, netOutflowGarantizado, depositTotal, settledUpTo, pendingDeficit}` desde AGGREGATOR. Vistas puras, sin gas de mutación.

### FACTORY — Registro de pares (`EuroxFactory.sol`) — decisión D12

| Campo | Tipo | Descripción |
|---|---|---|
| underlying | address | EUR_TOKEN (PK) |
| superToken | address | EURx creado para ese subyacente |
| owner | address | quien puede registrar nuevos pares |

## Relaciones

- EUR_TOKEN 1—1 FACTORY.underlying por par (PK de FACTORY = underlying; v1 registra un único par)
- FACTORY 1—1 SUPER_TOKEN por par (EUR→EURx)
- SUPER_TOKEN 1—∞ FLOW (cada flow vive dentro de su token)
- AGGREGATOR ||--o{ FLOW : "agrega" (depositTotal derivable: Σ salientes activos+pausados × 3600)
- EUR_TOKEN.address 1—∞ FLOW.sender / FLOW.receiver (participantes)
- AGGREGATOR 1—1 por account (dentro de cada EuroX)
