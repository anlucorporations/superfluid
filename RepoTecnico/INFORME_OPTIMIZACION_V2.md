# INFORME DE OPTIMIZACIÓN V2 — Auditoría de Código (H6)
## Proyecto: Superfluid EUR Streaming v1 beta · CodeCrypto Academy

> **Alcance:** código real `sc/src`, `sc/test`, `web/src`, `tools/`, contratos V2 desplegados.
> **Método:** workflow de 3 lentes (SOLIDITY · FRONTEND · SPEC-CONSISTENCIA) con
> verificación adversarial independiente por dimensión (regla: ante la duda, descarta).
> **Fecha:** 2026-09-30 (retomado tras pausa del director; cerrado el mismo día).
> **Veredicto:** hallazgos confirmados ⇒ el contrato V2 **no era apto para beta** (2 CRÍTICOS
> de conservación/acuñación). **Todos los hallazgos bloqueantes quedaron RESUELTOS en la
> reescritura V3** documentada abajo; el sistema pasa con condiciones menores aceptadas.

---

## 1. Hallazgos verificados y resolución

| ID | Sev. | Dimensión | Hallazgo (resumido) | Resolución |
|---|---|---|---|---|
| H2-01 | CRITICA | SOLIDITY | `claimSettled` acuñaba `realBalanceOf` sin débito ni respaldo: Σ real podía exceder `totalSupplyX` (sobre-emisión + drenaje first-mover de custodia ajena) | **V3 modelo de reserva**: `earnedUnclaimed` es pasivo DENTRO de `real[sender]`; claim = débito del emisor + crédito del receptor (`require real[from] ≥ amount + deps[from]`). Invariante I1 `Σ real == totalSupplyX` añadida al fuzz + regresión `test_claim_cannot_mint_beyond_custody` |
| H2-02 | CRITICA | FRONTEND | ethers v5 devuelve `BigNumber`, el pipeline lo trataba como `bigint`: comparación lexicográfica del desenvolvible y resta IEEE-754 → cifra económica falsa o corrupta en UI | Coerción `B()` en TODA la frontera de lectura (`getFlow/getAccountInfo/getRealtimeBalance/incomingUnclaimed`); tipos bigint reales; `formatEur` con signo; regresión E2E `live_balance_monotonic` |
| H2-03 | ALTA | SOLIDITY | `settle()` contaba `real + depositTotal` (doble conteo del mismo EUR) ⇒ pagaba de más y sobre-emitía vía claims; el test codificaba el bug | `paid = real` (deps ⊆ real); `available` del test ya no suma deps; aserción de conservación `e1+e2 ≤ real_pre` |
| H2-04 | ALTA | SOLIDITY | `downgradeTo` con `require(depositTotal ≥ owedDue)` era dimensionalmente imposible tras 1 h ⇒ **lockout permanente de retirada** con cualquier stream vivo | Regla V3 `free = real − deps − owed` (incluye Closed con deuda); regresión `test_downgrade_works_after_two_hours_of_stream` |
| H2-05 | ALTA | SOLIDITY | close liberaba garantía conservando crédito; bucle de reserva ignoraba Closed; `settle` inalcanzable tras cerrar todo ⇒ deuda perpetua | `owedTotal` incluye Closed con crédito en create/downgrade/claim; settle opera con `garantizado==0`; re-settle sin deuda = no-op idempotente |
| H2-06 | ALTA | SPEC | Trigger de settle divergía del canónico §0 (reloj/banda gris), `settledUpTo` = block.ts en vez de agotamiento, re-settle revertía en vez de no-op | Predicado canónico V3 `owed > real` (⇔ virtual ≤ 0) materializado primero; `settledUpTo = block.timestamp` **aceptado y reescrito en §0** (documentado como instante de liquidación); no-op idempotente implementado; test banda gris (`test_settle_reverts_when_solvent` + pausa-total) |
| H2-07 | ALTA | SPEC | Prorrateo por devengo debido ≠ política §0 "flowRate nominal (activos+pausados)" | V3 prorratea por **rate nominal** de parejas con deuda (incluye pausados y cerrados con crédito), recorte al debido + redistribución determinista de residuo; test diferencial `test_settle_prorata_is_by_nominal_rate_not_by_due` (3 rates desiguales + 1 pausado) |
| H2-08 | MEDIA | SOLIDITY | Índice de outflows sin poda: mutaciones/vistas O(pares históricos) ⇒ riesgo DoS a escala | `_pruneIfInert` swap-and-pop al cerrar/reclamar parejas sin deuda |
| H2-09 | MEDIA | FRONTEND | Polling: backoff nunca se aplicaba (closure obsoleto), refreshNow perdido, datos entre cuentas | Motor reescrito: `intervalRef`, `pendingRefresh`, `epoch`, reset por `resetKey` (cuenta); etiqueta UI muestra el intervalo real |
| H2-10 | MEDIA | FRONTEND | Guard de red no revalidado al firmar; `accountsChanged` sin recheck; listener leak | `requireSigner` verifica `getNetwork().chainId` antes de firmar; `accountsChanged` revalida red; `removeListener` en cleanup |
| H2-11 | MEDIA | SPEC | Registro canónico muerto: `vm.writeJson` sin `fs_permissions` + ruta bajo `out/` gitignoreada + catch silencioso + 4 fuentes espejadas | `foundry.toml fs_permissions`; registro versionado **`sc/deployments/codecrypto.json`** escrito sin catch; `check-deployments.mjs` anclado al root; web3.ts/README/cloudbuild sincronizados automáticamente |
| H2-12 | MEDIA | SPEC | Guardas on-chain sin spec (buffer 1 h; undercollateralization) contradiciendo "única formulación" | §0 reescrito con la fórmula canónica V3 del gate (`deps + owed + rate×3600`) — decisión D17; docs actualizados el mismo turno |
| H2-13 | MEDIA | SPEC | Matriz con IDs inexistentes + `coverage-check` vacuo + eventos asserts faltantes + fuzz 500≠1000 | Títulos E2E renombrados a los IDs de la matriz; `coverage-check` valida títulos reales; asserts `expectEmit` FlowResumed/FlowClosed/Settled añadidos; `fuzz.runs = 1000` |
| H2-14 | MEDIA | SPEC | Evento `Claimed` fuera de la "lista cerrada" RNF-10 | Lista ampliada a 8 eventos en doc técnico §2.3 y matriz RNF-10 |
| H2-15+ | BAJA | varias | Signo net-rate, botones sin disabled por wrongNet, `poll.error` oculto, modal doble-firma, `humanizeError` gaps, parseEur 0, layout metadata, scratch `__ui296.tsx`, perSender alineado, README 7≠specs | Todas aplicadas en el mismo ciclo (ver diffs en `Dashboard.tsx`/`superfluid.ts`/`layout.tsx`) |

