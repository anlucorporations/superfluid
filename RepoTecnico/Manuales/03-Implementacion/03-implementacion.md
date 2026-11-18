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
| `upgrade/downgrade` | 135/144 | Envolver BRLT → BrltX / **cobro** (quema BrltX y paga BRLT al llamante, incluso con el contrato pausado — AC-07). Emite el evento `Downgraded(account, amount)` (`sc/src/BrltX.sol:99`), base de la verificación y de la auditoría del cobro. |
| `wrapAndCreateFlow` | 161 | Cobra BRLT del admin, `flowRate = amount / duration` (floor al wei), residuo queda en escrow. Emite `FlowCreated` con el `flowId`. |
| `updateFlow` | 171/494 | Pausa (tasa 0, liquida el tramo; guarda `rateBeforePause` y `pausedAt`) o reanuda/cambia tasa reanclando `startedAt` y recalculando `endsAt`. |
| `deleteFlow` | 188 | Termina: liquida lo devengado y devuelve el remanente al admin en la misma tx. |
| `settleFlow` | 208 | **Público** (AC-02) pero solo para flujos **vencidos**: `FlowPaused` / `FlowNotExpired` como guardas. El devengo pendiente de un flujo activo **solo** se acredita a BrltX aquí: sin liquidación no hay BrltX nuevo. |
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

`verifyWalletAction` (`web/src/lib/flows-onchain.ts:145`) lee `eth_getTransactionReceipt` y
exige: misma `from` que la sesión + evento `Downgraded`/`FlowSettled` del empleado.
Sin verificación → `422 tx_no_verificada` y **no** se audita.

### Tope de downgrade del 80% (commit aab670e, corregido en 83f54e4)
#### Módulo `downgrade-limit.ts`

`web/src/lib/downgrade-limit.ts` implementa el tope acumulado del 80% (CU-16 ampliado /
CU-17). Ninguna pieza on-chain lo impone: es una regla de **producto** aplicada por el
backend antes de auditar.

| Elemento | Línea | Comportamiento |
|---|---|---|
| `DOWNGRADE_CAP` / `DOWNGRADE_CAP_DEN` | 19-20 | Fracción 80/100, constante de producto. |
| `downgradeMaximoDe(asignadoTotal)` | 34 | `floor((asignadoTotal × 80) / 100)` al wei. |
| `downgradeUsadoDe(wallet)` | 39-65 | Suma `meta.amount` de `audit_events` con `actorWallet` comparado **sin distinción de mayúsculas/minúsculas** (regex case-insensitive con escape de regex, líneas 43-49), `accion="flujo"` y `meta.operacion="cobro"` (límite 1000; importes corruptos se ignoran sin bloquear). Corrección del 2026-11-18: la auditoría registra la wallet a veces en formato checksum y la comparación exacta en minúsculas perdía cobros — bug destapado por la simulación operativa (`RepoTecnico/BaseOperaciones/estado_inyeccion.md`). |
| `getDowngradeLimit(wallet)` | 67-80 | `asignadoTotal` = suma de `deposited` de **todos** los flujos del receptor (vivos o terminados, vía `listFlowsByReceiver`); devuelve `{asignadoTotal, downgradeMaximo, downgradeUsado, downgradeDisponible}` con `disponible = maximo − usado` (nunca negativo). |
| `assertDowngradeLimit(limite, importe)` | 86-99 | Lanza `422 importe_invalido` si `importe ≤ 0` y `422 tope_80_superado` si `usado + importe > maximo`. |

La verdad del asignado es **el contrato** (Mongo reconciliada en cada lectura de flujos);
el gasto acumulado se reconstruye de la **auditoría** (solo cobros verificados contra la
cadena quedan en `audit_events`).

#### Aplicación en la API

- `POST /api/suite/actions` (`web/src/app/api/suite/actions/route.ts:16-63`): tras
  `assertCsrf` + `requireEmployee`, **verifica la tx contra la cadena** (24-36), después
  si `operacion === "cobro"` y hay importe calcula el límite y llama a
  `assertDowngradeLimit` **antes** de auditar (38-44) y solo entonces registra el
  `audit_event` (46-56). Cobros sobre el tope → `422 tope_80_superado`, sin auditoría.
- `GET /api/suite/me` (`web/src/app/api/suite/me/route.ts:21-28`): devuelve además
  `limites` (DTO de `DowngradeLimitDto`) junto a `employee`, `config`, `balances` y `flows`.

### Clear signing (commit 7da4a76)
#### Implementación en la app

