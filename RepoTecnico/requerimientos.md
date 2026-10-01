# Requerimientos — Superfluid EUR Streaming (v1 beta)

> Fuente: `BRIEF_SUPERFLUID.md` · Fase 1 cerrada + **Fase 2: auditoría V1 resuelta**
> (2026-09-29, entrevistas Bloques 1–7). Alcance v1: estrictamente lo pedido en el brief,
> subsanando ambigüedades y problemas de seguridad. Objetivo: sistema estable para **beta**.

## 0. Decisiones que subsanan las ambigüedades del brief

| # | Ambigüedad / problema detectado | Resolución adoptada en v1 | Justificación |
|---|---|---|---|
| D1 | Opción A vs B del §8 del brief (framework Superfluid real vs envoltorio propio) | **Opción B: Super Token propio (`EuroX.sol`) con semántica CFA simplificada, desplegado on-chain en Besu** | La red Codecrypto (chainId 81234) no está en el resolver oficial de Superfluid; la opción A exige desplegar el monorepo soberano completo (host + CFA + ACL + permissions), fuera del alcance "estricto" de v1. El envoltorio replica los conceptos didácticos exigidos por el brief (upgrade/downgrade, flow rate wei/s, depósito, flujo continuo). **Requiere confirmación del usuario (Pregunta 1).** |
| D2 | "Conectar wallet automáticamente (Anvil)" inyectaba private key en el frontend | **Nunca exponer claves en el navegador.** Conectividad vía MetaMask (red Codecrypto) o cuenta de solo-lectura; las transacciones se firman en la wallet del usuario. Para demo automatizada E2E se usa una cuenta de prueba dedicada solo en scripts locales. | Seguridad: brief original filtraba pk pública de Anvil en el cliente. |
| D3 | "Múltiples destinatarios" sin UI definida | Dashboard lista **todos los flows del sender** (crear, pausar/reanudar, cerrar por destinatario), límite blando de 10 flows visibles. | Cubre el objetivo explícito del brief. |
| D4 | Flow rate fijo 2000 EUR/mes vs ejercicios piden modificarlo | v1: **constante configurable** `DEFAULT_FLOW_RATE = floor(2000×10^18 / 2_592_000) = 771604938271604 wei/s` en `web3.ts`; **convención de producto: mes = 30 × 86400 s**; consecuencia declarada: un mes de 31 días drena 2066.67 EURx; residuo truncado 0.938 wei/s aceptado. Sin editor de rate (ejercicio intermedio, fuera de v1). | Estricción al brief + H-29 cerrado. |
| D5 | Depósito de seguridad no especificado | ~~Depósito igual a 1 hora de flujo por stream~~ → **superado por D10-bis**: depósito agregado por cuenta = netOutflowGarantizado × 3600 sin techo. | Regla mínima segura del CFA simplificado. |
| D6 | Tests solo de `Euro.t.sol` | Se añaden tests del core: `EuroX.t.sol` (wrap/unwrap/flow) con Foundry. Sin ellos no hay "sistema estable". | Criterio de estabilidad del usuario. |
| D7 | Manejo de errores indefinido | Validaciones explícitas: saldo insuficiente, dirección inválida/propia, flow duplicado, unwrap con streams activos → error claro en UI y revert en contrato. | Beta operativa. |
| D8 | "Ver balances en tiempo real cada 5 s" | Polling base 5 s con guarda anti-solapamiento y backoff 15/30 s ante timeout (block time QBFT medido = 2 s; RPC p90 ≈ 4.5 s; sin `eth_subscribe`). | Brief literal + medición live (auditoría V1 §2.3). |
| D9 | Liquidación por insolvencia indefinida (H-01) | `settle(account)` **permissionless** con patrón **PULL** y **trigger por condición de estado** (`virtualBalance(emisor) ≤ 0` tras liquidar devengo hasta now — el reloj no habilita settle, RE-07c). T = floor((virtualBalance+depositTotal)/netOutflowGarantizado) es cota informativa. Escasez: **prorrateo proporcional por flowRate nominal (activos+pausados)** como política única; `(flowRate desc, receiver asc)` solo como orden de iteración para residuos <1 wei (`pendingPool`), no prioridad de cobro. Déficit → `pendingDeficit`; devengo no reclamado → `earnedUnclaimed` por pareja (ningún cierre/settle lo destruye). Assert de conservación. `settledUpTo` inicial = block.timestamp primera mutación. | Aprobada Bloque 1 Q1 + refinada en auditorías CU y doc-técnico (pull+determinista V1:390; estado-vs-reloj y política única de escasez). |
| D10 | Semántica pausa vs cierre (H-03) | **Depósito agregado por cuenta** `(sender)` en `AGGREGATOR.depositTotal = netOutflowGarantizado × 3600`, **sin techo** (D10-bis, auditoría CU). `pauseFlow` = status Paused: rate efectivo 0 para devengo pero **retiene** garantía; `deleteFlow/closeFlow` = cerrar, liquidar y **liberar**. Dos tasas nombradas: `netFlowRate` (solo activos) y `netOutflowGarantizado` (activos+pausados). `getFlow` inmutable. | Aprobada Bloque 1 Q2 + refinada en auditoría de casos de uso. |
| D11 | Titularidad deployer/owner (P7) | Cuenta **#0 estándar de Anvil** `0xf39F…2266` como deployer+owner en Besu (pk pública del curso, asumible en red educativa privada); titular humano declarado: usuario/anlucorporations. Hard-cap supply 10M desde constructor; `renounceOwnership` opcional al cierre de beta. La cuenta generada `0xFFf3…12b9` queda **retirada** (su pk se expuso en chat). | Aprobadas Bloque 3 Q7/Q8. Balance verificado: 89 CC en #0 ✔. |
| D12 | EuroxFactory ambigua | **Se conserva** en v1 como MUST (decisión P5-auditoría): factory que registra pares EUR→EURx; con un único par hoy, deja abierta la multi-moneda del ejercicio avanzado sin coste contractual adicional. Definida en diccionario/diagrama con tests asignados. | Aprobada explícitamente por el usuario. |
| D13 | Límite de flows | Sin cota on-chain; paginación UI hasta 10 visibles por sender (límite solo de presentación). | Aprobada Bloque 2 Q6. |
| D14 | Destinatario (receptor) | Vista mínima «flows recibidos»: lista de flows donde `receiver == cuenta conectada` (consultando direcciones conocidas del sender emisor), net flow rate y retirada vía liquidación on-chain automática. RF-12. | Aprobada Bloque 5 Q13. |
| D15 | Direcciones destino irrecuperables | Aviso modal de irrevocabilidad antes de firmar + validación de destino ≠ contrato token/host. Sin whitelist EOAs en v1. | Aprobada Bloque 5 Q14. |
| D17 | Modelo contable tras auditoría de código V2 (hallazgos CRIT/ALTA) | **Reserva V3**: earnedUnclaimed vive DENTRO de real[sender]; claim transfiere real (débito+crédito, sin acuñación). Gate create: real ≥ deps+owed+rate×3600. Insolvencia: owed > real. Prorrateo nominal con recorte al debido. Limitación first-mover entre mutaciones aceptada para beta (settle es el mecanismo equitativo). | Aprobada implícitamente al resolver la auditoría V2 en H6 (2026-09-30); documentada en casos_uso §0. |
| D16 | Legal/licencia/RGPD | Cláusula «Limitaciones y aviso legal» (tokens de prueba sin respaldo, red educativa, prohibido uso real; nombres EUR/EURx se mantienen con sufijo visual "(token de prueba)"). Licencia **MIT**, titular CodeCrypto Academy/anlucorporations. RGPD: no aplicable (datos ficticios red privada), documentado como decisión; preview con allow-list. | Aprobadas Bloque 6 Q16-18. |

