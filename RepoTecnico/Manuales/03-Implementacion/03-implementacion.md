# 03 · Implementación

## Contratos

### Brlt.sol
#### Contrato del token

- ERC-20 con **18 decimales**, `MAX_SUPPLY` de 50.000.000 y `minter` único
  (`sc/src/Brlt.sol:63` → `mint` con `onlyMinter`; `burn`/`burnFrom` estándar).
- `Ownable2Step` para el traspaso de ownership en dos pasos.

### BrltX.sol
#### Envoltorio 1:1 con streaming

Estado clave (`sc/src/BrltX.sol:60-72`): `allowedDurations` (6/15/30/90 días fijados en
el constructor) y `_flows[flowId]` (struct `Flow` de 12 campos).

#### Operaciones

| Función | Línea | Comportamiento |
|---|---|---|
| `upgrade/downgrade` | 135/144 | Envolver BRLT → BrltX / **cobro** (quema BrltX y paga BRLT al llamante, incluso con el contrato pausado — AC-07). |
| `wrapAndCreateFlow` | 161 | Cobra BRLT del admin, `flowRate = amount / duration` (floor al wei), residuo queda en escrow. Emite `FlowCreated` con el `flowId`. |
| `updateFlow` | 171/494 | Pausa (tasa 0, liquida el tramo; guarda `rateBeforePause` y `pausedAt`) o reanuda/cambia tasa reanclando `startedAt` y recalculando `endsAt`. |
| `deleteFlow` | 188 | Termina: liquida lo devengado y devuelve el remanente al admin en la misma tx. |
| `settleFlow` | 208 | **Público** (AC-02) pero solo para flujos **vencidos**: `FlowPaused` / `FlowNotExpired` como guardas. |
| `changeReceiver` | 228 | Atómico: liquida al receptor viejo, cierra el flujo y abre otro con remanente+tiempo restante hacia la wallet nueva. |

#### Invariantes

- `totalEscrow` solo baja vía `_settleAt` / `_finish`; `brltBacking == supply BrltX`
  1:1 (testeado con fuzz en `sc/test/Invariants.t.sol`).

## Módulos de la app web

### Repositorios MongoDB
#### Colecciones

`employees`, `projects`, `system_config`, `admin_allowlist`, `siwe_nonces`, `sessions`,
`auth_ratelimits`, `audit_events`, `flows`, `scheduled_flows`, `flow_batches`,
`flows_history`, `job_runs` (índices en `web/src/lib/db.ts:32`).

#### Flujos

- `registerFlow` (`web/src/lib/repositories/flows.ts`) valida contra la cadena
  (`sender == wallet de sesión`) y hace upsert por `flowId`.
- `syncDoc` reconcilia cada lectura y preserva la **tasa contractual** cuando el flujo
  está pausado (`rateBeforePause`).
- `listFlowsByReceiver` indexa `receiverLower` para la Suite.

### Jobs (H6)
#### Reconciliador

`web/src/lib/jobs/reconciler.ts`:

- `reconcile_flows` — corrige deriva y descubre flujos on-chain ausentes
  (`lastFlowId` scan).
- `flows_history` — espejo `eth_getLogs` idempotente (`txHash-logIndex`).
- `anonymize_pii` — GDPR a 30 días de `borroSolicitadoAt`.
- `mark_scheduled_due` — contador de programaciones vencidas.
- Cron del proceso: `web/src/instrumentation.ts` cada 5 min (muta `job_runs`).

### Verificación de acciones del empleado (H5)
#### Anti-falsificación

`verifyWalletAction` (`web/src/lib/flows-onchain.ts`) lee `eth_getTransactionReceipt` y
exige: misma `from` que la sesión + evento `Downgraded`/`FlowSettled` del empleado.
Sin verificación → `422 tx_no_verificada` y **no** se audita.

## Puntos de extensión

### Para nuevas operaciones
#### Dónde tocar

- Nueva operación admin: firmar en `web/src/lib/client/contracts.ts` + registrar en
  `/api/flows/actions` (schema) + auditar.
- Nuevo job: añadirlo a `JOBS`/`PERIOD` (reconciler + instrumentation) y al panel
  `/admin/jobs`.
