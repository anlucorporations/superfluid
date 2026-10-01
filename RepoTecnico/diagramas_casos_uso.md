# Diagramas de Casos de Uso — Superfluid EUR Streaming v1

> Generados tras la auditoría de `casos_uso.md` (Fase 2). Coherentes con los casos auditados:
> mismos actores, mismos nombres, mismas precondiciones. Formato Mermaid (renderizable en GitLab/VS Code).

## 1. Diagrama de casos de uso UML

```mermaid
flowchart LR
    subgraph Actores
        E([Emisor])
        R([Receptor])
        K([Cualquier cuenta / keeper])
        O([Owner Admin - cuenta #0])
        V([Visitante preview])
    end
    subgraph Sistema["Superfluid EUR Streaming (Besu 81234)"]
        CU01[CU-01 Envolver EUR→EURx]
        CU02[CU-02 Desenvolver EURx→EUR]
        CU03[CU-03 Crear stream]
        CU04[CU-04 Balances en tiempo real]
        CU05[CU-05 Pausar/reanudar]
        CU06[CU-06 Cerrar stream]
        CU07[CU-07 Settle insolvencia pull]
        CU08[CU-08 Ver flows recibidos]
        CU09[CU-09 Conectar wallet red]
        CU10[CU-10 Desplegar sistema]
        CU11[CU-11 Financiar faucet]
        CU12[CU-12 Preview GCP]
        CU13[CU-13 getFlow detalle]
        MODAL{{aviso irrevocabilidad D15}}
        POLL{{polling backoff D8}}
    end
    E --> CU01 & CU02 & CU03 & CU04 & CU05 & CU06 & CU09 & CU13
    R --> CU02 & CU08 & CU13
    K --> CU07
    O --> CU10 & CU11
    V --> CU12
    E -.->|solo lectura sin MetaMask| CU04
    CU03 -.->|include| MODAL
    CU04 -.->|include| POLL
    CU08 -.->|include| POLL
    CU05 -.->|extend desde CU-03 flow existente| CU03
    CU06 -.->|extends| CU03
    CU07 -.->|si insolvencia| CU03
```

## 2. Secuencia — Crear stream y streaming continuo (CU-03 + CU-04)

```mermaid
sequenceDiagram
    participant W as Wallet Emisor (MetaMask)
    participant UI as Dashboard Next.js
    participant X as EuroX.sol (Besu 81234)
    participant Rec as Receptor
    UI->>W: request conectar (chainId 81234)
    W-->>UI: accounts (D2: nunca pk en bundle)
    UI->>X: createFlow(receiver, RATE)
    Note over X: valida ≠self, ≠token, saldo libre ≥ DEP_1<br/>depositTotal = netOutflowGarantizado×3600
    X-->>UI: FlowCreated(sender, receiver, RATE)
    loop cada segundo on-chain (block time QBFT 2 s)
        X->>X: devengo virtual += RATE×dt a receiver −RATE×dt a sender
    end
    loop polling base 5 s (RE-04 serializado)
        UI->>X: staticCall getAccountInfo / virtualBalanceOf
        X-->>UI: saldos en tiempo presente
        alt timeout > 25 s o error
            UI->>UI: backoff 15 s → 30 s; banner "conexión degradada"
        else 3 éxitos consecutivos
            UI->>UI: vuelve a 5 s
        end
    end
    Rec->>X: downgrade/retirada permitida (saldo libre)
```

## 3. Secuencia — Insolvencia: settle + claim (CU-07, patrón PULL)

```mermaid
sequenceDiagram
    participant K as Keeper (cualquiera)
    participant X as EuroX.sol
    participant R1 as Receptor 1
    participant R2 as Receptor 2
    Note over X: trigger V3: owed > realBalanceOf(emisor)<br/>tras materializar (⇔ virtual ≤ 0; el reloj NO habilita)
    K->>X: settle(emisor) — revert "not insolvent" si sigue solvente
    X->>X: liquidar hasta instante exacto de agotamiento
    X->>X: status=Closed en todos los salientes; settledUpTo=ts (SOLO timestamp)
    X->>X: déficit → pendingDeficit; residuos <1 wei → pendingPool
    X-->>K: Settled(emisor, settledUpTo, deficit)
    par prorrateo por flowRate nominal (orden de iteración solo para residuos wei)
        R1->>X: claimSettled()
        X-->>R1: parteNominal (rate/Σrates × real, tope debido)
    and
        R2->>X: claimSettled()
        X-->>R2: parte prorrateada
    end
    Note over X,R2: assert conservación: sum(salidas reales) == EURx disponibles<br/>settle repetido = no-op idempotente
```

## 4. Secuencia — Ciclo de vida de un flow (estados)

```mermaid
stateDiagram-v2
    [*] --> Active: CU-03 createFlow\nbloquea DEP incremental
    Active --> Paused: CU-05 pauseFlow\nno devenga, retiene garantía
    Paused --> Active: CU-05 resumeFlow\naccumulatedBalance invariable
    Active --> Closed: CU-06 closeFlow (solo sender)\nlibera RATE×3600
    Paused --> Closed: CU-06 closeFlow
    Active --> Closed: CU-07 settle por insolvencia\n(pull: claimSettled posterior)
    Paused --> Closed: CU-07 settle (participa con rate nominal)
    Closed --> [*]: depósito liberado/transfereido,\ndéficit en pendingDeficit si aplica
```

## 5. Diagrama de componentes (contexto para documento técnico)

```mermaid
flowchart TB
    subgraph Browser [Navegador del estudiante]
        MM[MetaMask / wallet]
        NEXT[Next.js 15 Dashboard\nweb/src/app + components/Dashboard.tsx]
        SF[lib/superfluid.ts\nupgrade/downgrade/create/pause/close/get/settle/claim]
        CFG[config/web3.ts\nchainId 81234, addresses, RATE]
        NEXT --> SF --> CFG
    end
    subgraph Besu ["Red Codecrypto Besu (QBFT, block 2s)"]
        EURO[Euro.sol ERC20 cap 10M]
        FAC[EuroxFactory.sol]
        EURX[EuroX.sol SuperToken\nflows + aggregator + settle]
        FAC -->|crea par| EURX
        EURX -->|custodia 1:1| EURO
    end
    subgraph GCP [GCP mcc-ecommerce]
        CR[Cloud Run frontend\nallow-list IPs curso]
    end
    MM -->|firma mutaciones| EURX
    SF -->|polling RPC HTTPS p90 4.5s| EURX
    NEXT -.->|deploy imagen Docker| CR
    CR -->|bundle estático| Browser
    FAUCET[faucet.codecrypto.academy] -.->|financia CC ≤100/solicitud| MM
```