## 1. Requerimientos Funcionales (RF)

| ID | Requerimiento | Origen brief | Prioridad v1 |
|---|---|---|---|
| RF-01 | Desplegar token ERC20 `EUR` (18 dec, supply inicial 10,000,000, owner puede mint/burn, estándar OpenZeppelin) | §4.1 | MUST |
| RF-02 | Envolver EUR como Super Token `EURx` (upgrade/downgrade 1:1) | §5.1 | MUST |
| RF-03 | Crear flow continuo a un destinatario a tasa fija 2000 EUR/mes (771604938271604 wei/s) | §4.2, §5.2 | MUST |
| RF-04 | Soportar múltiples destinatarios simultáneos desde un remitente | §1, §4.2 | MUST |
| RF-05 | Pausar y reanudar un flow existente | §4.2 | MUST |
| RF-06 | Cerrar/deleteFlow devolviendo depósito y liquidando flujo acumulado | §4.2 | MUST |
| RF-07 | Consultar información de un flow (rate, saldo acumulado, depósito) | §4.2 | MUST |
| RF-08 | Balance en tiempo real (EUR, EURx, flujo neto por segundo) refrescado cada 5 s | §4.2 | MUST |
| RF-09 | Conectar wallet con la red Codecrypto (MetaMask chainId 81234) | §7.8 adaptado | MUST |
| RF-10 | Script `DeployAll.s.sol`: despliega EUR + EuroxFactory + EURx y registra addresses en `out/deployments/codecrypto.json` | §4.1, §7.6 | MUST |
| RF-11 | Crear/financiar cuentas destinatarias mediante faucet web (proceso manual documentado) | §3.3 | SHOULD |
| RF-12 | Vista «flows recibidos» para el receptor: lista de flows entrantes, net flow rate y liquidación automática on-chain | decisión D14 | MUST |
| RF-13 | `settle(account)` permissionless que liquida devengos y marca insolvencia según fórmula D9 | decisión D9 | MUST |
| RF-14 | Operaciones separadas `pauseFlow` (retiene depósito) y `closeFlow/deleteFlow` (libera depósito), ambas consultables por sender | decisión D10 | MUST |

