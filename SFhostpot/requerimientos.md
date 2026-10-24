# Requerimientos — SFhostpot (Superfluid Hotspot v1)

> Fuente: `RepoTecnico/BRIEF_SUPERFLUID_HOSTPOT.md`. Base de consulta: proyecto v1
> `superfluid-DSH-GCP` (`sc/`, `web/`, `RepoTecnico/`). Fase 1 — Concepto.
> Las decisiones **D1–D56** subsanan las ambigüedades del brief y las auditorías V1/V2; las
> entrevistas P1–P49 del director están **resueltas** (P1–P13 en §6, P14–P34 en
> [`resolucion_auditoria_v1.md`](resolucion_auditoria_v1.md) y P35–P49 en
> [`resolucion_auditoria_fase2.md`](resolucion_auditoria_fase2.md)).

## 0. Decisiones que subsanan las ambigüedades del brief

| # | Ambigüedad / problema detectado en el brief | Resolución adoptada en v1 de SFhostpot | Justificación |
|---|---|---|---|
| D1 | "EVM: Polygon, Base, Arbitrum, etc." no fija red | **Dev/test: Besu Codecrypto 81234** (reutiliza todo v1); producción configurable a L2 EVM por `gateways.chain_id` / `network`. | Permite arrancar y probar sin coste ni claves reales, sin cerrar la puerta a producción. |
| D2 | ¿Superfluid real (Host/CFA + USDCx) o token propio? | **Token propio `BarloventoToken` (BRLT) + Super Token `BarloventoTx` (BRLTx)**, adaptados de `Euro.sol`/`EuroX.sol` de v1 y redesplegados con el nuevo nombre (P2 confirmada). No se integra el SDK real en v1. | El motor CFA de v1 está probado (37 tests + fuzz) y era el activo más valioso a preservar; el usuario fija su propio token en lugar de USDCx. |
| D3 | Opción A (MikroTik REST) vs Opción B (RADIUS) | Interfaz **`GatewayAdapter`**; v1 implementa **ambos adaptadores** (MikroTik REST + RADIUS CoA/Disconnect) **+ el `mock` obligatorio** (P3 confirmada). No hay hardware real: la integración se valida contra simuladores (P3b). | El brief pide expresamente las dos opciones; se implementan ambas con el mock como banco de pruebas, sin depender de un router físico. |
| D4 | Precio por segundo indefinido y su ubicación | **Off-chain** en `gateway_tariffs` (`price_per_second_wei`, operator-managed); `HotspotRegistry.sol` on-chain como extensión futura. | El operador debe poder cambiar tarifas sin redeploy; la validación off-chain ya está en la ruta crítica del middleware. |
| D5 | "Acceso temporal 30–60 s" sin valor ni condición de corte | **60 s** desde que la tx se ve en mempool; si no hay inclusión en **2 bloques**, se revoca. | Ventana concreta, testeable y compatible con block time de 2 s medido en v1. |
| D6 | Anti-spoofing mencionado sin mecanismo | **Challenge firmado (SIWE)** + binding inmutable de la terna `(wallet, MAC, IP, session_token)` antes de ordenar al router; re-auth obligatoria si cambia IP o MAC. | El brief exige ligar la terna antes de abrir el router; la firma evita que un tercero reclame una MAC ajena. |
| D7 | Token de sesión "cookie o JWT" sin formato | **JWT HS256** de vida corta en cookie `httpOnly` + fila server-side revocable (`portal_sessions`). | Revocación inmediata en servidor y no exposición a JS. |
| D8 | "WebSockets/RPC/Webhooks" sin preferencia | **Polling con checkpoint** (`eth_getLogs` por rangos + `indexer_checkpoints`); WS si la red lo soporta. | v1 verificó que Besu no expone `eth_subscribe`; el polling con checkpoint es la única vía garantizada. |
| D9 | "En cuestión de segundos" sin SLA | **Doble SLA (D43)**: `revocation_command_latency_ms` p95 < 10 s desde la detección y `service_cutoff_latency_ms` p95 < 75 s end-to-end; **health-check cada 1 min** (D42, Jobs + Scheduler). | Convierte la promesa del brief en un criterio verificable compatible con la cadencia de 1 min. |
| D10 | RGPD no mencionado, pero se tratan MAC/IP | **RGPD/LOPDGDD aplicable**: aviso **antes** de persistir MAC/IP, base legal (ejecución de contrato/servicio), minimización, retención **30 días** con borrado físico y matriz de retención, derecho de supresión. | MAC e IP son datos personales; v1 no aplicaba por datos ficticios, aquí sí. |
| D11 | "ISP / redes de gran escala" ambiguo | Un operador en v1; esquema normalizado por `gateway_id` y `tenant_id` opcional. | Modelo preparado para multi-tenant sin implementarlo. |
| D12 | Wallet receptora del pago | `gateway_tariffs.payout_wallet` por tarifa/gateway. | Cada gateway puede liquidar a una wallet distinta. |
| D13 | Unidades de tasa y precio | `flowRate` on-chain en **wei/s (int96)**; tarifa en BD `numeric(38,0)` wei/s. | Evita errores de coma flotante; el brief usa tasas sub-centavo por segundo. |
| D14 | Comportamiento ante fallo del gateway | **Fail-closed** para sesiones nuevas (no autoriza); en sesiones activas, 3 reintentos con backoff y gracia antes de marcar `degraded`. | Prioriza no regalar servicio sin cortar a clientes por un fallo transitorio. |
| D15 | Legal/licencia | **MIT** + disclaimer visible; entorno de red de prueba; prohibido uso comercial real sin auditoría. | Hereda el enfoque v1 adaptado al dominio hotspot. |
| D16 | Pruebas sin hardware | Adaptador **`mock`** obligatorio + `docker-compose` con FreeRADIUS y mock MikroTik. | La CI y las pruebas E2E no dependen de un router físico. |
| D17 | Topología de despliegue (P9) — **sustituida en BD por D51** | **Todo en cloud**: orquestador y portal en Cloud Run + **PostgreSQL en Cloud SQL**. D51 precisa: `truekeate-db-dev` (`southamerica-east1`) con **esquema/BD dedicada `sfhostpot`** (residencia LatAm aceptada). El alcance RADIUS CoA/PoD al NAS exige **VPC Connector + firewall UDP 3799** o VPN. | Decisión del director; residencia y aislamiento se documentan como riesgo (ver §7). |
| D18 | Acceso de equipos hijos con voucher (P5) | La wallet **padre** abre el stream; **después** genera un **voucher** que da acceso a hasta **`max_children` (2) dispositivos hijos sin wallet**, con **`bandwidth_percent` (50 %)** y mientras dure el stream del padre. Tablas `vouchers` + `voucher_redemptions`, sesiones `access_mode='voucher_child'`. | El director definió el modelo padre/hijo: la wallet es el padre y el voucher crea hijos sin wallet con velocidad limitada. |
| D19 | Repositorio (P13) | **Repositorio nuevo e independiente** para SFhostpot (documentación en `SFhostpot/`, código en `sfh-*/`); no se reutiliza la historia de `superfluid` v1. | Decisión del director para separar claramente ambas versiones. |

