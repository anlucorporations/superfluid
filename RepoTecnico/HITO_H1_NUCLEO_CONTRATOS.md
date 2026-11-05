# Hito H1 — Núcleo de contratos: BRLT + BrltX

> Fase 3 · Cerrado 2026-11-01 · Base: `plan_desarrollo.md` §H1, `documento_tecnico.md` §5,
> `requerimientos.md` (RF-01..RF-04, RF-12, RF-21) y `casos_uso.md` (CU-02, CU-06, CU-07,
> CU-08, CU-16).

## 1. Objetivo y resultado

**Objetivo:** disponer de los dos contratos completos y verificados en local, sin UI ni
despliegue, con matemática de tasas, estados y robustez conforme a las decisiones de Fase 2.

**Resultado:** ✅ **cerrado.** `forge build` y `forge test` verdes (44/44), cobertura de
líneas `Brlt` 100 % y `BrltX` 94,42 %, `forge fmt` aplicado y dependencias fijadas
(OpenZeppelin 5.1.0, Solidity 0.8.28, EVM `cancun`).

## 2. Entregables

| Archivo | Contenido |
|---|---|
| `sc/src/Brlt.sol` | ERC-20 «CriptoPeso» (BRLT), 18 decimales, `Ownable2Step`, minter explícito, supply inicial 10.000.000, tope 50.000.000, `burn`/`burnFrom`. |
| `sc/src/BrltX.sol` | Super Token 1:1 + motor de flujos por `flowId` con escrow, pausa prolongable, `settleFlow` público, `changeReceiver` atómico, `Pausable`/`ReentrancyGuard`/shortfall. |
| `sc/test/Brlt.t.sol` | 10 pruebas: metadatos, supply, tope, roles, burn y `Ownable2Step`. |
| `sc/test/BrltX.t.sol` | 33 pruebas: tasas, devengo, pausa/reanudación, liquidación, terminación, cambio de receptor, multi-flujo, pausa de emergencia y fuzz. |
| `sc/test/Invariants.t.sol` | Handler con 7 acciones y 4 invariantes (128 runs × 64 depth = 8.192 llamadas, 0 reverts). |
| `sc/foundry.toml` | `solc 0.8.28`, optimizer 200, remappings, fuzz 512, invariantes 128×64, `lint_on_build = false`. |
| `sc/.gitignore`, `sc/README.md` | Exclusión de artefactos/dependencias y guía de instalación y comandos. |

## 3. Decisiones de implementación

1. **Flujos por `flowId` global** (AC-23): `mapping(uint256 => Flow)` más índices por
   receptor, por sender y por par. Se conservan sobrecargas por par
   (`updateFlow(address,…)`, `deleteFlow(address)`, `settleFlow(address,address)`) que
   operan sobre el flujo **más reciente** del par para no romper la ABI documentada.
2. **Fórmula de devengo con `settled` acumulado y reanclaje:** el tramo vigente empieza en
   `startedAt`, que se reancla en `now` tras liquidar al pausar, reanudar o cambiar la tasa:
   `devengado = min(deposited, settled + flowRate × (min(t|pausedAt, endsAt) − startedAt))`.
3. **Pausa que no resta devengo:** al reanudar se recalcula
   `endsAt = now + (deposited − settled) / flowRate`; con la misma tasa el resultado es
   exactamente `endsAt` original + tiempo pausado (verificado en test con 3 días de pausa).
4. **Liquidación perezosa (AC-02):** `settleFlow` es público, exige `block.timestamp ≥ endsAt`
   y flujo no terminado; acredita BrltX al receptor, devuelve el residuo al admin y emite
   `FlowExpired`. Un flujo **pausado** no puede liquidarse: debe reanudarse o terminarse con
   `deleteFlow`, para no recortar el devengo pactado.
5. **`changeReceiver` (AC-03) en dos variantes:**
   - `changeReceiver(flowId, newReceiver)`: liquida al receptor antiguo y reabre el flujo con
     el remanente y **el mismo `endsAt`** (o el tiempo restante si estaba pausado), sin mover
     BRLT adicional.
   - `changeReceiver(oldReceiver, newReceiver, amount, duration)`: cierra el flujo del par
     devolviendo su remanente y crea uno nuevo con el monto indicado (ABI del documento
     técnico). Ambas son atómicas: si algo revierte no hay estado parcial.
6. **Duraciones permitidas gestionables:** por defecto 6/15/30/90 días; el owner puede
   habilitar otras (`setDurationAllowed`). La validación se aplica solo a la creación
   pública, no a la reapertura interna de `changeReceiver`.
7. **Respaldo contable:** `totalEscrow` se ajusta al acreditar (se convierte en supply) y al
   devolver BRLT; invariante
   `brlt.balanceOf(BrltX) == totalSupply() + totalEscrow` probada con fuzz e invariantes.
8. **Shortfall explícito:** el devengo se acota a `deposited` y `_settleAt` revierte con
   `Shortfall(required, available)` si lo superara, sin estado parcial.
9. **Pausa de emergencia (AC-07):** `pause()` solo owner; bloquea `wrapAndCreateFlow`,
   `updateFlow` y `changeReceiver`, pero permite `settleFlow`, `deleteFlow`, `downgrade` y
   `upgrade` para no atrapar saldos.
