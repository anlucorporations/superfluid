# Diagrama Entidad-Relación — Modelo lógico on-chain

> Equivalente ER del estado en contratos (no hay BD relacional en v1; ver `requerimientos.md` §5).
> Nombres idénticos a `diccionario_datos.md`. Sincronizado.

```mermaid
erDiagram
    EUR_TOKEN ||--o| FACTORY : "registrado en"
    FACTORY ||--|| SUPER_TOKEN : "crea par"
    SUPER_TOKEN ||--o{ FLOW : "transporta"
    SUPER_TOKEN ||--o{ AGGREGATOR : "agrega por cuenta"
    AGGREGATOR ||--o{ FLOW : "garantiza"

    EUR_TOKEN {
        address contract_address PK "Euro.sol desplegado"
        uint256 total_supply "hard-cap 10_000_000e18 (D11)"
        address owner "mint/burn hasta cap; EOA #0 Anvil"
    }

    FACTORY {
        address underlying PK_FK "EUR_TOKEN (1:1 por par)"
        address superToken "EURx del par"
        address owner "registro de pares"
    }

    SUPER_TOKEN {
        address contract_address PK "EuroX.sol (EURx)"
        address underlying FK "EUR_TOKEN"
        uint8 decimals "18 (sync diccionario)"
    }

    FLOW {
        address sender PK_FK "participante emisor"
        address receiver PK_FK "participante receptor"
        int96 flowRate "wei/s, RATE fijo 2000 EUR/mes (mes=30d)"
        uint8 status "enum Active(0) Paused(1) Closed(2)"
        uint40 lastUpdateTimestamp "block ts"
        uint128 accumulatedBalance "liquidado al receiver; invariable si Paused"
    }

    AGGREGATOR {
        address account PK "titular"
        int96 netFlowRate "solo activos; gobierna devengo presente"
        int96 netOutflowGarantizado "activos+pausados; gobierna deposito y T"
        uint256 depositTotal "netOutflowGarantizado x 3600 sin techo (D10-bis)"
        uint40 settledUpTo "SOLO timestamp (RE-07b)"
        uint256 pendingDeficit "wei impagados tras settle"
        uint128 pendingPool "residuos <1 wei del prorrateo"
    }
```

## Notas

- Clave primaria de `FLOW`: `(sender, receiver)` dentro de cada EuroX — mapeada en
  `mapping(address => mapping(address => Flow))`.
- El **depósito es agregado por cuenta** (`AGGREGATOR.depositTotal = netOutflowGarantizado × 3600`,
  sin techo), no por flow (decisión D10-bis, auditoría de casos de uso).
- Dos tasas nombradas: `netFlowRate` (solo activos → saldo virtual/devengo) y
  `netOutflowGarantizado` (activos+pausados → depósito y divisor T de D9). Ver `casos_uso.md §0`.
- Liquidación pull: `settle()` marca y cierra; receptores reclaman con `claimSettled()`;
  déficit en `pendingDeficit`; residuos en `pendingPool`. `settledUpTo` es solo timestamp.
- `status` enum sustituye al booleano `paused` (isomorfismo con base_datos.sql condicional).
- Convención de producto: mes = 30 × 86400 s; RATE = floor(2000e18/2592000) = 771604938271604 wei/s.
- `FACTORY` conservado por decisión D12 (par único EUR→EURx en v1; base multi-moneda futura).
- `AGGREGATOR` es entidad derivada (cálculo incremental on-chain), no tabla física.
- Proyección de lectura RF-07: `getFlow`/`getAccountInfo` documentada en diccionario (§PROYECCIÓN).
