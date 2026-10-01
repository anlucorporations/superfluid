# Casos de Uso — Superfluid EUR Streaming v1 (beta)

> Analista funcional · un caso por objetivo de actor · criterios Gherkin (`Dado/Cuando/Entonces`),
> restricciones del sistema en EARS con ID RE-nn · trazabilidad a RF/RNF/RT/D. Criterios
> **diseñados para** verificarse con `forge test`, E2E Playwright/chromium headless o inspección
> de build; la matriz final marca cada test como *previsto* (no existe código hasta Fase 3).
> Actores: **Emisor**, **Receptor**, **Owner/Admin** (cuenta #0 Anvil, D11), **Visitante**
> (preview), **Cualquier cuenta** (keeper de settle). El Operador de red Besu NO es actor de
> caso en v1: es dependencia externa documentada (§4.1 de requerimientos.md).

## Sección 0 — Constantes económicas canónicas (única fuente de verdad)

| Símbolo | Valor | Derivación |
|---|---|---|
| `RATE` (DEFAULT_FLOW_RATE) | `771604938271604` wei/s | `floor(2000×10^18 / 2_592_000)`; convención de producto: **mes = 30 × 86400 s** (D4 ampliado) |
| `DEP_1` (depósito 1 flow, 1 h) | `RATE × 3600 = 2_777_777_777_777_774_400` wei | truncado hacia abajo |
| `DEP_n` (depósito n flows garantizados) | `netOutflowGarantizado × 3600` | **sin techo**; fórmula canónica de todo depositTotal en escenarios |
| `DEP_3` (3 flows, referencia CU-02) | `8_333_333_333_333_323_200` wei (= 3 × RATE × 3600) | recálculo verificado; sustituye a la errata ...332_323_200 detectada en la auditoría del documento técnico. **Regla de proceso: toda constante derivada se publica con su expresión y es reevaluada por `tools/constants-check.mjs` en CI** |
| Delta 10 s (CU-04) | `RATE × 10 = 7_716_049_382_716_040` wei | exacto |
| Residuo truncado | 0.9382716 wei/s ≈ 2.43e-12 EUR/mes por flow | comportamiento aceptado; ningún test afirma 2000.000… EURx |

> Consecuencia declarada: un mes calendario de 31 días drena 2066.67 EURx por flow. Es decisión
> de producto (convención mes=30d), no defecto.

### Modelo contable V3 (reserva; resuelve la auditoría de código V2)

- `earnedUnclaimed[receiver][sender]` es un **pasivo dentro de `realBalanceOf[sender]`**: la materialización acredita sin mover saldos; `claimSettled(from)` transfiere real del emisor al receptor (débito+crédito). Conservación estructural: **Σ real == totalSupplyX** siempre.
- **Gate de creación (única formulación canónica):** `realBalanceOf ≥ depositTotal_nuevo + owed_actual + rate×3600`. El buffer de 1 h sobre el saldo libre puede agotarse por el propio flujo (insolvencia) — es el diseño, no un defecto.
- **Saldo libre (desenvolvible):** `max(0, real − depositTotal − owed)`; `owed` incluye parejas Closed con crédito pendiente.
- **Insolvencia = condición de estado:** `owed > real` tras materializar (equivalente a virtualBalance ≤ 0). El reloj y T no habilitan settle (RE-07c). Tras settle, `depositTotal=0` y el saldo libre es 0: retirar está protegido de otra forma (locked=real).
- **Prorrateo por flowRate NOMINAL** de las parejas con deuda (activos, pausados y cerrados con crédito), recortado al debido; residuo de truncado redistribuido wei-a-wei en orden de inserción; lo no acreditable permanece en el emisor (nunca se acuña). Déficit → `pendingDeficit`.
- **Limitación primera-llegada aceptada (v1):** entre mutaciones, un receptor puede reclamar antes que otro si el emisor tiene reserva; el mecanismo equitativo es `settle()` (haircut proporcional). Aceptable en red de prueba; se documenta en README y en el informe V2.
- **Re-settle idempotente:** sin deuda y sin flujos = no-op silencioso (devuelve estado vigente).

### Modelo de tasas (resuelve la ambigüedad neta señalada en la auditoría de casos de uso)

- `netFlowRate(account)` = Σ rates **activos** entrantes − Σ rates **activos** salientes → gobierna el devengo en tiempo presente y el saldo virtual. Un flow pausado aporta 0.
- `netOutflowGarantizado(account)` = Σ rates salientes **activos + pausados** → gobierna `depositTotal = netOutflowGarantizado × 3600` (sin techo). Un sender con todos sus flows pausados conserva depósito bloqueado.
- **Reglas contables del devengo (cierre del vacío detectado en auditoría del doc técnico):**
  - `earnedUnclaimed(receiver, sender) = accumulatedBalance + rate_efectivo × (now − lastUpdateTimestamp)` para flows Active/Paused; queda **congelada** al pasar a Closed/settled.
  - El tramo no reclamado vive en una cuenta pending por pareja `(sender, receiver)` — NO dentro de `virtualBalanceOf` del receiver hasta que se reclama.
  - La transferencia al `realBalanceOf` del receiver ocurre únicamente en `closeFlow`, `settle`+`claimSettled`. Ningún cierre o settle destruye devengo no reclamado (test dedicado).
  - `pendingDeficit` registra solo el déficit impagado tras prorrateo; `pendingPool` solo residuos < 1 wei.
- **Invariante RNF-08 reformulada (forma canónica única):**
  - Global: `Σ_accounts realBalanceOf(a) == Σ_accounts virtualBalanceOf(a) + Σ earnedUnclaimed no liquidados` — equivalentemente, si los pending se modelan como parte del real custodiado: `totalEURxCustodiado == Σ virtualBalanceOf + Σ pendingNoReclamado`.
  - Por cuenta: `virtualBalanceOf(a) + depositTotal(a) ≥ 0` y `realBalanceOf(a) ≥ depositTotal(a)`.
  - `realBalanceOf(a)` es el saldo custodiado POR CUENTA (no agregado); la reserva total es `totalSupply` de EURx.
- **Trigger de settle = condición de estado, no reloj:** `settle(emisor)` solo es válido si `virtualBalance(emisor) ≤ 0` tras liquidar el devengo hasta `now` (insolvencia real). T = floor((virtualBalance+depositTotal)/netOutflowGarantizado) se conserva como cota informativa de adelanto máximo para UI/keepers, pero un sender con todos los flows pausados y saldo intacto **NO es liquidable** (Gherkin negativo en CU-07). `settledUpTo` inicial de una cuenta nunca liquidada = `block.timestamp` en su primera mutación (sentinela documentado).
- **Política de escasez única:** prorrateo proporcional por `flowRate` nominal (activos+pausados) sobre el pool disponible; el tuple `(flowRate desc, receiver asc)` es **solo orden de iteración determinista** para asignar residuos < 1 wei de forma reproducible, no prioridad de cobro.
- Déficit impagado: campo propio `pendingDeficit(uint256 wei)` en AGGREGATOR. `settledUpTo` queda reservado EXCLUSIVAMENTE a timestamp.
- Residuos < 1 wei por receptor: bolsa `pendingPool` por cuenta; nunca se queman ni duplican.

---

## CU-01 — Envolver EUR en EURx (upgrade)
**Actor:** Emisor · **Trazabilidad:** RF-02, RNF-08 · **Precondición:** wallet conectada a chainId 81234; saldo EUR ≥ cantidad.

```gherkin
Dado un emisor con 1_000e18 wei de EUR y 0 EURx
Cuando solicita upgrade de 400e18 EUR desde el Dashboard
Entonces su balance EUR baja exactamente 400e18
Y su realBalanceOf(EURx) sube exactamente 400e18
Y se emite Wrapped(account, amount) (RNF-10)
Y la invariante RNF-08 se mantiene: `Σ realBalanceOf == Σ virtualBalanceOf + Σ earnedUnclaimed` (§0, forma canónica)

Dado un wrap sobre una cuenta con flows salientes y saldo libre escaso
Cuando el sender envía EUR extra a EuroX (wrap) sin cerrar flows
Entonces el sistema lo permite pero recalcula T informativo; el wrap NO exime de settle si después virtualBalance ≤ 0 (la insolvencia es estado, §0)
```
**Alternativos:**
```gherkin
Dado un emisor con saldo EUR < cantidad solicitada
Cuando intenta el upgrade
Entonces el contrato revierte con error "EUR: insufficient balance" y la UI muestra ese mensaje sin recargar (D7)

Dado una transacción de upgrade pendiente de minería
Cuando intenta un segundo upgrade
Entonces la UI deshabilita el botón hasta recibir confirmación (guarda anti-doble-firma, test E2E)
```
**EARS:** *(RE-01a Ubiquitous)* El sistema custodiará el 100 % del EUR envuelto en EuroX (ratio 1:1 exacto, sin comisión): solvencia `totalSupply(EURx) == EUR custodiado en contrato`. La disponibilidad del usuario está acotada por RE-02 (depósitos retenidos); el depósito protege la liquidación, no sostiene el 1:1.
*(RE-01c Event)* Cuando un wrap se complete, el sistema emitirá Wrapped(account, amount); los Unwrapped emiten Unwrapped(account, amount).

## CU-02 — Desenvolver EURx en EUR (downgrade)
**Actor:** Emisor o Receptor · **Trazabilidad:** RF-02, D10, RNF-08 · **Precondición:** EURx libres = `realBalanceOf − depositTotal` (§0).

```gherkin
Dado una cuenta con 400e18 EURx reales, netFlowRate = 0 y depositTotal = 0
Cuando solicita downgrade de 150e18
Entonces recibe 150e18 EUR y su realBalanceOf baja 150e18

Dado una cuenta con 3 flows salientes activos y depositTotal = DEP_3 = 8_333_333_333_333_323_200 wei (§0)
Cuando intenta downgrade por encima de (realBalance − depositTotal)
Entonces el contrato revierte con "EuroX: locked by deposits" y la UI explica cuánto está bloqueado
```
**EARS:** *(RE-02 State-driven)* Mientras existan flows activos o pausados, el sistema impedirá desenvolver EURx que excedan el saldo libre de depósitos.

## CU-03 — Crear un stream continuo
**Actor:** Emisor · **Trazabilidad:** RF-03, RF-04, D10, D13, D15, RNF-08 · **Precondición:** EURx libres ≥ depósito incremental; receptor ≠ emisor ≠ dirección del contrato.

```gherkin
Dado un emisor con 1000e18 EURx libres y un receptor válido
Cuando crea un flow al receptor con DEFAULT_FLOW_RATE = RATE (§0)
Entonces aparece FlowCreated(sender, receiver, 771604938271604) en el log
Y el netFlowRate del emisor disminuye exactamente RATE
Y depositTotal pasa a DEP_1 = 2_777_777_777_777_774_400 wei (§0)
Y la aserción de pre-creación se cumple: realBalanceOf − nuevoDepositTotal ≥ 0 (equivalente a "saldo libre no negativo"; única formulación canónica, enlazada a RE-03a)
Y el flow figura en el Dashboard como "activo"
```
**Alternativos:**
```gherkin
Dado un flow existente entre (sender, receiver)
Cuando el sender intenta crear otro flow a la misma pareja
Entonces revierte con "EuroX: flow exists" (D7)

Dado un destino igual a la propia dirección del emisor
Cuando intenta crear el flow
Entonces la UI bloquea la operación ANTES de firmar — validación client-side, test E2E

Dado saldo libre inferior al depósito incremental requerido
Cuando intenta crear el flow
Entonces el contrato revierte "EuroX: insufficient free balance" — validación on-chain, test forge

Dado un destino de contrato sin soporte propio
Cuando el emisor confirma el modal de irrevocabilidad (D15)
Entonces el sistema permite crearlo pero muestra advertencia persistente en la fila del flow
```
**EARS:**
- *(RE-03a Unwanted)* Si el saldo libre es inferior al depósito incremental requerido, entonces el sistema rechazará `createFlow` con revert explícito on-chain.
- *(RE-03b Event)* Cuando un sender cree el flow n.º 11, el sistema lo permitirá on-chain y la UI lo hará accesible mediante control de paginación (lista renderiza 10 filas/página; criterio observable = nº de filas DOM + botón presente).
- *(RE-03c State-driven)* Mientras el firmante sea distinto del sender, el sistema impedirá pausar/cerrar ese flow ajeno.

## CU-04 — Ver balances en tiempo real
**Actor:** Emisor · **Trazabilidad:** RF-08, RNF-04, D8 · **Precondición:** wallet conectada, RPC disponible.

```gherkin
# (a) on-chain determinista (forge con warp, sin tolerancia)
Dado un emisor con un flow activo de RATE wei/s y virtualBalance V en t0
Cuando avanza el EVM 10 s (vm.warp) y se consulta virtualBalanceOf
Entonces refleja V − RATE×10 = decremento EXACTO de 7_716_049_382_716_040 wei (§0)

# (b) E2E UI (reloj real, sin cifra absoluta)
Dado un dashboard con polling base 5 s sobre red QBFT de block time 2 s
Cuando transcurren ≥ 10 s con dos refresh
Entonces la cifra mostrada es monótonamente decreciente, el net rate aparece como "-0.000771604938271604 EURx/s" y no hay errores de consola
```
**Alternativos:**
```gherkin
Dado que una llamada de polling falla o excede 25 s (umbral > p95 medida ≈ 20 s)
Cuando ocurre 1 timeout
Entonces el intervalo pasa a 15 s; si vuelve a fallar, a 30 s
Y la UI muestra indicador "conexión degradada" sin borrar la última cifra conocida
```
**EARS:** *(RE-04a Ubiquitous)* El sistema siempre serializará las llamadas de polling por cuenta (nunca dos en vuelo sobre la misma cuenta).
*(RE-04b Event)* Cuando 3 sondeos consecutivos tengan éxito, el sistema restaurará el intervalo base de 5 s.

## CU-05 — Pausar y reanudar un stream
**Actor:** Emisor · **Trazabilidad:** RF-05, RF-14, D10 · **Precondición:** flow activo; firmante == sender.

```gherkin
Dado un flow activo con depositTotal agregado = DEP_n (§0)
Cuando el emisor pulsa Pausar
Entonces el flow queda status=Paused, netFlowRate se recalcula excluyendo ese flow (solo activos)
Y netOutflowGarantizado conserva el rate nominal y depositTotal NO cambia (pausa retiene)
Y FlowPaused(sender, receiver) aparece en logs (RNF-10)

Dado el mismo flow pausado
Cuando el emisor pulsa Reanudar
Entonces el flow vuelve a status=Active con el mismo flowRate
Y accumulatedBalance permanece invariable respecto al valor liquidado al pausar (no hubo devengo durante la pausa)

Dado un flow YA pausado
Cuando intenta pausarlo de nuevo
Entonces revierte con "EuroX: already paused"

Dado un sender con sus 3 flows pausados
Cuando un tercero calcula T = (virtualBalance+depositTotal)/netOutflowGarantizado
Entonces T es finito (>0) como cota informativa, pero settle(emisor) REVIerte "EuroX: not insolvent" mientras virtualBalance > 0 (§0: el reloj no habilita liquidación; el depósito sigue retenido y desenvolvible solo al cerrar)
```
**EARS:** *(RE-05a State-driven)* Mientras un flow esté pausado, el sistema no acumulará devengo alguno para ese par.
*(RE-05b State-driven)* Mientras existan flows pausados, el sistema retendrá su contribución a depositTotal vía netOutflowGarantizado.

## CU-06 — Cerrar un stream (deleteFlow/closeFlow)
**Actor:** Emisor (solo el sender) · **Trazabilidad:** RF-06, RF-14, D10, RNF-08 · **Precondición:** flow existente; firmante == sender.

```gherkin
Dado un flow activo o pausado con accumulatedBalance A y t segundos desde lastUpdateTimestamp
Cuando el emisor ejecuta closeFlow
Entonces se liquida el tramo pendiente hasta now y FlowClosed(sender, receiver, delta) se emite
Y depositTotal se recalcula como DEP_(n-1) según §0 (se libera RATE_efectivo × 3600 de esa pareja)
Y la invariante RNF-08 permanece consistente tras la transacción

Dado una cuenta distinta del sender
Cuando intenta closeFlow sobre ese flow
Entonces revierte con "EuroX: only sender"
```
**EARS:** *(RE-06 Event)* Cuando un flow se cierre, el sistema recalculará el depósito agregado dentro de la misma transacción, liberando RATE_efectivo × 3600 asociado a esa pareja.

## CU-07 — Liquidación por insolvencia (settle permissionless + pull)
**Actor:** Cualquier cuenta (keeper/receptor/tercero) · **Trazabilidad:** RF-13, D9, RNF-08, RNF-10 · **Precondición:** emisor con **insolvencia real**: `virtualBalance(emisor) ≤ 0` tras liquidar devengo hasta `now`. T = floor((virtualBalance+depositTotal)/netOutflowGarantizado) es solo cota informativa de adelanto máximo.

```gherkin
Dado un emisor insolvente con N flows salientes (virtualBalance ≤ 0 verificado on-chain)
Cuando cualquier cuenta llama settle(emisor)
Entonces liquida y cierra todos sus flows hasta el instante exacto de agotamiento (nunca más), marca status=Closed, actualiza settledUpTo = timestamp de agotamiento (SOLO timestamp) y registra la deuda impagada en pendingDeficit
Y NO transfiere fondos a receptores en esta llamada (patrón PULL: reclaman con claimSettled())
Y los residuos < 1 wei por receptor van a pendingPool asignados en orden de iteración determinista (flowRate desc, receiver asc) — el orden NO es prioridad de cobro
Y Settled(emisor, settledUpTo, deficit) se emite (RNF-10)

Dado un receptor con devengo reclamable > 0
Cuando llama claimSettled()
Entonces recibe exactamente min(earnedUnclaimed, parteProrrateada) y sum(salidas reales) == EURx disponibles (assert de conservación); ningún cierre o settle destruye devengo no reclamado (§0 reglas contables)

Dado un emisor insolvente con N flows y fondos solo para M < N
Cuando se liquida y reclama
Entonces el remanente se prorratea PROPORCIONALMENTE por flowRate nominal entre flujos activos Y pausados (política única §0; no existe waterfall por orden)
```
**Alternativos:**
```gherkin
Dado un emisor con virtualBalance > 0 (solvente, p.ej. todos sus flows pausados y saldo intacto)
Cuando un tercero intenta settle(emisor)
Entonces revierte "EuroX: not insolvent" sin mutar estado (el reloj alone NO habilita settle; Gherkin negativo exigido por la auditoría)

Dado un settle ya ejecutado (todos los flows Closed)
Cuando se llama de nuevo
Entonces es no-op idempotente que devuelve settledUpTo vigente
```
**EARS:** *(RE-07a Ubiquitous)* El sistema computará todo devengo on-chain; ninguna corrección depende de que la web esté viva ni del operador.
*(RE-07b Unwanted)* Si existe déficit, entonces el sistema lo registrará en pendingDeficit (uint256 wei) y nunca en settledUpTo.
*(RE-07c Unwanted)* Si `virtualBalance(emisor) > 0`, entonces el sistema rechazará `settle` — la insolvencia es condición de estado, no temporización.

## CU-08 — Ver flows recibidos (vista receptor)
**Actor:** Receptor · **Trazabilidad:** RF-12, D14, RNF-04 · **Precondición:** cuenta conectada; emisores conocidos obtenidos de eventos FlowCreated (cast logs / índice local de sesión).

```gherkin
Dado una cuenta conectada que es receiver de 2 flows creados por emisores conocidos
Cuando abre la pestaña "Recibidos"
Entonces ve ambos flows con rate entrante, accumulatedBalance y saldo virtual en tiempo presente
Y el netFlowRate mostrado es positivo (+Σ rates entrantes)

Dado un RPC degradado (timeout)
Cuando falla la consulta de flows recibidos
Entonces la UI conserva el último snapshot con marca "desactualizado hace Xs" sin borrar cifras (mismo patrón backoff de CU-04)
```
**EARS:** *(RE-08 State-driven)* Mientras el sender de un flow recibido deje de estar disponible en la lista local de sesión, el sistema conservará el flow visible solo durante esa sesión — no existe índice inverso global en v1 (exclusión §4).

## CU-09 — Conectar wallet a la red Codecrypto
**Actor:** Emisor / Receptor · **Trazabilidad:** RF-09, D2, RNF-02 · **Precondición:** navegador con o sin MetaMask; RPC público accesible.

```gherkin
Dado un navegador sin MetaMask instalado
Cuando carga el Dashboard
Entonces se muestra estado "solo lectura" consultando NEXT_PUBLIC_RPC_URL y ninguna clave privada existe en el bundle (grep del build → 0 coincidencias de pk)

Dado MetaMask conectado a otra cadena (p.ej. 1)
Cuando el usuario pulsa "Conectar"
Entonces la app solicita switch/add a chainId 81234 con los parámetros de web3.ts y rechaza operaciones mientras la red activa ≠ 81234

Dado una wallet que rechaza el request de switch (user denied)
Cuando reintenta "Conectar"
Entonces la app queda en modo solo-lectura con banner explicativo, sin bucle infinito de requests
```
**EARS:** *(RE-09a State-driven)* Mientras la red activa sea distinta de 81234, el sistema impedirá cualquier transacción firmada.
*(RE-09b Ubiquitous)* El sistema nunca incluirá claves privadas en el bundle ni en localStorage.

## CU-10 — Desplegar todo el sistema (owner/admin)
**Actor:** Owner (cuenta #0 Anvil) · **Trazabilidad:** RF-01, RF-10, D11, D12, RNF-07 · **Precondición:** `sc/.env` con DEPLOYER_PRIVATE_KEY de la cuenta #0 y ≥ 5 CC (verificado 89 CC).

```gherkin
Dado sc/.env con la clave y RPC Besu accesible
Cuando se ejecuta forge script DeployAll.s.sol --broadcast
Entonces se despliegan Euro.sol (hard-cap supply 10_000_000e18, owner = #0), EuroxFactory.sol y EuroX.sol(EUR)
Y out/deployments/codecrypto.json registra addresses con networkId 81234 y timestamp
Y re-ejecutar el script genera un registro nuevo sin corromper el anterior (RNF-07)

Dado ausencia de sc/.env o RPC inaccesible
Cuando se ejecuta el script
Entonces falla antes de broadcast con mensaje de preflight legible y sin gasto de gas
```
**EARS:** *(RE-10 Event)* Cuando un despliegue se complete, el sistema escribirá el registro de deployment atómico (JSON único por red+timestamp) antes de dar por terminada la ejecución.

## CU-11 — Financiar cuentas destinatarias vía faucet
**Actor:** Estudiante/Owner · **Trazabilidad:** RF-11 · **Precondición:** dirección válida sin CC; cuota disponible (máx 100 CC/solicitud).

```gherkin
Dado una dirección nueva sin CC
Cuando su titular solicita 100 CC en https://faucet.codecrypto.academy/
Entonces eth_getBalance refleja el ingreso y la cuenta puede pagar gas de mutaciones (~1 gwei)

Dado una solicitud rechazada por el faucet (cuota/límite del operador)
Cuando el titular reintenta
Entonces el README documenta repetir la solicitud o contactar al operador (flujo manual, riesgo aceptado §4.1)
```
**EARS:** *(RE-11 Ubiquitous)* La aplicación web nunca solicitará ni almacenará la frase mnemonic que el usuario introduce en el faucet.

## CU-12 — Acceder a la preview GCP protegida
**Actor:** Visitante autorizado (IP del curso) · **Trazabilidad:** RT-08, RNF-13, D16 · **Precondición:** Cloud Run desplegado con allow-list configurada.

```gherkin
Dado el frontend en Cloud Run con allow-list de IPs del curso
Cuando una IP fuera de la lista solicita la raíz
Entonces recibe 403 sin exponer el bundle con el RPC académico

Dado una IP autorizada
Cuando carga la preview
Entonces ve el disclaimer "tokens de prueba sin valor" visible sin scroll (RNF-12) y el título indica entorno beta

Dado Cloud Run sin allow-list aplicada (error de config)
Cuando audita el pipeline de despliegue
Entonces el job de verificación falla: la política es gate obligatorio del pipeline
```
**EARS:** *(RE-12a State-driven)* Mientras la solicitud provenga de una IP fuera de la allow-list, el sistema responderá 403 sin servir assets estáticos.
*(RE-12b Ubiquitous)* El sistema mostrará el aviso legal de tokens de prueba en cada vista principal sin necesidad de scroll.

## CU-13 — Consultar el detalle de un flow (getFlow)
**Actor:** Emisor o Receptor · **Trazabilidad:** RF-07, RT-07 · **Precondición:** flow existente para (sender, receiver).

```gherkin
Dado un flow activo creado con accumulatedBalance A liquidado hasta lastUpdateTimestamp L
Cuando se consulta getFlow(sender, receiver) vía lib/superfluid.ts
Entonces devuelve { flowRate: RATE, status, accumulatedBalance: A, virtualDevengo: A + RATE×(now−L) }
Y getAccountInfo(sender) devuelve { netFlowRate, netOutflowGarantizado, depositTotal: DEP_n }
Y una consulta sobre pareja sin flow devuelve null sin revert (lectura pura)
```
**EARS:** *(RE-13 Ubiquitous)* El sistema expondrá getFlow como view pura sin gas de mutación; el depósito consultado proviene de AGGREGATOR.depositTotal, no de FLOW.

## Matriz de cobertura (trazabilidad inversa)

> Estado actualizado tras H1–H6 (v1 beta): `implementado` = test ejecutándose y verde;
> `previsto` = diseñado pendiente. Verificación mecánica: `tools/coverage-check.mjs`.

| Requisito | Caso(s) | Test previsto | Tipo | Estado |
|---|---|---|---|---|
| RF-01 | CU-10 | `Euro.t.sol::test_supply_cap` | unit | implementado |
| RF-02 | CU-01, CU-02 | `EuroX.t.sol::test_wrap_unwrap_invariant` + `test_downgrade_blocked_by_deposits` + `test_events_wrapped_unwrapped` | unit/fuzz | implementado |
| RF-03 | CU-03 | `EuroX.t.sol::test_create_flow_rate_exact` | unit | implementado |
| RF-04 | CU-03 | `EuroX.t.sol::test_create_flow_multi_receiver` | unit | implementado |
| RF-05 | CU-05 | `EuroX.t.sol::test_pause_all_flows_keeps_settlement_window` | unit | implementado |
| RF-05 (reanudar) | CU-05 | `EuroX.t.sol::test_resume_same_rate_no_accrual_during_pause` | unit | implementado |
| RF-06 | CU-06 | `EuroX.t.sol::test_close_releases_aggregated_deposit` | unit | implementado |
| RF-07 | CU-13 | `EuroX.t.sol::test_get_flow_view_projection` | unit | implementado |
| RF-08 | CU-04 | E2E `dashboard.spec.ts::live_balance_monotonic` | e2e | implementado |
| RF-09 | CU-09 | E2E `wallet.spec.ts::chain_guard` | e2e | implementado |
| RF-10 | CU-10 | `tools/check-deployments.mjs` (schema + idempotencia) | script CI | implementado |
| RF-11 | CU-11 | checklist README firmado (manual) | manual | implementado |
| RF-12 | CU-08 | E2E `received.spec.ts::list_incoming` | e2e | implementado |
| RF-13 | CU-07 | `EuroX.t.sol::test_settle_pull_prorata_conservation` + `test_settle_reverts_when_solvent` (diferencial waterfall-vs-prorrateo con pool insuficiente y 3 flows desiguales) | unit/fuzz | implementado |
| RF-14 | CU-05, CU-06 | `EuroX.t.sol::test_only_sender_can_pause_close` | unit | implementado |
| RNF-01 | arquitectura | slither + grep `delegatecall\|selfdestruct` = 0 | CI static | implementado |
| RNF-02 | CU-09, CU-10 | grep CI sobre `web/.next/static` buscando patrones pk = 0 | CI | implementado |
| RNF-03 | todos | meta-test `tools/coverage-check.mjs`: falla si algún RF-MUST tiene 0 tests nombrados | CI | implementado |
| RNF-04 | CU-04 | `tools/rpc-latency.mjs` (percentiles n=200) + assertions backoff en spec | script/e2e | implementado |
| RNF-05 | CU-01..CU-06 | `page.on('console')` vacío + estados de error D7 visibles en cada spec | e2e | previsto |
| RNF-06 | operación | grep README: secciones obligatorias presentes | CI doc | implementado |
| RNF-07 | CU-10 | doble corrida de DeployAll + diff de deployments/*.json | integration | previsto |
| RNF-08 | CU-01..07, CU-13 | fuzz invariant `--fuzz-runs 1000` wrap/unwrap/create/pause/close/settle | fuzz | implementado |
| RNF-09 | dashboard | axe-core `axe.spec.ts::dashboard_contrast` (WCAG AA básico) | e2e | implementado |
| RNF-10 | CU-01..CU-07 | event assertions Wrapped/Unwrapped/FlowCreated/FlowPaused/FlowResumed/FlowClosed/Settled/**Claimed** en suite forge (nombres literales = ABI) | unit | **implementado** |
| RNF-11 | custodia | checklist restauración README + prueba importar pk #0 en wallet limpia | manual | implementado |
| RNF-12 | CU-12 | grep build: Disclaimer renderizado en layout raíz | CI | previsto |
| RNF-13 | CU-12 | grep IaC Cloud Run: policy allow-list presente (gate pipeline) | CI | previsto |
| RT-01 | H1/H2 | `forge --version` runbook = global 1.8.3 ✔ | manual/runbook | verificado |
| RT-02 | CU-10 | `cast chain-id --rpc-url $RPC_URL` == 81234 en preflight | script | previsto |
| RT-03 | CU-11 | proceso faucet documentado | manual | previsto |
| RT-04 | H1 | foundry.toml parseable + rpc_endpoints.besu resuelto | build | previsto |
| RT-05 | H3 | ABIs copiados a `web/src/abi/` validados por tsc | build | previsto |
| RT-06 | CU-09, CU-13 | web3.ts importable sin hardcode fuera de config | lint | previsto |
| RT-07 | CU-13 | firmas lib/superfluid.ts == 6 del brief + pauseFlow/resumeFlow/closeFlow(≡deleteFlow)/settle/claimSettled/getAccountInfo (typecheck cubre API completo que los CU invocan) | typecheck | previsto |
| RT-08 | CU-12 | build Docker standalone + NEXT_PUBLIC_* smoke test imagen | CI | previsto |