Inventario de los 13 puntos de firma y textos por plantilla:
`RepoTecnico/CLEAR_SIGNING.md` (informe dedicado, con categoría
`[AUTH]/[PERM]/[XFER]/[DEFI]/[GOV]` e impacto real de cada punto).

- **Statements SIWE por propósito** (`web/src/app/api/auth/nonce/route.ts:8-13`):
  diccionario `STATEMENTS[purpose]` con textos ASCII sin acentos que explican el acceso
  («Acceder al panel de administracion…», «Acceder a tu Portal del Empleado…») y la nota
  «No mueve fondos ni autoriza gastos». El challenge de alta de admin
  (`web/src/app/api/admin/allowlist/challenge/route.ts:21-24`) lleva su propio statement
  («Confirmar esta wallet como administradora…»).
- **Componente `FirmaResumen`** (`web/src/components/firma-resumen.tsx:9-36`): ficha con
  `titulo` + `filas` + `nota` (por defecto «La firma es gratuita: no mueve fondos ni
  autoriza gastos.»), renderizada **antes** de pedir la firma en los 4 flujos de firma:
  `EntryLogin.tsx:123` (entrada única), `AdminLoginFlow.tsx` (login admin),
  `LoginFlow.tsx` (login empleado) y las páginas admin `empleados/page.tsx` y
  `sistema/page.tsx` (EIP-712 de cambio de wallet + alta en allowlist).
- **Transacciones on-chain**: los textos explicativos por operación (approve, flujos,
  downgrade, settle, changeReceiver) viven en la UI de `/admin` y `/suite` — tabla en
  `CLEAR_SIGNING.md` §2.4. No cambia ninguna firma: es capa de presentación sobre los
  mismos `signTypedData_v4` / `personal_sign` / llamadas de
  `web/src/lib/client/contracts.ts`.

### Scripts operativos de datos (commits de inyección + 83f54e4)
#### Inyección y simulación

