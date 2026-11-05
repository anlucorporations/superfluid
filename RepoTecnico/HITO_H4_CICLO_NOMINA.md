# Hito H4 — Ciclo completo de nómina en el panel admin

> **Estado: ✅ Cerrado (2026-11-04).** El panel admin opera el ciclo completo de nómina
> sobre la Besu real (chainId 81234): programar, crear, pausar, reanudar, cambiar receptor,
> terminar, liquidar, emitir/quemar y enviar en lote. La UI firma con MetaMask; el servidor
> reconcilia con `eth_call` y persiste en MongoDB. Verificado con 39 tests unitarios, build
> de 34 rutas y un smoke E2E contra la cadena real.

## Alcance entregado

| Área | Entregado |
|---|---|
| Contratos | ABIs `Brlt`/`BrltX` y struct `Flow` de 12 campos en `web/src/lib/contracts.ts`. |
| Lecturas | `getFlow`, `getPending`, `totalEscrow`, `brltBacking`, `balanceOf` y `allowance` vía `eth_call` crudo, sin provider en servidor. |
| Escrituras | `approve`, `wrapAndCreateFlow`, `updateFlow` (pausa/reanudación), `deleteFlow`, `settleFlow`, `changeReceiver`, `mint`, `burn` firmadas en el navegador. |
| Persistencia | Colecciones `flows`, `scheduled_flows` y `flow_batches` con índices; copia reconciliada del estado on-chain. |
| API | `GET/POST /api/flows`, `GET /api/flows/[id]`, `POST /api/flows/actions`, `GET/POST/PATCH /api/scheduled-flows`, `POST /api/batches`, `GET /api/batches/[id]`. |
| UI admin | Pestañas Flujos, Crear flujo, Programados, Lote (máx. 10) y Tesorería en `/admin/flujos`; nav «Flujos». |
| Cambio de wallet | Tras el cambio EIP-712 de H3, la UI detecta los flujos vigentes y los migra con `changeReceiver`; el flujo nuevo queda registrado y el antiguo cerrado. |
| Alertas | Avisos de flujos vencidos pendientes de liquidación y de flujos que terminan en < 24 h. |
| Solapamiento | Confirmación explícita si el empleado ya tiene flujos activos, con total agregado y proyección diaria (AC-23). |
| Dashboard | BRLT/BrltX del admin, allowance, escrow, respaldo 1:1, supply y gasto proyectado día/mes. |

## Flujo operativo

```text
Programar (MongoDB) ──► Ejecutar (firma admin) ──► wrapAndCreateFlow
                                                   │
        ┌──────────────────────────────────────────┤
        ▼                                          ▼
     Pausar (updateFlow 0) ──► Reanudar (updateFlow rate)
        │
        ├──► Cambiar receptor (changeReceiver) ──► flujo nuevo + antiguo cerrado
        ├──► Terminar (deleteFlow) ──► liquidación + remanente al admin
        └──► Vencer ──► Liquidar (settleFlow público, AC-02)
```

En cada paso el servidor relee el contrato antes de responder: el cliente nunca declara el
estado. `deriveFlowStatus` combina `terminated`, `paused` y `endsAt`:

| Condición | Estado |
|---|---|
| `terminated = true` | `terminado` |
| `paused = true` | `pausado` |
| `endsAt ≤ now` | `vencido` (pendiente de liquidación) |
| resto | `activo` |

## Verificación

### Tests unitarios (39)

| Suite | Casos |
|---|---|
| `tests/rates.test.ts` | 10 — tasa con floor, residuo, BRLT ↔ wei, proyecciones. |
| `tests/validation.test.ts` | 11 — wallets, importes, periodos, defaults, firma de allowlist. |
| `tests/eip712.test.ts` | 6 — dominio, recuperación de firmantes, manipulación. |
| `tests/flows.test.ts` | **12 nuevos** — `deriveFlowStatus` (4), `humanDuration`/`timeLeft` (2), esquemas de flujo, acción, programación y lote (6). |

```text
Test Files  4 passed (4)
Tests       39 passed (39)
```

### Build

```text
npm run typecheck  → sin errores
npm run build      → 34 rutas (11 estáticas + 23 dinámicas), OK
```

Rutas nuevas: `/admin/flujos`, `/api/flows`, `/api/flows/[id]`, `/api/flows/actions`,
`/api/scheduled-flows`, `/api/batches` y `/api/batches/[id]`.

### Smoke E2E real (`npm run smoke:h4`)

MongoDB en memoria + `next start` + **Besu 81234 real**, firmando con la wallet admin del
deploy (`sc/.env`). Wallets de empleado efímeras para no ensuciar datos reales.

1. Login SIWE admin (200) y `PATCH /api/system` con BRLT/BrltX/bloque reales (validado con
   `eth_chainId` + `eth_getCode`).
2. Empleado creado y lote abierto antes de crear flujos.
3. `approve` + `wrapAndCreateFlow` real: **flujo #3**, 10 BRLT / 6 días, tasa
   `19290123456790 wei/s` (bloque 6.432.784, tx `0xfd36b5…ed565`, 304.108 gas).
