# Diccionario de datos — Superfluid Brlt Streaming v2

> Registro de entidades, variables y sus campos. Se actualiza durante todo el desarrollo.
> Estado: borrador Fase 1. Cadena: Besu Codecrypto (81234).

## Unidades y tokens

| Elemento | Descripción |
|----------|-------------|
| CC | Moneda nativa de la red (gas). 18 decimales. Se obtiene del faucet (máx. 100/solicitud). |
| BRLT | Token ERC20 (BarloToken). Supply inicial 10.000.000. **Decimales: 18 (decidido 2026-10-30, Bl. 3; sustituye al «8 dígitos» del brief §2.5).** |
| BrltX | Super Token (wrapper de BRLT con semántica CFA simplificada, Opción B). Misma moneda que BRLT tras wrap. |
| flowRate | Cantidad de tokens por segundo transmitida en un flujo, en wei/segundo del token. |

### Cálculo de flow rate (referencia)

```
flowRate = floor(montoTotal × 10^18 / duraciónDelPeriodoEnSegundos)   ← regla H-06: truncado al wei
Ejemplo (18 decimales): 2000 BRLT / 30 días = floor(2000e18 / 2.592.000 s) = 771604938271604 wei/s
El residuo del truncado queda a favor del administrador (sin pérdida de tokens).
```

### Duraciones de periodo

| Periodo (días) | Segundos |
|---------------|----------|
| 6 | 518.400 |
| 15 | 1.296.000 |
| 30 | 2.592.000 |
| 90 | 7.776.000 |

## Entidades (dominio administrativo)

### Empleado

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | identificador | Clave única del empleado. |
| nombre | string | Nombre / identificación del empleado. |
| wallet | dirección | Dirección Ethereum destino de los flujos; también **credencial de acceso** a la Suite (login por wallet). |
| proyecto | FK → Proyecto | Proyecto al que está asignado. |
| concepto | enum | mantenimiento · nomina · proyecto_mvp · actividad_espacial · otros. |
| monto_periodo | entero (wei BRLT) | Cantidad total BRLT que recibe por periodo. |
| periodo | enum | 6 · 15 · 30 · 90 (días). |
| estado | enum | activo · inactivo · en_flujo (**derivado**, no persistido: existe flujo on-chain con rate > 0; AC-21). |
| datos_personales | objeto | Datos del perfil gestionados por el empleado en su Suite (email, teléfono, etc.). |

### Proyecto

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | identificador | Clave única. |
| nombre | string | p. ej. «MVP», «Streaming 2026». |
| descripción | string | Detalle opcional. |
| presupuesto | entero (wei BRLT) | Presupuesto asignado en BRLT (**solo informativo**, decisión H-31; no bloquea flujos). |
| estado | enum | activo · cerrado. |

### Flujo (on-chain: flow)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | identificador | Referencia / índice del flujo. |
| remitente | dirección | Wallet del administrador que envía (owner). |
| destinatario | dirección | Wallet del empleado. |
| token | dirección | Contrato del Super Token (BrltX). |
| flowRate | entero (wei/s) | Tokens por segundo. |
| periodo | enum | 6 · 15 · 30 · 90 días (respaldo del dato, el CFA es continuo). |
| concepto | enum | Concepto de pago asociado. |
| estado | enum | próximo (programado, **persistido off-chain en MongoDB** `flujos_programados` hasta la firma del admin) · activo (on-chain) · pausado (flowRate=0 via updateFlow) · vencido_pendiente_liquidacion (block.timestamp ≥ fecha_fin, aún sin tx) · terminado (on-chain: por deleteFlow del admin o por **settleFlow público** sobre un vencido). |
| fecha_inicio | timestamp | Programada (si es «próximo») o bloque/timestamp de creación real. |
| fecha_fin | timestamp | Fecha programada o real de fin; al alcanzarla el flujo deja de acumular y queda **vencido pendiente de liquidación** hasta que alguien firme `settleFlow`. Si el flujo se pausa, `fecha_fin` se prolonga por el tiempo pausado (decisión 2026-11-01). |
| acumulado | entero (wei) | Total transferido hasta el momento (calculable on-chain). |

