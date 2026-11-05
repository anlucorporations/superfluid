# Diagramas de secuencia — operaciones clave

> Complementan `../casos_uso.md`. Todos los firmantes son wallets del navegador; el backend
> nunca firma ni custodia transacciones.

## 1. CU-01 / CU-13 — Autenticación SIWE (admin y empleado)

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario (wallet)
    participant UI as Panel / Suite
    participant API as Backend (Next.js)
    participant DB as MongoDB
    participant RPC as Besu 81234

    U->>UI: Conectar wallet
    UI->>RPC: eth_chainId
    alt chainId ≠ 81234
        UI->>U: wallet_addEthereumChain(81234)
    end
    UI->>API: GET /api/auth/nonce
    API->>DB: guardar nonce (TTL 5 min)
    API-->>UI: nonce EIP-4361
    UI->>U: firmar mensaje SIWE
    U-->>UI: firma
    UI->>API: POST /api/auth/verify {mensaje, firma}
    API->>API: ecrecover + dominio + chainId
    API->>DB: consumir nonce (un solo uso)
    alt admin
        API->>DB: comprobar admin_allowlist
    else empleado
        API->>DB: wallet activa o ventana de retiro
    end
    API->>DB: crear sesión (admin 2 h / empleado 8 h)
    API-->>UI: cookie Secure/HttpOnly/SameSite=Strict + CSRF token
    UI-->>U: portal habilitado
```

## 2. CU-06 — Iniciar un flujo programado

```mermaid
sequenceDiagram
    autonumber
    actor A as ADMIN
    participant UI as Panel admin
    participant RPC as Besu 81234
    participant B as Brlt.sol
    participant X as BrltX.sol
    participant DB as MongoDB

    A->>UI: «Iniciar flujo on-chain»
    UI->>DB: leer registro «próximo»
    UI->>RPC: balance BRLT/CC + getFlow
    alt falta saldo o CC
        UI-->>A: bloquear + sugerir mint o faucet
    else allowance insuficiente
        A->>B: approve(BrltX, monto)
    end
    A->>X: wrapAndCreateFlow(monto, wallet, duración)
    X->>B: transferFrom(admin, BrltX, monto)
    X->>X: Flow{rate=floor, startedAt, endsAt}
    X-->>RPC: evento FlowCreated
    RPC-->>UI: receipt
    UI->>DB: scheduled_flows.estado = ejecutado + tx_hash
    UI->>DB: flows_history += FlowCreated
    UI-->>A: flujo activo
```

## 3. CU-03 — Cambio de wallet atómico (AC-03)

```mermaid
sequenceDiagram
    autonumber
    actor A as ADMIN
    actor N as Wallet nueva
    participant UI as Panel admin
    participant API as Backend
    participant DB as MongoDB
    participant X as BrltX.sol

    A->>UI: iniciar cambio de wallet
    UI->>N: solicitar firma EIP-712
    N-->>UI: firma(empleado + walletA + walletB)
    UI->>API: verificar autorización
    API->>API: ecrecover + binding
    API-->>UI: OK + reto de step-up
    A->>UI: firmar step-up EIP-712
    UI->>API: validar step-up
    API->>DB: audit_events(cambio_wallet)
    alt existe flujo activo
        A->>X: changeReceiver(A, B, monto, duración)
        X->>X: liquidar flujo A + crear flujo B (una tx)
        X-->>UI: receipt o revert
        alt revert
            UI-->>A: error decodificado, sin cambios
        else confirmado
            UI->>DB: employees.wallet = B
        end
    else sin flujo
        UI->>DB: employees.wallet = B
    end
    UI-->>A: cambio completado
```

## 4. CU-08 — Liquidación de un flujo vencido (`settleFlow` público)

```mermaid
sequenceDiagram
    autonumber
    actor T as Cualquiera (admin, empleado o tercero)
    participant UI as Panel / Suite
    participant RPC as Besu 81234
    participant X as BrltX.sol
    participant DB as MongoDB

    T->>UI: pulsar «Liquidar»
    UI->>RPC: getFlow(sender, receiver)
    alt block.timestamp < endsAt
        UI-->>T: aún activo, no se puede liquidar
    else vencido y no terminado
        T->>X: settleFlow(sender, receiver)
        X->>X: devengado = rate × (endsAt - inicio)
        X->>X: acreditar BrltX al empleado
        X->>X: devolver remanente al admin
        X-->>RPC: evento FlowSettled / FlowExpired
        RPC-->>UI: receipt
        UI->>DB: flows_history += evento
        UI-->>T: flujo terminado
    end
```

## 5. CU-16 — Cobro del empleado (`downgrade`)

```mermaid
sequenceDiagram
    autonumber
    actor E as EMPLEADO
    participant UI as Suite
    participant RPC as Besu 81234
    participant X as BrltX.sol
    participant B as Brlt.sol

    E->>UI: abrir «Mi saldo»
    UI->>RPC: balanceOf(BrltX, wallet)
    alt flujo vencido pendiente
        E->>X: settleFlow(sender, receiver)
        X-->>UI: BrltX acreditado
    end
    E->>UI: «Cobrar» (total o parcial)
    UI->>UI: validar importe ≤ saldo y CC para gas
    alt sin CC
        UI-->>E: bloquear + faucet (máx. 100 CC)
    else válido
        E->>X: downgrade(importe)
        X->>B: transfer(empleado, importe)
        X-->>RPC: Transfer / evento
        RPC-->>UI: receipt
        UI-->>E: saldo BRLT actualizado
    end
```

## 6. CU-09 — Lote de hasta 10 flujos

```mermaid
sequenceDiagram
    autonumber
    actor A as ADMIN
    participant UI as Panel admin
    participant DB as MongoDB (batches)
    participant X as BrltX.sol
    participant RPC as Besu 81234

    A->>UI: cargar hasta 10 filas
    UI->>UI: validar total BRLT y rates (floor)
    A->>UI: firmar approve único del lote
    loop cada fila (una tx por flujo)
        A->>X: wrapAndCreateFlow(fila)
        X-->>RPC: receipt
        RPC-->>UI: txHash
        UI->>DB: fila = confirmada + txHash
    end
    alt interrupción del navegador
        UI->>DB: leer progreso guardado
        UI->>RPC: getFlow para filas dudosas (anti doble pago)
        UI-->>A: reanudar solo filas no confirmadas
    end
    UI-->>A: progreso N/10
```

## 7. CU-14 — Suite con flujo vencido

```mermaid
sequenceDiagram
    autonumber
    actor E as EMPLEADO
    participant UI as Suite
    participant RPC as Besu 81234
    participant DB as MongoDB (flows_history)

    loop cada tasa_refresco_ms (default 5 s)
        UI->>RPC: getFlow + getRealtimeBalance
        UI->>DB: próximos y terminados
        alt flujo vencido
            UI-->>E: etiqueta «vencido pendiente de liquidación» + botón Liquidar
        else terminado
            UI-->>E: acumulado final congelado
        end
    end
```
