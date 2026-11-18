# Estado de ejecución (vivo) — Batería Superfluid Brlt

> Última actualización: 2026-11-18 · primera ejecución autorizada (FASE 5).
> Fuente: `05_resultados/resultados_2026-11-18.ndjson` (estado vivo = última
> entrada por escenario; los NOT_RUN nunca se borran, regla 6).

## Contadores vivos (125 escenarios)

| Estado | N | Nota |
|---|---|---|
| PASS | 3 | ESC-007 (Phantom), ESC-008 (Coinbase), ESC-009 (Trust) en extension-chrome, modo simulada |
| FAIL | 0 | Sin anomalías de la app |
| BLOCKED | 54 | Todos MetaMask real en Chrome: falta `E2E_WALLET_BUILD_METAMASK`; al ampliar filtros, Rabby (build) y Brave (`E2E_BRAVE_PATH`) también quedarán BLOCKED |
| NOT_RUN | 43 | 35 fuera de los filtros de la última corrida (Firefox/Edge/desktop sin filtro, wallets no incluidas) + 8 con pasos aún sin intérprete |
| N/A | 25 | Combinaciones inexistentes del catálogo (nunca cuentan como fallo) |

## Por plataforma

| Plataforma | PASS | FAIL | BLOCKED | NOT_RUN | N/A |
|---|---|---|---|---|---|
| extension-chrome | 3 | 0 | 54 | 16 | 2 |
| extension-firefox | 0 | 0 | 0 | 11 | 4 |
| extension-edge | 0 | 0 | 0 | 10 | 10 |
| desktop | 0 | 0 | 0 | 6 | 9 |

## Por wallet (estado vivo)

| Wallet | PASS | FAIL | BLOCKED | NOT_RUN | N/A |
|---|---|---|---|---|---|
| metamask | 0 | 0 | 54 | 8 | 2 |
| rabby | 0 | 0 | 0 | 13 | 0 |
| brave | 0 | 0 | 0 | 8 | 7 |
| okx | 0 | 0 | 0 | 11 | 0 |
| phantom | 1 | 0 | 0 | 3 | 5 |
| coinbase | 1 | 0 | 0 | 0 | 5 |
| trust | 1 | 0 | 0 | 0 | 6 |

## Escenarios con pasos sin intérprete (hueco de herramienta H-1)

ESC-006, ESC-046, ESC-059, ESC-071, ESC-087, ESC-103, ESC-123 (+ los de
sesión/filtros). Sus pasos observados y errores quedan en el NDJSON con
captura; **nunca se marcan como fallo de la app**.

## Pendientes para la siguiente ejecución

1. `E2E_WALLET_BUILD_METAMASK`, `E2E_WALLET_BUILD_RABBY`, `E2E_BRAVE_PATH` (desbloquea modo real).
2. Ampliar `helpers/pasos.ts` (flujos con sesión SIWE, portal, downgrade 80%).
3. Perfil de Firefox preparado (`E2E_FIREFOX_PROFILE`) para extension-firefox.
4. Confirmar si el proxy RPC admite `anvil_*` (anomalía de herramienta H-3).