### Flujo programado (`flujos_programados`)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | identificador | Clave del registro de intención. |
| empleado_id | referencia | Empleado destinatario. |
| monto / periodo | entero, enum | Monto total y periodo 6/15/30/90 días. |
| flow_rate | entero (wei/s) | Floor calculado al programar. |
| fecha_inicio / fecha_fin | timestamp | Ventana prevista del flujo. |
| estado | enum | `próximo · ejecutado · cancelado · fallido` (nunca «terminado», AC-05). |
| tx_hash | hash | Presente solo si `ejecutado`. |
| motivo_fallo | texto | Presente solo si `fallido`. |

> **Implementación H4:** la colección física es `scheduled_flows` (`employeeId`, `employeeNombre`,
> `receiver`, `amount`, `periodo` en días, `durationSeconds`, `fechaInicio`, `estado`, `flowId`,
> `txHash`, `error`, `createdBy`, `createdAt`, `updatedAt`, `executedAt`). `flowRate` no se
> duplica: se calcula con `flowRateFor(amount, periodo)` al ejecutar.

### Lotes de flujos (`flow_batches`, H4/CU-09)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| _id | ObjectId | Identificador del lote devuelto a la UI. |
| estado | enum | `en_curso` (se ampliará con `completado`/`parcial` en H6). |
| total | entero | Empleados seleccionados al abrir el lote (máx. 10). |
| completados | entero | Derivado: flujos de `flows` con `batchId` = lote. |
| createdBy / createdAt / updatedAt | wallet, fecha | Trazabilidad del lote. |

## Colecciones físicas de flujos (H4)

| Colección | Campos principales | Índices |
|---|---|---|
| `flows` | `flowId` (único), `employeeId`, `sender`, `receiver`, `amount`, `durationSeconds`, `flowRate`, `startedAt`, `endsAt`, `estado`, `txHash`, `batchId`, `createdBy`, `paid`, `returned`, `terminatedAt`, `lastSyncedAt`, `createdAt`, `updatedAt` | `flowId`, `(employeeId, estado)`, `(estado, endsAt)` |
| `scheduled_flows` | ver arriba | `(fechaInicio, estado)`, `employeeId` |
| `flow_batches` | ver arriba | `createdAt` |

`flows` es una **copia reconciliada** del contrato: cada lectura compara con `getFlow` y
`getPending` (máx. 60 por petición) y actualiza `estado`, `receiver`, `flowRate`, `endsAt`,
`paid` y `lastSyncedAt`. `flowRate` refleja la tasa contractual (`rateBeforePause` si el
flujo está pausado). La colección `flows_history` prevista en H1/H6 sigue pendiente de
implementar; hoy el detalle histórico vive en `audit_events`. |

### Historial de flujos (`flows_history`, H6)

Espejo reconstruible de los eventos on-chain (`FlowCreated`, `FlowUpdated`, `FlowSettled`,
`FlowDeleted`, `FlowExpired`, `Upgraded`, `Downgraded`). Campos: `key` (`txHash-logIndex`,
única), `blockNumber`, `txHash`, `logIndex`, `evento`, `flowId`, `sender`, `receiver`,
`amount`, `extra`, `createdAt`. Índices: `key` única y `(flowId, blockNumber)`. Es la
fuente de los «terminados» que muestra la Suite; se regenera desde el bloque de
despliegue si se pierde (job `flows_history`). [AC-05, H-12]

### Ejecuciones de jobs (`job_runs`, H6)

`job` (`reconcile_flows · flows_history · anonymize_pii · mark_scheduled_due`), `ok`,
`startedAt`, `finishedAt`, `result` (JSON), `error` (si falló), `trigger` (`cron · manual`).
Panel `/admin/jobs`; el cron vive en `instrumentation.ts` con intervalo de 5 min.

### Evento de auditoría (`audit_events`)

