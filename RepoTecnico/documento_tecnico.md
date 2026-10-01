# Documento Técnico — Superfluid EUR Streaming v1 (beta)

> Fase 2 · elaborado sobre `requerimientos.md` (RF/RNF/RT + D1–D16), `casos_uso.md` auditado y
> `diagramas_casos_uso.md`. Cada componente traza a CU-xx y RF/RNF/RT. Incluye la nota comparativa
> **CFA real vs envoltorio propio** aprobada en Bloque 7 (P21).

## 1. Visión general y alcance

Aplicación educativa de money streaming: token ERC20 `EUR` (prueba, sin valor), envuelto como
Super Token propio `EURx`, con flujos continuos de 2000 EUR/mes (`RATE = 771604938271604 wei/s`,
mes = 30 días) a múltiples destinatarios, desplegada en la red privada Hyperledger Besu
CodeCrypto (chainId 81234) usando Foundry global del servidor, con dashboard Next.js 15 y preview
en Cloud Run. Exclusiones: ver `requerimientos.md §4`.

## 2. Arquitectura

```
[Navegador]                     [Besu Codecrypto 81234]           [GCP mcc-ecommerce]
MetaMask ──firma──┐             ┌──────────────────────┐          ┌───────────────┐
Dashboard Next15 ─┼─ RPC HTTPS ─► Euro.sol (ERC20 cap) │          │ Cloud Run     │
 lib/superfluid.ts│              │ EuroxFactory.sol    │          │ (allow-list)  │
 config/web3.ts ◄─┘              │ EuroX.sol (SuperTok)│◄─custodia│               │
   polling 5s+backoff            └──────────────────────┘  1:1    └───────────────┘
```

### 2.1 Módulo contratos (`sc/src/`) — traza RT-01, RT-02, RT-04, RNF-01, RNF-08, RNF-10, CU-01..08, CU-13

| Componente | Descripción | Trazabilidad |
|---|---|---|
| `foundry.toml` | `[rpc_endpoints] besu = env RPC_URL`, solc 0.8.28, libs OZ vía forge install; parseable en build | RT-04, RT-01 |
| `Euro.sol` | ERC20 OpenZeppelin 5.1.0, Solidity 0.8.28, 18 dec, hard-cap `MAX_SUPPLY = 10_000_000e18` enforced in `_mint`; owner = cuenta #0; mint/burn solo hasta cap | RF-01, CU-10, D11 |
| `EuroxFactory.sol` | Registro de pares underlying→superToken por owner; v1 un par; patrón clon-lite o deploy directo | RF-10, D12, CU-10 |
| `EuroX.sol` | Super Token: wrap/unwrap 1:1 (custodia EUR, emite `Wrapped/Unwrapped`), mapping flows `(sender→receiver→Flow{flowRate int96, status enum(Active/Paused/Closed), lastUpdateTimestamp uint40, accumulatedBalance uint128})`, Aggregator por cuenta (`netFlowRate`, `netOutflowGarantizado`, `depositTotal`, `settledUpTo`, `pendingDeficit`, `pendingPool`), earnedUnclaimed por pareja, `settle()` pull + `claimSettled()`, views `getFlow/getAccountInfo/virtualBalanceOf` | RF-02..07, RF-12..14, D9/D10-bis, CU-01..08, CU-13 |

**Reglas de invariantes del core — V3 (post-auditoría de código; verificadas por fuzz RNF-08):**
1. Conservación: `Σ_a realBalanceOf(a) == totalSupplyX` (I1, estructural en el modelo de reserva) y custodia `Σ realBalanceOf == EUR retenido == totalSupplyX` (I4, RE-01a). `virtualBalanceOf(a) = real(a) − owed(a) − tramo vivo` (I4 derivada §0).
2. `depositTotal(account) == netOutflowGarantizado(account) × 3600` (sin techo).
3. Pre-creación: `realBalanceOf ≥ depositTotal_nuevo + owed_actual + rate×3600` (gate V3; única formulación que enlaza RE-03a y `test_create_flow_rate_exact`).
4. Conservación en settle/claim: `sum(salidas reales) == EURx disponibles`; residuos → `pendingPool`; ningún cierre/settle destruye devengo no reclamado.
5. Trigger de settle = condición de estado V3: `owed > real` tras materializar (⇔ virtual ≤ 0), RE-07c; T solo cota informativa. `settledUpTo` inicial = block.timestamp en primera mutación; re-settle sin deuda = no-op idempotente.
6. Política de escasez única V3: prorrateo por flowRate nominal de parejas con deuda (activos/pausados/cerrados), recortado al debido, residuo redistribuido determinista; límite first-mover entre mutaciones documentado y aceptado para beta.
7. Reentrancia: `settle`/`claim` siguen checks-effects-interactions; `receive` EUR vía transferencia estándar OZ (no `safeTransferFrom` callbacks re-entrantes sobre estado mutable).