4. Registro verificado por RPC (emisor = admin de sesión) y listado con tesorería
   (escrow 10 BRLT).
5. Pausa → estado `pausado` conservando la tasa contractual (`rateBeforePause`).
6. Reanudación → estado `activo`.
7. `changeReceiver`: **flujo #4** hacia la wallet nueva (bloque 6.432.793, tx `0xc5d6c4…8cbf2`,
   315.712 gas); el #3 queda `terminado` y el #4 se registra automáticamente.
8. Terminación del #4: `terminado`, `getPending = 0`, remanente devuelto al admin.
9. Programación creada (`proximo`) y cancelada; progreso del lote 1/1 sin duplicar.
10. Auditoría con 8 eventos `flujo` (`alta`, `pausa`, `reanudacion`, `cambio_receptor`,
    `terminacion`, `programacion`…) y CSRF obligatorio en todas las escrituras.

```text
[smoke:h4] flujo #3 creado on-chain (tasa 19290123456790 wei/s) ✓
[smoke:h4] registro verificado por RPC ✓
[smoke:h4] pausa reconciliada (tasa contractual conservada) ✓
[smoke:h4] reanudación reconciliada ✓
[smoke:h4] cambio de receptor: flujo #3 → #4 ✓
[smoke:h4] terminación + liquidación (pendiente 0) ✓
[smoke:h4] programado creado y cancelado ✓
[smoke:h4] progreso del lote (1/1, sin duplicar) ✓
[smoke:h4] auditoría con 8 eventos de flujo ✓
[smoke:h4] TODO OK
```

El smoke de H3 (`npm run smoke`) sigue verde: 27 → ahora 39 tests y ningún cambio de
comportamiento en identidad, CSRF, nonce, allowlist ni Suite.

### Estado de la cadena tras el smoke

```text
admin BRLT        9.999.999,99949845679012346
supply BRLT       10.000.000
escrow BrltX      0
BrltX supply      0,00050154320987654
brltBacking       0,00050154320987654   (1:1 con BrltX)
```

Los 0,00050154320987654 BRLT son lo devengado y entregado como BrltX a las wallets
efímeras de prueba; el escrow quedó a cero al terminar los flujos.

## Decisiones de implementación

1. **El contrato es la verdad.** MongoDB es una caché para listar e historiar; cada lectura
   reconciliada (`listFlows`, `getFlowById`, acciones) actualiza el documento con lo que
   devuelve `getFlow`. El registro de un flujo se rechaza si `sender` no es la wallet de la
   sesión.
2. **Tasa contractual al pausar.** En pausa el contrato pone `flowRate = 0` y guarda la tasa
   en `rateBeforePause`; el servidor persiste la tasa contractual para que «Reanudar» no
   dependa del cliente.
3. **`changeReceiver` abre un flujo nuevo.** El contrato cierra el antiguo y crea otro con el
   remanente y el tiempo restante. El cliente extrae el `flowId` del evento `FlowCreated` y
   el servidor registra el nuevo flujo (con verificación de emisor) y audita el cambio.
   Así la migración de wallet de H3 no deja flujos huérfanos ni pagos al receptor antiguo.
4. **Reconciliación acotada.** `listFlows` sincroniza como máximo 60 flujos por petición y
   omite los `terminado`, para no saturar el RPC en listados grandes.
5. **Idempotencia del lote.** `flow_batches` guarda los empleados y `flows.batchId` marca los
   ya creados; al reintentar se consulta `GET /api/batches/:id` y se saltan los existentes
   (anti doble pago, CU-09).
6. **Mint/burn auditados con `flowId = 0`.** La operación se registra como evento `flujo`
   con `operacion: "mint" | "burn"`; no hay flujo asociado.
7. **Pausa global del contrato respetada.** `updateFlow` y `changeReceiver` revierten si el
   owner pausó BrltX; la UI muestra el error del nodo y no altera MongoDB.

## Pendiente / traspaso a otros hitos

- **H5:** botón «Cobrar» (`downgrade`) y «Liquidar» desde la Suite del Empleado, saldo en
  tiempo real y movimientos desde eventos.
- **H5:** retiro tras la baja (ventana de 90 días) y borrado/anonimización GDPR.
- **H6:** job de reconciliación de eventos (`FlowCreated/Updated/Deleted/Expired`),
  `flows_history` y ejecución automática de `scheduled_flows` con reintentos.
- **H6:** alertas 4 h/24 h por correo o panel de notificaciones (hoy son avisos en pantalla).
- **H7:** `standalone` en Cloud Run, cookies `Secure` bajo HTTPS y límites por instancia.

## Comandos

```bash
cd web
npm run typecheck
npm test
npm run build
npm run smoke        # H3: identidad y datos (Mongo en memoria)
npm run smoke:h4     # H4: ciclo real contra Besu 81234
```