- `scripts/inyectar_datos_operativos.py` (266 líneas): inyección base aprobada
  2026-11-16 (allowlist #0/#1, proyecto `Nomina ANLU`, empleados #2..#4, mint 10.000 BRLT
  a #0 y 100 BRLT a #1..#4 con la wallet owner). `--dry-run` sin escritura,
  confirmación s/n, log sin secretos en `RepoTecnico/BaseOperaciones/inyeccion_datos.log`.
- `scripts/simular_actividades.py` (543 líneas): dos fases con `--fase reset|actividades`.
  - **Fase A/reset**: respaldo JSON previo de las 11 colecciones en
    `RepoTecnico/BaseOperaciones/respaldo_<fecha>/*.json`, drop de las colecciones de
    `superfluid_anvil`, recreación de `system_config` (chainId 31337, RPC proxy,
    addresses del despliegue, `deployBlock 56395`) y reinyección base idéntica a la
    aprobada + mint top-up idempotente. El drop nunca corre en `--dry-run`.
  - **Fase B/actividades**: 2 empleados nuevos (#5/#6), proyecto extra, mint de
    financiación + `approve` a BrltX, 4 flujos `wrapAndCreateFlow` espejados, pausa →
    cobro `downgrade` auditado (dentro del tope 80%) → reanudación, terminación
    `deleteFlow` y 2 flujos programados «proximo».
- Registro vivo del resultado real: `RepoTecnico/BaseOperaciones/estado_inyeccion.md`
  (incluye la corrección de los flujos fantasma #3..#11 terminados por el admin tras la
  simulación, con `via: correccion-simulacion` en auditoría).

## Frontend de la app web

### Portal del Empleado `/suite` (rediseño, commit aab670e)
#### Identidad visual y secciones

`web/src/app/suite/page.tsx` (835 líneas) renderiza el portal completo del empleado con
**identidad visual propia**, distinta del AdminLTE de `/admin`:

- Tokens Tailwind `empleado.*` (`web/tailwind.config.ts:45-52`): fondo azul noche
  `#0d1425` (`empleado-bg`), tarjeta oscura `#131c30` (`empleado-card`), cabecera
  degradada violeta `#1b1140` → `#101a33` (`empleado-header`/`empleado-header2`).
  El panel admin sigue usando los tokens `adminlte.*` (28-44).
- Secciones del portal (en orden): **resumen** (BRLT en saldo, cobrable BrltX con
  devengo, salario por periodo — líneas 352-371), **Downgrade de flujos** con tope 80%
  (373-481, ver siguiente sub-sección), **Cobro autónomo** libre (483-537), **Mis flujos**
  (tabla con refresco 5 s y botón «Descargar» por fila, 539-617), **Mi ficha** (619-638) y
  **Mi perfil** (datos personales + consentimiento + borrado, 640-715).

#### Downgrade de flujos con tope (UI)

- Fichas de límites (`LimitChip`, líneas 386-399): **asignado a tu cuenta / tope 80% /
  ya descargado / disponible** (valores de `/api/suite/me#limites`).
- Selector de flujo (`visibleFlows`: activos, pausados o terminados — 290-292) + campo de
  importe + botón **«Máximo»** = `min(BrltX en cartera, disponible del tope)`
  (`descargableWei`, 284-287 y 450-464).
- Botón **Descargar** en cada fila de la tabla de flujos (595-609): preselecciona el
  flujo y hace scroll al panel de downgrade.
- `downgradeFlujo(wei, flowId)` (200-224): firma `downgrade` on-chain y registra
  `POST /api/suite/actions {operacion:"cobro", flowId, txHash}`; el servidor exige el tope.
- Nota de producto (468-480): si `descargableWei ≤ 0`, el tope está agotado o el BrltX en
  cartera es 0; el devengo pendiente de un flujo activo se acredita a BrltX al liquidar
  on-chain (`settleFlow` exige vencimiento, `sc/src/BrltX.sol:208`).

#### Cobro autónomo libre

`cobrar(wei)` (172-193) mantiene el CU-16: quema BrltX de la cartera y recibe BRLT en la
misma tx, sin elegir flujo ni mostrar fichas de límites en su panel. Ojo: **sí está
sujeto al tope** — el mismo `/api/suite/actions` exige el límite a todo cobro verificado
(`actions/route.ts:41-44`), y ambos consumen el mismo acumulado
(`meta.operacion="cobro"`).

### Entrada única `/entrar`
#### Decisión de portal y SIWE

- `web/src/app/entrar/page.tsx`: página mínima que monta `EntryLogin`.
- `web/src/components/EntryLogin.tsx` (125 líneas): fases `conectando → consultando →
  firmando → verificando → redirigiendo` (14-34). Flujo (42-84):
  1. `ensureChain` + `connectWallet`.
  2. `POST /api/auth/role` (sin firma ni sesión; `web/src/app/api/auth/role/route.ts:20-36`)
     → `admin` → `/admin`, `empleado` → `/suite`, `ninguno` → error «pide alta al
     administrador».
  3. Una firma SIWE con el `purpose` de la suite destino (`/api/auth/nonce` + `/api/auth/verify`)
     y `router.replace(suite)`.

### Validación continua de la wallet en `/suite`
#### Sesión frente a cuenta activa

`web/src/app/suite/page.tsx`:

- Al cargar: `GET /api/auth/me` — sesión de admin → redirect `/admin`; sin sesión →
  redirect `/entrar`; empleado → portal (90-115). Refresco de datos cada 5 s (`RF-08`).
- Validación continua (117-141): con la sesión activa, `eth_accounts` contra la wallet
  EIP-1193, suscripción al evento `accountsChanged` y **poll cada 10 s**. Si
  `cuentas[0] ≠ session.wallet` (comparación en minúsculas) se muestra el aviso
  «Wallet distinta a tu sesión» (327-335) con botón para revalidar en `/entrar`.
- `walletAccount()` (158-170): antes de firmar cualquier transacción, compara la cuenta
  conectada con la de sesión y aborta con error si no coinciden.

## Puntos de extensión

### Para nuevas operaciones
#### Dónde tocar

- Nueva operación admin: firmar en `web/src/lib/client/contracts.ts` + registrar en
  `/api/flows/actions` (schema) + auditar.
- Nuevo job: añadirlo a `JOBS`/`PERIOD` (reconciler + instrumentation) y al panel
  `/admin/jobs`.
- Cambio del tope de downgrade: ajustar `DOWNGRADE_CAP`/`DOWNGRADE_CAP_DEN` en
  `web/src/lib/downgrade-limit.ts` (no hay variable de entorno; es constante de producto).
- Nuevo mensaje de firma: añadir statement a `STATEMENTS` en
  `web/src/app/api/auth/nonce/route.ts` (SIWE) o pasar `titulo`/`filas`/`nota` al
  componente `FirmaResumen`; actualizar el inventario de `RepoTecnico/CLEAR_SIGNING.md`.
- Nueva fase de simulación de datos: extender `scripts/simular_actividades.py`
  (fase `actividades`) respetando la seguridad del script (nunca imprimir URI ni
  mnemónico; dry-run sin escritura).

---

*Actualizado 2026-11-18 · análisis completo v2 (clear signing, fix case-insensitive del
tope 80% y scripts operativos; commit `83f54e4`)*