> **Entrevista P1–P13 resuelta (2026-10-15).** Resoluciones: P1 → D1 (dev Besu, prod L2);
> P2 → D2 (**BRLT/BRLTx**); P3/P3b → D3 (ambos adaptadores, sin hardware real); P4 → D4 (tarifas por
> plan off-chain); P5 → D18 (**vouchers padre/hijo**, modelo definido en P12b); P6 → D11
> (mono-operador preparado); P7 → D10 (retención 30 días); P8 → D6 (SIWE + re-auth); P9 → D17 (todo
> cloud); P10 → parámetros BRLT; P11 → formato de códigos; P12/P12b → naturaleza del voucher;
> P13 → D19 (repositorio nuevo). D1–D4, D6, D10, D11 y D17–D19 quedan **confirmadas**; D5, D7, D8,
> D9, D12–D16 se ratifican por defecto.

## 1. Requerimientos Funcionales (RF)

### 1.1 Portal cautivo e identidad Web3

| ID | Requerimiento | Origen brief | Prioridad |
|---|---|---|---|
| RF-01 | El portal cautivo crea la `portal_session` **solo a través de un canal autenticado hotspot→API** (MikroTik llama a `/v1/internal/hotspot/bind` con allow-list de origen + firma HMAC del gateway y devuelve un `bind_token` de corta vida); la MAC/IP **nunca se aceptan del cuerpo del cliente**, se exige **aviso de privacidad aceptado** (`notice_version`/`notice_accepted_at`) antes de persistirlas, y la terna se confirma contra `/ip/hotspot/host`/`/ip/dhcp-server/lease` (previa) y `/ip/hotspot/active` (posterior). | §2.A.1, D45, V2-01 | MUST |
| RF-02 | El portal permite **conectar una wallet Web3** (Wagmi/Viem) y muestra la red/chain esperada. | §2.A.2 | MUST |
| RF-03 | El portal emite un **challenge de firma (SIWE)** y registra el binding `(wallet, MAC, IP, session_token)` en `device_bindings` antes de permitir cualquier orden al gateway. | §4 (MAC spoofing) | MUST |
| RF-04 | El portal permite **envolver el token subyacente** en el Super Token (`upgradeTo`/wrap 1:1) y muestra saldo y allowance. | §2.A.3 | MUST |
| RF-05 | El portal abre un **flow** hacia `payout_wallet` del gateway con `flowRate >= tarifa`; la interfaz expone el costo por segundo y el tiempo estimado con el saldo. | §2.A.3 | MUST |
| RF-06 | El portal muestra el **estado de la sesión** (provisional/activa/degradada/revocada) y avisa del disclaimer legal. | §4, D15 | MUST |