### 2.2 Módulo frontend (`web/src/`) — traza RT-05, RT-06, RT-07, RNF-02, RNF-04, RNF-05, RNF-09, RNF-12, CU-01..09, CU-12, CU-13

| Componente | Descripción | Trazabilidad |
|---|---|---|
| `config/web3.ts` | chainId/rpcUrl/addresses desde `sc/out/deployments/codecrypto.json` exportado (ruta canónica única); constantes RATE/DEP (§0 casos_uso) compartidas | RF-09, RT-06 |
| `src/abi/*` | ABIs generados por `forge build --extra-output`, copiados al pipeline web y validados por tsc | RT-05 |
| `lib/superfluid.ts` | capa con las 6 firmas del brief (`upgradeToEuroX`, `downgradeFromEuroX`, `createFlow`, `deleteFlow`(≡closeFlow), `getFlow`, `getRealtimeBalance`) + `pauseFlow/resumeFlow/closeFlow/settle/claimSettled/getAccountInfo` | RT-07, CU-02/05/06/07/08/13 |
| `components/Dashboard.tsx` | wallet connect/guard de red, wrap/unwrap, alta de destinatario con modal irrevocabilidad, lista flows sender (paginación 10/página), pestaña Recibidos, pausa/reanudar/cerrar, balances live | RF-02..08, RF-12/14, D13/D15, CU-01/03/04/05/06/08/09/12 |
| Polling engine | serializado por cuenta, base 5 s, backoff 15/30 s, timeout umbral 25 s, recuperación tras 3 éxitos; banner degradado; consola limpia en flujo feliz | RNF-04, RNF-05, D8, RE-04 |
| A11y/Legal | WCAG AA básico (axe en E2E), Disclaimer visible sin scroll | RNF-09/12, CU-12 |

### 2.3 Infraestructura y operación — traza RT-01, RT-02, RT-03, RT-08, RNF-02, RNF-03, RNF-06, RNF-07, RNF-11, RNF-13, CU-10, CU-11, CU-12

- Foundry global `~/.foundry/bin` (1.8.3) — sin instalación por proyecto (RT-01).
- Deploy (fuente ejecutable autoritativa = `entornos_globales.md §Comandos clave`):
  ```bash
  cd sc && source .env
  forge script sc/script/DeployAll.s.sol:DeployAllScript \
    --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast
  ```
  Preflight valida chainId==81234 (`cast chain-id`) y saldo CC ≥ 5 (CU-10, RT-02).
  Registro canónico **versionado**: `sc/deployments/codecrypto.json` (fs_permissions en foundry.toml; networkId+timestamp+chainId; RNF-07 doble corrida + `tools/check-deployments.mjs` anclado a la raíz del repo).
- Financiamiento: faucet Codecrypto ≤ 100 CC/solicitud (RT-03, CU-11, RF-11) — procedimiento MANUAL documentado en README/runbook; sin componente de código.
- Preview: Docker multi-stage Next standalone → Artifact Registry → Cloud Run `europe-west1`, variables `NEXT_PUBLIC_*` cargadas desde `web/.env.local` en build (RT-08); allow-list IPs curso como gate de pipeline (CU-12, RNF-13). El bundle expone el RPC académico: riesgo aceptado y documentado (Bloque 4 Q12).
- CI/seguridad: job grep pk sobre `web/.next/static` (RNF-02), meta-test `tools/coverage-check.mjs` que falla si algún RF-MUST tiene 0 tests nombrados (RNF-03), slither estático (RNF-01), README con secciones obligatorias y checklist de custodia/restauración de claves (RNF-06, RNF-11).
- Lista cerrada de eventos emitidos por EuroX.sol (RNF-10): `Wrapped(account,amount)`, `Unwrapped(account,amount)`, `FlowCreated(sender,receiver,flowRate)`, `FlowPaused(sender,receiver)`, `FlowResumed(sender,receiver)`, `FlowClosed(sender,receiver,deltaLiquidado)`, `Settled(emisor,settledUpTo,deficit)` — nombres literales = ABI final.

## 3. Modelo de datos preliminar

Entidades on-chain: EUR_TOKEN, FACTORY, SUPER_TOKEN, FLOW, AGGREGATOR (+ proyección getFlow).
Definición completa y tipos exactos en `diccionario_datos.md` / `diagrama_er.md` (sincronizados).
Sin BD relacional en v1 (P3); `base_datos.sql` queda condicional.

## 4. Flujos críticos (ver diagramas_casos_uso.md)