`actor_wallet`, `accion` (alta/edición/cambio_wallet/baja/config/login/logout/**flujo**),
`empleado_id`, `wallet_anterior`, `wallet_nueva`, `timestamp` y `tx_hash` cuando aplique. Las
operaciones de flujo guardan en `meta` el `operacion` (`alta`, `pausa`, `reanudacion`,
`terminacion`, `liquidacion`, `cambio_receptor`, `programacion`, `mint`, `burn`), el `flowId`
y, si aplica, el `newFlowId` del flujo reabierto. Sin secretos ni PII innecesaria. [AC-03]

### Finanzas (dashboard)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| balance_cc | entero (wei CC) | Gas disponible de la cuenta admin. |
| balance_brlt | entero (wei BRLT) | BRLT sin envolver. |
| balance_brltx | entero (wei BrltX) | BRLT envuelto (disponible para streaming). |
| total_flujos_activos | entero | Número de streams activos. |
| gasto_por_segundo | entero (wei/s) | Σ flowRates activos. |
| gasto_previsto | entero (wei) | Proyección por periodo (agregada). |

### Cobro / Suite (H5)

**Empleado** (Suite, wallet = su wallet):

| Campo | Tipo | Descripción |
|-------|------|-------------|
| wallet_brlt | entero (wei) | BRLT ya retirado a su cartera. |
| wallet_brltx | entero (wei) | BrltX en cartera, cobrable de inmediato con `downgrade`. |
| cobrable | entero (wei) | `getRealtimeBalance`: BrltX + devengo pendiente de sus flujos. |

Operaciones: `cobro` (`downgrade`, incluso con contrato pausado), `liquidacion`
(`settleFlow` de flujos vencidos, AC-02), edición de perfil, consentimiento (true/false con
fecha) y solicitud de borrado con efecto inmediato (`borroSolicitado = true`).

### Configuración del sistema

| Campo | Tipo | Descripción |
|-------|------|-------------|
| chain_id | 81234 | Fijo. Red Codecrypto. |
| rpc_url | `https://besu.alumnos.codecrypto.academy` | Nodo JSON-RPC remoto. |
| dirección_brlt | dirección | Salida del deploy (DeployAll). |
| dirección_brltx | dirección | Salida del deploy (DeployAll). |
| tasa_refresco_ms | 5000 (default) | Refresco de balances en UI; ajustable al block time. |
| faucet_url | `https://faucet.codecrypto.academy/` | Financiación de cuentas. |

## Notas

- Persistencia decidida (2026-10-30): las entidades administrativas (Empleado, Proyecto,
  Configuración) viven en **MongoDB**; lo on-chain (balances y flows) se lee directamente de
  la red Besu. La Suite del Empleado valida acceso comparando la wallet conectada con la
  wallet registrada en la BD.
- **Flujos programados (decisión auditoría H-11)**: mientras un flujo está «próximo» solo
  existe off-chain, en la colección MongoDB `flujos_programados`; al firmarlo el admin nace
  on-chain y se reconcilia con la cadena. **Al vencer `fecha_fin` no hay corte automático**
  (AC-02): el flujo pasa a «vencido_pendiente_liquidacion» y cualquier cuenta puede llamar
  `settleFlow(sender, receiver)` para acreditar al empleado y devolver el remanente al admin.
- **Sesiones (AC-08)**: nonce SIWE 5 min de un solo uso; sesión admin 2 h; sesión empleado
  8 h; rate-limit 5 intentos/15 min por wallet+IP; revocación inmediata en la baja; cookies
  `Secure/HttpOnly/SameSite=Strict` y CSRF double-submit.
- **Retención de datos (AC-10)**: borrado inmediato a petición; PII anonimizada a los 30 días
  de la baja; agregados anónimos 5 años; wallet pseudonimizada hasta el fin de la ventana de
  retiro (90 días).
- **Límites operativos**: mint acotado a 50.000.000 BRLT de supply (AC-16); faucet limitado a
  1 solicitud por wallet cada 24 h (AC-25); allowance BRLT→BrltX acotada al monto del flujo o
  lote, nunca `uint256.max`.