### 1.2 Orquestador / middleware

| ID | Requerimiento | Origen brief | Prioridad |
|---|---|---|---|
| RF-07 | **Indexador** de eventos `FlowCreated/Paused/Resumed/Closed/Settled/Claimed` desde la chain, con checkpoint persistente y sin pérdida ni duplicado (`flow_events` UK por `tx_hash+log_index`). | §2.C.1 | MUST |
| RF-08 | **Emparejamiento de identidad**: asocia la wallet emisora (`sender`) con la `(MAC, IP)` del binding y rechaza flujos de wallets no ligadas a la sesión. | §2.C.2 | MUST |
| RF-09 | **Validador de flujo**: autoriza solo si `flowRate >= gateway_tariffs.price_per_second_wei`, la wallet/receptor coinciden y el Super Token es el esperado. | §2.C.3 | MUST |
| RF-10 | **Autorización de gateway**: emite el comando de acceso (MikroTik login / RADIUS Access-Accept o CoA) y lo audita en `access_commands`. | §3.A, §3.B | MUST |
| RF-11 | **Revocación de gateway**: emite la orden de desconexión (DELETE hotspot active / RADIUS Disconnect-Request PoD UDP 3799) al detectar `FlowDeleted`, `flowRate = 0` o insolvencia. | §3.A.2, §3.B.3 | MUST |
| RF-12 | **Acceso provisional endurecido (un único oráculo por modo)**: otorga 60 s solo tras **observar y validar la tx** (`from == wallet del binding`, `to == Super Token`, método `createFlow`, `receiver == payout_wallet`, `flowRate >= tarifa`, saldo/nonce ejecutables). Modo `MEMPOOL_MODE=visible`: oráculo `eth_getTransactionByHash` (pendiente); modo `MEMPOOL_MODE=receipt`: oráculo `eth_getTransactionReceipt` (incluida). La concesión y la revocación usan **el mismo** oráculo; sin confirmación a 2 bloques en 60 s → revocación. Cuota **1 provisional por MAC+wallet cada 15 min**, intentos fallidos en `audit_log` y bloqueo ante abuso. | §4, H-02, D56/V2-06 | MUST |
| RF-13 | **Reconciliación y health-check**: **cada 1 min** (D42) valida solvencia (`virtualBalanceOf`) y estado del router; corrige divergencias router↔BD. | §4 (insolvencia), D42 | MUST |
| RF-14 | **API REST** para el portal y operadores: alta de sesión, challenge, apertura/estado/cierre de sesión, consulta de flows y health. | §2.C | MUST |

