# 05 · Diccionario de datos

## MongoDB

### Colecciones administrativas
#### Resumen

| Colección | Clave / índices | Contenido |
|---|---|---|
| `employees` | `walletLower`, `(estado, createdAt)` | Ficha, wallet, proyecto, concepto, monto/periodo, datos personales, consentimiento, borrado. |
| `projects` | `createdAt` | Nombre/presupuesto informativo/estado. |
| `system_config` | `_id: "system"` | chainId, RPC, addresses, `deployBlock`, `tasaRefrescoMs`. |
| `admin_allowlist` | `walletLower` única | Wallets con rol admin/operador y estado. |
| `siwe_nonces` | `nonceHash` única, TTL | Nonce de un uso (5 min) ligado a wallet y propósito. |
| `sessions` | `tokenHash` única, TTL | Sesiones opacas (2 h admin / 8 h empleado), revocables. |
| `auth_ratelimits` | `key`, TTL | Ventana fija de rate limit. |
| `audit_events` | `createdAt`, `(accion, empleadoId)` | Actor, acción, empleado, txHash, `meta`. Para los cobros verificados: `accion="flujo"`, `meta.operacion="cobro"`, `meta.amount` (wei) y `meta.via="suite"`; es la fuente del gasto acumulado del tope de downgrade (ver «DTO de límites» más abajo). Ojo: `actorWallet` puede quedar en formato checksum (depende del formato de la sesión); el acumulado lo compara case-insensitive (`downgrade-limit.ts:43-49`). |
| `flows` | `flowId` única, `(receiverLower, estado)` | Copia reconciliada del flujo on-chain. |
| `scheduled_flows` | `(fechaInicio, estado)` | Programación de nómina (AC-05). |
| `flow_batches` | `createdAt` | Lote de hasta 10 empleados (CU-09). |
| `flows_history` | `key` única (`txHash-logIndex`) | Espejo de eventos BrltX (H6). |
| `job_runs` | `(job, startedAt)` | Ejecuciones de jobs y su resultado. |

Nota de reinicio: `scripts/simular_actividades.py` (fase `reset`) solo dropea las 11
colecciones que lista en su constante `COLECCIONES`
(`scripts/simular_actividades.py:81-83`); `sessions`, `siwe_nonces` y
`auth_ratelimits` quedan fuera del reset (pendiente de confirmar si es intencional —
preserva sesiones activas tras un reinicio de datos).

### Flows (copia reconciliada)
#### Campos

`flowId · sender · receiver(+receiverLower) · amount (wei) · flowRate (wei/s) ·
startedAt · endsAt · estado (activo/pausado/vencido/terminado) · paid · returned ·
batchId · txHash · lastSyncedAt`.

Invariantes de reconciliación (`repositories/flows.ts#syncDoc`): `estado`/`paid`/`endsAt`
se reponen desde `getFlow`; en pausa se guarda `rateBeforePause` como `flowRate`.

### employees (GDPR)
#### Campos sensibles

`datosPersonales {email?/telefono?}`, `consentimiento {aceptado, fecha}`,
`borroSolicitado`, **`borroSolicitadoAt`** (ancla del job de 30 días), `anonymizado`.

## Cadena (on-chain)

### Struct Flow (BrltX)
#### Campos y semántica

`flowRate (uint128) · startedAt/endsAt/lastSettledAt/pausedAt (uint64) ·
rateBeforePause (uint256) · deposited/settled (uint256) · sender/receiver ·
paused/terminated`. ABI de lectura en `web/src/lib/contracts.ts#FLOW_TUPLE`.

### Eventos soportados
#### flows_history

`FlowCreated · FlowUpdated · FlowSettled · FlowDeleted · FlowExpired · Upgraded ·
Downgraded · DurationAllowed` (ABIs con eventos en `web/src/lib/contracts.ts`).

## API de la Suite

### DTO de límites de downgrade
#### `DowngradeLimitDto` (nuevo, commit aab670e)

Fuente: `web/src/lib/downgrade-limit.ts:22-31`; lo expone `GET /api/suite/me` en la clave
`limites` y lo consume la ficha «Downgrade de flujos» de `/suite`.

| Campo | Unidad | Semántica |
|---|---|---|
| `asignadoTotal` | wei (string) | Suma de `deposited` de todos los flujos del receptor (vivos o terminados). |
| `downgradeMaximo` | wei (string) | Techo cobrable: `floor(asignadoTotal × 80 / 100)`. |
| `downgradeUsado` | wei (string) | BRLT ya obtenido vía downgrade acumulado (suma de `meta.amount` de `audit_events` con `meta.operacion="cobro"`). |
| `downgradeDisponible` | wei (string) | `maximo − usado`, nunca negativo. |

Errores asociados en `POST /api/suite/actions`: `422 importe_invalido` (importe ≤ 0) y
`422 tope_80_superado` (usado + importe supera el máximo).

## Estado de datos actual (2026-11-18, post-reinicio + simulación)

### Contenido vigente de `superfluid_anvil`
#### Tras `scripts/simular_actividades.py` (commit 83f54e4)

Fuente viva: `RepoTecnico/BaseOperaciones/estado_inyeccion.md`; respaldo previo al
reinicio en `RepoTecnico/BaseOperaciones/respaldo_20261118T173426Z/*.json`.

| Dato | Valor actual |
|---|---|
| Empleados activos | **5**: Uno/Dos/Tres (#2..#4, 100 BRLT/30 d) · Cuatro (#5, mantenimiento 50 BRLT/15 d) · Cinco (#6, proyecto_mvp 80 BRLT/6 d). |
| Proyectos | **2**: `Nomina ANLU` y `Mantenimiento Infraestructura`. |
| Flujos canónicos | **#12** 300/30 d activo · **#13** 600/6 d activo · **#15** 360/6 d activo · **#14** 240/15 d terminado (`deleteFlow`). |
| Flujos históricos | 11 terminados en total (incluye los fantasma #3..#11 de eras previas, terminados por el admin con `via: correccion-simulacion`). |
| Flujos programados | 2 en estado «proximo» (CU-05, sin ejecutar). |
| Allowlist | #0 (super admin/owner) y #1 (admin de sistema). |
| Cobros auditados | Pausa → cobro → reanudación sobre #12 y #13; acumulado del tope 80% dentro del límite (verificado con la corrección case-insensitive). |

Los datos on-chain (saldos BRLT/BrltX, escrow) son la verdad; esta tabla describe el
espejo administrativo tras la simulación.

---

*Actualizado 2026-11-18 · análisis completo v2 (estado post-simulación y fix
case-insensitive del tope; commit `83f54e4`)*