**Descartados por los verificadores adversariales** (selección): "pk expuesta en el bundle"
(el bundle es limpio; la pk del mock es la pública del curso, D11), "writeJson serializa string"
(falso verificado empíricamente), "saturación uint128 de pendingPool" (el cast es el residuo <n wei),
"prorrateo rompe conservación" (el recorte lo impide), entre otros — detalle en los JSON de la
corre: workflow `audita-codigo-v2b` (6 agentes, 3+3).

## 2. Corrección aplicable y no aplicada

- **Limitación first-mover entre mutaciones** (aceptada D17): documentada en README §Limitaciones y §0.
- **Migración a ethers v6** (alternativa recomendada por el auditor): no aplicada — la coerción
  `B()` en la frontera cubre el defecto con menos riesgo de reescritura en beta.
- **settle por lotes/paginado + máximo de flows** (H2-08 parcial): la poda del índice resuelve el
  caso de uso real (flujos cerrados); el tope duro queda como deuda para v2.

## 3. Estado de calidad tras V3 (métricas reales)

| Métrica | Valor |
|---|---|
| forge test | 4 Euro + 26 EuroX + 1 suite de invariantes (custodia 1:1, **Σ real==supplyX**, real≥deps, fórmula deps) = **31/31 verdes**, fuzz `runs=1000`, `viaIR` |
| slither src (V3, post-lint) | **0 high / 0 medium** en `src/` (incorrect-equality y uninitialized-local eliminados con cambios puramente internos; ABI verificado idéntico bit a bit → el contrato desplegado sigue siendo válido para el fuente actual); 25 restantes = Low/Informational (assembly documentado en getOpenOutflows, pragma, timestamps inherentes al streaming, librerías OZ) |
| Playwright E2E | **8/8 verdes en 2 corridas consecutivas** (incluye el nuevo negativo `chain_guard` de red equivocada y `live_balance_monotonic` con cifras V3 correctas) |
| Gates de proceso | `coverage-check OK (13 RF-MUST con tests nombrados y existentes)` · `constants-check OK` · `check-deployments OK (registro 1790817209)` |
| Despliegue V3 | EUR `0x36C0…B570` · FACTORY `0x809d…AC3D` · **EURx `0x7046…D16E`** en Besu 81234; smoke en vivo completo (wrap 300 → create → pause → resume → close → claim con `totalSupplyX` idéntico antes/después) ✔ |
| Preview | revisión `00003` sirviendo la app V3 (verificada la dirección EURx en el HTML) ✔ |