### 1.3 Operación, seguridad y multi-gateway

| ID | Requerimiento | Origen brief | Prioridad |
|---|---|---|---|
| RF-15 | **Administración de gateways y tarifas** (alta, edición, activación) mediante CLI/API admin con RBAC. | §3 | MUST |
| RF-16 | Soporte de **múltiples gateways** con adaptador declarado (`mikrotik_rest`, `radius`, `mock`) y `payout_wallet`/tarifa independientes. | §3.A/B | MUST |
| RF-17 | **Anti-suplantación MAC (D45)**: la terna `(wallet, MAC, IP)` se verifica contra la tabla `ip/hotspot/active` del NAS vía RouterOS REST antes de vincular; un binding queda bloqueado a su terna y los intentos de reutilizar la MAC con otra wallet/IP se rechazan (409) y auditan sin revocar al titular legítimo (D47). | §4, D45/D47 | MUST |
| RF-18 | **Auditoría completa** de comandos de acceso y acciones de operador (`access_commands`, `audit_log`) con resultado, latencia y reintentos. | §3 | MUST |
| RF-19 | **Cierre por insolvencia o pausa**: revoca en < 10 s desde la detección cuando `status != Active`, `flowRate < tarifa` o `virtualBalanceOf(sender) <= 0` (predicado cerrado, H-01/H-13) y registra la causa. | §4, H-01/H-13 | MUST |
| RF-20 | **Reintentos idempotentes** de comandos al gateway con backoff; un `access_command` con la misma clave no se duplica. | D14 | MUST |
| RF-21 | **Accounting RADIUS opcional**: registrar sesiones en `radacct` (inicio/fin, octetos, causa de terminación). | §3.B | SHOULD |
| RF-22 | **Adaptar y redesplegar** los contratos v1 como `BarloventoToken` (BRLT), `BarloventoTx` (BRLTx) y `BarloventoFactory`, conservando interfaces y semántica CFA (D2). | herencia v1 + P2 | MUST |
| RF-23 | **Modo simulación**: adaptador `mock` que emula authorize/disconnect de MikroTik y RADIUS para CI y demos sin hardware. | D16, P3b | MUST |
| RF-24 | **Notificaciones** al usuario/operador (webhook o log estructurado) ante revocación, fallo de comando o caída de gateway. | extensión | SHOULD |
| RF-25 | **Vouchers padre/hijo (D55)**: tras crear el stream, la wallet padre genera un código (12 chars Crockford Base32, SHA-256) que habilita hasta `max_children` (2) dispositivos **hijos sin wallet**, con cupo **por sesión viva** (se libera al desconectarse y permite reconexión) y límite global `max_children_per_parent` (default 5); el canje valida vigencia, cupo y **stream padre vivo**, crea la sesión `voucher_child` con `bandwidth_percent` (50 %) y registra la redención. | P5, D18/D55 | MUST |
| RF-26 | **QoS de hijos**: aplicar el límite de cada sesión hija con **magnitud absoluta** — plan base 50 Mbps bajada / 10 Mbps subida, hijo al 50 % (25/5 Mbps) — vía `WISPr-Bandwidth-Max-Down/Up` (bps) o `rate-limit` de perfil MikroTik, con test contra el mock RADIUS (H-05). | D18, H-05 | MUST |
| RF-27 | **Revocación en cascada**: si el stream del padre cae (FlowDeleted/insolvencia) o el padre se cierra, todas las sesiones hijas se revocan y sus dispositivos vuelven al portal. | D18, D9 | MUST |

## 2. Requerimientos No Funcionales (RNF)

