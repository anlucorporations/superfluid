# Diagrama de casos de uso — Superfluid BRLT Streaming v2

> Vista general de actores y casos de uso (CU-01..CU-17) sobre la red de la configuración
> (Besu 81234 por defecto; el despliegue actual `brltv2-00033-dmn` opera contra Anvil
> 31337 vía proxy, ver `04-despliegue.md`).
> Fuente canónica: `../casos_uso.md`.

```mermaid
flowchart LR
    ADMIN([ADMIN<br/>wallet owner/minter])
    EMP([EMPLEADO<br/>wallet + SIWE])
    DEP([DESPLEGADOR<br/>clave efímera])
    SYS[(Sistema<br/>MongoDB + contratos)]

    subgraph ENTRADA["Entrada única por wallet (/entrar)"]
        CU01[CU-01 Autenticarse<br/>SIWE admin]
        CU13[CU-13 Acceder<br/>SIWE empleado]
        WVAL[Validación de wallet<br/>POST /api/auth/role +<br/>validación continua en /suite]
    end

    subgraph PANEL["Panel de administración (on-chain + MongoDB)"]
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

    subgraph SUITE["Portal del Empleado (/suite, identidad visual propia)"]
        CU14[CU-14 Consultar flujos]
        CU15[CU-15 Perfil y datos]
        CU16[CU-16 Cobrar BrltX<br/>cobro autónomo libre]
        CU17[CU-17 Downgrade de flujo<br/>con tope 80%]
    end

    subgraph DEPLOY["Despliegue"]
        CU12[CU-12 Desplegar contratos<br/>Ownable2Step en sesión]
    end

    ADMIN --> WVAL
    EMP --> WVAL
    WVAL --> CU01
    WVAL --> CU13

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

    EMP --> CU14
    EMP --> CU15
    EMP --> CU16
    EMP --> CU17

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
    CU03 -.->|baja / cambio wallet| CU16
    CU06 -.->|deposited asignado| CU17
    CU14 -.->|elegir flujo| CU17
    CU17 -.->|consume tope| CU16

    CU02 --> BRLT[(BRLT ERC-20)]
    CU06 --> BRLTX[(BrltX wrapper)]
    CU16 --> BRLT
    CU17 --> BRLT
    CU08 --> BRLTX
    CU10 --> SYS
```

## Leyenda

| Relación | Significado |
|---|---|
| Flecha continua | El actor inicia el caso de uso. |
| Flecha punteada | Dependencia de estado o de datos entre casos de uso. |
| `BRLT` / `BrltX` | Contratos desplegados en la red de `system_config`. |
| `Sistema` | Backend + MongoDB; nunca firma transacciones. |
| `Validación de wallet` | Flujo de soporte (no es un CU numerado): `POST /api/auth/role` decide el portal y `/suite` revalida la cuenta activa de la wallet cada 10 s y en `accountsChanged`. |

## Notas de lectura

- La **entrada es única por wallet**: desde `/entrar` (`web/src/app/entrar/page.tsx`,
  `web/src/components/EntryLogin.tsx`) se conecta la wallet, se consulta `POST /api/auth/role`
  (`web/src/app/api/auth/role/route.ts:22-36`) y se redirige: admin → `/admin`,
  empleado → `/suite`, sin alta → error. La identidad se demuestra después con la firma SIWE
  del propósito de la suite destino (CU-01 o CU-13).
- El portal del empleado (`/suite`) tiene **identidad visual propia** (tokens Tailwind
  `empleado.*`, no AdminLTE) y valida de forma **continua** que la cuenta activa de la
  wallet coincida con la sesión (`eth_accounts` + evento `accountsChanged` + poll de 10 s,
  `web/src/app/suite/page.tsx:117-141`): si diverge, se avisa y se exige revalidar en `/entrar`.
- `CU-16` es el cobro autónomo libre: el empleado firma `downgrade` (`sc/src/BrltX.sol:144`)
  y quema BrltX a cambio de BRLT. También puede firmar `settleFlow` de un flujo vencido.
- `CU-17` es el **downgrade de flujo con tope acumulado del 80%**: descarga BRLT «desde un
  flujo concreto» y el backend exige (`web/src/lib/downgrade-limit.ts`,
  `web/src/app/api/suite/actions/route.ts:38-44`) que el acumulado cobrado no supere el 80%
  del total asignado a la cuenta; en caso contrario responde `422 tope_80_superado`.
  Se apoya en la misma transacción `downgrade` de CU-16, por lo que consumen el mismo límite.
- `CU-08` cubre dos operaciones: `deleteFlow` (corte anticipado del admin) y `settleFlow`
  (liquidación de un flujo vencido, invocable por cualquiera).

---

*Actualizado 2026-11-17 · commit aab670e*
