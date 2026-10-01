# Plan de Desarrollo Vertical — Fase 3 (Superfluid EUR Streaming v1)

> Cada hito es una entrega 100% operativa. Trazabilidad a CU/RF/RNF/RT y tests según
> `casos_uso.md §Matriz`. El contrato técnico autoritativo: `documento_tecnico.md` +
> `casos_uso.md §0` (constantes y reglas contables canónicas).

## H1 — Contratos + tests (`sc/`)
**Entrega:** `forge build` limpio y suite completa en verde en EVM local de forge.
- Scaffold Foundry: `foundry.toml` (solc 0.8.28, `[rpc_endpoints] besu`, libs OZ 5.1.0 vía forge install). RT-01/04
- `src/Euro.sol`: ERC20 OZ, hard-cap MAX_SUPPLY 10M enforced, mint/burn owner hasta cap. RF-01, CU-10
- `src/EuroxFactory.sol`: registro pares underlying→superToken, owner-only. D12, CU-10
- `src/EuroX.sol`: wrap/unwrap 1:1 con eventos Wrapped/Unwrapped; Flow{flowRate int96, status enum, lastUpdateTimestamp uint40, accumulatedBalance uint128}; Aggregator{netFlowRate, netOutflowGarantizado, depositTotal, settledUpTo, pendingDeficit, pendingPool}; earnedUnclaimed por pareja; createFlow/pauseFlow/resumeFlow/closeFlow/settle(estado ≤0)/claimSettled; views getFlow/getAccountInfo/virtualBalanceOf. RF-02..07/12..14, D9/D10-bis
- Tests: `Euro.t.sol::test_supply_cap`; `EuroX.t.sol` completo según matriz (wrap_unwrap_invariant, downgrade_blocked_by_deposits, events_wrapped_unwrapped, create_flow_rate_exact, create_flow_multi_receiver, pause_all_flows_keeps…, resume_same_rate…, only_sender_can_pause_close, close_releases_aggregated_deposit, get_flow_view_projection, settle_pull_prorata_conservation, settle_reverts_when_solvent) + fuzz invariant RNF-08 --fuzz-runs 1000. RNF-03
- Static: slither sin high/medium + grep delegatecall/selfdestruct = 0. RNF-01
- `tools/constants-check.mjs`: reevalúa RATE/DEP_1/DEP_3 contra §0. (proceso CI del hallazgo DEP_3)
**Criterio de salida:** 100% tests verdes; cobertura ≥1 test por RF-MUST verificado por coverage-check.

## H2 — Despliegue en Besu Codecrypto
**Entrega:** contratos vivos en chainId 81234 con registro de deployment.
- `script/DeployEuro.s.sol` y `script/DeployAll.s.sol:DeployAllScript` con preflight (cast chain-id == 81234, saldo CC ≥ 5). CU-10, RT-02
- Broadcast con cuenta #0 (`0xf39F…2266`, pk pública curso en sc/.env). D11
- Registro canónico `sc/out/deployments/codecrypto.json` (networkId+timestamp); doble corrida idempotente + `tools/check-deployments.mjs`. RNF-07, RT-06
- Verificación post-deploy: cast call totalSupply/cap, wrap mínimo, smoke flow 60 s y close. CU-01/03/06 live
**Criterio de salida:** transacciones confirmadas en Besu; smoke E2E on-chain pasa; JSON de despliegue estable.

## H3 — Scaffolding web + configuración
**Entrega:** Next.js 15 compilando con tipado estricto y capa de acceso a contratos funcional (solo-lectura).
- `create-next-app` App Router + TS + Tailwind 3.4; ethers 5.7.2. RT-05
- ABIs desde `forge build --extra-output` → `web/src/abi/` (script de copiado en package.json). RT-05
- `config/web3.ts`: chainId/rpcUrl/addresses leídos de deployments exportado + constantes §0 compartidas. RT-06
- `lib/superfluid.ts`: las 6 firmas del brief + pauseFlow/resumeFlow/closeFlow/settle/claimSettled/getAccountInfo. RT-07, CU-13
- Provider wallet: MetaMask con guard de red 81234 + modo solo-lectura sin wallet. RF-09, CU-09, D2
- Polling engine: serializado por cuenta, base 5 s, backoff 15/30 s, timeout 25 s, recuperación tras 3 éxitos. RNF-04, RE-04
- CI básico: tsc --noEmit, eslint, grep pk sobre bundle (RNF-02), constants-check.
**Criterio de salida:** `npm run build` limpio; typecheck cubre API completo; lectura de saldos reales desde Besu en página vacía.

## H4 — Dashboard completo
**Entrega:** UI operativa de todos los flujos del emisor y receptor.
- Balances live EUR/EURx/net rate cada 5 s. RF-08, CU-04
- Wrap/unwrap con validaciones D7 y estados de error visibles. CU-01/02, RNF-05
- Alta de destinatario: modal irrevocabilidad (D15), bloqueo self/contrato. CU-03
- Lista flows sender con paginación 10/página, pausa/reanudar/cerrar. RF-05/06/14, D13, CU-05/06
- Pestaña Recibidos (eventos FlowCreated → índice de sesión). RF-12, CU-08
- Actions settle/claim para keeper/receptor. RF-13, CU-07
- Disclaimer visible sin scroll + título beta + WCAG AA básico. RNF-09/12, CU-12
**Criterio de salida:** walkthrough manual feliz completo sobre Besu real; axe-core sin violaciones críticas.

## H5 — E2E automatizados
**Entrega:** specs Playwright/chromium headless sobre la app contra Besu (con fondos faucet de prueba).
- `dashboard.spec.ts::live_balance_monotonic`, `wallet.spec.ts::chain_guard`, `received.spec.ts::list_incoming`, `axe.spec.ts::dashboard_contrast`, asserts de consola limpia en cada spec (RNF-05) y backoff simulado (page.route latencia).
- Meta-test `tools/coverage-check.mjs`: todo RF-MUST con ≥1 test ejecutándose. RNF-03
**Criterio de salida:** suite E2E verde 2 corridas consecutivas.

## H5b — Preview GCP Cloud Run
**Entrega:** frontend público (allow-list IPs curso) corriendo en europe-west1.
- Docker multi-stage Next standalone; NEXT_PUBLIC_* inyectados en build; Artifact Registry + Cloud Run. RT-08
- Gate de pipeline: verificación allow-list presente (RE-12a) + grep disclaimer. RNF-13/12
**Criterio de salida:** URL HTTPS accesible desde IP autorizada; 403 fuera de ella; smoke CU-12.

## H6 — Cierre beta
- README end-to-end (run/deploy/disclaimer/checklist custodia RNF-11). RNF-06
- Re-auditoría @audita V2 sobre código (quick pass) + registro de revisión firmada (quién/cuándo). Bloque 3 Q9
- Estado del proyecto actualizado a "beta operativa".

## Orden y dependencias
H1 → H2 → H3 → H4 → H5 → H5b → H6. H3 puede solaparse con H2 (scaffold sin addresses hasta el final).
Riesgos heredados (ver documento_técnico §7): RPC académico frágil → todos los hits de H4/H5 llevan
fallback snapshot; red reseteable → H2 regenerable con un comando.