| ID | Requerimiento | Criterio verificable |
|---|---|---|
| RNF-01 | **Seguridad de contratos** (heredado v1): sin `delegatecall`/`selfdestruct`, reentrancia protegida, Slither sin high/medium. | Suite Forge verde + Slither 0 high/medium |
| RNF-02 | **Ninguna clave privada** en repositorio, bundle del portal ni logs; secretos (RPC, RADIUS, MikroTik, JWT) desde Secret Manager / `.env` no versionado. | grep CI sobre bundle y repo; escaneo de secretos |
| RNF-03 | **Latencia de revocación (doble métrica, D43)**: `revocation_command_latency_ms` p95 **< 10 s desde la detección** (inicio del Job de health-check) y `service_cutoff_latency_ms` p95 **< 75 s desde el inicio de la insolvencia** (detección ≤60 s por cadencia de 1 min + comando ≤10 s + red); los casos sin ACK se miden aparte y disparan corte de emergencia. | métrica instrumentada + test con reloj controlado |
| RNF-04 | **Validación asíncrona (D44)**: `/v1/session/authorize` responde **202 Accepted** y la validación ocurre en el worker; `authorize_validation_latency` p95 **< 10 s**; health-check agrupa lecturas (concurrencia ≤8) y prueba k6 de **100 sesiones** antes de H5. | test de carga k6 |
| RNF-05 | **Índice sin huecos con cadencia de 1 min (D42)**: el Job del indexador procesa el 100 % de los eventos **confirmados a 2 bloques** (finalidad QBFT) con **política de reorg de 12 bloques**; reejecución idempotente (UK `tx_hash+log_index`) y lease en `indexer_checkpoints`; el provisional se confirma con receipt/getFlow, no con el indexador. | test de reindexado + doble ejecución |
| RNF-06 | **Idempotencia de comandos**: repetir un `access_command` no genera doble autorización ni doble desconexión. | tests con clave de idempotencia |
| RNF-07 | **Consistencia router↔BD**: ninguna sesión `active` en BD puede quedar sin correlato en el gateway más de 1 ciclo de reconciliación (**1 min**, D42). | test de divergencia forzada |
| RNF-08 | **Disponibilidad**: SLO **99,5 % mensual** del orquestador y la API medido por **sonda sintética**, con alcance y fuente declarados; degradación controlada y diferenciada por escenario (chain, gateway, BD) (H-15). | monitorización + umbral documentado |
| RNF-09 | **Observabilidad**: logs estructurados JSON con `session_id`/`tx_hash`, métricas de latencia y contadores de errores; trazas por sesión. | revisión de dashboards/logs |
| RNF-10 | **Seguridad de la API**: autenticación de operadores, validación de entrada, rate-limit, sin errores verbosos; CORS restringido al portal. | tests de seguridad + revisión |
| RNF-11 | **ISO 25010** (encaje general): adecuación funcional, eficiencia, compatibilidad, usabilidad del portal, fiabilidad, seguridad, mantenibilidad y portabilidad evaluadas con **cobertura mínima 80 %** en el orquestador medida en CI (H-18). | matriz de evaluación + coverage-check |
| RNF-12 | **RGPD/LOPDGDD**: aviso de privacidad, base legal, minimización, **borrado físico a los 30 días** mediante job de purga diario (con orden transaccional que resuelve la FK `RESTRICT`) y cifrado de logs con datos personales; inventario de PII y decisión sobre EIPD documentados (H-09/H-28). | job de purga + test de supresión + revisión legal |
| RNF-13 | **Accesibilidad y compatibilidad** en el portal: **0 violaciones axe A/AA**, alcance declarado, i18n es/en y matriz de navegadores/SO del portal cautivo (H-19). | axe-core en E2E |
| RNF-14 | **Portabilidad**: todo el stack (BD, orquestador, portal, RADIUS, mock) arranca con `docker-compose` en una máquina. | `docker compose up` verde en limpio |
| RNF-15 | **Cobertura de pruebas**: todo RF-MUST con ≥ 1 test nombrado (Forge/Vitest/Playwright) según matriz de trazabilidad. | meta-test `coverage-check` |
| RNF-16 | **Legal/licencia**: MIT + disclaimer visible en portal y README; red educativa; prohibido uso real sin auditoría. | grep en build + revisión |
| RNF-17 | **Recuperación (H-07/D26)**: backup automático **diario** con 30 días de retención; **RTO ≤ 4 h / RPO ≤ 24 h**; restauración probada y documentada. | prueba de restauración + política Cloud SQL |
| RNF-18 | **Secretos (H-08)**: ningún secreto en claro; RADIUS/MikroTik solo por `*_ref`; verificación de secretos en CI; RadSec si el NAS lo soporta. | grep de secretos = 0 + CI |
| RNF-19 | **Revocación robusta (H-04)**: 3 intentos 1/2/4 s + jitter, timeout 2 s, gracia 30 s → `degraded`, fallback CoA/PoD ↔ REST, `revoked` solo con ACK; sin ACK, corte de emergencia + alerta. | test de integración con reloj controlado |
| RNF-20 | **Resiliencia RPC (H-10)**: timeout duro 8 s, 3 reintentos con backoff+jitter, anti-solapamiento, monotonicidad por `blockNumber`, `eth_getLogs` ≤ 5.000 bloques; modo degradado documentado (riesgo aceptado). | prueba de degradación |
| RNF-21 | **Pausa = corte (H-13)**: validador y health-check exigen `status == Active`; pausar revoca padre e hijos. | test de integración con `pauseFlow` |
| RNF-22 | **Observabilidad (H-17)**: métricas nombradas con umbrales, reglas de alerta, retención de logs, SLO/MTTR y runbook. | revisión de dashboards + runbook |
| RNF-23 | **Capacidad (H-25)**: 100 sesiones concurrentes (incl. 50 hijos), 10 gateways, 5 eventos/s; prueba de carga k6 como criterio. | k6 con población declarada |
| RNF-24 | **API admin (H-26)**: API keys por operador, MFA opcional, bloqueo por intentos fallidos, login y acciones en `audit_log`; RBAC `admin/operator/readonly/auditor/dpo`. | tests de seguridad |
| RNF-25 | **PII y sesión web (H-28)**: inventario de PII ampliado, decisión sobre EIPD documentada, cookie `SameSite`, token CSRF y rotación/revocación de JWT. | revisión + tests |
| RNF-26 | **Anti-fuerza-bruta de vouchers (H-38)**: 5 intentos fallidos por IP+MAC cada 15 min, bloqueo temporal y alerta, registrados en `audit_log`. | test de rate-limit |
| RNF-27 | **Reentrancia (H-27/D34)**: `ReentrancyGuard` (OZ 5.1) + CEI; Slither y fuzz sin hallazgos de reentrancia. | Slither + fuzz CI |