## 2. Requerimientos No Funcionales (RNF)

| ID | Requerimiento | Criterio verificable |
|---|---|---|
| RNF-01 | Seguridad de contratos: OpenZeppelin 5.1.0 auditado, Solidity 0.8.28, sin `delegatecall`/`selfdestruct`, reentrancia protegida | `forge test` pasa suite; sin hallazgos críticos en auditoría |
| RNF-02 | Ninguna clave privada en el repositorio ni en el bundle del frontend | `.gitignore` + grep CI; keys solo en `.env` local / Secret Manager |
| RNF-03 | Estabilidad beta: todos los RF-MUST cubiertos por ≥1 test unitario/integración | 100% tests verdes antes de beta |
| RNF-04 | Disponibilidad de lectura: **p90 < 5 s y p95 < 20 s sobre 200 muestras; ≥ 95 % respuestas válidas en ventana de 10 min** (línea base medida en auditoría: p50 0.21 s, p90 4.45 s, timeouts ~4 %) | script `tools/rpc-latency.mjs` con percentiles; polling con guarda anti-solapamiento + backoff 15/30 s |
| RNF-05 | UI usable sin errores de consola en flujo feliz + estados de error visibles para todas las validaciones D7 | walkthrough E2E headless |
| RNF-06 | Documentación de operación mínima (README con pasos end-to-end) | entregable Fase 5 |
| RNF-07 | Idempotencia de deployment: volver a ejecutar `DeployAll` no duplica registros corruptos | `deployments/*.json` versionado por timestamp+network |
| RNF-08 | Invariante económica (forma canónica §0 casos_uso): global `Σ realBalanceOf(a) == Σ virtualBalanceOf(a) + Σ earnedUnclaimed`; por cuenta `virtualBalanceOf(a)+depositTotal(a) ≥ 0` y `realBalanceOf(a) ≥ depositTotal(a)`; se mantiene tras cada mutación (wrap/unwrap/create/pause/resume/close/settle/claim) | fuzz invariant `forge test --fuzz-runs 1000` + `tools/constants-check.mjs` en CI |
| RNF-09 | Accesibilidad WCAG 2.1 AA básico en dashboard (contraste, aria-labels, roles en cifras económicas) | verificación axe-core automatizada en E2E |
| RNF-10 | Observabilidad mínima: todo evento relevante emite Solidity Event (`FlowCreated/Paused/Closed/Settled/Wrapped`) indexable por `cast logs` | suite de tests que suscribe y valida emisión |
| RNF-11 | Backup/recuperación: la cuenta deployer usa pk pública del curso (D11); cualquier pk propia se registra en el archivo local cifrado del workspace con política de no-versionado documentada | checklist en README |
| RNF-12 | Legal: cláusula «Limitaciones y aviso legal» visible en UI y README; licencia MIT publicada antes del primer push | grep en build; revisión manual |
| RNF-13 | Preview GCP protegida por allow-list de IPs del curso (riesgo de exposición del RPC académico aceptado y documentado) | config Cloud Run + sección riesgos |

## 3. Requerimientos Técnicos (RT)

