# Diagramas de secuencia — operaciones clave

> Complementan `../casos_uso.md`. Todos los firmantes son wallets del navegador; el backend
> nunca firma ni custodia transacciones.

## 1. CU-01 / CU-13 — Entrada única por wallet (`/entrar`) y autenticación SIWE

> La entrada es ahora única: la wallet conectada decide el portal **antes de firmar**
> (`POST /api/auth/role`, sin firma ni sesión), y después demuestra su identidad con la
> firma SIWE del propósito que corresponde (`web/src/components/EntryLogin.tsx:42-84`).

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuario (wallet)
    participant E as /entrar (EntryLogin)
    participant API as Backend (Next.js)
    participant DB as MongoDB
    participant RPC as Red 81234/31337

    U->>E: «Entrar con wallet»
    E->>RPC: eth_chainId
    alt chainId ≠ esperada
        E->>U: wallet_addEthereumChain
    end
    E->>RPC: connectWallet (eth_requestAccounts)
    E->>API: POST /api/auth/role {wallet}
    API->>DB: admin_allowlist → employees
    alt admin activo
        API-->>E: role=admin · suite=/admin
    else empleado activo o en retiro
        API-->>E: role=empleado · suite=/suite
    else sin alta
        API-->>E: role=ninguno · suite=null
        E-->>U: error «pide alta al administrador»
    end
    E->>API: POST /api/auth/nonce {wallet, purpose=admin|suite}
    API->>DB: guardar nonce (TTL 5 min)
    API-->>E: nonce EIP-4361
    E->>U: firmar mensaje SIWE
    U-->>E: firma
    E->>API: POST /api/auth/verify {mensaje, firma}
    API->>API: ecrecover + dominio + chainId
    API->>DB: consumir nonce (un solo uso)
    API->>DB: crear sesión (admin 2 h / empleado 8 h)
    API-->>E: cookie Secure/HttpOnly/SameSite=Strict + CSRF token
    E-->>U: router.replace(suite) → portal habilitado
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

## 5. CU-16 — Cobro autónomo del empleado (`downgrade`, libre)

> El cobro se audita en `/api/suite/actions`, que **verifica la tx contra la cadena antes
> de registrarla** (`web/src/app/api/suite/actions/route.ts:16-63`). El cobro autónomo
> («Cobro autónomo», sin elegir flujo) **también queda sujeto al tope del 80%**: la
> verificación del tope se aplica a todo `cobro` verificado en la API
> (`actions/route.ts:41-44`), porque ambos consumen el mismo límite acumulado
> (`meta.operacion="cobro"`). Lo que hace distinto al downgrade de flujo de CU-17 es que
> exige `flowId` y su UI se guía por las fichas de límites de `/api/suite/me`.

```mermaid
sequenceDiagram
    autonumber
    actor E as EMPLEADO
    participant UI as Suite (/suite)
    participant API as Backend
    participant DB as MongoDB
    participant RPC as Red (81234/31337)
    participant X as BrltX.sol
    participant B as Brlt.sol

    E->>UI: «Cobro autónomo» + importe
    UI->>UI: validar importe ≤ saldo BrltX y CC para gas
    alt sin CC
        UI-->>E: bloquear + faucet (máx. 100 CC)
    else válido
        E->>X: downgrade(importe)
        X->>B: transfer(empleado, importe)
        X-->>RPC: evento Downgraded
        RPC-->>UI: receipt (txHash)
        UI->>API: POST /api/suite/actions {operacion=cobro, txHash}
        API->>RPC: eth_getTransactionReceipt(txHash)
        API->>API: verificar from == sesión y evento Downgraded(account=sesión)
        alt tx no verificada
            API-->>UI: 422 tx_no_verificada (no se audita)
        else verificada
            API->>DB: audit_events(accion=flujo, meta.operacion=cobro, meta.amount)
            API-->>UI: cobro registrado
        end
        UI-->>E: saldo BRLT actualizado
    end
```

> Nota: el devengo pendiente de un flujo **activo** solo se acredita a BrltX al liquidar
> on-chain (`settleFlow` exige vencimiento, `sc/src/BrltX.sol:208`); el cobrable real del
> empleado es el BrltX ya acreditado en su cartera.

## 6. CU-17 — Downgrade de flujo con tope acumulado del 80%

> Nuevo en commit aab670e. La limitación vive en el backend
> (`web/src/lib/downgrade-limit.ts`) y se exige **antes de auditar** el cobro
> (`web/src/app/api/suite/actions/route.ts:38-44`). El empleado elige un flujo concreto
> desde la ficha «Downgrade de flujos» del portal (`web/src/app/suite/page.tsx:373-481`).

