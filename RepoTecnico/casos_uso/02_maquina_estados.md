# Máquina de estados — flujo on-chain y flujo programado

> Fuente canónica: `../casos_uso.md` §3 y §3.1; `../diccionario_datos.md`.
> Decisiones aplicadas: AC-02 (liquidación perezosa) y AC-05 (estados de programación).

## 1. Ciclo de vida del flujo on-chain (BrltX)

```mermaid
stateDiagram-v2
    [*] --> proximo: CU-05 programa<br/>(solo MongoDB)
    proximo --> activo: wrapAndCreateFlow<br/>(admin, CU-06)
    proximo --> cancelado: admin cancela<br/>(CU-05-A6)
    activo --> pausado: updateFlow(0)<br/>(CU-07)
    pausado --> activo: updateFlow(rate original)<br/>(CU-07)
    activo --> vencido: block.timestamp >= endsAt
    pausado --> vencido: block.timestamp >= endsAt
    vencido --> terminado: settleFlow(sender, receiver)<br/>(público, AC-02)
    activo --> terminado: deleteFlow<br/>(admin, CU-08)
    pausado --> terminado: deleteFlow<br/>(admin, CU-08)
    terminado --> [*]

    note right of vencido
        No acumula más.
        Ningún contrato se auto-ejecuta:
        alguien debe pagar el gas.
    end note

    note right of terminado
        El BrltX devengado se acredita
        al empleado y el remanente
        vuelve al admin.
    end note
```

## 2. Estados de `flujos_programados` (AC-05)

```mermaid
stateDiagram-v2
    [*] --> proximo: CU-05 guarda<br/>intención en MongoDB
    proximo --> ejecutado: wrapAndCreateFlow confirmado<br/>(tx_hash)
    proximo --> cancelado: admin cancela
    proximo --> fallido: revert definitivo /<br/>24 h sin firma (AC-14)
    ejecutado --> [*]
    cancelado --> [*]
    fallido --> [*]

    note right of ejecutado
        Terminal. El flujo on-chain
        ya vive en BrltX y se consulta
        por RPC/eventos.
    end note
```

## 3. Reglas de transición

| Desde | Evento | Hacia | Quién firma |
|---|---|---|---|
| `próximo` | `wrapAndCreateFlow` confirmado | `ejecutado` (programado) + `activo` (on-chain) | ADMIN |
| `activo` | `updateFlow(0)` | `pausado` | ADMIN |
| `pausado` | `updateFlow(rate>0)` | `activo` | ADMIN |
| `activo`/`pausado` | `block.timestamp ≥ endsAt` | `vencido pendiente de liquidación` | nadie (cambio de lectura) |
| `vencido` | `settleFlow(sender, receiver)` | `terminado` | cualquiera (admin, empleado, tercero) |
| `activo`/`pausado` | `deleteFlow(receiver)` | `terminado` | ADMIN |
| `terminado` | cualquier operación | — | revierte |

## 4. Invariantes

1. Un flujo `terminado` no puede volver a `activo`.
2. `settleFlow` sobre un flujo no vencido revierte.
3. `settleFlow` dos veces sobre el mismo flujo revierte (idempotencia).
4. Lo devengado nunca supera `deposited` (shortfall explícito, AC-07).
5. La pausa de emergencia no impide `deleteFlow`, `settleFlow` ni `downgrade`.
6. `flujos_programados` nunca pasa a «terminado»: ese estado solo existe on-chain.