1. Crear stream + streaming continuo (CU-03/04) — secuencia §2 diagramas.
2. Insolvencia settle-pull + claim determinista (CU-07) — secuencia §3.
3. Ciclo de vida Active/Paused/Closed (stateDiagram §4).

## 5. Nota comparativa: CFA real de Superfluid vs envoltorio propio (compensación D1, P21)

| Mecanismo CFA real | En este proyecto (v1) | Diferencia y motivo |
|---|---|---|
| Host + CFA como contratos separados e inmutables, gestionados por gobernanza Superfluid | Lógica CFA dentro de `EuroX.sol` monolítico | Simplificación didáctica; sin soberanía multi-token ni upgradability |
| Resolver + `Framework.getResolver()` para descubrir host por cadena | Addresses hardcoded en web3.ts desde deployments.json | Besu 81234 no está en el resolver oficial (BRIEF §8) |
| Flow rate bidireccional: cualquier cuenta puede ser flowSender Y receiver simultáneamente con net rate | Sí se implementa (`netFlowRate`) | Equivalente funcional |
| Depósito por-flow con `deposit` y `buffer` configurables por ACL | Depósito agregado por cuenta = garantizado×3600 | Elección D10-bis: evita n×depósitos. Ojo: el depósito RETIENE desenvolvibilidad (RE-02); la solvencia 1:1 la sostiene la custodia, no el depósito |
| Liquidación automática continua "inline" en cada operación + timeout de insolvencia con `totalOperatingBalance` | `settle()` permissionless explícito + pull claim | Más simple y testeable; pierde granularidad de liquidación automática por segundo en mutaciones ajenas |
| ACL (access control list) modular, actualización de rates, `updateFlow` | Sin updateFlow en v1 (pausar/cerrar); sin ACL | Ejercicios intermedios del brief quedan fuera de v1 |
| SDK oficial `@superfluid-finance/sdk-core` + Subgraph para consultas | Capa TS propia con las mismas 6 firmas + ethers 5 | Sin subgraph en red privada; polling directo a vistas on-chain |
| Multi-framework: GDA (agregados), IDA (distribución instantánea) | No implementado | Fuera de alcance estricto del brief |

**Conclusión formativa:** el estudiante comprende wrap/unwrap, flow rate wei/s, depósito,
devengo continuo y liquidación — los cuatro conceptos nucleares del brief — pero debe saber que
el protocolo real añade gobernanza modular (Host/ACL), liquidación inline y ecosistema de índices.

## 6. Entornos y variables

Ver `entornos_globales.md` (red verificada, métricas de latencia reales, comandos, remotos duales,
política `/push`). Secretos: pk pública cuenta #0 solo en `sc/.env` local; `.gitignore` en raíz ya
cubre `.env*`, keystore y artefactos.

## 7. Riesgos técnicos residuales (post-auditoría V1 + auditoría CU)

| Riesgo | Mitigación v1 | Severidad residual |
|---|---|---|
| RPC único académico sin fallback; 47.9 % fallos en concurrencia 8 | backoff + snapshot UI + allow-list preview | MEDIA (aceptada, dependencia externa) |
| Persistencia/reset de la red Besu por su operador sin aviso | backups de deployments.json + runbook reproducible | MEDIA (riesgo aceptado, sin contacto formal P10) |
| pk pública de la cuenta #0 firma despliegues | red educativa privada; disclaimer; owner renunciable al cierre beta | BAJA (contextual) |
| Gas spikes o cambio de política QBFT | gasPrice actual 1 gwei constante; scripts parametrizados | BAJA |
| Deriva de reloj entre bloques (timestamp) en devengo | tolerancia ± block time 2 s declarada en tests E2E | BAJA |

## 8. Decisiones pendientes de implementación (Fase 3)

- Orden exacto de storage packing en `Flow`/`Aggregator` (gas).
- ¿`claimSettled` por receptor o batch `claimMany`? (v1: simple).
- ~~Naming de eventos y firma ABI final~~ → **CERRADO**: lista cerrada de eventos en §2.3; nombres de campos canónicos = `diccionario_datos.md` (lastUpdateTimestamp, accumulatedBalance).
- Pendiente solo: generación material de ABIs a `web/src/abi/` cuando exista `sc/`.

## 9. Trazabilidad consolidada

La matriz extremo-a-extremo (requisito → CU → test previsto → tipo → estado) vive en
`casos_uso.md §Matriz de cobertura` (35 requisitos: 14 RF + 13 RNF + 8 RT, todos con dueño y
test). Este documento enlaza componente→requisito en las columnas «Trazabilidad» de §2.1–2.3;
léanse juntas como el contrato de verificación de Fase 3.
