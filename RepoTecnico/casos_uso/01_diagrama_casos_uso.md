# Diagrama de casos de uso — Superfluid BRLT Streaming v2

> Vista general de actores y casos de uso (CU-01..CU-16) sobre Besu Codecrypto 81234.
> Fuente canónica: `../casos_uso.md`.

```mermaid
flowchart LR
    ADMIN([ADMIN<br/>wallet owner/minter])
    EMP([EMPLEADO<br/>wallet + SIWE])
    DEP([DESPLEGADOR<br/>clave efímera])
    SYS[(Sistema<br/>MongoDB + contratos)]

    subgraph PANEL["Panel de administración (on-chain + MongoDB)"]
        CU01[CU-01 Autenticarse<br/>SIWE admin]
        CU02[CU-02 Mint / burn BRLT]
        CU03[CU-03 Gestionar empleados]
        CU04[CU-04 Gestionar proyectos]
        CU05[CU-05 Programar flujo]
        CU06[CU-06 Iniciar flujo<br/>wrapAndCreateFlow]
        CU07[CU-07 Pausar / reanudar]
        CU08[CU-08 Terminar / liquidar<br/>deleteFlow · settleFlow]
        CU09[CU-09 Envío múltiple<br/>lote ≤ 10]
        CU10[CU-10 Monitorear finanzas]
        CU11[CU-11 Configurar sistema]
    end

    subgraph SUITE["Suite del Empleado (solo wallet)"]
        CU13[CU-13 Acceder<br/>SIWE empleado]
        CU14[CU-14 Consultar flujos]
        CU15[CU-15 Perfil y datos]
        CU16[CU-16 Cobrar BrltX<br/>downgrade]
    end

    subgraph DEPLOY["Despliegue"]
        CU12[CU-12 Desplegar contratos<br/>Ownable2Step en sesión]
    end

    ADMIN --> CU01
    ADMIN --> CU02
    ADMIN --> CU03
    ADMIN --> CU04
    ADMIN --> CU05
    ADMIN --> CU06
    ADMIN --> CU07
    ADMIN --> CU08
    ADMIN --> CU09
    ADMIN --> CU10
    ADMIN --> CU11

    EMP --> CU13
    EMP --> CU14
    EMP --> CU15
    EMP --> CU16

    DEP --> CU12
    ADMIN --> CU12

    CU05 -.->|próximo| CU06
    CU06 -.->|activo| CU07
    CU07 -.->|pausado| CU08
    CU06 -.->|vencido| CU08
    CU08 -.->|terminado| CU14
    CU08 -.->|BrltX devengado| CU16
    CU11 -.->|addresses| CU06
    CU11 -.->|addresses| CU10
    CU01 -.->|allowlist| CU11
    CU03 -.->|baja / cambio wallet| CU16

    CU02 --> BRLT[(BRLT ERC-20)]
    CU06 --> BRLTX[(BrltX wrapper)]
    CU16 --> BRLT
    CU08 --> BRLTX
    CU10 --> SYS
```

## Leyenda

| Relación | Significado |
|---|---|
| Flecha continua | El actor inicia el caso de uso. |
| Flecha punteada | Dependencia de estado o de datos entre casos de uso. |
| `BRLT` / `BrltX` | Contratos desplegados en la red 81234. |
| `Sistema` | Backend + MongoDB; nunca firma transacciones. |

## Notas de lectura

- El panel admin y la Suite son **aplicaciones separadas** con sesiones SIWE distintas.
- `CU-16` es la única vía por la que el empleado firma una transacción (cobro); también
  puede firmar `settleFlow` de un flujo vencido.
- `CU-08` cubre dos operaciones: `deleteFlow` (corte anticipado del admin) y `settleFlow`
  (liquidación de un flujo vencido, invocable por cualquiera).