## 4. Registro de revisión (Bloque 3 Q9)

| Rol | Quién | Cuándo | Qué firmó |
|---|---|---|---|
| Auditoría automatizada | equipo @audita (workflow 6 agentes, lectura-only) | 2026-09-30 | Hallazgos con evidencia ruta:línea + recalculos |
| Implementación de fixes | agente desarrollador DSH (sesión superfluid) | 2026-09-30 | V3 + 5 tests de regresión + docs sincronizados |
| Verificación en vivo | cast smoke sobre Besu 81234 (transacciones reales) | 2026-09-30 | Conservación `totalSupplyX` post-claim |
| Aprobación de riesgo beta | director del proyecto (usuario) | **pendiente de ratificación explícita** | Limitaciones §2 + first-mover |

## 5. Acciones finales ejecutadas

1. Redeploy V3 + registro versionado + sincronización total de configs.
2. Re-auditoría slither sobre V3: 0 high/medium en `src/` (residuales Low/Informational en librerías OZ y patrones documentados).
3. Suite E2E completa ×2 consecutivas sobre V3.
4. Rebuild + redeploy de la preview Cloud Run con la app V3.
5. `estado_proyecto.md` → **beta operativa** (con la ratificación pendiente de riesgos §4).

## 6. Nota de trazabilidad fuente↔despliegue

Tras cerrar el informe se aplicaron dos correcciones de estilo slither al fuente (`>= <=` de rango en
lugar de `==` sobre enum; inicializaciones `= 0` explícitas). Se verificó que el **ABI compilado es
idéntico** byte a byte al desplegado (`diff` sobre `web/src/abi/EURx.json`) y que la suite sigue en
verde, por lo que **no se requirió redeploy** y la instancia en cadena (`0x7046…D16E`) es válida para
el fuente actual. Queda constancia para futuros diffs de bytecode: redeploy = `DeployAllScript`.

## 7. Veredicto final

Con los 15 hallazgos resueltos (2 CRÍTICOS, 5 ALTOS, 6 MEDIOS, 2 BAJAS, además de los descartes
documentados), la v1 cumple el mandato del director: *sistema estable con la mínima confianza para
operar en modo beta*, estrictamente en el alcance del BRIEF_SUPERFLUID.md. Riesgos abiertos a
ratificar por el humano: preview pública sin allow-list (pendiente lista de IPs del curso),
first-mover entre mutaciones (limitación D17) y disponibilidad del RPC académico.