## 3. Requerimientos Técnicos (RT)

| ID | Requerimiento |
|---|---|
| RT-01 | Stack blockchain reutilizado: Solidity 0.8.28 + Foundry global (`~/.foundry/bin` 1.8.3) + OpenZeppelin 5.1.0 |
| RT-02 | Red de desarrollo: Besu Codecrypto chainId **81234**, RPC `https://besu.alumnos.codecrypto.academy`; producción configurable (L2 EVM) |
| RT-03 | `orchestrator/`: **Node.js 22 + TypeScript**, framework HTTP (Fastify/Express), `ethers` para RPC, cliente UDP para RADIUS, cliente REST para MikroTik |
| RT-04 | Persistencia: **PostgreSQL 15+** (validado en Cloud SQL 15.18; objetivo 15/16) con migraciones versionadas; los 3 artefactos de datos sincronizados |
| RT-05 | Portal: **Next.js 15 + React 19 + TS + Tailwind + wagmi + viem** (deriva de `web/` de v1) |
| RT-06 | Gateway Opción A: **MikroTik RouterOS v7 REST API** (TLS + credenciales dedicadas) |
| RT-07 | Gateway Opción B: **FreeRADIUS 3.x** con **RFC 5176** (CoA/Disconnect UDP 3799) y accounting en `radacct` |
| RT-08 | Configuración centralizada por entorno (`.env`/Secret Manager): `DATABASE_URL`, `RPC_URL`, `CHAIN_ID`, `SUPER_TOKEN_ADDRESS`, `RADIUS_SECRET`, `MIKROTIK_*`, `JWT_SECRET` |
| RT-09 | ABI y direcciones: reutilizar `tools/sync-abi.mjs` y el registro de deployments de v1 |
| RT-10 | Pruebas: **Forge** (contratos), **Vitest** (orquestador/lógica), **Playwright** (portal E2E), contenedores para integración |
| RT-11 | Infra: `docker-compose` con Postgres + FreeRADIUS + mock MikroTik + orquestador + portal; despliegue previsto Cloud Run/GCE según P9 |
| RT-12 | Observabilidad: logs JSON + endpoint `/metrics` (Prometheus) + health `/healthz` `/readyz` |