10. **BRLT:** `mint` solo minter/owner con tope duro; `burn` del propio saldo y `burnFrom`
    con allowance; `setMinter(address(0))` deshabilita la emisión delegada (documentado).

## 4. Verificación

### 4.1 Pruebas

```text
Ran 3 test suites: 44 tests passed, 0 failed, 0 skipped
  BrltTest .............. 10 passed
  BrltXTest ............. 33 passed
  InvariantsTest ........  1 suite (4 invariantes, 8.192 llamadas, 0 reverts)
```

Casos destacados:

| Área | Prueba | Qué garantiza |
|---|---|---|
| Tasa | `testWrapAndCreateFlowComputesFloorRate` | 2.000 BRLT / 30 d = **771604938271604 wei/s** y evento `FlowCreated`. |
| Devengo | `testAccrualIsLinear`, `testAccrualCapsAtDeposited` | Linealidad por segundo y congelación tras `endsAt`. |
| Liquidación | `testPublicSettleAfterExpiryPaysAndRefunds` | Tercero sin rol liquida, pago + remanente, idempotencia (segundo settle revierte). |
| Pausa | `testPauseFreezesAccrualAndResumeProlongsEndsAt` | Cero devengo en pausa y `endsAt` + 3 días exactos. |
| Terminación | `testDeleteFlowRefundsRemainder` | Pago parcial y devolución del remanente en la misma tx. |
| Cambio wallet | `testChangeReceiverIsAtomic`, `testChangeReceiverDocOverload` | Atomicidad, conservación de escrow y `endsAt`. |
| Multi-flujo | `testMultipleConcurrentFlowsPerReceiver` | Dos flujos simultáneos y saldo en tiempo real agregado. |
| Emergencia | `testEmergencyPauseBlocksCreationButNotExits` | La pausa no bloquea salidas ni cobro. |
| Cobro | `testEmployeeCobroViaDowngrade` | `downgrade` BrltX→BRLT del empleado (RF-21). |
| Fuzz | `testFuzzFlowMath` (512 runs) | `flowRate = amount/duration`, `paid + refunded = amount`. |
| Invariantes | `invariant_backing`, `invariant_escrowCovered`, `invariant_settledNeverExceedsDeposited`, `invariant_terminatedFlowsDoNotAccrue` | Respaldo 1:1, escrow cubierto, sin shortfall ni reactivación. |

### 4.2 Cobertura (`forge coverage --report summary`)

| Archivo | % Líneas | % Sentencias | % Ramas | % Funciones |
|---|---|---|---|---|
| `src/Brlt.sol` | 100,00 % | 87,50 % | 40,00 % | 100,00 % |
| `src/BrltX.sol` | **94,42 %** | 87,35 % | 56,14 % | 100,00 % |

La cobertura de ramas mide también las ramas defensivas inalcanzables por diseño (topes,
`Shortfall`, `RateOverflow`) y las del handler de invariantes; el criterio de salida del plan
(≥ 90 % de líneas en BrltX) se cumple.

### 4.3 Gas (`forge test --gas-report`, medias)

| Función | Gas medio |
|---|---|
| `wrapAndCreateFlow` | ~289.400 |
| `changeReceiver(uint256,address)` | ~115.400 |
| `deleteFlow(uint256)` | ~59.700 |
| `updateFlow(uint256,uint128)` | ~59.100 |
| `upgrade` / `downgrade` | ~60.900 / ~53.600 |
| `settleFlow(uint256)` | ~33.200 |

Cifras compatibles con el presupuesto de gas de la red Besu de prácticas; se recalibrarán
con el block time real en H7.

## 5. Observaciones y deuda asumida

- `getFlow(sender, receiver)` devuelve el flujo **más reciente** del par, incluso terminado.
  La UI debe usar `getFlowIdsByReceiver` para listar todos los flujos activos.
- Los eventos incorporan `flowId` como primer parámetro indexado (mejora sobre el borrador);
  el `documento_tecnico.md` §5.3 ya está sincronizado.
- `forge lint` emite avisos de estilo (casts acotados, `setMinter` admite `address(0)` a
  propósito); no hay errores. `lint_on_build` queda desactivado para no romper `forge build`.
- No hay scripts de despliegue todavía: corresponden a H2.

## 6. Reproducción

```bash
cd sc
forge install foundry-rs/forge-std --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git
forge build
forge test
forge coverage --report summary
```

## 7. Criterio de salida

| Criterio del plan | Resultado |
|---|---|
| `forge build` verde | ✅ |
| `forge test` verde | ✅ 44/44 |
| Cobertura ≥ 90 % en BrltX | ✅ 94,42 % de líneas |
| Tasa 2.000 BRLT/30 d = 771604938271604 wei/s | ✅ verificada en test |

## 8. Siguiente hito

**H2 — Despliegue gobernado:** `script/DeployBrlt.s.sol` y `script/DeployAll.s.sol` con
`Ownable2Step` (propose desde la clave efímera + accept desde la wallet admin en la misma
sesión), bootstrap de `admin_allowlist`, verificación con `cast` y registro de addresses y
bloque inicial para la reconciliación.