```mermaid
sequenceDiagram
    autonumber
    actor E as EMPLEADO
    participant UI as Suite (/suite)
    participant API as Backend
    participant DB as MongoDB
    participant RPC as Red (81234/31337)
    participant X as BrltX.sol

    E->>UI: abrir portal
    UI->>API: GET /api/suite/me
    API->>DB: flujos del receptor (deposited)
    API->>DB: audit_events con meta.operacion=cobro (usado)
    API-->>UI: limites {asignadoTotal, downgradeMaximo=80%<br/>(floor al wei), downgradeUsado, downgradeDisponible}

    UI->>UI: descargable = min(BrltX en cartera, disponible del tope)
    E->>UI: elegir flujo + importe (botón «Máximo» = descargable)
    E->>X: downgrade(importe)
    X-->>RPC: evento Downgraded
    RPC-->>UI: receipt (txHash)
    UI->>API: POST /api/suite/actions {operacion=cobro, flowId, txHash}
    API->>RPC: eth_getTransactionReceipt(txHash)
    API->>API: verificar from, evento y operacion
    API->>DB: recalcular límite (asignado − usado)
    alt usado + importe > 80% del asignado
        API-->>UI: 422 tope_80_superado (cobro no auditado)
    else dentro del tope
        API->>DB: audit_events(meta.operacion=cobro, meta.amount, meta.via=suite)
        API-->>UI: downgrade registrado
    end
    UI-->>E: fichas actualizadas (asignado / tope 80% / ya descargado / disponible)
```

**Reglas del tope (CU-17):**

- `asignadoTotal` = suma de `deposited` de **todos** los flujos del receptor, vivos o
  terminados (`web/src/lib/downgrade-limit.ts:65-78`); la verdad es el contrato vía Mongo
  reconciliada.
- `downgradeMaximo` = `floor(asignadoTotal × 80 / 100)` al wei (`DOWNGRADE_CAP = 80/100`,
  `web/src/lib/downgrade-limit.ts:19-36`).
- `downgradeUsado` se reconstruye de `audit_events` con `meta.operacion = "cobro"` (eventos
  `Downgraded` verificados contra la cadena; hasta 1000 eventos, importes corruptos se
  ignoran sin bloquear).
- `downgradeDisponible` = `maximo − usado`, nunca negativo.
- La API exige el tope **antes** de auditar el nuevo cobro (`assertDowngradeLimit`),
  lanzando `422 tope_80_superado` o `422 importe_invalido` (importe ≤ 0).
- Se mantiene además el «Cobro autónomo» libre de CU-16: ambos consumen el mismo tope
  porque comparten la operación `downgrade` y la auditoría `meta.operacion = "cobro"`.

## 7. CU-09 — Lote de hasta 10 flujos

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

## 8. CU-14 — Suite con flujo vencido

```mermaid
sequenceDiagram
    autonumber
    actor E as EMPLEADO
    participant UI as Suite
    participant RPC as Red (81234/31337)
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

## 9. Validación continua de la wallet en `/suite` (CU-13 / CU-14 / CU-16)

> Nuevo en commit aab670e. Mientras el portal está abierto, la cuenta activa de la wallet
> se compara con la sesión (`eth_accounts`), en el evento `accountsChanged` y con un poll
> de 10 s (`web/src/app/suite/page.tsx:117-141`). Si diverge, el portal avisa y exige
> revalidar en `/entrar`; no se firma ninguna transacción nueva.

```mermaid
sequenceDiagram
    autonumber
    actor E as EMPLEADO
    participant W as Wallet (EIP-1193)
    participant UI as Suite (/suite)
    participant API as Backend

    UI->>API: GET /api/auth/me (sesión + rol)
    alt sin sesión
        API-->>UI: 401 → router.replace("/entrar")
    else rol admin
        API-->>UI: session.role ≠ empleado → router.replace("/admin")
    else rol empleado
        API-->>UI: sesión válida → portal operando
    end

    loop poll cada 10 s y en accountsChanged
        UI->>W: eth_accounts
        W-->>UI: cuentas activas
        alt cuentas[0] ≠ session.wallet
            UI-->>E: aviso «Wallet distinta a tu sesión»
            UI-->>E: botón «validar tu wallet» → /entrar
        else coincide
            UI-->>E: sin aviso, operativa normal
        end
    end

    E->>UI: operación firmada (cobro / downgrade)
    UI->>W: connectWallet (devuelve cuenta activa)
    alt cuenta ≠ sesión
        UI-->>E: error «la wallet conectada no es la de tu sesión» (no se firma)
    else coincide
        UI->>W: firmar transacción
    end
```

> La validación continua no interrumpe el refresco de datos de 5 s (`RF-08`); solo bloquea
> la firma de nuevas transacciones hasta que el empleado revalida en `/entrar`.

---

*Actualizado 2026-11-17 · commit aab670e*