## 4. Alcance de v1

**Incluye:** RF-MUST + adaptador de gateway elegido + `mock` + BD PostgreSQL completa + portal
cautivo Web3 + indexador/validador + anti-spoofing + auditoría + RGPD + observabilidad básica.

**Excluye:** stablecoin real en mainnet; protocolo Superfluid soberano completo (Host/CFA/ACL
oficiales); planes de datos facturados; panel de autogestión del ISP; QoS por plan; multi-tenant
comercial; TOGA/liquidadores reales.

### 4.1 Stakeholders

| Rol | Quién | Responsabilidad |
|---|---|---|
| Director del proyecto / titular | Usuario (anlucorporations) | aprueba alcance/decisiones, custodia de claves, autoriza `/push` |
| Operador del hotspot / ISP | administrador del servicio | configura gateways y tarifas, supervisa sesiones |
| Usuario final (cliente WiFi) | visitante con wallet | firma challenge, abre stream, navega |
| Proveedor de red / NAS | router MikroTik o FreeRADIUS | ejecuta autorización/desconexión |
| Operador de red blockchain | CodeCrypto / L2 elegida | disponibilidad del RPC |
| Auditor documental | `@audita` | auditoría Fase 2 y re-verificación |
| Responsable de protección de datos | operador | cumplimiento RGPD/LOPDGDD |

## 5. Base de datos

A diferencia de v1, SFhostpot **sí tiene base de datos relacional**: el estado operativo
(sesiones, bindings, comandos, eventos indexados, accounting) vive en **PostgreSQL**. El modelo
lógico on-chain (reutilizado de v1) se documenta como espejo en `flow_subscriptions`, pero la
autoridad del estado de los flujos es la blockchain.

Fuente de verdad sincronizada: `diccionario_datos.md`, `diagrama_er.md`, `base_datos.sql`.

## 6. Respuestas de la entrevista de Fase 1 (2026-10-15)

- **P1 ✅** — Dev/test en **Besu Codecrypto 81234**; producción configurable a L2 por `chain_id`.
- **P2 ✅** — Token propio **`BarloventoToken` (BRLT)** y Super Token **`BarloventoTx` (BRLTx)**.
- **P3 ✅** — **Ambos** adaptadores: **MikroTik RouterOS REST** + **RADIUS (CoA/PoD)**.
- **P3b ✅** — **Sin hardware real**: integración validada contra `mock` MikroTik + FreeRADIUS.
- **P4 ✅** — Tarifas **por plan administrables off-chain** (`gateway_tariffs`), con payout y vigencia.
- **P5 ✅** — **Wallet Web3 + vouchers/códigos** (RF-25, D18, tablas `vouchers`/`voucher_redemptions`).
- **P6 ✅** — **Un operador en v1**, esquema preparado para multi-tenant (`tenant_id`).
- **P7 ✅** — RGPD: aviso, base legal de servicio, minimización y **retención 30 días configurable**.
- **P8 ✅** — Anti-spoofing con **binding firmado SIWE + re-autenticación** (sin 802.1X en v1).
- **P9 ✅** — **Todo en cloud**: Cloud Run + **Cloud SQL**; CoA/PoD requiere VPC Connector + UDP 3799
  o VPN hacia el NAS (riesgo documentado).

### Cierre de Fase 1 (P10–P13)

- **P10 ✅** — **BRLT**: name "Barlovento Token", symbol BRLT, 18 dec, hard-cap **10.000.000** con
  mint del owner hasta el cap.
- **P11 ✅** — **Códigos de voucher**: 12 chars **Crockford Base32**, **SHA-256**, caducidad por
  defecto **90 días**, emisión por **CLI + API admin**.
- **P12/P12b ✅** — El voucher **exige stream**: la wallet **padre** abre el stream y luego genera el
  voucher; habilita hasta **2 hijos sin wallet** al **50 % de velocidad** mientras dure el stream.
- **P13 ✅** — **Repositorio nuevo e independiente** para SFhostpot (D19).