| ID | Requerimiento |
|---|---|
| RT-01 | Foundry global del servidor (`~/.foundry/bin`: forge/cast/anvil 1.8.3 verificados) — sin instalación por proyecto |
| RT-02 | Red destino: Codecrypto Besu, chainId **81234**, RPC `https://besu.alumnos.codecrypto.academy`, gasPrice 1 gwei (verificado) |
| RT-03 | Financiamiento de cuentas vía faucet `https://faucet.codecrypto.academy/` (CC nativa) |
| RT-04 | `sc/`: foundry.toml con `[rpc_endpoints] besu = ...`, redes remapeadas (OpenZeppelin vía `lib/forge-std` + deps npm→forge install) |
| RT-05 | `web/`: Next.js 15.5.4 + React 19 + TS + Tailwind 3.4 + ethers 5.7.2; ABIs generados por `forge build --extra-output` y copiados a `web/src/abi/` |
| RT-06 | Config de red centralizada en `web/src/config/web3.ts` (chainId, rpcUrl, addresses desde deployments.json) |
| RT-07 | Sin dependencia del SDK oficial `@superfluid-finance/sdk-core` en runtime (decisión D1); la capa `lib/superfluid.ts` expone la misma interfaz de funciones que pedía el brief (`upgradeToEuroX`, `downgradeFromEuroX`, `createFlow`, `deleteFlow`, `getFlow`, `getRealtimeBalance`) sobre los contratos propios |

## 4. Alcance de v1 (límites explícitos)

**Incluye:** todo RF-MUST + RNF + RT anteriores; dashboard de una página; rede solo Codecrypto; streaming EUR/EURx.

**Excluye de v1 (explícitamente fuera, según "estrictamente el brief"):**
- Ejercicios propuestos del brief (§11): editor de flow rate, multi-moneda (USD/GBP), contrato gestor automático de flows.
- Despliegue del framework Superfluid soberano completo (Opción A) — decisión D1/BRIEF §8 enmendado.
- Múltiples tokens base aparte de EUR.
- Índice inverso global on-chain para enumerar flows por receptor sin dirección de sender conocida (la vista RF-12 usa los emissores visibles).
- Nota: el despliegue GCP del frontend **SÍ entra** en v1 (P5/RT-08); la exclusión anterior de esta lista queda anulada.

### 4.1 Stakeholders identificados (post-auditoría)

| Rol | Quién | Responsabilidad |
|---|---|---|
| Director del proyecto / titular deployer | Usuario (anlucorporations) | aprueba alcance, custodia cuenta #0, autoriza `/push` |
| Estudiantes/usuarios beta | CodeCrypto Academy | operan dashboard con wallets propias |
| Receptores de streams | cuentas destinatarias | reciben flujos; ven vista RF-12 |
| Operador de red Besu | Administración CodeCrypto (sin contacto formal — decisión P10) | disponibilidad/persistencia del chain; riesgo aceptado |
| Administrador faucet | CodeCrypto Academy | cuota 100 CC/solicitud |
| Operador preview GCP | Usuario + agente | Cloud Run mcc-ecommerce, allow-list |
| Auditor documental | @audita (equipo-auditoria) | informe V1 y re-verificación en Fase 4 |

## 5. Base de datos

Este sistema **no tiene BD relacional propia**: el estado vive on-chain (Besu). Los artefactos
`diccionario_datos.md`, `diagrama_er.md` y `base_datos.sql` registran el **modelo lógico on-chain**
(estructuras de contrato/equiparables a tablas). Solo se crearía `base_datos.sql` si el usuario
aprueba añadir un backend de índice/historial (Pregunta 3).

## 6. Respuestas de la entrevista (Fase 1 cerradas — 2026-09-29)

- **P1 ✅** — Confirmada **Opción B**: Super Token propio `EuroX.sol` con semántica CFA simplificada.
- **P2 ✅** — Agente crea cuenta de prueba; usuario la financia en el faucet.
  Dirección: `0xFFf332f0f18a10de18E51c385dB22f5625Ce12b9` (pk local en `RepoTecnico/.deployer_wallet.local.json`, chmod 600, no versionar).
- **P3 ✅** — v1 **estrictamente on-chain**, sin BD relacional. `base_datos.sql` queda como placeholder condicional.
- **P4 ✅** — Remotos: GitLab.com `anlucorporations/superfluid` **+** GitLab institucional
  `https://gitlab.codecrypto.academy/anlucorporations/superfluid.git`, ambos en rama `superfluid-DSH-GCP`.
  Sin GitHub. Push solo con orden `/push`.
- **P5 ✅** — **Sí, desplegar preview GCP** del frontend en esta v1 (Cloud Run; proyecto/credenciales
  globales `mcc-ecommerce` vía `gcp-env.sh`). Se añade RT-08 y hito H5b al plan.

### Adición a Requerimientos Técnicos

| ID | Requerimiento |
|---|---|
| RT-08 | Frontend desplegable en Cloud Run (GCP `mcc-ecommerce`, región `europe-west1`) con build Docker/Next standalone; variables `NEXT_PUBLIC_*` inyectadas en build; acceso HTTPS para MetaMask |
