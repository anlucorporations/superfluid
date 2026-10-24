# Casos de Uso — SFhostpot (Superfluid Hotspot v1)

> **Propósito.** Especificar el comportamiento observable de SFhostpot mediante **19 casos de uso
> (CU-01…CU-19)** con criterios de aceptación **Gherkin** (comportamiento) y restricciones de sistema
> **EARS** (reglas), de forma que cada criterio sea verificable por un test concreto y trazable a un
> requisito. Este documento **no crea requisitos**: cada criterio deriva de
> [`requerimientos.md`](requerimientos.md) (RF-01…RF-27, RNF-01…RNF-27, RT-01…RT-12, D1…D41),
> [`diccionario_datos.md`](diccionario_datos.md) (modelo on-chain BRLT/BRLTx + 20 tablas PostgreSQL),
> [`propuesta_adaptacion.md`](propuesta_adaptacion.md) (arquitectura y flujos),
> [`resolucion_auditoria_v1.md`](resolucion_auditoria_v1.md) (H-01…H-38, D20…D41) y
> [`entornos_globales.md`](entornos_globales.md) (parámetros de entorno).
> **Alcance.** v1: un operador, red de desarrollo Besu 81234, adaptadores MikroTik REST + RADIUS
> CoA/PoD + `mock`, sin hardware real.
> **Diagramas asociados.** [`diagramas_casos_uso.md`](diagramas_casos_uso.md).

---

## 1. Actores

### 1.1 Actores primarios

| Actor | Tipo | Descripción | CUs |
|---|---|---|---|
| **Usuario con wallet** | Persona | Cliente WiFi que llega al portal cautivo con una wallet Web3 (EIP-1193/Wagmi/Viem). Firma el challenge SIWE, envuelve BRLT en BRLTx, abre el stream hacia `payout_wallet` y navega mientras el flujo esté activo y sea solvente. Puede actuar como **padre** y generar vouchers para sus equipos hijos. | CU-01…CU-07 |
| **Usuario sin wallet** | Persona | Huésped o equipo secundario que **no** dispone de wallet. Solo puede navegar canjeando un **voucher** emitido por un padre; su sesión es `voucher_child`, con `bandwidth_percent` (50 %) y sin stream propio. | CU-08 |
| **Operador** | Persona (RBAC) | Administrador del hotspot/ISP. Configura gateways, tarifas y planes, supervisa sesiones y auditoría, revoca sesiones, administra vouchers y operadores. Roles RBAC `admin`, `operator`, `readonly`, `auditor`, `dpo` (RNF-24, D33/D49); cada operador tiene **API keys persistidas** en `operators` (`api_key_hash`, `api_key_prefix`, `api_key_scopes`, `api_key_expires_at`, `api_key_last_used_at`, `api_key_revoked_at`). | CU-09…CU-14 |
| **Operador/DPO** | Persona (RBAC) | Operador con rol `dpo` (o el Director asumiendo D38) que atiende el **derecho de supresión** RGPD/LOPDGDD sobre MAC/IP y datos asociados. | CU-15 |
| **Titular de los datos** | Persona | Titular de los datos personales (MAC/IP/wallet) que **ejerce derechos RGPD** (supresión, acceso, rectificación). Solicita por el **canal publicado en el aviso de privacidad** (formulario del portal y mostrador del operador), recibe acuse con `request_id` y respuesta en ≤ 30 días. No opera el sistema ni ejecuta comandos. | CU-15 |
| **Sistema** | Sistema | Orquestador/middleware (Node 22 + TS): indexador de eventos, validador de flujo, gestor de sesiones, health-check, adaptadores de gateway, auditoría. Actúa sin intervención humana en CU-16…CU-19. | CU-16…CU-19 |

### 1.2 Sistemas externos (no son actores de caso de uso, pero participan)

| Sistema | Rol | Interfaz |
|---|---|---|
| **Gateway/NAS** | RouterOS v7 (Opción A) o FreeRADIUS 3.x (Opción B, RFC 5176) que ejecuta autorización/desconexión. | REST TLS / UDP 1812, 1813, 3799; `mock` en CI |
| **Chain (BarloventoTx / BarloventoToken)** | Autoridad del estado de los flujos (`status`, `flowRate`, `virtualBalanceOf`). | JSON-RPC `eth_getLogs`, `eth_call`, `eth_getTransactionByHash` |
| **PostgreSQL 15+ (Cloud SQL)** | Estado operativo, bindings, comandos, auditoría y accounting (20 tablas). | SQL/TLS |
| **Cloud Scheduler + Cloud Run Jobs** | Ejecución periódica del indexador y del health-check con **cadencia mínima real de 1 minuto** (`* * * * *`) y sin procesos *always-on* (D42). | Cron + lease en `indexer_checkpoints` |
| **Portal cautivo (Next.js 15)** | Interfaz del usuario con wallet y del huésped sin wallet. | HTTPS |

> **Actor secundario implícito.** El **portal** no decide: solo presenta estado y envía peticiones a
> la API. Las reglas viven en el **Sistema**; por eso los criterios se escriben sobre el orquestador
> y no sobre la UI.

---

## 2. Convenciones de notación

### 2.1 Comportamiento — Gherkin

- Formato **Dado / Cuando / Entonces / Y** (español), un escenario = un criterio verificable.
- Cada escenario declara **magnitudes concretas** (segundos, Mbps, wei/s, códigos HTTP, filas,
  porcentajes) y un **resultado observable** (estado en BD, comando al gateway, respuesta HTTP,
  métrica, entrada de auditoría).
- No se describen clics ni selectores de UI: se describe la petición y el efecto verificable.
- **Un escenario = un único resultado observable (D50).** Las ramas se separan en escenarios distintos
  y no se admiten estados finales alternativos ("closed o revoked"): el estado final se fija por la
  regla de cascada única (§2.5).
- Los escenarios se ejecutan con **Vitest** (orquestador), **Playwright** (portal E2E) o **Forge**
  (contratos), según la matriz de trazabilidad (§ final).
- **Los criterios de rendimiento (p95, k6, ventanas de muestra) no viven en este documento**: se
  especifican en el *spec* k6 versionado del `documento_tecnico.md` §5.9 (D50/H2-30). Aquí solo quedan
  criterios funcionales deterministas.
- Las aserciones sobre el plano de datos se hacen sobre **atributos WISPr/`rate-limit` del comando** o
  sobre una **sonda de tráfico declarada**; nunca sobre "el dispositivo navega" (H2-31).

### 2.1.1 Anclajes de UI (Playwright)

Cuando un escenario verifique el portal, el anclaje se declara por **rol + nombre accesible** y, si no
existe nombre estable, por `data-testid` publicado en el contrato del portal; nunca por texto libre
susceptible de cambiar (H2-31). Los escenarios de este documento citan el anclaje entre paréntesis:

| Vista | Anclaje canónico |
|---|---|
| Saldo y envoltura (CU-01/02) | `role=status` con nombre accesible `saldo-brlt` + botón `data-testid=wrap-open` |
| Apertura de stream (CU-03) | `role=status` `tiempo-estimado` + botón `data-testid=open-stream` |
| Estado de sesión (CU-04) | `role=status` `session-status` (texto, no solo color) |
| Cierre (CU-06) | botón `data-testid=close-session` + `role=alert` `close-result` |
| Canje de voucher (CU-08) | campo `data-testid=voucher-code` + `role=status` `redeem-result` |

### 2.1.2 Relación entre flujos FA/EX y escenarios Gherkin (H2-36)

No hay correspondencia 1:1 entre los flujos documentados y los escenarios: un escenario puede cubrir
un flujo principal completo y varios flujos alternativos se verifican en el mismo escenario cuando
comparten oráculo. Se declara explícitamente que **todo FA/EX con efecto observable tiene escenario o
queda fuera del alcance de prueba con motivo**; la tabla de correspondencia se mantiene en
`documento_tecnico.md` §7.4 (una fila por flujo crítico sin escenario propio).

### 2.1.3 Alertas como artefacto canónico (H2-29)

"Se emite una alerta" se considera un artefacto verificable y se escribe siempre como:

- `audit_log.action = 'alert.<tipo>'` (p. ej. `alert.revocation_no_ack`, `alert.gateway_offline`,
  `alert.checkpoint_stalled`, `alert.reconciliation_divergence`, `alert.rpc_degraded`,
  `alert.provisional_abuse`, `alert.gdpr_erasure_failed`) con `details.severity` ∈
  `{warning, critical}` y `request_id`; y
- métrica `alerts_total{type,severity}` publicada en `/metrics`.

Un escenario que asevere una alerta comprueba esas dos piezas (no un canal externo).

### 2.2 Restricciones del sistema — EARS

| Patrón | Plantilla | Uso en este documento |
|---|---|---|
| Ubicuo | `El sistema deberá <respuesta>.` | Invariantes siempre válidas |
| Dirigido por evento | `Cuando <disparador>, el sistema deberá <respuesta>.` | Reacción a evento/bloque |
| Dirigido por estado | `Mientras <estado>, el sistema deberá <respuesta>.` | Mientras haya sesión activa, provisional, etc. |
| Dirigido por opción | `Si <característica opcional>, el sistema deberá <respuesta>.` | Adaptador RADIUS/accounting opcional |
| Comportamiento no deseado | `Si <condición no deseada>, entonces el sistema deberá <respuesta>.` | Fallos, abuso, insolvencia |

### 2.3 Identificadores

| Prefijo | Significado |
|---|---|
| `CU-xx` | Caso de uso (lista canónica, no se renombra) |
| `FA-xx.n` | Flujo alternativo del CU-xx |
| `EX-xx.n` | Flujo de excepción/error del CU-xx |
| `RB-xx` | Regla de negocio (§3) |
| `RF/RNF/RT/Dx/H-xx` | Requisito/decisión/hallazgo de la fuente de verdad |
| `†` | Constante **derivada** (no fija requisito nuevo; ver §3.3) |

### 2.4 Regla de oro de testabilidad

Un criterio que no pueda expresarse como `entrada → salida observable con magnitud y umbral` **se
reescribe**. En este documento todos los criterios usan estados de la BD, códigos HTTP, comandos
`access_commands`, métricas o filas de auditoría como evidencia, y cada escenario tiene **un único
resultado final** (D50). Los umbrales estadísticos se verifican en el *spec* k6 (§5.9 del documento
técnico), no aquí.

---

## 3. Reglas de negocio y constantes (§0)

### 3.1 Constantes canónicas

| # | Regla | Valor canónico | Fuente |
|---|---|---|---|
| RB-01 | **Plan base** de ancho de banda | **50 Mbps bajada / 10 Mbps subida** (`bandwidth_down_bps = 50 000 000`, `bandwidth_up_bps = 10 000 000`) | RF-26, D25, H-05 |
| RB-02 | **Sesión hija de voucher** | **50 % del plan = 25 Mbps bajada / 5 Mbps subida** (`bandwidth_percent = 50`) | RF-26, D18, D25 |
| RB-03 | **Ventana provisional y oráculo único** | **60 s** (`provisional_seconds = 60`); el provisional **no lo confirma el indexador**. Un **único oráculo por modo** (`MEMPOOL_MODE`, D56) concede **y** confirma/revoca: `visible` → `eth_getTransactionByHash` (+ `getFlow`/`getAccountInfo`); `receipt` → `eth_getTransactionReceipt` (+ `getFlow`/`getAccountInfo`). El modo se fija en H2 (ENV-02) y no se mezclan ramas (D42/D56) | RF-12, D5, D21, D56, ENV-02 |
| RB-04 | **Cuota de provisional** | **1 provisional por MAC + wallet cada 15 min**; el intento fallido se audita y el dispositivo se bloquea ante abuso. La clave de cuota usa la **MAC observada por el NAS**, nunca la declarada por el cliente (H2-28) | RF-12, H-02, D21 |
| RB-05 | **Modelo de ejecución y cadencia** | **Cloud Run Jobs + Cloud Scheduler, sin *always-on*; cadencia mínima real de 1 minuto.** Indexador `* * * * *` (cada 1 min) y health-check `* * * * *` (cada 1 min). No existen ciclos de 4 s ni de 15 s (D42) | RF-13, D9, D23, D29, D42 |
| RB-06 | **SLA de revocación (doble métrica)** | `revocation_command_latency_ms` **p95 < 10 s** medida desde la **detección** (inicio de la ejecución del Job de health-check o del evento indexado) hasta el ACK; `service_cutoff_latency_ms` **p95 < 75 s** desde el **inicio de la insolvencia** (detección ≤ 60 s + comando ≤ 10 s + red). Los casos sin ACK se miden aparte y disparan corte de emergencia por address-list (D43) | RNF-03, D23, D43 |
| RB-07 | **Reintentos de comando** | **3 intentos** con backoff **1 / 2 / 4 s + jitter**, **timeout 2 s/intento**, **gracia 30 s**; el comando sin ACK termina en `timeout` o `failed` (nunca `degraded`, que es estado de sesión); la sesión pasa a `degraded`, con fallback CoA↔REST y `revoked` solo con ACK | RNF-19, D24, H-04, H2-26 |
| RB-08 | **Confirmaciones y reorg** | Evento confirmado a **2 bloques**; ventana de reorg **12 bloques**; `eth_getLogs` ≤ **5 000 bloques**; compensación de efectos ya ejecutados (H2-21) | RNF-05, RNF-20, H-16 |
| RB-09 | **Voucher** | **12 caracteres Crockford Base32**, hash **SHA-256**, **2 hijos por voucher** por defecto (`max_children=2`, rango 1..10), **cupo por sesión viva** (se libera al desconectarse y permite reconexión), **`max_children_per_parent` configurable con default 5** en `gateway_tariffs`, caducidad por defecto **90 días**, código mostrado **una sola vez** (D55) | RF-25, D18, P11, D31, D55 |
| RB-10 | **Retención de PII** | **30 días** con job de purga diario y borrado en orden transaccional | RNF-12, D27, H-09 |
| RB-11 | **Backup/recuperación** | Backup **diario**, retención **30 días**, **RTO ≤ 4 h / RPO ≤ 24 h**, restauración probada | RNF-17, D26, H-07 |
| RB-12 | **Rate-limit de vouchers** | **5 intentos fallidos por IP + MAC observada por el NAS cada 15 min** → bloqueo temporal + alerta + `audit_log`. Contadores en **almacén compartido** (tabla con TTL/Redis), nunca en memoria de instancia (H2-28) | RNF-26, D36, H-38 |
| RB-13 | **Garantía/depósito** | `buffer_seconds = 3600`; **la apertura del stream exige 1 h de tarifa**: `required = rate × 3600 + deuda pendiente`, sin tramo extra (contrato `BarloventoTx` adaptado, D54). `depositTotal = netOutflowGarantizado × 3600` | H-01, D20, D54 |
| RB-14 | **Solvencia (predicado cerrado)** | `is_solvent := (status == Active) ∧ (flowRate >= tarifa) ∧ (virtualBalanceOf(sender) > 0)` | H-01, D20, RF-19 |
| RB-15 | **Pausa = corte** | `pauseFlow` revoca padre e hijos; reanudar exige reautorización | H-13, D22, RNF-21 |
| RB-16 | **Sesión de portal / JWT** | JWT HS256 en cookie `httpOnly`, `SameSite`, **TTL 900 s**, fila server-side revocable y token CSRF | D7, RNF-25, D35 |
| RB-17 | **RPC** | timeout duro **8 s**, 3 reintentos con backoff + jitter, anti-solapamiento, monotonicidad por `blockNumber` | RNF-20, H-10 |
| RB-18 | **Capacidad** | **100 sesiones concurrentes** (incl. 50 hijos), **10 gateways**, **5 eventos/s** | RNF-23, D37 |
| RB-19 | **SLO** | **99,5 % mensual** medido por sonda sintética | RNF-08, H-15 |
| RB-20 | **Cobertura** | ≥ **80 %** del orquestador medida en CI | RNF-11, H-18 |
| RB-21 | **Token** | BRLT 18 decimales, hard-cap **10 000 000**; BRLTx envuelve **1:1** | P10, D2 |
| RB-22 | **Red** | Dev/test **chainId 81234** (Besu Codecrypto); producción L2 por `gateways.chain_id` | D1, RT-02 |
| RB-23 | **Identidad de gateway** | Receptor del stream = `gateway_tariffs.payout_wallet` (autoridad única) | D12, D32, H-24 |
| RB-24 | **Anti-spoofing y canal hotspot→API** | **Fuente autoritativa de MAC/IP:** el portal se sirve **desde el hotspot MikroTik** con variables `$(mac)`/`$(ip)`; el NAS llama a `POST /v1/internal/hotspot/bind` desde IP en allow-list con `X-Gateway-Signature: HMAC-SHA256(secreto_del_gateway, gateway_id\|mac\|ip\|ts\|nonce)` (ventana ±60 s, nonce anti-replay) y recibe un `bind_token` JWT de 5 min ligado a gateway\|mac\|ip. **Antes de autorizar**, la terna se verifica en `/ip/hotspot/host` y `/ip/dhcp-server/lease`; `/ip/hotspot/active` queda **solo para reconciliación post-autorización**. El cuerpo de `POST /v1/portal/sessions` **nunca** aporta MAC/IP (D45). Un solo binding `active` por MAC; MAC + wallet + IP + token inmutables; cambio de IP/MAC exige re-autenticación por `/v1/session/revalidate` (H2-25) | RF-03, RF-17, D6, D45 |

### 3.2 Invariantes de datos

| # | Invariante | Verificación |
|---|---|---|
| RB-25 | Una sola sesión **no terminal** por MAC (`pending`, `provisional`, `active`, `degraded`, `revoking`). **Un flow activo autoriza una sola sesión padre:** índice único parcial `uq_hotspot_sessions_active_flow` sobre `(super_token_address, sender_wallet, receiver_wallet)` **con predicado** `WHERE status IN (…) AND access_mode = 'wallet_stream'` (solo padres, no hijos); los demás dispositivos del mismo padre van por voucher (D56/H2-09) | Índices únicos parciales `uq_hotspot_sessions_open_mac` y `uq_hotspot_sessions_active_flow` |
| RB-26 | Un solo binding `active` por MAC (`uq_device_bindings_active_mac`) | Índice único parcial |
| RB-27 | Un hijo **no tiene stream propio** (`flow_rate_wei_s = 0`) y hereda `sender_wallet` del padre | CHECK + trigger/validación de aplicación |
| RB-28 | Voucher: `children_used ≤ max_children` **por sesión viva** (se decrementa al liberar la redención y el mismo MAC puede reconectar); `redeemed` solo al alcanzar el cupo; índice único **parcial** `uq_voucher_redemptions_live_mac` sobre `(voucher_id, mac_address) WHERE released_at IS NULL`; `sync_voucher_children()` mantiene `vouchers.children_used` (cupo vivo); `Σ hijos vivos del padre ≤ max_children_per_parent` | CHECK + índice único parcial + trigger, D55/H2-20 |
| RB-29 | Idempotencia de comandos por `access_commands.idempotency_key` (UK) | UK + test de doble envío |
| RB-30 | Idempotencia del indexador por UK `(chain_id, tx_hash, log_index)` | UK + reindexado |

### 3.3 Constantes derivadas (†) — solo para hacer testeables los criterios

> No introducen requisito nuevo: parametrizan umbrales que la fuente deja abiertos y quedan ratificados
> en [`registro_decisiones.md`](registro_decisiones.md) con propietario y fecha (2026-10-17, D53).

| # | Constante derivada | Valor | Derivación |
|---|---|---|---|
| RB-31 † | Caducidad del challenge SIWE / nonce | **900 s** (alineada con `SESSION_TTL_SECONDS`) y uso único | D7 + `entornos_globales.md` |
| RB-32 † | Rate-limit de endpoints de identidad | **5 solicitudes fallidas por IP + MAC observada por el NAS cada 15 min** → HTTP 429; contadores en almacén compartido (BD/Redis) | RNF-10 + RNF-26, H2-28 |
| RB-33 † | Umbral de conteo para `degraded` | **3 comandos fallidos consecutivos** o gracia de 30 s agotada | RNF-19, D24 |
| RB-34 † | Paginación de listados admin | **100 filas/página** | RNF-14/RT-12 |
| RB-35 † | Tamaño de lote de purga RGPD | **1 000 filas por transacción**, job diario a las 03:00 UTC | RNF-12, D27 |
| RB-36 † | Cooldown por conflicto de MAC | **15 min** por MAC tras un conflicto; el binding legítimo se mantiene | D47 (V2-13) |
| RB-37 † | Bloqueo por segundo conflicto de MAC | **24 h** (`devices.blocked = true`) ante el segundo conflicto en la ventana | D47 (V2-13) |

> RB-36/RB-37 son constantes derivadas de D47; el Lead las ratifica en
> [`registro_decisiones.md`](registro_decisiones.md) (no se edita aquí).

---

## CU-01 — Vincular wallet y abrir sesión de portal

| Campo | Valor |
|---|---|
| **ID** | CU-01 |
| **Nombre** | Vincular wallet y abrir sesión de portal |
| **Actor(es)** | Usuario con wallet (primario); Sistema (secundario) |
| **Objetivo** | Obtener la **terna (MAC, IP) por un canal autenticado hotspot→API** (el NAS MikroTik firma con HMAC y recibe un `bind_token` de corta vida; la terna se verifica en `/ip/hotspot/host` y `/ip/dhcp-server/lease`), registrar el aviso de privacidad **antes** de persistir PII, emitir un challenge SIWE, verificar la firma y dejar un binding inmutable `(wallet, MAC, IP, session_token)` antes de permitir cualquier orden al gateway. |
| **Requisitos** | RF-01, RF-02, RF-03, RF-06, RF-17; RNF-10, RNF-12, RNF-25 |

**Precondiciones**
1. El dispositivo está asociado al SSID y su petición HTTP fue interceptada por el portal **servido por el propio hotspot MikroTik**, que inyecta las variables `$(mac)` e `$(ip)` (D45).
2. Existe un `gateway` en estado `online` con `super_token_address` y al menos una tarifa `active`.
3. El NAS está dado de alta con su secreto de gateway y su IP de egreso en la **allow-list**; solo él puede llamar a `POST /v1/internal/hotspot/bind` (RB-24).
4. El NAS ha obtenido un `bind_token` vigente (JWT de 5 min) ligado a `gateway|mac|ip`; el portal conoce la versión vigente del aviso de privacidad. La `portal_session` se crea en el paso 4 del flujo con `mac_address`/`ip_address` tomadas del token, `notice_version`/`notice_accepted_at` y `session_token_hash` (SHA-256), nunca el token.
5. El aviso de privacidad (versión vigente y timestamp) se mostró y registró **antes** de llamar a `POST /v1/portal/sessions` (D52).

**Postcondiciones**
1. `portal_sessions.status = 'bound'` con `wallet_address`, `bound_at`, `notice_version` y
   `notice_accepted_at` (D52).
2. `auth_challenges` de la sesión marcado `consumed_at` (nonce de un solo uso).
3. `device_bindings` con `binding_type='wallet'`, `status='active'`,
   `binding_hash = SHA-256(wallet|mac|ip|token)`.
4. **Ningún** `access_command` enviado al gateway (la vinculación no autoriza red).
5. Entrada en `audit_log` con `action='portal.bind'` (éxito o rechazo).

**Flujo principal**
1. El dispositivo solicita una URL HTTP; el portal **servido por el hotspot** recibe `$(mac)` y
   `$(ip)` del NAS. El NAS MikroTik llama a `POST /v1/internal/hotspot/bind` desde una IP de la
   allow-list con `X-Gateway-Signature: HMAC-SHA256(secreto_del_gateway, gateway_id|mac|ip|ts|nonce)`;
   el orquestador valida la firma, la ventana de **±60 s** y el nonce anti-replay, y responde
   `bind_token` (JWT de **5 min** ligado a `gateway|mac|ip`). Una firma inválida o una IP no permitida
   se rechaza con **403** y **no** crea `portal_session` (EX-01.9).
2. El orquestador verifica la terna **antes de autorizar** consultando `/ip/hotspot/host` y
   `/ip/dhcp-server/lease` del NAS vía RouterOS REST: la MAC debe existir y su `address`/lease debe
   coincidir con la IP del token. Si no consta, ejecuta EX-01.7 (409 `mac_not_on_nas`) y **no** crea
   binding. `/ip/hotspot/active` **no** se usa aquí: solo lista sesiones ya autenticadas y se reserva
   para la reconciliación post-autorización (CU-19).
3. El portal muestra el **aviso de privacidad versionado** (responsable, DPO, finalidades, base legal,
   destinatarios, plazo de 30 días, derechos y vía de reclamación) y el disclaimer legal, y **registra
   la aceptación** del usuario (versión vigente + timestamp) **antes** de llamar al alta; se registra
   `audit_log action='privacy.notice_shown'` con versión y timestamp (D52/V2-10).
4. El portal envía `POST /v1/portal/sessions` con `{bind_token, user_agent, notice_version,
   notice_accepted_at}` (sin `mac_address` ni `ip_address`). El servidor toma la terna del token,
   exige que `notice_version` sea la vigente y que `notice_accepted_at` esté presente; si falta o está
   desactualizado ejecuta EX-01.8. Solo entonces persiste MAC/IP y crea la `portal_session` (`pending`)
   con `notice_version`/`notice_accepted_at`, cookie JWT HS256 `httpOnly`, `SameSite`, TTL **900 s**, y
   muestra la **red esperada** (`chainId = 81234`) con la dirección de BRLTx.
5. El usuario conecta su wallet (Wagmi/Viem). El portal compara `chainId` de la wallet con el
   esperado; si difiere, solicita el cambio de red y **no** continúa.
6. El portal solicita `POST /v1/session/challenge`; el orquestador crea `auth_challenges` con `nonce`
   aleatorio de un solo uso, `message` EIP-4361 y `expires_at = now() + 900 s`.
7. El usuario firma el mensaje. El portal envía `POST /v1/session/bind` con `{signature, nonce,
   wallet_address}`; **la MAC/IP las toma el servidor de la terna del `bind_token` y de la
   verificación del paso 2**, no del cuerpo. El orquestador recupera el firmante (`ecrecover`) y
   comprueba que el mensaje SIWE cubre `domain`, `uri`, `chainId`, `nonce`, `issuedAt`,
   `expirationTime`, MAC e IP.
8. El orquestador valida el binding previo: si la MAC no tiene binding `active`, o lo tiene con la
   **misma** wallet, procede; si tiene otro binding `active` con **otra** wallet, ejecuta EX-01.3.
9. El orquestador marca el challenge como consumido, actualiza `portal_sessions` a `bound`, inserta
   `device_bindings` con `binding_hash` SHA-256 y `verified_at = now()`.
10. Devuelve **HTTP 200** con `{portal_session_id, wallet, chain_id, super_token, status:"bound"}` y
    renueva la cookie de sesión. El portal muestra el estado (`role=status` `session-status`) y el botón
    de apertura de stream (CU-03).

**Flujos alternativos**
- **FA-01.1 — Ya existe binding activo con la misma wallet.** Se reutiliza; si cambió la IP se actualiza
  `ip_address` del binding **tras re-verificar la terna en el NAS** y se exige firma nueva por
  `POST /v1/session/revalidate`. `audit_log action='portal.rebind'`.
- **FA-01.2 — Wallet conectada pero sin fondos.** El binding se crea igualmente; el portal muestra
  saldo BRLT/BRLTx = 0 (`role=status` `saldo-brlt`) y dirige a CU-02. No se emite comando al gateway.
- **FA-01.3 — Dispositivo ya `bound` con otra sesión de portal vigente.** Se cierra la
  `portal_session` anterior con `status='expired'` (valor válido del enum) si no hay sesión de red, y
  se continúa con la nueva.
- **FA-01.4 — Deriva de IP/MAC en una sesión ya autorizada (H2-25).** Si la reconciliación (CU-19) o
  un nuevo bind detecta que la MAC observada cambió de IP, el orquestador marca la sesión
  `degraded`, audita `action='security.ip_mac_drift'` y exige `POST /v1/session/revalidate` con firma
  SIWE nueva en **≤ 60 s**; si no llega, revoca la sesión con `disconnect_reason='timeout'`.

**Flujos de excepción**
- **EX-01.1 — Firma inválida o firmante distinto.** HTTP **401**, `auth_challenges` no consumido,
  `audit_log` `action='portal.bind_rejected'`, `details.reason='signature_mismatch'`; se incrementa
  el contador de intentos de la IP.
- **EX-01.2 — Nonce expirado (> 900 s) o ya consumido.** HTTP **409**,
  `details.reason='challenge_expired'`; se emite un challenge nuevo solo si la cuota lo permite.
- **EX-01.3 — MAC ya ligada intenta ligarse con otra wallet (D47).** HTTP **409**
  `reason='mac_conflict'`; **se mantiene el binding legítimo en `active`** y se rechaza el intento
  nuevo; se audita `action='security.mac_conflict'` con ambas wallets y la MAC observada, se
  **alerta al titular** (`alert.mac_conflict`) y se aplica **cooldown de 15 min por MAC**
  (**RB-36**, derivada de D47). Un segundo conflicto en 24 h marca `devices.blocked = true`
  (**RB-37**). La revocación del binding legítimo solo procede de una re-autenticación fehaciente del
  titular.
- **EX-01.4 — Red equivocada.** HTTP **409** `details.reason='wrong_chain'`, sin crear challenge ni
  binding; el portal indica la red 81234.
- **EX-01.5 — Rate-limit de identidad superado.** HTTP **429** con `Retry-After` = segundos hasta
  cumplir la ventana de 15 min; `audit_log` `action='security.rate_limited'`.
- **EX-01.6 — Gateway sin tarifa activa o `offline`.** HTTP **503**
  `details.reason='gateway_unavailable'`; no se crea binding (fail-closed, D14).
- **EX-01.7 — MAC no presente en `/ip/hotspot/host` ni en `/ip/dhcp-server/lease` (D45).** HTTP **409**
  `reason='mac_not_on_nas'`; no se crea `portal_session` ni binding, no se consume cuota y se audita
  `action='security.mac_not_on_nas'` con la MAC observada (nunca la declarada).
- **EX-01.8 — Aviso de privacidad no mostrado, versión desactualizada o timestamp ausente.** HTTP
  **409** `reason='privacy_notice_missing'`; no se persiste MAC/IP ni se crea `portal_session`
  (D52/H2-27). La comprobación es determinista: el portal registra la aceptación **antes** de la
  llamada y el endpoint exige `notice_version` vigente y `notice_accepted_at`.
- **EX-01.9 — Suplantación remota del hotspot.** Una llamada a `POST /v1/internal/hotspot/bind` con
  firma HMAC inválida, `ts` fuera de la ventana de ±60 s, nonce reutilizado o IP de origen fuera de la
  allow-list se rechaza con **403** (`invalid_gateway_signature` / `origin_not_allowed` /
  `nonce_replayed`); un `bind_token` ausente, expirado o ligado a otro `gateway|mac|ip` se rechaza con
  **401** `bind_token_invalid`. En ningún caso se crea `portal_session` ni se persiste PII; se audita
  `action='security.hotspot_spoof_rejected'` con la IP de origen y el gateway declarado.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Vinculación correcta de wallet con MAC e IP verificadas en el NAS
  Dado un dispositivo con MAC "00:11:22:33:44:55" e IP "10.20.0.7" presentes en ip/hotspot/host y en el lease DHCP del NAS
  Y un bind_token válido de 5 min emitido por POST /v1/internal/hotspot/bind para esa MAC e IP
  Y el portal registró la aceptación del aviso de privacidad "v1" antes de llamar al alta
  Y un gateway "online" con chainId 81234 y una tarifa activa
  Cuando el usuario firma el challenge con la wallet "0xAbC0000000000000000000000000000000000001" y envía POST /v1/session/bind
  Entonces la respuesta HTTP es 200
  Y portal_sessions.status es "bound" con wallet_address igual a "0xAbC0000000000000000000000000000000000001"
  Y portal_sessions conserva notice_version "v1" y notice_accepted_at no nulo
  Y device_bindings.status es "active" con binding_hash = SHA-256(wallet|mac|ip|token)
  Y no existe ningún registro nuevo en access_commands
  Y audit_log contiene action "portal.bind" con actor "Usuario con wallet"

Escenario: Suplantación remota del hotspot rechazada sin crear portal_session
  Dado un gateway "gw-01" con secreto conocido y una allow-list con la IP "10.20.0.1"
  Cuando llega POST /v1/internal/hotspot/bind desde la IP "203.0.113.9" con firma HMAC inválida
  Entonces la respuesta HTTP es 403 con reason "invalid_gateway_signature" o "origin_not_allowed"
  Y no se crea portal_session ni device_binding
  Y audit_log registra "security.hotspot_spoof_rejected"

Escenario: MAC no presente en host ni en el lease DHCP del NAS
  Dado un NAS cuyo ip/hotspot/host y cuyo lease DHCP no contienen la MAC "00:11:22:33:44:55"
  Cuando el portal envía POST /v1/portal/sessions con un bind_token válido para esa MAC
  Entonces la respuesta HTTP es 409 con reason "mac_not_on_nas"
  Y no se crea portal_session ni device_binding
  Y audit_log registra "security.mac_not_on_nas"

Escenario: Alta de portal_session sin aviso de privacidad registrado
  Dado un bind_token válido para la MAC "00:11:22:33:44:55" e IP "10.20.0.7"
  Cuando llega POST /v1/portal/sessions sin notice_version ni notice_accepted_at
  Entonces la respuesta HTTP es 409 con reason "privacy_notice_missing"
  Y no se persiste mac_address ni ip_address en portal_sessions

Escenario: Firma de otra wallet distinta a la declarada
  Dado un challenge emitido para la wallet "0xAbC0000000000000000000000000000000000001"
  Cuando llega POST /v1/session/bind firmado por "0xDeF0000000000000000000000000000000000002"
  Entonces la respuesta HTTP es 401
  Y el challenge no queda consumido
  Y no se crea ningún device_binding
  Y audit_log registra "portal.bind_rejected" con reason "signature_mismatch"

Escenario: Reutilización de una MAC ya ligada a otra wallet
  Dado un device_binding "active" para la MAC "00:11:22:33:44:55" y la wallet "0xAbC0000000000000000000000000000000000001"
  Cuando la wallet "0xDeF0000000000000000000000000000000000002" intenta vincularse con la misma MAC
  Entonces la respuesta HTTP es 409 con reason "mac_conflict"
  Y el binding anterior permanece en estado "active" con revoked_at nulo
  Y no se crea un segundo binding "active" para esa MAC
  Y audit_log registra "security.mac_conflict"
  Y audit_log registra "alert.mac_conflict" con details.severity "warning"

Escenario: Nonce usado dos veces
  Dado un challenge ya consumido
  Cuando se reenvía POST /v1/session/bind con el mismo nonce y una firma válida
  Entonces la respuesta HTTP es 409 con reason "challenge_expired"
  Y no se crea un segundo device_binding

Escenario: Sexta solicitud fallida desde la misma IP+MAC en 15 minutos
  Dado 5 intentos fallidos de vinculación desde la IP "10.20.0.7" y la MAC observada "00:11:22:33:44:55" en los últimos 15 minutos
  Cuando se envía un sexto intento
  Entonces la respuesta HTTP es 429 con reason "rate_limited"
  Y la cabecera Retry-After es mayor que 0 y menor o igual a 900
  Y audit_log registra "security.rate_limited"

Escenario: Dispositivo con wallet pero sin saldo
  Dado un usuario cuya wallet tiene saldo BRLT "0" y BRLTx "0"
  Cuando completa la firma del challenge
  Entonces la respuesta HTTP es 200 y la sesión queda "bound"
  Y access_commands permanece sin registros para esa sesión
  Y el portal muestra "saldo-brlt" con valor "0" y el botón "wrap-open" habilitado (CU-02)

Escenario: Disclaimer legal y red esperada visibles antes de abrir el stream
  Dado un usuario con el portal abierto en el paso de apertura de stream
  Cuando el portal renderiza la vista
  Entonces role=status "chain-expected" muestra "81234"
  Y existe un elemento role=note con el disclaimer legal y la versión del aviso "v1"
  Y no se habilita el botón "open-stream" sin ese disclaimer visible

Escenario: Deriva de IP de una sesión autorizada sin re-autenticación
  Dado un hotspot_session "active" con device_binding para la MAC "00:11:22:33:44:55" e IP "10.20.0.7"
  Y el NAS reporta esa MAC con IP "10.20.0.9"
  Cuando la reconciliación detecta la deriva y transcurren 60 s sin POST /v1/session/revalidate válido
  Entonces la sesión pasa a "revoking" y luego a "revoked" con disconnect_reason "timeout"
  Y audit_log registra "security.ip_mac_drift"
  Y se emite access_commands "disconnect" en status "success"
```

**Restricciones del sistema (EARS)**

- El sistema deberá almacenar `session_token_hash` (SHA-256) y **nunca** el token de sesión en claro
  ni en logs.
- Cuando el `chainId` de la wallet difiera de `gateways.chain_id`, el sistema deberá rechazar la
  vinculación con HTTP 409 sin emitir challenge.
- Mientras la `portal_session` esté en `pending` o `challenge_issued`, el sistema deberá impedir
  cualquier `access_command` al gateway.
- El sistema deberá obtener MAC/IP por el canal autenticado hotspot→API: el NAS firma
  `gateway_id|mac|ip|ts|nonce` con HMAC-SHA256 desde una IP de la allow-list, recibe un `bind_token`
  de 5 min y `POST /v1/portal/sessions` toma la terna del token; **nunca** deberá aceptar
  `mac_address`/`ip_address` del cuerpo (RF-17, D45).
- El sistema deberá verificar la terna **antes de autorizar** en `/ip/hotspot/host` y
  `/ip/dhcp-server/lease`; `/ip/hotspot/active` solo se usará para reconciliación post-autorización.
- Si la firma HMAC es inválida, el `ts` está fuera de ±60 s, el nonce se reutiliza o la IP de origen no
  está permitida, entonces el sistema deberá rechazar el bind con 403 sin crear `portal_session`.
- Si la MAC no consta en `/ip/hotspot/host` ni en el lease, entonces el sistema deberá responder 409
  `mac_not_on_nas` sin persistir PII.
- Si la MAC ya tiene un binding `active` con otra wallet, entonces el sistema deberá **mantener** ese
  binding, rechazar el nuevo con 409, alertar al titular y aplicar cooldown, sin revocar el binding
  legítimo (D47, RB-24).
- El sistema deberá aplicar el rate-limit de RB-32 a `POST /v1/session/challenge` y
  `POST /v1/session/bind` por IP + MAC observada, con contadores en almacén compartido.
- El sistema deberá mostrar y versionar el aviso de privacidad **antes** de llamar al alta, exigir
  `notice_version` vigente y `notice_accepted_at` en `POST /v1/portal/sessions`, y solo entonces
  persistir MAC/IP y registrar la evidencia de puesta a disposición (RNF-12, D52).
- Si la IP o la MAC de una sesión autorizada deriva, entonces el sistema deberá exigir
  `POST /v1/session/revalidate` en ≤ 60 s y revocar con `timeout` si no se re-autentica (H2-25).
- De acuerdo con D7 y RNF-25, el sistema deberá emitir el JWT en cookie `httpOnly` con `SameSite`,
  TTL de 900 s, token CSRF válido y revocación server-side en `portal_sessions`.

**Trazabilidad:** RF/RNF/RT cubiertos: RF-01, RF-02, RF-03, RF-06, RF-17; RNF-10, RNF-12, RNF-25.
Cobertura secundaria: RF-14 (API `/v1/session/*`), RNF-02 (sin secretos en logs),
RNF-25 (CSRF/rotación JWT), RT-05 (portal), RT-08 (configuración).

---

## CU-02 — Envolver BRLT en BRLTx

| Campo | Valor |
|---|---|
| **ID** | CU-02 |
| **Nombre** | Envolver BRLT en BRLTx |
| **Actor(es)** | Usuario con wallet (primario); Chain (secundario) |
| **Objetivo** | Convertir BRLT en BRLTx 1:1 mediante `upgradeTo`/wrap, dejando saldo y allowance suficientes para **cubrir la 1 h de tarifa que exige la apertura del stream** (`rate × 3600`, D54), sin exponer claves ni firmar transacciones por el usuario. |
| **Requisitos** | RF-04; RNF-02, RNF-01 |

**Precondiciones**
1. Existe binding `active` del dispositivo (CU-01) y la wallet está vinculada.
2. La wallet tiene saldo BRLT ≥ importe a envolver y `allowance(wallet, BRLTx)` ≥ importe, o el
   usuario firma la aprobación en el mismo flujo.
3. El par (`BRLT`, `BRLTx`) está registrado en `BarloventoFactory` y la dirección coincide con
   `gateways.super_token_address`.
4. Tras el wrap, `BRLTx.balanceOf(wallet) ≥ price_per_second_wei × 3600` (depósito de apertura de
   1 h de tarifa, D54).

**Postcondiciones**
1. `BRLTx.balanceOf(wallet)` incrementado exactamente en el importe envuelto (1:1, sin comisión).
2. `BRLT.balanceOf(wallet)` decrementado en el mismo importe.
3. `BRLTx.totalSupplyX()` igual al BRLT custodiado (invariante de reserva).
4. El portal muestra nuevo saldo y allowance; no se modifica ningún comando de gateway.

**Flujo principal**
1. El portal consulta `balanceOf` de BRLT y BRLTx y `allowance` de la wallet, y muestra la tasa de
   conversión 1:1, el **importe mínimo efectivo de apertura = `price_per_second_wei × 3600`** (1 h de
   tarifa, `required = rate × 3600 + deuda pendiente`, D54) y el **tiempo estimado = saldo BRLTx /
   `price_per_second_wei`**, advirtiendo de que la apertura consume la primera hora de garantía.
2. El usuario introduce el importe (en BRLT, 18 decimales) o acepta el sugerido.
3. Si `allowance < importe`, el portal solicita primero `approve(BRLTx, importe)` y espera
   confirmación de la transacción.
4. El usuario firma `upgradeTo(importe)` (wrap) desde su wallet; el portal **no** firma nada.
5. El orquestador/portal espera la confirmación (**2 bloques**, RB-08) y verifica por `eth_call` el
   nuevo `balanceOf(BRLTx)` y el evento de wrap.
6. El portal actualiza saldo, allowance y coste estimado del stream (importe / `price_per_second_wei`
   = segundos disponibles) y registra el resultado en `audit_log` `action='wallet.wrap'`.

**Flujos alternativos**
- **FA-02.1 — Importe 0 o inferior al mínimo.** El portal bloquea la operación con el mensaje
  "importe mínimo = `price_per_second_wei × 3600` (1 h de tarifa)" y no envía transacción. Si
  `gateway_tariffs.min_deposit_wei` es mayor que ese valor, se muestra el mayor de los dos, pero el
  gate on-chain sigue siendo `rate × 3600` (D54).
- **FA-02.2 — El usuario ya tiene BRLTx suficiente.** Se omite el wrap y se continúa en CU-03 con el
  saldo existente.
- **FA-02.3 — Aprobación y wrap en una sola transacción.** Si el contrato lo permite, se ejecuta
  `approve` + `upgradeTo` y se acepta un único `tx_hash` con los dos efectos.

**Flujos de excepción**
- **EX-02.1 — Transacción revertida** (saldo insuficiente, allowance insuficiente, hard-cap).
  El portal muestra el motivo del revert, no actualiza saldos y audita
  `action='wallet.wrap_failed'` con `tx_hash`.
- **EX-02.2 — Transacción no incluida en 2 bloques (reorg o descarte).** Se reintenta la lectura o se
  invita a reenviar; no se considera el saldo envuelto hasta confirmación.
- **EX-02.3 — Par BRLT/BRLTx no registrado o dirección distinta a la del gateway.** HTTP/UI error
  bloqueante `pair_mismatch`; no se permite envolver.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Envoltura 1:1 con saldo y allowance suficientes
  Dado un usuario con 100,000000000000000000 BRLT y allowance ilimitado hacia BRLTx
  Cuando envuelve 40,000000000000000000 BRLT y la transacción se confirma en 2 bloques
  Entonces BRLTx.balanceOf(usuario) aumenta en 40,000000000000000000
  Y BRLT.balanceOf(usuario) disminuye en 40,000000000000000000
  Y totalSupplyX() es igual al BRLT custodiado por el contrato
  Y audit_log registra "wallet.wrap" con el tx_hash confirmado

Escenario: Envoltura sin allowance previo
  Dado un usuario con allowance 0 hacia BRLTx
  Cuando solicita envolver 10,000000000000000000 BRLT
  Entonces el portal exige primero una aprobación por importe mayor o igual a 10,000000000000000000
  Y no se envía upgradeTo hasta que la aprobación esté confirmada

Escenario: Importe por debajo del mínimo de apertura (1 h de tarifa)
  Dado un gateway cuya tarifa tiene price_per_second_wei = 1000000000000 (1e12 wei/s)
  Y el importe mínimo de apertura es 3600000000000000 wei (rate × 3600)
  Cuando el usuario introduce 3000000000000000 wei de BRLT
  Entonces la operación se rechaza en el portal y no se envía ninguna transacción
  Y el mensaje muestra el mínimo 3600000000000000 wei

Escenario: El tiempo estimado refleja el depósito de 1 h
  Dado un saldo BRLTx de 7200000000000000 wei y price_per_second_wei = 1000000000000
  Cuando el portal calcula el tiempo estimado
  Entonces muestra 7200 s (2 h) y advierte de que la apertura exige 3600 s de garantía
  Y el importe mínimo efectivo mostrado es 3600000000000000 wei

Escenario: Transacción revertida por saldo insuficiente
  Dado un usuario con 1,000000000000000000 BRLT
  Cuando intenta envolver 5,000000000000000000 BRLT
  Entonces la transacción revierte
  Y BRLTx.balanceOf(usuario) no cambia
  Y audit_log registra "wallet.wrap_failed" con el motivo del revert

Escenario: La clave privada nunca abandona la wallet
  Dado el flujo completo de envoltura en el portal
  Cuando se inspeccionan las peticiones del portal y el bundle servido
  Entonces no aparece ninguna clave privada ni mnemónico
  Y la firma la produce exclusivamente el proveedor EIP-1193 del usuario
```

**Restricciones del sistema (EARS)**

- El sistema deberá ejecutar la envoltura **1:1** sin comisión y sin retener BRLT fuera del contrato
  BRLTx.
- Cuando el importe sea inferior al **mínimo efectivo de apertura** (`price_per_second_wei × 3600`,
  1 h de tarifa por D54), el sistema deberá rechazar la operación antes de firmar.
- El sistema deberá mostrar el **tiempo estimado = saldo / tarifa** y advertir de que la apertura
  exige 1 h de tarifa como depósito (D54).
- El sistema deberá verificar el par (`BRLT`, `BRLTx`) contra `gateways.super_token_address` antes de
  permitir el wrap.
- Si la transacción no queda confirmada en 2 bloques, entonces el sistema deberá tratar el saldo como
  no disponible y no habilitar CU-03.
- El sistema **no deberá** solicitar, almacenar ni transmitir claves privadas, mnemónicos ni firmas
  completas en logs (RNF-02).

**Trazabilidad:** RF/RNF/RT cubiertos: RF-04; RNF-01, RNF-02.
Cobertura secundaria: RNF-27 (contrato BRLTx con `ReentrancyGuard` y CEI, verificado con
Forge/Slither), RF-22 (BRLT/BRLTx adaptados), RT-01 (Solidity 0.8.28 + OZ 5.1), RNF-05 (2 bloques),
D54 (1 h de tarifa en la apertura).

---

## CU-03 — Abrir stream y obtener acceso a internet

| Campo | Valor |
|---|---|
| **ID** | CU-03 |
| **Nombre** | Abrir stream y obtener acceso a internet |
| **Actor(es)** | Usuario con wallet (primario); Sistema y Gateway/NAS (secundarios) |
| **Objetivo** | Abrir un stream `wallet → payout_wallet` con `flowRate >= tarifa` y el depósito de 1 h, obtener acceso provisional en ≤ 60 s, y confirmar la sesión al incluirse en 2 bloques. La petición responde **202 Accepted** y la validación de la tx se ejecuta en el *worker* (D44). |
| **Requisitos** | RF-05, RF-09, RF-12; RNF-03, RNF-04, RNF-20, RNF-21, RNF-27 |

**Precondiciones**
1. Binding `active` (CU-01) y saldo BRLTx ≥ `price_per_second_wei × 3600` (1 h de tarifa, D54/CU-02).
2. Tarifa `active` y vigente (`valid_from ≤ now() < valid_to`), con `payout_wallet`,
   `price_per_second_wei > 0` y `super_token_address` correctos.
3. Gateway `online` y sin sesión no terminal para esa MAC (RB-25).
4. Cuota de provisional disponible para `(MAC, wallet)` (RB-04).
5. El flow no está ya ligado a otra sesión padre no terminal (unicidad flow↔sesión, D56/RB-25).

**Postcondiciones**
1. `hotspot_sessions` creada en `pending` al aceptar la petición (202) y, tras la validación del
   *worker*, en `provisional` (o `failed` si la tx no es válida), con `flow_rate_wei_s`,
   `min_rate_required_wei`, `tx_hash`, `authorized_at`.
2. `access_commands` con `authorize`/`confirm` en `success` y `idempotency_key` única.
3. `flow_subscriptions` refleja el flow `active` con la tasa validada.
4. La sesión queda autorizada con el perfil de **50/10 Mbps** (atributos WISPr/`rate-limit` del
   comando, verificables sin tráfico real).
5. Si no hay confirmación en 2 bloques: sesión `revoked` y comando `disconnect` enviado.

**Flujo principal**
1. El portal muestra coste por segundo (`price_per_second_wei`), tiempo estimado con el saldo
   (`saldo / tarifa`), el aviso de que la apertura exige **1 h de tarifa** (`rate × 3600`, D54) y el
   plan de 50 Mbps bajada / 10 Mbps subida.
2. El usuario firma `createFlow(receiver = payout_wallet, flowRate)` con
   `flowRate >= price_per_second_wei` (int96, wei/s) y el depósito de 1 h.
3. El portal envía `POST /v1/session/authorize` con `{portal_session_id, tx_hash, flow_rate}`; el
   orquestador valida lo síncrono (binding, tarifa, gateway, cuota, unicidad flow↔sesión), persiste la
   `hotspot_session` en `pending` y **encola una tarea durable** en Cloud Tasks
   (`authorize-validation`, reintentos con OIDC) antes de responder **202 Accepted** con
   `{hotspot_session_id, status:"pending"}` (D44/V2-05). La validación de la tx **no** ocurre en la
   petición HTTP y no depende de que la instancia siga viva: si la instancia se apaga tras el 202, la
   tarea se reintenta y la validación no se pierde.
4. El *worker* asíncrono valida la tx con un **único oráculo por modo** (`MEMPOOL_MODE`, D56), el
   mismo que se usará para confirmar o revocar: `visible` → `eth_getTransactionByHash`; `receipt` →
   `eth_getTransactionReceipt`. Valida: `from == wallet del binding`, `to == Super Token`, método
   `createFlow`, `receiver == payout_wallet`, `flowRate >= tarifa`, saldo y nonce ejecutables. En
   `receipt` no se concede provisional sin recibo incluido; el modo se fija en H2 (ENV-02) y **no se
   mezclan ramas**.
5. Con la validación OK, la sesión pasa de `pending` a `provisional` con
   `provisional_until = now() + 60 s` y envía `access_command(authorize, provisional)` al adaptador
   (`mikrotik_rest` / `radius` / `mock`) con `idempotency_key` única y atributos WISPr 50/10 Mbps.
6. El gateway confirma el ACK; el portal consulta `GET /v1/session/{id}`, informa "acceso provisional,
   60 s" y el dispositivo queda autorizado.
7. Al vencer la ventana, una tarea durable de Cloud Tasks (`provisional-expiry`, reintentos con OIDC)
   confirma con el **mismo oráculo del modo** (`MEMPOOL_MODE`: `eth_getTransactionByHash` o
   `eth_getTransactionReceipt`) + `getFlow`/`getAccountInfo` (sondeo directo, **no** con el indexador,
   D42/V2-05). Si el oráculo sigue presente y el flow es `Active` con `flowRate >= tarifa`, envía
   `confirm` (login/CoA persistente o `reauthorize`); si no, revoca. La tarea es idempotente por
   `access_commands.idempotency_key` y no se pierde si la instancia se apagó.
8. El orquestador actualiza la sesión a `active` con `confirmed_at` y `authorized_at`, y registra
   ambas órdenes en `access_commands`. El indexador (Job de 1 min) procesa `FlowCreated`/
   `FlowUpdated` a 2 bloques como **reconciliación** del read model (RF-09), no como confirmador del
   provisional.
9. El health-check (Job de 1 min) toma la primera muestra de solvencia (`session_health_checks`) y el
   portal pasa a estado `active` con el contador de consumo.

**Flujos alternativos**
- **FA-03.1 — La transacción no se incluye antes de 60 s.** Al vencer `provisional_until` sin que el
  oráculo del modo siga devolviendo la tx (o sin recibo en modo `receipt`, que nunca habría concedido
  provisional), la sesión pasa a `revoking` → `revoked` con `disconnect_reason='timeout'` y se envía
  `disconnect`; el portal ofrece reintentar.
- **FA-03.2 — Reconexión del mismo dispositivo con el flow aún activo.** Solo si la MAC es la misma
  de la sesión padre previa se reutiliza el flow (`flow_subscriptions` ya `active`) y se valida
  igualmente, sin nueva transacción. **Un flow activo autoriza una sola sesión padre** (D56/RB-25):
  otra MAC del mismo padre debe usar voucher (CU-07/CU-08), nunca el mismo flow.
- **FA-03.3 — Gateway RADIUS no alcanzable (UDP 3799 bloqueado).** El adaptador hace fallback a
  `mikrotik_rest` si el gateway tiene ambos transportes; si no, fail-closed (D14) y HTTP 503.
- **FA-03.4 — `flowRate` superior a la tarifa.** Se acepta; se documenta el excedente y el coste real
  por segundo en la sesión.

**Flujos de excepción**
- **EX-03.1 — Cuota de provisional agotada** (ya hubo 1 provisional para esa MAC+wallet en 15 min).
  HTTP **429** `details.reason='provisional_quota'`, `audit_log` `action='security.provisional_quota'`,
  sin comando al gateway.
- **EX-03.2 — Transacción inválida** (`from` distinto, `receiver` distinto, método distinto o
  `flowRate < tarifa`). La petición ya respondió **202**; la sesión pasa de `pending` a `failed`, sin
  autorización y con `audit_log action='flow.validation_rejected'` y el motivo concreto
  (`flow_rate_below_tariff`, `wrong_super_token`, `invalid_transaction`).
- **EX-03.3 — Super Token distinto al del gateway.** La sesión pasa a `failed` con
  `details.reason='wrong_super_token'`; no se autoriza.
- **EX-03.4 — Sin saldo/nonce ejecutable.** La sesión pasa a `failed` con
  `details.reason='insufficient_funds_or_nonce'`; no se concede provisional.
- **EX-03.5 — `authorize` sin ACK tras 3 intentos (1/2/4 s + jitter, timeout 2 s).** La sesión pasa a
  `failed`; no se reintenta más; `audit_log alert.revocation_no_ack` (o `gateway.authorize_failed`) y
  `alerts_total{type="authorize_failed"}`; fail-closed.
- **EX-03.6 — `pauseFlow` detectado antes de confirmar.** La sesión no se confirma y se revoca
  (RB-15): `revoking` → `status='revoked'`, `disconnect_reason='flow_paused'`.
- **EX-03.7 — RPC no responde en 8 s.** 3 reintentos con backoff; si persiste, la petición síncrona
  responde 503 `reason='rpc_degraded'` sin crear sesión (modo degradado documentado, RNF-20).
- **EX-03.8 — Flow ya ligado a otra sesión padre no terminal.** HTTP **409**
  `reason='flow_already_bound'`, sin crear `hotspot_session`; el segundo dispositivo debe usar voucher
  (D56).

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Aceptación asíncrona y acceso provisional en 60 segundos
  Dado un binding activo para MAC "00:11:22:33:44:55" y wallet "0xAbC...0001"
  Y una tarifa con price_per_second_wei = 1000000000000 y payout_wallet "0xPay...0009"
  Cuando el usuario envía createFlow con flowRate = 1000000000000 y POST /v1/session/authorize
  Entonces la respuesta HTTP es 202 con status "pending"
  Y hotspot_sessions existe en estado "pending" con tx_hash registrado
  Y el worker crea provisional_until = authorized_at + 60 s y la sesión pasa a "provisional"
  Y access_commands contiene un "authorize" con status "success" e idempotency_key única
  Y el comando "authorize" incluye WISPr-Bandwidth-Max-Down 50000000 y Up 10000000

Escenario: Confirmación con el mismo oráculo del modo al vencer la ventana
  Dado un hotspot_session en "provisional" con tx_hash incluido en el bloque N y MEMPOOL_MODE "receipt"
  Cuando vence provisional_until y la tarea provisional-expiry obtiene eth_getTransactionReceipt y getFlow
  Entonces getFlow devuelve status "Active" y flowRate >= 1000000000000
  Y la sesión pasa a "active" con confirmed_at no nulo
  Y access_commands contiene un "confirm" en status "success"
  Y flow_subscriptions.status es "active" con flow_rate_wei_s = 1000000000000

Escenario: Transacción con flowRate inferior a la tarifa
  Dado un usuario que envía createFlow con flowRate = 999999999999
  Cuando el worker valida la transacción
  Entonces hotspot_sessions.status es "failed"
  Y no existe access_command de tipo "authorize" para esa sesión
  Y audit_log registra "flow.validation_rejected" con reason "flow_rate_below_tariff"

Escenario: Segundo dispositivo del mismo padre intenta reutilizar el flow
  Dado un flow activo ya ligado a la sesión padre de la MAC "00:11:22:33:44:55"
  Cuando la MAC "AA:BB:CC:DD:EE:01" del mismo padre solicita autorización con el mismo flow
  Entonces la respuesta HTTP es 409 con reason "flow_already_bound"
  Y no se crea una segunda hotspot_session padre
  Y el portal dirige al canje de voucher (CU-08)

Escenario: Segunda provisional para la misma MAC y wallet en 15 minutos
  Dado un provisional concedido hace 3 minutos para (MAC "00:11:22:33:44:55", wallet "0xAbC...0001")
  Cuando se solicita una nueva provisional
  Entonces la respuesta HTTP es 429 con reason "provisional_quota"
  Y no se envía ningún comando al gateway
  Y audit_log registra "security.provisional_quota"

Escenario: Provisional no confirmada en 60 segundos
  Dado un hotspot_session "provisional" cuyo provisional_until vence y el oráculo del modo no devuelve la tx
  Cuando la tarea de caducidad evalúa la sesión
  Entonces la sesión pasa a "revoking" y luego a "revoked" con disconnect_reason "timeout"
  Y access_commands contiene un "disconnect" con status "success"

Escenario: Pausa del stream durante la ventana provisional
  Dado un hotspot_session "provisional"
  Cuando el indexador procesa FlowPaused para ese sender y receiver
  Entonces la sesión pasa a "revoked" con disconnect_reason "flow_paused"
  Y no se emite "confirm"
```

**Restricciones del sistema (EARS)**

- Cuando el *worker* reciba una transacción candidata, deberá validar
  `from == wallet del binding`, `to == Super Token`, método `createFlow`,
  `receiver == payout_wallet`, `flowRate >= price_per_second_wei` y el depósito de 1 h **antes** de
  ordenar el acceso.
- Cuando se reciba `POST /v1/session/authorize` con las validaciones síncronas correctas, el sistema
  deberá responder **202 Accepted** y registrar la sesión en `pending`; la validación de la tx se
  ejecuta en el *worker* (D44).
- Mientras una sesión esté en `provisional`, el sistema deberá limitar el acceso a **60 s** y
  revocarlo si al vencer la ventana el oráculo del modo no devuelve la tx (o no hay lectura solvente).
- El sistema deberá confirmar el provisional con el **mismo oráculo del modo** (`MEMPOOL_MODE`:
  `eth_getTransactionByHash` o `eth_getTransactionReceipt`) + `getFlow`/`getAccountInfo`, **sin
  depender del indexador** (D42/D56).
- El sistema deberá conceder como máximo **1 provisional por MAC + wallet cada 15 min**, auditar los
  intentos fallidos y bloquear el dispositivo ante abuso.
- Si la transacción no es ejecutable (saldo o nonce), entonces el sistema deberá pasar la sesión a
  `failed` sin emitir comando de autorización al gateway.
- El sistema deberá medir `revocation_command_latency_ms` desde la detección hasta el ACK (p95 < 10 s)
  y `service_cutoff_latency_ms` desde el inicio de la insolvencia (p95 < 75 s) (D43).
- Cuando el gateway no responda al `authorize` tras 3 intentos, el sistema deberá aplicar fail-closed
  (no autorizar), registrar el fallo con estado `timeout`/`failed` en `access_commands` y emitir
  `alert.authorize_failed`.
- Mientras el flow esté activo, el sistema deberá exigir `status == Active` además de
  `flowRate >= tarifa` para mantener la sesión.
- De acuerdo con RNF-20, el sistema deberá usar timeout de 8 s, 3 reintentos con backoff + jitter y
  `eth_getLogs` de como máximo 5 000 bloques.
- El sistema deberá aplicar el perfil de **50 Mbps bajada / 10 Mbps subida** a la sesión padre mediante
  atributos WISPr/`rate-limit` verificables en el comando.
- El sistema deberá rechazar con 409 `flow_already_bound` un segundo dispositivo que intente usar un
  flow ya ligado a una sesión padre no terminal (D56).

**Trazabilidad:** RF/RNF/RT cubiertos: RF-05, RF-09, RF-12; RNF-03, RNF-04, RNF-20, RNF-21, RNF-27.
Cobertura secundaria: RF-10 (autorización), RF-14 (API), RF-17 (binding), RNF-06 (idempotencia),
RNF-09 (métricas), RNF-23 (carga, spec k6 §5.9), D42 (Jobs de 1 min), D44 (202 + worker),
D54 (1 h de tarifa), D56 (unicidad flow↔sesión y mempool), RT-06/RT-07 (adaptadores), RT-12 (`/metrics`).

---

## CU-04 — Consultar estado de sesión y consumo

| Campo | Valor |
|---|---|
| **ID** | CU-04 |
| **Nombre** | Consultar estado de sesión y consumo |
| **Actor(es)** | Usuario con wallet (primario); Sistema (secundario) |
| **Objetivo** | Mostrar en el portal el estado autoritativo de la sesión (`pending`, `provisional`, `active`, `degraded`, `revoking`, `revoked`, `closed`, `expired`, `failed`), el consumo acumulado y el tiempo restante estimado con el saldo, de forma accesible (WCAG A/AA). |
| **Requisitos** | RF-06, RF-14; RNF-13 |

**Precondiciones**
1. Existe `portal_session` vinculada (CU-01) y, al menos, un intento de sesión de red (CU-03).
2. El JWT de portal es válido y no revocado.

**Postcondiciones**
1. El portal muestra el estado devuelto por `GET /v1/session/{id}` sin inferirlo localmente.
2. El usuario ve: estado, `flow_rate_wei_s`, coste por segundo, consumo acumulado (wei y BRLTx),
   segundos restantes estimados, motivo de revocación si aplica.
3. La consulta queda registrada en logs estructurados con `session_id` (RNF-09) pero **no** genera
   `access_command` ni entrada en `audit_log` (lectura sin efecto).

**Flujo principal**
1. El portal consulta `GET /v1/session/{id}` con el JWT y el token CSRF.
2. El orquestador lee `hotspot_sessions` (+ `session_health_checks` más reciente y
   `flow_subscriptions`) y compone `{status, authorized_at, provisional_until, flow_rate_wei_s,
   min_rate_required_wei, consumed_wei, estimated_seconds_left, disconnect_reason}`.
3. Calcula `estimated_seconds_left = virtualBalanceOf(sender) / flow_rate_wei_s` solo si
   `flow_rate_wei_s > 0`; para hijos (`voucher_child`, tasa 0) devuelve `null` y hereda el estado del
   padre.
4. Devuelve **HTTP 200** con el estado; el portal refresca cada **60 s** (alineado con la cadencia
   mínima del Job de health-check, D42) y muestra el disclaimer legal.
5. Si el estado es terminal (`revoked`/`closed`/`expired`/`failed`), el portal muestra el motivo y
   ofrece volver a iniciar (CU-03) o canjear voucher (CU-08).
6. Si la sesión es hija (`voucher_child`), el estado y la solvencia se leen del **padre**
   (`session_health_checks` del padre), porque el hijo no tiene stream propio (D55/H2-34).

**Flujos alternativos**
- **FA-04.1 — Sesión en `degraded`.** El portal muestra aviso "calidad degradada, reintentando
  desconexión/confirmación", con el número de intentos y el tiempo de gracia restante (≤ 30 s).
- **FA-04.2 — Hijo de voucher.** Devuelve `access_mode='voucher_child'`, `bandwidth_percent=50`,
  `flow_rate_wei_s=0` y el estado del padre como referencia.
- **FA-04.3 — Sin sesión de red todavía.** Devuelve `status='pending'` (sesión creada por CU-03 con
  la petición ya aceptada) o `status=null` con `portal_session='bound'` si aún no se solicitó acceso,
  y `estimated_seconds_left=null` con la instrucción de abrir stream.

**Flujos de excepción**
- **EX-04.1 — JWT expirado (> 900 s) o revocado.** HTTP **401**; el portal reinicia CU-01 sin perder
  la captura MAC/IP si la `portal_session` sigue vigente.
- **EX-04.2 — Sesión inexistente o de otra wallet.** HTTP **404** (no se filtra existencia de
  sesiones ajenas) y `audit_log` `action='security.session_access_denied'`.
- **EX-04.3 — BD no disponible.** HTTP **503** `reason='db_unavailable'`; el portal muestra el último
  estado cacheado con marca de tiempo y no permite operaciones.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Consulta de una sesión activa con consumo
  Dado un hotspot_session "active" con flow_rate_wei_s = 1000000000000
  Y virtualBalanceOf(sender) = 3600000000000000
  Cuando el usuario consulta GET /v1/session/{id}
  Entonces la respuesta HTTP es 200 con status "active"
  Y consumed_wei es mayor o igual que 0
  Y estimated_seconds_left = 3600
  Y la respuesta no crea ningún access_command

Escenario: Consulta de un hijo de voucher
  Dado un hotspot_session con access_mode "voucher_child" y bandwidth_percent 50
  Cuando se consulta GET /v1/session/{id}
  Entonces status refleja el estado del padre
  Y flow_rate_wei_s es 0
  Y bandwidth_percent es 50
  Y estimated_seconds_left es nulo

Escenario: Sesión revocada por insolvencia
  Dado un hotspot_session "revoked" con disconnect_reason "insolvent"
  Cuando se consulta GET /v1/session/{id}
  Entonces la respuesta HTTP es 200 con status "revoked"
  Y disconnect_reason es "insolvent"
  Y el portal muestra el motivo y la opción de reabrir stream

Escenario: JWT expirado
  Dado un JWT emitido hace 901 s
  Cuando se consulta GET /v1/session/{id}
  Entonces la respuesta HTTP es 401
  Y no se devuelve ningún dato de la sesión

Escenario: Acceso a una sesión de otra wallet
  Dado un hotspot_session cuyo wallet_address es "0xAbC...0001"
  Cuando la wallet "0xDeF...0002" consulta esa sesión
  Entonces la respuesta HTTP es 404
  Y audit_log registra "security.session_access_denied"

Escenario: Accesibilidad del estado en el portal
  Dado el portal renderizado en estado "active" en español e inglés
  Cuando se ejecuta axe-core sobre la vista de estado
  Entonces hay 0 violaciones de nivel A y AA
  Y el estado se anuncia con texto, no solo con color
```

**Restricciones del sistema (EARS)**

- El sistema deberá devolver el estado desde `hotspot_sessions` y **no** desde una copia local del
  portal.
- Cuando el JWT haya expirado o esté revocado, el sistema deberá responder 401 sin revelar datos.
- Si el solicitante no es el titular de la sesión, entonces el sistema deberá responder 404 y auditar
  el intento.
- Mientras la sesión esté en `degraded`, el sistema deberá exponer el número de intentos y el tiempo
  de gracia restante (≤ 30 s).
- De acuerdo con RNF-13, el sistema deberá ofrecer la vista de estado en **es/en** con **0
  violaciones axe A/AA** en la matriz de navegadores declarada.
- El sistema deberá refrescar como máximo cada **60 s** (cadencia del Job de health-check) y no
  generar tráfico on-chain por consulta de estado.
- Cuando la sesión sea `voucher_child`, el sistema deberá devolver el estado de solvencia **heredado
  del padre** leído de `session_health_checks` del padre, sin evaluar al hijo (H2-34).

**Trazabilidad:** RF/RNF/RT cubiertos: RF-06, RF-14; RNF-13.
Cobertura secundaria: RNF-09 (logs con `session_id`), RNF-10 (auth de API), RNF-25 (JWT/CSRF),
RF-21 (datos de accounting si existen), RT-05 (portal), RT-12 (`/healthz`).

---

## CU-05 — Pausar y reanudar el stream

| Campo | Valor |
|---|---|
| **ID** | CU-05 |
| **Nombre** | Pausar y reanudar el stream |
| **Actor(es)** | Usuario con wallet (primario); Sistema y Gateway/NAS (secundarios) |
| **Objetivo** | Permitir que el usuario suspenda el gasto con `pauseFlow` (lo que **revoca** el acceso, no lo congela) y lo reanude con `resumeFlow`, exigiendo reautorización del gateway. |
| **Requisitos** | RF-14, RF-19; RNF-21 |

**Precondiciones**
1. Sesión `active` con stream `Active` y binding vigente.
2. La wallet conserva el depósito/garantía (`buffer_seconds = 3600`).

**Postcondiciones (pausa)**
1. El flow on-chain queda `Paused` con `flowRate` efectivo 0.
2. `hotspot_sessions.status = 'revoking'` → `revoked` con `disconnect_reason='flow_paused'`; los
   hijos `voucher_child` también quedan `revoked` con la misma causa (RB-15).
3. `access_commands` contiene un `disconnect` en `success`; el dispositivo vuelve al portal.

**Postcondiciones (reanudación)**
1. `resumeFlow` ejecutado y flow `Active` con `flowRate >= tarifa`.
2. Nueva autorización al gateway (`authorize`/`confirm`) y sesión `active` (o `provisional` si aún no
   hay 2 bloques).
3. `audit_log` con `action='flow.pause'` / `action='flow.resume'` y `tx_hash`.

**Flujo principal — pausa**
1. El usuario pulsa "Pausar" en el portal; el portal advierte que **pausar corta el acceso** y que
   los equipos hijos también se desconectan.
2. El usuario firma `pauseFlow(receiver)`; el portal envía `POST /v1/session/pause` con `tx_hash`
   (D48).
3. El orquestador registra la intención y espera el evento `FlowPaused` (o detecta `flowRate = 0`).
4. Al detectarlo, marca la sesión `revoking` y envía `disconnect` al gateway con
   `disconnect_reason='flow_paused'` (idempotente).
5. Con ACK, la sesión y sus hijos pasan a `revoked`; el portal muestra el estado y el saldo restante.
6. `settle()`/`claimSettled()` liquidan el devengo al `payout_wallet` según el contrato.

**Flujo principal — reanudación**
1. El usuario firma `resumeFlow(receiver)` (o `createFlow` si el flow fue cerrado).
2. El portal envía `POST /v1/session/resume` (D48); el orquestador valida `flowRate >= tarifa` y
   solvencia (RB-14).
3. El indexador confirma `FlowResumed` a 2 bloques; el orquestador reabre sesión (nueva fila o
   reactivación) y envía `authorize`/`confirm`.
4. Se aplica de nuevo el perfil 50/10 al padre y el 50 % a los hijos que se re-canjearon.

**Flujos alternativos**
- **FA-05.1 — Pausa solicitada pero el flow ya estaba `Paused`.** Operación idempotente: no se emite
  segundo `disconnect` (misma `idempotency_key`), se devuelve 200 con el estado actual.
- **FA-05.2 — Reanudación sin saldo suficiente.** El orquestador rechaza la reautorización con HTTP
  402 y mantiene la sesión `revoked`; el portal dirige a CU-02.
- **FA-05.3 — Reanudación con un flow cerrado.** Se exige `createFlow` nuevo (CU-03) en lugar de
  `resumeFlow`.

**Flujos de excepción**
- **EX-05.1 — `disconnect` sin ACK tras 3 intentos.** La sesión pasa a `degraded` durante la gracia
  de 30 s; el comando queda en `timeout` (nunca `degraded`); si no hay ACK, se aplica corte de
  emergencia (address-list) y `alert.revocation_no_ack` (RNF-19).
- **EX-05.2 — Evento `FlowPaused` perdido.** El health-check detecta `status != Active` o
  `flowRate < tarifa` en ≤ 1 ciclo (60 s) y revoca (RB-14).
- **EX-05.3 — Pausa durante la ventana provisional.** Se cancela la confirmación y la sesión pasa a
  `revoked` sin llegar a `active`.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Pausa revoca el acceso del padre y de los hijos
  Dado un hotspot_session "active" con dos hijos "voucher_child" activos
  Cuando el usuario firma pauseFlow y el indexador procesa FlowPaused
  Entonces el padre pasa a "revoking" y luego a "revoked" con disconnect_reason "flow_paused"
  Y los dos hijos pasan a "revoked" con disconnect_reason "flow_paused"
  Y access_commands registra un "disconnect" en status "success" por cada sesión revocada

Escenario: Pausa idempotente
  Dado un stream ya pausado y una sesión ya revocada por "flow_paused"
  Cuando se repite POST /v1/session/pause con el mismo tx_hash
  Entonces la respuesta HTTP es 200
  Y no se crea un segundo access_command "disconnect"

Escenario: Reanudación con solvencia correcta
  Dado un flow "Paused" con flowRate 1000000000000 y tarifa 1000000000000
  Y virtualBalanceOf(sender) mayor que 0
  Cuando el usuario firma resumeFlow y envía POST /v1/session/resume
  Entonces access_commands contiene un "authorize" en status "success"
  Y la sesión pasa a "active" tras el ACK del gateway
  Y el comando incluye WISPr-Bandwidth-Max-Down 50000000 y Up 10000000

Escenario: Reanudación sin saldo
  Dado un flow "Paused" y virtualBalanceOf(sender) = 0
  Cuando el usuario solicita reanudar
  Entonces la respuesta HTTP es 402
  Y la sesión permanece "revoked"
  Y no se envía ningún comando de autorización al gateway

Escenario: Desconexión sin ACK
  Dado un gateway que no responde a disconnect en 3 intentos (1/2/4 s, timeout 2 s)
  Cuando se agota la gracia de 30 s
  Entonces la sesión pasa a "degraded"
  Y access_commands.status es "timeout"
  Y se aplica corte de emergencia por address-list
  Y audit_log registra "alert.revocation_no_ack" con details.severity "critical"
```

**Restricciones del sistema (EARS)**

- Cuando se detecte `pauseFlow` o `flowRate = 0`, el sistema deberá revocar el acceso y **no**
  mantenerlo "congelado".
- Mientras la sesión esté `revoked` por pausa, el sistema deberá impedir el tráfico hasta una
  reanudación autorizada.
- Si el usuario reanuda, entonces el sistema deberá exigir `status == Active`,
  `flowRate >= tarifa` y `virtualBalanceOf(sender) > 0` antes de reautorizar.
- El sistema deberá revocar en cascada todos los hijos del padre pausado o cerrado.
- Si `disconnect` no recibe ACK, entonces el sistema deberá degradar la sesión, dejar el comando en
  `timeout`/`failed`, aplicar corte de emergencia y emitir `alert.revocation_no_ack`, sin marcar
  `revoked` hasta el ACK (RB-07).
- El sistema deberá garantizar idempotencia de pausa/reanudación por `tx_hash` y
  `idempotency_key`.

**Trazabilidad:** RF/RNF/RT cubiertos: RF-14, RF-19; RNF-21.
Cobertura secundaria: RF-11 (revocación), RF-27 (cascada), RNF-06 (idempotencia), RNF-19 (ACK y
emergencia), D22, RT-06/RT-07.

---

## CU-06 — Cerrar el stream y finalizar el acceso

| Campo | Valor |
|---|---|
| **ID** | CU-06 |
| **Nombre** | Cerrar el stream y finalizar el acceso |
| **Actor(es)** | Usuario con wallet (primario); Sistema y Gateway/NAS (secundarios) |
| **Objetivo** | Cerrar el stream (`closeFlow`), liquidar el devengo pendiente al `payout_wallet` y desconectar el dispositivo, dejando la sesión en `closed` sin servicio residual. |
| **Requisitos** | RF-06, RF-11 |

**Precondiciones**
1. Sesión `active` o `degraded` con flow `Active` o `Paused`.
2. Binding vigente y wallet con saldo para el gas de la transacción.
3. Si hay hijos, están identificados por `parent_hotspot_session_id`.

**Postcondiciones**
1. Flow `Closed` con `flowRate = 0` y devengo liquidado (`settle`, `claimSettled` según contrato).
2. `hotspot_sessions.status = 'closed'` con `disconnected_at` y `disconnect_reason='user_closed'`
   cuando el `disconnect` recibe ACK. El estado final determinista del cierre voluntario es
   **`closed`** (H2-06/D50).
3. Hijos `voucher_child` en **`closed`** (regla de cascada única: cierre voluntario → hijos `closed`)
   y sus bindings `revoked`.
4. `access_commands` con `disconnect` en `success`; el dispositivo vuelve al portal.
5. `vouchers` del padre pasan a **`expired`** (cascada de cierre voluntario).

**Flujo principal**
1. El usuario pulsa "Cerrar sesión" en el portal y confirma el aviso de liquidación.
2. El usuario firma `closeFlow(receiver)`; el portal envía `POST /v1/session/{id}/close` con
   `tx_hash`.
3. El orquestador marca la sesión `revoking` y envía `disconnect` al gateway con
   `disconnect_reason='user_closed'` (no espera a los 2 bloques para cortar, D14).
4. Con ACK, la sesión pasa a **`closed`**; se revocan bindings, los hijos pasan a `closed` y los
   vouchers a `expired`.
5. El indexador procesa `FlowClosed`/`FlowDeleted` a 2 bloques, confirma `flow_subscriptions` en
   `closed` y registra `Settled`/`Claimed` en `flow_events` si existen.
6. El portal muestra el resumen: duración, consumo liquidado, saldo BRLTx restante y enlace a
   `claimSettled` si hay devengo reclamable.
7. Si el gateway usa RADIUS y `accounting` está activo, se completa `radacct.acctstoptime`,
   `acctsessiontime` y `acctterminatecause='User-Request'` (RF-21, opcional).

**Flujos alternativos**
- **FA-06.1 — Cierre sin saldo para gas.** El portal informa y ofrece pausar (corte inmediato) o
  esperar; la sesión no se marca `closed` hasta la confirmación on-chain, pero el acceso se corta.
- **FA-06.2 — Cierre iniciado por el operador.** Se comporta como CU-12 (`disconnect_reason='admin'`)
  y el flujo on-chain se cierra por el usuario o queda `Paused` hasta su cierre.
- **FA-06.3 — Cierre detectado por evento (`FlowDeleted`) sin acción del usuario.** Se ejecuta el
  mismo cierre con `disconnect_reason='flow_deleted'` y se revoca en cascada.

**Flujos de excepción**
- **EX-06.1 — `disconnect` sin ACK.** Gracia de 30 s → la sesión queda `degraded` y el comando
  `timeout`, fallback de transporte, corte de emergencia y `alert.revocation_no_ack` (RNF-19). La
  sesión **no** se marca `closed` sin ACK.
- **EX-06.2 — `closeFlow` revierte.** Se informa del motivo, el acceso permanece activo mientras el
  flow siga `Active` y solvente, y se audita `action='flow.close_failed'`.
- **EX-06.3 — Sesión ya cerrada.** Respuesta **409** `reason='already_closed'`, idempotente, sin
  nuevo comando.
- **EX-06.4 — Evento de cierre no indexado en 12 bloques.** Se abre incidencia, se fuerza la lectura
  on-chain del flow y se reconcilia (CU-19).

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Cierre correcto con liquidación
  Dado un hotspot_session "active" con flow_rate_wei_s 1000000000000 y 600 s de consumo
  Cuando el usuario firma closeFlow y el gateway confirma el disconnect
  Entonces la sesión pasa a "closed" con disconnected_at no nulo
  Y access_commands contiene un "disconnect" en status "success"
  Y flow_subscriptions.status es "closed" y flow_rate_wei_s = 0
  Y flow_events registra un evento "flow_deleted" con tx_hash confirmado

Escenario: Cierre con hijos activos
  Dado un padre "active" con dos hijos "voucher_child" activos
  Cuando el usuario cierra el stream del padre
  Entonces los dos hijos pasan a "closed"
  Y los vouchers del padre pasan a "expired"
  Y sus device_bindings pasan a "revoked"
  Y sus vouchers dejan de ser canjeables

Escenario: Cierre repetido
  Dado un hotspot_session ya "closed"
  Cuando se repite POST /v1/session/{id}/close
  Entonces la respuesta HTTP es 409 con reason "already_closed"
  Y no se crea un segundo access_command "disconnect"

Escenario: Desconexión sin ACK en el cierre
  Dado un gateway que no responde al disconnect
  Cuando transcurren 30 s de gracia sin ACK
  Entonces la sesión pasa a "degraded" y no a "closed"
  Y access_commands.status es "timeout"
  Y se ejecuta el fallback de transporte CoA/PoD a REST
  Y audit_log registra "alert.revocation_no_ack" con el session_id

Escenario: Registro de accounting RADIUS al cerrar
  Dado un gateway RADIUS con accounting activo y un Acct-Session-Id asignado
  Cuando se cierra la sesión
  Entonces radacct.acctstoptime no es nulo
  Y acctsessiontime es mayor o igual que la duración real en segundos
  Y acctterminatecause es "User-Request"
```

**Restricciones del sistema (EARS)**

- Cuando el usuario cierre el flow, el sistema deberá ordenar el `disconnect` sin esperar a la
  confirmación de 2 bloques, para no regalar servicio.
- El sistema deberá liquidar el devengo con `settle`/`claimSettled` y reflejar `Settled`/`Claimed` en
  `flow_events`.
- Mientras exista un hijo activo, el sistema deberá cerrarlo o revocarlo al cerrar el padre.
- Si la sesión ya está cerrada, entonces el sistema deberá responder 409 sin duplicar comandos.
- Si `disconnect` no recibe ACK, entonces el sistema deberá dejar la sesión en `degraded`, el comando
  en `timeout`, hacer fallback y emitir `alert.revocation_no_ack`; nunca marcar `closed` sin ACK.
- El sistema deberá aplicar la **regla de cascada única**: cierre voluntario → hijos `closed` y
  vouchers `expired`; revocación por caída/insolvencia → hijos `revoked` y vouchers `revoked`
  (H2-06).
- De acuerdo con RF-21 (SHOULD), si el gateway usa RADIUS con accounting, el sistema deberá registrar
  inicio, fin, octetos y causa de terminación en `radacct`.

**Trazabilidad:** RF/RNF/RT cubiertos: RF-06, RF-11.
Cobertura secundaria: RF-21 (accounting, SHOULD — D46), RF-27 (cascada), RNF-06 (idempotencia),
RNF-19 (reintentos), RF-24 (notificación de revocación), RT-07 (RFC 5176).

---

## CU-07 — Generar voucher para equipos hijos

| Campo | Valor |
|---|---|
| **ID** | CU-07 |
| **Nombre** | Generar voucher para equipos hijos |
| **Actor(es)** | Usuario con wallet / padre (primario); Sistema (secundario) |
| **Objetivo** | Emitir un código de un solo uso (12 chars Crockford Base32, SHA-256) ligado a la sesión padre y a su stream vivo, que habilite hasta **`max_children` (2 por defecto)** equipos hijos sin wallet al **50 %** de velocidad, dentro del límite global `max_children_per_parent` del padre. |
| **Requisitos** | RF-25, RF-27; RNF-26 |

**Precondiciones**
1. Sesión padre `active` (`wallet_stream`) con stream `Active` y `flowRate >= tarifa`.
2. La wallet solicitante es la titular de la sesión padre.
3. **Cupo por sesión viva:** la suma de hijos vivos del padre es menor que
   `gateway_tariffs.max_children_per_parent` (default **5**), y `max_children` del voucher está en
   1..10 (default 2). El cupo se libera al desconectarse la sesión hija (D55).

**Postcondiciones**
1. Fila en `vouchers` con `code_hash = SHA-256(código)`, `parent_hotspot_session_id`,
   `max_children`, `bandwidth_percent=50`, `status='active'`, `valid_to = now() + 90 días`.
2. El **código en claro se devuelve una sola vez** al portal; nunca se almacena ni se registra en
   logs.
3. `audit_log` con `action='voucher.create'` (sin el código), `operator_id` si lo emite el operador
   (CU-13) o `actor='wallet'`.
4. `children_used` cuenta **slots de sesiones vivas**, no dispositivos de por vida: al cerrar una
   sesión hija se decrementa y el mismo MAC puede volver a canjear mientras el cupo esté libre
   (D55).

**Flujo principal**
1. El padre, con sesión `active`, solicita "generar voucher" e indica el número de hijos (1..10,
   máximo `max_children`; por defecto 2).
2. El orquestador verifica que la sesión padre está `active`, que el flow sigue `Active` y que
   `flowRate >= tarifa` (RB-14).
3. Genera un código aleatorio de **12 caracteres Crockford Base32** con entropía criptográfica
   (excluye `I`, `L`, `O`, `U` para evitar ambigüedad).
4. Calcula `code_hash = SHA-256(código)` y persiste `vouchers` con `children_used = 0`,
   `bandwidth_percent = 50`, `valid_from = now()`, `valid_to = now() + 90 días`.
5. Devuelve **HTTP 201** con el código en claro **una única vez** y los metadatos (caducidad, cupo,
   50 % de velocidad, gateway y plan).
6. El portal muestra el código, advierte que no se podrá recuperar y ofrece copiarlo; registra el
   evento en `audit_log` sin el código.

**Flujos alternativos**
- **FA-07.1 — Varios vouchers para el mismo padre.** Permitido mientras el padre esté `active` y la
  suma de hijos vivos no supere `max_children_per_parent` (default 5); cada voucher tiene su propio
  `max_children` (default 2) (D55).
- **FA-07.2 — Emisión por operador (CU-13).** El operador puede crear un voucher para un padre
  existente; queda `created_by` con su `operator_id` y auditoría de operador.
- **FA-07.3 — Reducción de cupo a 1.** `max_children=1` es válido (CHECK 1..10) y el voucher pasa a
  `redeemed` al primer canje.

**Flujos de excepción**
- **EX-07.1 — Sesión padre no `active` o flow no `Active`.** HTTP **409**
  `reason='parent_stream_not_active'`; no se emite voucher.
- **EX-07.2 — Solicitante distinto del titular.** HTTP **403**; `audit_log`
  `action='security.voucher_forbidden'`.
- **EX-07.3 — Fallo de persistencia.** No se devuelve código; operación atómica (rollback) y HTTP 500
  sin filtrar detalles internos.
- **EX-07.4 — Intento de crear más vouchers que el límite operativo por sesión.** HTTP **429**
  `reason='voucher_creation_limited'` con `audit_log`.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Generación de voucher para un padre activo
  Dado un hotspot_session "active" con wallet "0xAbC...0001" y flow "Active"
  Cuando el padre solicita un voucher con 2 hijos
  Entonces la respuesta HTTP es 201 y devuelve un código de exactamente 12 caracteres
  Y el código solo contiene caracteres del alfabeto Crockford Base32
  Y vouchers guarda code_hash = SHA-256(código) y nunca el código en claro
  Y max_children es 2, children_used es 0 y bandwidth_percent es 50
  Y valid_to = valid_from + 90 días
  Y la petición se registra contra POST /v1/vouchers

Escenario: Límite global de hijos del padre
  Dado un padre con max_children_per_parent 5 y 5 hijos vivos
  Cuando la wallet del padre solicita un sexto voucher
  Entonces la respuesta HTTP es 429 con reason "voucher_creation_limited"
  Y no se inserta ninguna fila en vouchers
  Y audit_log registra "voucher.creation_limited"

Escenario: El código no se puede recuperar después
  Dado un voucher recién creado cuyo código se mostró una vez
  Cuando el padre consulta GET /v1/vouchers/{id}
  Entonces la respuesta no contiene el código en claro
  Y solo devuelve metadatos (cupo, caducidad, estado, bandwidth_percent)

Escenario: Intento de generar voucher con el stream pausado
  Dado un hotspot_session "revoked" con disconnect_reason "flow_paused"
  Cuando la wallet intenta generar un voucher
  Entonces la respuesta HTTP es 409 con reason "parent_stream_not_active"
  Y no se inserta ninguna fila en vouchers

Escenario: Generación por una wallet ajena
  Dado un hotspot_session "active" de la wallet "0xAbC...0001"
  Cuando la wallet "0xDeF...0002" solicita un voucher para esa sesión
  Entonces la respuesta HTTP es 403
  Y audit_log registra "security.voucher_forbidden"

Escenario: Código no aparece en logs ni auditoría
  Dado el flujo completo de generación de voucher
  Cuando se inspeccionan audit_log y los logs estructurados del orquestador
  Entonces ninguna entrada contiene el código en claro
  Y solo aparece su hash SHA-256 o el voucher_id
```

**Restricciones del sistema (EARS)**

- Cuando el padre solicite un voucher, el sistema deberá verificar que la sesión padre está `active`
  y el flow `Active`.
- El sistema deberá generar códigos de **12 caracteres Crockford Base32** con entropía
  criptográfica y almacenar **solo** su SHA-256.
- El sistema deberá devolver el código en claro **una sola vez** y nunca incluirlo en logs,
  `audit_log`, métricas ni trazas.
- El sistema deberá fijar `max_children = 2` por defecto (rango 1..10) y `bandwidth_percent = 50`.
- El sistema deberá limitar los hijos **vivos** del padre a `max_children_per_parent` (default 5,
  configurable en `gateway_tariffs`) y liberar el cupo al cerrarse la sesión hija (D55).
- Si el solicitante no es el titular, entonces el sistema deberá responder 403 y auditar el intento.
- Mientras el voucher esté `active` y el stream padre vivo, el sistema deberá permitir su canje
  (CU-08); si el padre cae, deberá invalidarlo.

**Trazabilidad:** RF/RNF/RT cubiertos: RF-25, RF-27; RNF-26.
Cobertura secundaria: RF-13 (stream vivo), RF-18 (auditoría), RNF-02 (sin secretos en logs),
RNF-06 (idempotencia de emisión), D18/D31, RT-03.

---

## CU-08 — Canjear un voucher y conectar un equipo hijo sin wallet

| Campo | Valor |
|---|---|
| **ID** | CU-08 |
| **Nombre** | Canjear un voucher y conectar un equipo hijo sin wallet |
| **Actor(es)** | Usuario sin wallet (primario); Sistema y Gateway/NAS (secundarios) |
| **Objetivo** | Permitir que un dispositivo sin wallet acceda a internet canjeando un voucher vigente, con cupo disponible y stream padre vivo, creando una sesión `voucher_child` al **50 %** del plan, con MAC/IP **verificadas en el NAS** y revocación en cascada. |
| **Requisitos** | RF-17, RF-25, RF-26, RF-27; RNF-26, RNF-19 |

**Precondiciones**
1. El dispositivo hijo no tiene wallet ni binding `wallet`; la MAC/IP del hijo se obtienen del portal
   servido por el hotspot a través de un `bind_token` (canal HMAC NAS→API) y se verifican **antes de
   autorizar** en `/ip/hotspot/host` y `/ip/dhcp-server/lease` del NAS (D45); `/ip/hotspot/active` se
   reserva para reconciliación.
2. Existe un voucher `active` con `valid_from ≤ now() < valid_to` y
   `children_used < max_children`.
3. El stream del padre está `Active` y su sesión padre sigue `active` **y solvente** (última muestra
   de `session_health_checks` del padre con `is_solvent = true`; H2-34).
4. El dispositivo hijo no tiene ya una redención **viva** de ese voucher (índice único parcial
   `uq_voucher_redemptions_live_mac` sobre `(voucher_id, mac_address) WHERE released_at IS NULL`);
   tras liberarse la redención puede reconectar.

**Postcondiciones**
1. `voucher_redemptions` con `voucher_id`, `portal_session_id`, `hotspot_session_id` (hijo),
   `mac_address`, `ip_address`.
2. `device_bindings` con `binding_type='voucher'`, `voucher_id`, `status='active'`.
3. `hotspot_sessions` hijo creada en `pending` y, con ACK, en `active`, con
   `access_mode='voucher_child'`, `parent_hotspot_session_id`, `flow_rate_wei_s=0`,
   `bandwidth_percent=50`.
4. `vouchers.children_used` incrementado en 1; si llega a `max_children` **con todas las sesiones
   vivas**, `status='redeemed'`. Al cerrarse una sesión hija se decrementa `children_used` y, si el
   voucher estaba `redeemed` con cupo liberado, vuelve a `active` (D55).
5. `access_commands` con `authorize` aplicando **25 Mbps bajada / 5 Mbps subida** (WISPr o
   `rate-limit`).
6. Si el padre cae, el hijo pasa a `revoking` → `revoked` en ≤ 1 ciclo de health-check más el SLA de
   comando (cascada, D43).

**Flujo principal**
1. El equipo hijo abre una URL; el portal servido por el hotspot obtiene `$(mac)`/`$(ip)`, el
   orquestador **verifica la terna en `/ip/hotspot/host` y `/ip/dhcp-server/lease`**, crea la
   `portal_session` y muestra la opción "tengo un código".
2. El usuario introduce el código de 12 caracteres; el portal envía `POST /v1/vouchers/redeem` con
   `{code, portal_session_id}` (la MAC/IP las aporta la terna verificada, nunca el cuerpo).
3. El orquestador calcula `SHA-256(código)` y busca el voucher; abre transacción con
   `SELECT ... FOR UPDATE` sobre `vouchers` (atomicidad H-20).
4. Valida: `status='active'`, vigencia, `children_used < max_children`, `Σ hijos vivos del padre <
   max_children_per_parent`, stream padre `Active`, sesión padre `active` y **solvente** según la
   última muestra de `session_health_checks` del padre (H2-34).
5. Valida que `(voucher_id, mac_address)` no tenga una redención **viva** (`released_at IS NULL`) en
   `voucher_redemptions` (índice único parcial `uq_voucher_redemptions_live_mac`).
6. Crea `device_binding` tipo `voucher`, `portal_session` en `bound` y `hotspot_session` hijo en
   `pending` con `bandwidth_percent = voucher.bandwidth_percent` (50).
7. Inserta `voucher_redemptions`, incrementa `children_used` y, si `children_used == max_children`
   **con todas las sesiones vivas**, marca `vouchers.status='redeemed'`; hace commit.
8. Envía `access_command(authorize)` al gateway con QoS absoluta: `WISPr-Bandwidth-Max-Down =
   25000000`, `WISPr-Bandwidth-Max-Up = 5000000` (o `rate-limit=25M/5M` en MikroTik).
9. Con ACK, el hijo pasa a `active` y el portal muestra "conectado al 50 % del plan" y el tiempo
   restante del padre.

**Flujos alternativos**
- **FA-08.1 — Código con espacios o minúsculas.** Se normaliza (mayúsculas, sin separadores) antes
  del hash; se acepta `abcd-efgh-ijkl` y `ABCDEFGHIJKL` como el mismo código.
- **FA-08.2 — Canje concurrente de los dos últimos cupos.** El `SELECT ... FOR UPDATE` serializa; uno
  obtiene el cupo y el otro recibe 409 `voucher_exhausted`, sin sobreventa.
- **FA-08.3 — Reconexión del mismo dispositivo tras desconectarse.** El cupo se liberó al cerrar la
  sesión hija (decremento auditado de `children_used`), por lo que el mismo MAC puede volver a canjear
  el voucher mientras el padre siga vivo y haya cupo. Con una redención **viva** previa se rechaza con
  409 `device_has_active_session` (D55/H2-20).

**Flujos de excepción**
- **EX-08.1 — Código inexistente o caducado.** HTTP **404** genérico (`reason='voucher_invalid'`) para
  no distinguir existencia; `audit_log` `action='voucher.redeem_failed'` con `code_hash` (nunca el
  código).
- **EX-08.2 — Cupo agotado.** HTTP **409** `reason='voucher_exhausted'`; `children_used` no cambia.
- **EX-08.3 — Stream padre caído o padre no `active`.** HTTP **409**
  `reason='parent_stream_not_active'`; no se crea sesión hija.
- **EX-08.4 — Fuerza bruta de códigos.** Tras **5 intentos fallidos por IP + MAC observada por el
  NAS en 15 min** (contadores en almacén compartido): HTTP **429**, bloqueo temporal del dispositivo,
  `audit_log action='alert.provisional_abuse'` y `alerts_total{type="voucher_bruteforce"}` (RNF-26).
- **EX-08.5 — Gateway sin ACK.** La transacción de canje ya hizo commit: la sesión hija queda
  `failed`, se libera el cupo (decremento compensatorio auditado) y se emite
  `alert.revocation_no_ack`; no se deja cupo consumido sin servicio.
- **EX-08.7 — MAC no verificable en `/ip/hotspot/host` ni en el lease DHCP.** HTTP **409**
  `reason='mac_not_on_nas'`; no se consume cupo ni se crea sesión hija (D45).
- **EX-08.6 — Sesión no terminal previa en la misma MAC.** HTTP **409**
  `reason='device_has_active_session'` (RB-25), sin consumir cupo.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Canje correcto del primer hijo
  Dado un voucher "active" con max_children 2, children_used 0 y bandwidth_percent 50
  Y una sesión padre "active" con plan 50 Mbps bajada / 10 Mbps subida
  Y la MAC "AA:BB:CC:DD:EE:01" presente en ip/hotspot/host y en el lease DHCP del NAS
  Cuando el equipo hijo canjea el código válido
  Entonces la respuesta HTTP es 201
  Y hotspot_sessions crea una fila con access_mode "voucher_child" y bandwidth_percent 50
  Y flow_rate_wei_s del hijo es 0 y parent_hotspot_session_id apunta al padre
  Y vouchers.children_used pasa a 1 y status sigue "active"
  Y access_commands "authorize" incluye WISPr-Bandwidth-Max-Down 25000000 y Up 5000000

Escenario: Canje del segundo hijo agota el cupo
  Dado un voucher con max_children 2 y children_used 1
  Cuando un segundo dispositivo canjea el código
  Entonces la respuesta HTTP es 201
  Y children_used pasa a 2 y vouchers.status pasa a "redeemed"

Escenario: Tercer intento de canje
  Dado un voucher con children_used 2 y status "redeemed"
  Cuando un tercer dispositivo intenta canjear el mismo código
  Entonces la respuesta HTTP es 409 con reason "voucher_exhausted"
  Y no se crea ninguna sesión hija
  Y children_used permanece en 2

Escenario: Canje con el stream del padre caído
  Dado un voucher "active" pero cuyo hotspot_session padre está "revoked"
  Cuando un dispositivo intenta canjear el código
  Entonces la respuesta HTTP es 409 con reason "parent_stream_not_active"
  Y no se inserta voucher_redemptions ni se incrementa children_used

Escenario: Reutilización del mismo dispositivo con sesión viva
  Dado un voucher canjeado por la MAC "AA:BB:CC:DD:EE:01" con sesión hija "active"
  Cuando la misma MAC intenta canjear el mismo voucher
  Entonces la respuesta HTTP es 409 con reason "device_has_active_session"
  Y no se consume un segundo cupo
  Y el intento queda auditado

Escenario: Reconexión del hijo libera y reutiliza el cupo
  Dado un voucher con max_children 2 y children_used 1 por la MAC "AA:BB:CC:DD:EE:01"
  Cuando la sesión hija pasa a "closed" y se decrementa children_used a 0
  Y la misma MAC canjea de nuevo el voucher con el padre aún "active"
  Entonces la respuesta HTTP es 201
  Y children_used vuelve a 1
  Y no se supera max_children_per_parent

Escenario: Fuerza bruta de códigos
  Dado 5 intentos fallidos de canje desde la IP "10.20.0.9" y la MAC observada "AA:BB:CC:DD:EE:02" en 15 min
  Cuando se envía el sexto intento
  Entonces la respuesta HTTP es 429 con reason "rate_limited"
  Y el dispositivo queda bloqueado temporalmente
  Y audit_log registra "alert.provisional_abuse" con la IP y la MAC observada

Escenario: Revocación en cascada del hijo al caer el padre
  Dado un hijo "active" y un padre "active"
  Cuando el indexador detecta FlowDeleted del padre
  Entonces el hijo pasa a "revoking" y, con ACK, a "revoked" con disconnect_reason "flow_deleted"
  Y access_commands contiene un "disconnect" para el hijo con status "success"
  Y los vouchers del padre pasan a "revoked"

Escenario: Canje concurrente del último cupo
  Dado un voucher con max_children 2 y children_used 1
  Cuando dos dispositivos canjean el mismo código simultáneamente
  Entonces exactamente una respuesta es 201 y la otra es 409
  Y children_used termina en 2, nunca en 3
```

**Restricciones del sistema (EARS)**

- Cuando el sistema reciba un código, deberá normalizarlo, calcular su SHA-256 y buscar el voucher
  sin registrar el código en claro.
- El sistema deberá ejecutar el canje completo en **una transacción** con `SELECT ... FOR UPDATE`
  sobre el voucher (H-20).
- Mientras el voucher esté `active` con cupo disponible y el stream padre vivo, el sistema deberá
  permitir el canje; en cualquier otro caso, denegarlo.
- El sistema deberá aplicar al hijo **exactamente** `bandwidth_percent` del plan base: 25 Mbps
  bajada / 5 Mbps subida, mediante `WISPr-Bandwidth-Max-Down/Up` o `rate-limit`.
- El hijo **no deberá** tener stream propio (`flow_rate_wei_s = 0`) ni wallet propia: hereda
  `sender_wallet` y `super_token_address` del padre.
- Si `children_used` alcanza `max_children`, el sistema deberá pasar el voucher a `redeemed`.
- Si se superan **5 intentos fallidos por IP + MAC en 15 min**, entonces el sistema deberá bloquear
  temporalmente, alertar y auditar.
- Cuando el stream del padre caiga, el sistema deberá revocar al hijo con la **doble métrica**: ACK en
  ≤ 10 s desde la detección y corte total en ≤ 75 s desde el inicio de la insolvencia (D43).
- El sistema deberá evaluar la solvencia del hijo **en la sesión padre** (última muestra de
  `session_health_checks` del padre con `is_solvent`), porque el hijo tiene `flow_rate_wei_s = 0`
  (H2-34).
- Si el gateway no confirma la autorización, entonces el sistema deberá compensar el cupo consumido,
  liberar el slot y dejar la sesión hija en `failed`, emitiendo `alert.revocation_no_ack`.
- El sistema deberá liberar el cupo de `children_used` al cerrarse la sesión hija y permitir la
  reconexión del mismo MAC mientras el padre siga vivo (D55).

**Trazabilidad:** RF/RNF/RT cubiertos: RF-17, RF-25, RF-26, RF-27; RNF-26, RNF-19.
Cobertura secundaria: RF-01/RF-03 (captura y binding de tipo voucher), RF-10/RF-11 (autorización y
revocación), RNF-03 (cascada), RNF-06 (idempotencia), RNF-23 (50 hijos), D18/D31, D45 (terna
verificada), D55 (cupo por sesión viva), RT-07 (WISPr/radius).

---

## CU-09 — Administrar gateways

| Campo | Valor |
|---|---|
| **ID** | CU-09 |
| **Nombre** | Administrar gateways |
| **Actor(es)** | Operador (primario); Sistema y Gateway/NAS (secundarios) |
| **Objetivo** | Dar de alta, editar, activar/desactivar y verificar gateways multi-vendor (`mikrotik_rest`, `radius`, `mock`), con credenciales por **referencia**, **configuración data-driven por cadena** (`chain_id` → RPC, contratos indexados) y validación de conectividad antes de habilitar servicio. |
| **Requisitos** | RF-15, RF-16; RT-06, RT-07, RNF-18 |

**Precondiciones**
1. El operador está autenticado con rol `admin` (RBAC) y su sesión está en `audit_log`.
2. Los secretos existen en Secret Manager con nombre `sfhostpot-mikrotik-password` /
   `sfhostpot-radius-secret` (o sus equivalentes por gateway).

**Postcondiciones**
1. Fila en `gateways` con `vendor`, `chain_id`, `super_token_address`, `mgmt_url` (si
   `mikrotik_rest`) o `radius_nas_ip` (si `radius`), y `*_secret_ref` (nunca el secreto).
2. `gateways.status` en `online` tras un health-check exitoso, o `offline` si falla.
3. `audit_log` con `action='gateway.create'|'gateway.update'|'gateway.disable'` y el `operator_id`.
4. Ningún secreto en claro en BD, logs, respuestas de API ni auditoría.

**Flujo principal**
1. El operador abre el alta de gateway y elige `vendor` ∈ {`mikrotik_rest`, `radius`, `mock`}.
2. Introduce nombre (UK), ubicación, `chain_id` (81234 en dev), `super_token_address` (BRLTx) y, según
   vendor: `mgmt_url` + `mgmt_username` + `mgmt_secret_ref`, o
   `radius_nas_ip` + `radius_auth_port=1812` + `radius_acct_port=1813` + `radius_coa_port=3799` +
   `radius_secret_ref`.
3. El orquestador valida el formato (EVM `^0x[0-9a-fA-F]{40}$`, IP/puerto, URL HTTPS) y la
   coherencia vendor↔campos obligatorios.
4. Resuelve los secretos por referencia en tiempo de uso (nunca los persiste) y ejecuta
   `healthcheck()`: REST `GET /rest/system/resource` (MikroTik) o `Access-Request` de prueba /
   `Status-Server` (RADIUS) o ping simulado (`mock`).
5. Si el health-check responde en < 5 s, crea el gateway en `online` con `last_health_at = now()`;
   si no, lo crea en `offline` con el error en `metadata.last_error`.
6. Registra el gateway en la **configuración data-driven**: el indexador y el health-check enumeran
   gateways `online`/`maintenance` y resuelven el RPC por `chain_id` (`RPC_URLS_BY_CHAIN`, Secret
   Manager); dar de alta un gateway con otra cadena o otro `super_token_address` no exige redeploy
   (H2-23).
7. El operador asigna tarifas (CU-10) y el gateway queda disponible para CU-03/CU-08.

**Flujos alternativos**
- **FA-09.1 — Edición de un gateway existente.** Se permite cambiar `mgmt_url`, puertos, referencias
  y `status`; el cambio queda auditado con valores anteriores y nuevos (sin secretos).
- **FA-09.2 — Desactivación.** `status='disabled'` impide nuevas autorizaciones (fail-closed); las
  sesiones activas se revocan con `disconnect_reason='admin'` (padre e hijos) y, si el comando no
  recibe ACK, pasan a `degraded` con corte de emergencia y `alert.revocation_no_ack` (D14).
- **FA-09.3 — Gateway `mock`.** Se crea sin credenciales reales (solo `vendor='mock'`), obligatorio
  para CI y demos (D16).
- **FA-09.4 — Multi-gateway.** Varios gateways conviven con tarifas y `payout_wallet` independientes
  (RF-16); el enrutado se hace por `gateway_id` de la sesión.

**Flujos de excepción**
- **EX-09.1 — `vendor='mikrotik_rest'` sin `mgmt_url` o `vendor='radius'` sin `radius_nas_ip`.**
  HTTP **422** con la lista de campos faltantes; no se crea el gateway.
- **EX-09.2 — Secreto no resoluble en Secret Manager.** HTTP **422**
  `reason='secret_unresolved'`; no se crea ni se activa; se audita el `*_ref` (nunca el valor).
- **EX-09.3 — Nombre duplicado.** HTTP **409** `reason='gateway_name_exists'` (UK `name`).
- **EX-09.4 — Health-check falla.** El gateway se crea `offline`; HTTP **201** con
  `status='offline'` y `last_error`; no se permite autorizar sesiones hasta que pase un check.
- **EX-09.5 — Operador sin rol `admin`.** HTTP **403** y `audit_log`
  `action='security.rbac_denied'`.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Alta de gateway MikroTik operativo
  Dado un operador con rol "admin" autenticado
  Y el secreto "sfhostpot-mikrotik-password" disponible en Secret Manager
  Cuando crea un gateway vendor "mikrotik_rest" con mgmt_url "https://10.0.0.2" y super_token_address "0xBRLTx...0001"
  Y el router mock responde al health-check en 800 ms
  Entonces la respuesta HTTP es 201 y gateways.status es "online"
  Y gateways.mgmt_secret_ref es una referencia y no contiene el secreto
  Y audit_log registra "gateway.create" con el operator_id

Escenario: Alta de gateway RADIUS con puertos por defecto
  Dado un operador "admin"
  Y un NAS que responde al Access-Request de prueba
  Cuando crea un gateway vendor "radius" con radius_nas_ip "10.0.0.3"
  Entonces radius_auth_port es 1812, radius_acct_port es 1813 y radius_coa_port es 3799
  Y el gateway queda "online" con last_health_at no nulo

Escenario: Campos obligatorios ausentes según vendor
  Dado un operador "admin"
  Cuando crea un gateway vendor "mikrotik_rest" sin mgmt_url
  Entonces la respuesta HTTP es 422 y el detalle lista "mgmt_url"
  Y no se inserta ninguna fila en gateways

Escenario: Secreto no resoluble
  Dado un gateway vendor "radius" con radius_secret_ref "no-existe"
  Cuando el operador intenta activarlo
  Entonces la respuesta HTTP es 422 con reason "secret_unresolved"
  Y el gateway permanece "offline"
  Y audit_log no contiene el valor del secreto

Escenario: Desactivación con sesiones activas
  Dado un gateway "online" con 3 sesiones "active"
  Cuando el operador lo pasa a "disabled"
  Entonces no se autorizan nuevas sesiones en ese gateway
  Y las 3 sesiones pasan a "revoking" y, con ACK, a "revoked" con disconnect_reason "admin"
  Y audit_log registra "gateway.disable"

Escenario: Operador sin permisos
  Dado un operador con rol "readonly"
  Cuando intenta crear un gateway
  Entonces la respuesta HTTP es 403
  Y audit_log registra "security.rbac_denied"
```

**Restricciones del sistema (EARS)**

- El sistema deberá almacenar únicamente **referencias** a secretos (`*_secret_ref`) y resolverlos en
  tiempo de uso desde Secret Manager / `.env` no versionado.
- Cuando el `vendor` sea `mikrotik_rest`, el sistema deberá exigir `mgmt_url`; cuando sea `radius`,
  deberá exigir `radius_nas_ip`.
- Mientras un gateway esté `offline`, `disabled` o `maintenance`, el sistema deberá aplicar
  fail-closed a las sesiones nuevas.
- Si el health-check falla, entonces el sistema deberá dejar el gateway en `offline` con
  `metadata.last_error` y no autorizar sesiones.
- El sistema deberá validar `super_token_address` con el patrón EVM y contra el par BRLT/BRLTx
  desplegado.
- De acuerdo con RNF-18, el sistema deberá impedir que secretos aparezcan en BD, logs, auditoría o
  respuestas de API, y verificar la ausencia en CI.
- El sistema deberá descubrir gateways y cadenas de forma **data-driven** (enumeración de gateways
  activos y mapa `chain_id` → RPC), sin exigir redeploy al alta de un gateway o de otra cadena
  (H2-23).
- Si el `disconnect` de una sesión activa no recibe ACK al desactivar el gateway, entonces el sistema
  deberá dejarla en `degraded`, aplicar corte de emergencia y emitir `alert.revocation_no_ack`.

**Trazabilidad:** RF/RNF/RT cubiertos: RF-15, RF-16; RT-06, RT-07, RNF-18.
Cobertura secundaria: RF-10/RF-11 (adaptadores), RF-13 (health-check), RF-18/RNF-24 (auditoría y
RBAC), RF-23 (mock), RNF-08 (disponibilidad por gateway), RNF-12 (minimización), D3/D14/D16,
H2-23 (configuración data-driven por cadena).

---

## CU-10 — Administrar tarifas y planes

| Campo | Valor |
|---|---|
| **ID** | CU-10 |
| **Nombre** | Administrar tarifas y planes |
| **Actor(es)** | Operador (primario); Sistema (secundario) |
| **Objetivo** | Crear, editar, activar y versionar tarifas por gateway (`price_per_second_wei`, `payout_wallet`, plan 50/10 Mbps, `min_deposit_wei` entendido como mínimo de apertura de 1 h, `max_children_per_parent`, ventana provisional, vigencia) sin desplegar contratos. |
| **Requisitos** | RF-15; D4, D25, RNF-24 |

**Precondiciones**
1. Operador autenticado con rol `admin` u `operator`.
2. Gateway existente y `super_token_address` válido.

**Postcondiciones**
1. Fila en `gateway_tariffs` con `price_per_second_wei > 0`, `payout_wallet` EVM,
   `bandwidth_down_bps = 50 000 000`, `bandwidth_up_bps = 10 000 000`,
   `provisional_seconds = 60`, `buffer_seconds = 3600`, `max_children_per_parent = 5`,
   `active`, `valid_from`/`valid_to`.
2. El **mínimo efectivo de apertura** mostrado y validado es `price_per_second_wei × 3600` (1 h de
   tarifa, D54): `min_deposit_wei` se conserva como umbral inferior declarativo y nunca puede
   contradecir el gate on-chain.
2. Las sesiones ya abiertas **conservan** `min_rate_required_wei` con el que se autorizaron
   (inmutabilidad por sesión); las nuevas usan la tarifa vigente.
3. `audit_log` con `action='tariff.create'|'tariff.update'|'tariff.deactivate'`.

**Flujo principal**
1. El operador selecciona el gateway y crea una tarifa con nombre único por gateway.
2. Introduce `price_per_second_wei` (wei/s, `numeric(38,0)`), `payout_wallet`, plan base 50/10 Mbps,
   `min_deposit_wei` y `max_children_per_parent` (1..50, default 5).
3. El orquestador valida: `price_per_second_wei > 0`, `payout_wallet` EVM y **≠** dirección cero,
   `token_address == gateways.super_token_address`, `bandwidth_*_bps > 0`, `provisional_seconds` en
   0..300, `buffer_seconds > 0`, `max_children_per_parent` en 1..50, `valid_to > valid_from`, y que
   `min_deposit_wei` no contradiga el **mínimo efectivo de apertura `rate × 3600`** (D54).
4. Guarda la tarifa `active` con `valid_from = now()` y calcula el coste por hora
   (`price_per_second_wei × 3600`) para mostrarlo en el panel.
5. La tarifa queda disponible para CU-03; el portal muestra el coste por segundo, el **mínimo de
   apertura `rate × 3600`** y el tiempo estimado.
6. Cualquier cambio posterior crea una **nueva versión** (nueva fila con `valid_from`) y desactiva la
   anterior con `valid_to = now()`, sin romper sesiones en curso.

**Flujos alternativos**
- **FA-10.1 — Cambio de precio con sesiones activas.** Las sesiones vivas mantienen
  `min_rate_required_wei`; solo las nuevas aplican el precio nuevo (D4).
- **FA-10.2 — Tarifa con vigencia futura.** `valid_from > now()`; no se aplica hasta esa fecha.
- **FA-10.3 — Plan promocional.** Se permite `price_per_second_wei` menor con `valid_to` acotado; al
  expirar, las nuevas sesiones usan la tarifa vigente siguiente.
- **FA-10.4 — QoS por plan.** Se ajustan `bandwidth_down_bps`/`bandwidth_up_bps` (siempre magnitudes
  absolutas, D25); el hijo sigue siendo el 50 % del plan vigente del padre.

**Flujos de excepción**
- **EX-10.1 — `price_per_second_wei = 0` o negativo.** HTTP **422**; no se guarda.
- **EX-10.2 — `payout_wallet` inválida o igual al `sender` por defecto.** HTTP **422**
  `reason='invalid_payout_wallet'`.
- **EX-10.6 — `min_deposit_wei` inferior al mínimo efectivo de 1 h y susceptible de inducir error al
  usuario.** HTTP **422** `reason='min_deposit_below_opening_hour'`; se muestra `rate × 3600` (D54).
  `max_children_per_parent` fuera de 1..50 → HTTP **422** `reason='invalid_max_children_per_parent'`.
- **EX-10.3 — `token_address` distinto del Super Token del gateway.** HTTP **422**
  `reason='super_token_mismatch'`.
- **EX-10.4 — Nombre duplicado en el mismo gateway.** HTTP **409** (UK por gateway).
- **EX-10.5 — Desactivar la última tarifa activa de un gateway con sesiones nuevas.** HTTP **409**
  `reason='last_active_tariff'`, salvo confirmación explícita con `?force=true` auditada.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Alta de tarifa con los valores canónicos
  Dado un gateway "online" con super_token_address "0xBRLTx...0001"
  Cuando el operador crea la tarifa "plan-base" con price_per_second_wei 1000000000000 y payout_wallet "0xPay...0009"
  Entonces la respuesta HTTP es 201
  Y bandwidth_down_bps es 50000000 y bandwidth_up_bps es 10000000
  Y provisional_seconds es 60, buffer_seconds es 3600 y max_children_per_parent es 5
  Y el mínimo efectivo de apertura mostrado es 3600000000000000 wei (rate × 3600)
  Y audit_log registra "tariff.create"

Escenario: Precio por segundo inválido
  Dado un operador "operator"
  Cuando crea una tarifa con price_per_second_wei 0
  Entonces la respuesta HTTP es 422
  Y no se inserta ninguna fila en gateway_tariffs

Escenario: Cambio de precio sin afectar a sesiones activas
  Dado un hotspot_session activo con min_rate_required_wei 1000000000000
  Cuando el operador publica una tarifa nueva con price_per_second_wei 2000000000000
  Entonces la sesión existente conserva min_rate_required_wei 1000000000000
  Y una sesión nueva exige 2000000000000

Escenario: Payout wallet inválida
  Dado un operador "admin"
  Cuando crea una tarifa con payout_wallet "0x0000000000000000000000000000000000000000"
  Entonces la respuesta HTTP es 422 con reason "invalid_payout_wallet"
  Y no se guarda la tarifa

Escenario: Super Token distinto al del gateway
  Dado un gateway con super_token_address "0xBRLTx...0001"
  Cuando se crea una tarifa con token_address "0xOtro...0002"
  Entonces la respuesta HTTP es 422 con reason "super_token_mismatch"

Escenario: Vigencia futura
  Dado un operador que crea una tarifa con valid_from en 24 h
  Cuando un usuario intenta abrir un stream antes de esa fecha
  Entonces la tarifa no se aplica
  Y el sistema informa de que no hay tarifa vigente para ese gateway
```

**Restricciones del sistema (EARS)**

- El sistema deberá almacenar el precio en **wei/s** como `numeric(38,0)` y **nunca** en coma
  flotante.
- El sistema deberá exigir `price_per_second_wei > 0`, `payout_wallet` EVM distinta de cero y
  `token_address == gateways.super_token_address`.
- Cuando se publique una tarifa nueva, el sistema deberá conservar `min_rate_required_wei` de las
  sesiones existentes.
- Mientras una tarifa no esté vigente (`valid_from > now()` o `active = false`), el sistema no deberá
  usarla para autorizar.
- El sistema deberá aplicar el plan **50 Mbps bajada / 10 Mbps subida** salvo que la tarifa declare
  otra magnitud absoluta, y el hijo siempre el 50 % del plan del padre (D25).
- De acuerdo con D4, el sistema deberá permitir cambiar tarifas sin redeploy de contratos.
- El sistema deberá versionar las tarifas (nueva fila con `valid_from`) y auditar cada cambio sin
  secretos.
- El sistema deberá mostrar y validar el **mínimo de apertura de 1 h** (`price_per_second_wei × 3600`)
  y rechazar configuraciones que lo contradigan (D54).
- El sistema deberá persistir `max_children_per_parent` (1..50, default 5) y aplicarlo como límite de
  hijos vivos por padre (D55).

**Trazabilidad:** RF/RNF/RT cubiertos: RF-15; D4, D25, RNF-24.
Cobertura secundaria: RF-05/RF-09 (tarifa en la validación), RF-16 (tarifa por gateway), RF-26 (QoS),
RF-18 (auditoría), RNF-06 (idempotencia de publicación), RNF-12 (minimización), RT-04 (PostgreSQL),
D54 (1 h de tarifa), D55 (max_children_per_parent).

---

## CU-11 — Supervisar sesiones y auditoría

| Campo | Valor |
|---|---|
| **ID** | CU-11 |
| **Nombre** | Supervisar sesiones y auditoría |
| **Actor(es)** | Operador (primario); Sistema (secundario) |
| **Objetivo** | Ofrecer una vista operativa en tiempo casi real de las sesiones (`v_active_sessions`), sus métricas de solvencia y la traza de auditoría de comandos y acciones, con capacidad declarada y alertas. |
| **Requisitos** | RF-14, RF-18; RNF-22, RNF-23 |

**Precondiciones**
1. Operador autenticado con rol `admin`, `operator`, `readonly` o `auditor`.
2. `v_active_sessions` y `audit_log` accesibles; métricas expuestas en `/metrics`.

**Postcondiciones**
1. Listado paginado de sesiones no terminales con `session_id`, MAC, IP, wallet, gateway, vendor,
   `flow_rate_wei_s`, `min_rate_required_wei`, `status`, `authorized_at`, `provisional_until`,
   `last_health_at`, `seconds_active`; las métricas de cabecera incluyen el p95 de
   `revocation_command_latency_ms`, el de `service_cutoff_latency_ms` (D43) y los contadores
   `alerts_total{type,severity}` (H2-29).
2. Consulta de `audit_log` filtrable por actor, acción, entidad y rango temporal, paginada.
3. **Ninguna** operación de lectura modifica sesiones ni envía comandos al gateway.
4. `audit_log` `action='operator.view_sessions'` / `'operator.view_audit'` con el `operator_id`.

**Flujo principal**
1. El operador abre el panel y filtra por gateway, estado o wallet.
2. El orquestador consulta `v_active_sessions` con paginación de **100 filas** y orden por
   `authorized_at` descendente.
3. Devuelve contadores agregados: sesiones por estado, hijos por padre, sesiones `degraded`,
   comandos fallidos en la última hora, p95 de `revocation_command_latency_ms` y de
   `service_cutoff_latency_ms` (D43).
4. El operador selecciona una sesión y ve su detalle: health-checks recientes, comandos con latencia y
   resultado, y `flow_subscriptions` asociada.
5. El operador consulta `audit_log` por `session_id` o `tx_hash` y ve la cadena completa de acciones.
6. El panel muestra el estado de los gateways (`online/offline`) y alertas activas según umbrales
   (RNF-22).

**Flujos alternativos**
- **FA-11.1 — Rol `readonly`.** Puede ver sesiones y auditoría, pero no ejecutar CU-12/CU-13/CU-14;
  los botones se deshabilitan y la API responde 403 si se intenta.
- **FA-11.2 — Rol `auditor`.** Acceso completo a `audit_log` y a la exportación, sin poder modificar
  configuración.
- **FA-11.3 — Exportación de auditoría.** CSV/JSON con rango máximo de **30 días** (RB-10), sin PII
  innecesaria y con `audit_log` de la propia exportación.
- **FA-11.4 — Capacidad declarada.** El panel muestra 100 sesiones concurrentes (50 hijos), 10
  gateways y 5 eventos/s como referencia de la prueba k6 (RNF-23).

**Flujos de excepción**
- **EX-11.1 — BD no disponible.** HTTP **503** y banner de "datos no disponibles"; no se muestran
  datos obsoletos sin marca de tiempo.
- **EX-11.2 — Filtro con rango > 30 días.** HTTP **422** `reason='range_too_large'`; se sugiere
  dividir la consulta.
- **EX-11.3 — Intento de acceso sin sesión de operador.** HTTP **401** y `audit_log`
  `action='security.admin_unauthenticated'`.
- **EX-11.4 — Consulta que supera el tiempo de respuesta de 5 s.** Se corta con HTTP **504** y se
  registra la consulta lenta con su plan.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Listado paginado de sesiones activas
  Dado 250 sesiones no terminales en v_active_sessions
  Cuando un operador "operator" consulta la primera página sin filtros
  Entonces la respuesta HTTP es 200 con 100 filas
  Y cada fila incluye session_id, mac_address, wallet_address, gateway_name, status y flow_rate_wei_s
  Y audit_log registra "operator.view_sessions"

Escenario: Detalle de una sesión degradada
  Dado un hotspot_session "degraded" con 2 comandos fallidos
  Cuando el operador abre su detalle
  Entonces ve los 2 access_commands con status "timeout" y su latency_ms
  Y ve el último session_health_checks con is_solvent y action
  Y la vista no modifica el estado de la sesión

Escenario: Consulta de auditoría por tx_hash
  Dado un tx_hash con 4 acciones registradas
  Cuando un operador "auditor" filtra audit_log por ese tx_hash
  Entonces la respuesta HTTP es 200 con exactamente 4 entradas ordenadas por created_at
  Y cada entrada incluye actor, action, entity_type y created_at

Escenario: Rango de auditoría superior a 30 días
  Dado un operador que solicita audit_log desde hace 45 días
  Cuando se ejecuta la consulta
  Entonces la respuesta HTTP es 422 con reason "range_too_large"
  Y no se devuelve ninguna fila

Escenario: Rol readonly no puede revocar
  Dado un operador con rol "readonly"
  Cuando intenta ejecutar la revocación de una sesión
  Entonces la respuesta HTTP es 403
  Y no se crea ningún access_command

Escenario: Capacidad y alertas de referencia visibles
  Dado el panel de supervisión
  Cuando un operador consulta la cabecera de capacidad
  Entonces muestra 100 sesiones concurrentes, 50 hijos, 10 gateways y 5 eventos/s
  Y muestra el p95 de revocation_command_latency_ms y el de service_cutoff_latency_ms de la última hora
  Y muestra los contadores alerts_total agrupados por type y severity
```

**Restricciones del sistema (EARS)**

- El sistema deberá exponer las sesiones no terminales desde `v_active_sessions` y no desde una copia
  del portal.
- Cuando el operador consulte, el sistema deberá paginar en bloques de 100 filas y limitar el rango
  de auditoría a 30 días.
- El sistema **no deberá** modificar sesiones ni emitir comandos como efecto de una consulta.
- Si el rol no autoriza la acción, entonces el sistema deberá responder 403 y auditar el intento.
- Mientras una sesión esté `degraded`, el sistema deberá mostrarla en el panel con su causa y los
  reintentos.
- De acuerdo con RNF-22, el sistema deberá exponer métricas nombradas con umbrales, reglas de alerta,
  retención de logs, SLO y MTTR en un runbook; las alertas se materializan como
  `audit_log.action='alert.<tipo>'` y `alerts_total{type,severity}` (H2-29).
- De acuerdo con RNF-23, el sistema deberá soportar **100 sesiones concurrentes** (incl. 50 hijos),
  **10 gateways** y **5 eventos/s** en la prueba k6.

**Trazabilidad:** RF/RNF/RT cubiertos: RF-14, RF-18; RNF-22, RNF-23.
Cobertura secundaria: RF-13 (health-check), RNF-07 (consistencia), RNF-08 (SLO 99,5 %), RNF-09
(logs/trazas), RNF-12 (PII en auditoría), RNF-24 (RBAC), RT-12 (`/metrics`).

---

## CU-12 — Revocar una sesión manualmente

| Campo | Valor |
| --- | --- |
| **ID** | CU-12 |
| **Nombre** | Revocar una sesión manualmente |
| **Actor(es)** | Operador (primario); Sistema y Gateway/NAS (secundarios) |
| **Objetivo** | Cortar el acceso de una sesión concreta (y de sus hijos) desde el panel, con motivo obligatorio, auditoría y confirmación de ACK, sin esperar al flujo on-chain. |
| **Requisitos** | RF-11, RF-19; RNF-19 |

**Precondiciones**
1. Operador con rol `admin` u `operator`.
2. Sesión en estado no terminal (`pending`, `provisional`, `active`, `degraded`).
3. Gateway accesible o con fallback disponible.

**Postcondiciones**
1. `hotspot_sessions.status = 'revoking'` → `revoked` solo con ACK; `disconnect_reason='admin'`,
   `disconnected_at` y `audit_log` con motivo, operador y sesión.
2. Hijos `voucher_child` revocados en cascada y sus bindings `revoked`.
3. `access_commands` con `disconnect` en `success` (o `timeout`/`failed` si no hay ACK).
4. Si no hay ACK, la sesión queda `degraded`, el comando en `timeout` y se aplica corte de emergencia
   + `alert.revocation_no_ack`.

**Flujo principal**
1. El operador busca la sesión (CU-11) y pulsa "Revocar".
2. El sistema exige un **motivo** de la lista cerrada (`fraud`, `abuse`, `maintenance`, `request`,
   `security`) y, opcionalmente, una nota libre (sin PII innecesaria). El motivo de operador se mapea
   al vocabulario único de `disconnect_reason` = **`admin`**, con el motivo original en
   `audit_log.details.operator_reason` (H2-32).
3. El operador confirma; el orquestador registra la intención en `audit_log`
   `action='session.revoke_requested'` y pasa la sesión a `revoking`.
4. Envía `disconnect` al gateway con `idempotency_key` derivada de `(session_id, 'admin', intento)`.
5. Con ACK, marca padre e hijos `revoked` con `disconnect_reason='admin'` y registra latencia.
6. El portal del usuario muestra "sesión revocada por el operador" con el motivo permitido.
7. Si el flujo on-chain sigue `Active`, la wallet conserva el stream; se notifica (RF-24) para que lo
   cierre y no siga pagando sin servicio.

**Flujos alternativos**
- **FA-12.1 — Revocación de una sesión `provisional`.** No se espera confirmación on-chain; se corta y
  se marca `revoked` con `disconnect_reason='admin'`.
- **FA-12.2 — Revocación masiva de un gateway en mantenimiento.** Se revocan todas las sesiones del
  gateway con el mismo motivo y una sola entrada de auditoría por lote más una por sesión.
- **FA-12.3 — Revocación idempotente.** Repetir la acción sobre una sesión ya `revoked` devuelve
  **200** sin nuevo comando (misma `idempotency_key`).

**Flujos de excepción**
- **EX-12.1 — Sin motivo.** HTTP **422** `reason='reason_required'`; no se revoca.
- **EX-12.2 — Sesión ya terminal (`closed`/`expired`).** HTTP **409** `reason='session_already_closed'`.
- **EX-12.3 — `disconnect` sin ACK en 3 intentos (1/2/4 s, timeout 2 s).** La sesión pasa a
   `degraded`; se intenta fallback CoA↔REST; si persiste, corte de emergencia (address-list) y
   `alert.revocation_no_ack`; `access_commands.status='timeout'` y
   `audit_log action='session.revoke_failed'`.
- **EX-12.4 — Operador sin permiso.** HTTP **403** y `audit_log` `action='security.rbac_denied'`.
- **EX-12.5 — Gateway `offline`.** Se intenta el otro transporte; si no hay, se aplica corte de
  emergencia local (address-list en el router de borde) y se emite `alert.revocation_no_ack`.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Revocación manual con ACK
  Dado un hotspot_session "active" con un hijo "voucher_child"
  Y un operador "operator" autenticado
  Cuando revoca la sesión con motivo "abuse"
  Entonces la sesión pasa a "revoked" con disconnect_reason "admin" y disconnected_at no nulo
  Y el hijo pasa a "revoked"
  Y access_commands contiene un "disconnect" en status "success"
  Y audit_log registra "session.revoke_requested" y "session.revoked" con el operator_id

Escenario: Revocación sin motivo
  Dado un operador autenticado
  Cuando solicita revocar una sesión sin indicar motivo
  Entonces la respuesta HTTP es 422 con reason "reason_required"
  Y la sesión permanece "active"

Escenario: Revocación idempotente
  Dado un hotspot_session ya "revoked" por el operador
  Cuando se repite la revocación
  Entonces la respuesta HTTP es 200
  Y no se crea un segundo access_command "disconnect"

Escenario: Gateway sin ACK
  Dado un gateway que no responde al disconnect en 3 intentos
  Cuando se agota la gracia de 30 s
  Entonces la sesión pasa a "degraded" y no a "revoked"
  Y se registra access_commands.status "timeout"
  Y audit_log registra "alert.revocation_no_ack" con details.severity "critical"
  Y se aplica corte de emergencia por address-list

Escenario: Revocación manual con latencia registrada
  Dado un gateway mock con latencia de 200 ms
  Cuando el operador revoca una sesión y el gateway responde ACK
  Entonces la sesión pasa a "revoked" con disconnect_reason "admin"
  Y access_commands registra latency_ms 200 y status "success"
  Y la muestra se agrega a revocation_command_latency_ms

Escenario: Rol readonly
  Dado un operador con rol "readonly"
  Cuando intenta revocar una sesión
  Entonces la respuesta HTTP es 403
  Y no se modifica hotspot_sessions
```

**Restricciones del sistema (EARS)**

- Cuando el operador solicite una revocación, el sistema deberá exigir un motivo de la lista cerrada y
  registrarlo en `audit_log`.
- El sistema deberá pasar la sesión a `revoking` antes de enviar el comando y a `revoked` **solo** con
  ACK.
- El sistema deberá revocar en cascada los hijos de la sesión revocada.
- Si no hay ACK tras 3 intentos, entonces el sistema deberá aplicar fallback, dejar la sesión en
  `degraded` y el comando en `timeout`, ejecutar corte de emergencia y emitir
  `alert.revocation_no_ack`.
- Mientras la sesión esté `revoked`, el sistema deberá impedir nuevas autorizaciones para esa MAC sin
  un binding nuevo.
- El sistema deberá ser idempotente por `(session_id, motivo)` y no duplicar comandos.
- De acuerdo con RF-24, el sistema deberá notificar al usuario y al operador de la revocación.

**Trazabilidad:** RF/RNF/RT cubiertos: RF-11, RF-19; RNF-19.
Cobertura secundaria: RF-10 (comando), RF-18 (auditoría), RF-24 (notificación), RF-27 (cascada),
RNF-06 (idempotencia), RNF-09 (métricas), RNF-22 (alertas), D24, RT-06/RT-07.

---

## CU-13 — Administrar vouchers

| Campo | Valor |
| --- | --- |
| **ID** | CU-13 |
| **Nombre** | Administrar vouchers |
| **Actor(es)** | Operador (primario); Sistema (secundario) |
| **Objetivo** | Emitir, consultar, revocar y reemitir vouchers desde CLI/API admin, con control de cupo, caducidad, trazabilidad y sin exponer códigos en claro más de una vez. |
| **Requisitos** | RF-25 (alcance ampliado: emisión, listado, revocación, reemisión y emisión masiva — H2-18/P11/H-29); RNF-26, D36 |

**Precondiciones**
1. Operador con rol `admin` u `operator`.
2. Sesión padre existente y `active` (o autorización explícita para pre-emisión, si se habilita).

**Postcondiciones**
1. `vouchers` con `code_hash`, `gateway_id`, `tariff_id`, `parent_hotspot_session_id`,
   `max_children`, `bandwidth_percent`, `valid_to`, `created_by`.
2. Código devuelto una sola vez en la respuesta de creación (nunca en listados).
3. `audit_log` con `action='voucher.create'|'voucher.revoke'|'voucher.reissue'` y `operator_id`.
4. Revocación: `status='revoked'` y los hijos activos revocados en cascada.

**Flujo principal — emisión**
1. El operador selecciona la sesión padre, el cupo (1..10, por defecto 2), el respeto de
   `max_children_per_parent` (default 5) y la caducidad (por defecto 90 días, máximo configurable).
2. El orquestador valida que el padre está `active` y que el flow sigue `Active`.
3. Genera el código (12 chars Crockford Base32), guarda SHA-256 y devuelve el código **una vez**.
4. La respuesta incluye `voucher_id`, caducidad, cupo, `bandwidth_percent=50` y estado `active`.

**Flujo principal — consulta**
1. El operador filtra por gateway, estado (`active`, `redeemed`, `expired`, `revoked`) o padre.
2. El listado devuelve metadatos y **nunca** `code_hash` ni código en claro; solo `voucher_id`.
3. El detalle muestra `children_used`, redenciones (`voucher_redemptions`) y sesiones hijas asociadas.

**Flujo principal — revocación**
1. El operador revoca un voucher con motivo.
2. `vouchers.status='revoked'`; los `voucher_child` activos se revocan (CU-12/CU-18) y sus bindings
   pasan a `revoked`.
3. Los canjes posteriores fallan con 404/409 genérico y se auditan.

**Flujo principal — reemisión**
1. Ante pérdida del código, el operador **revoca** el voucher y emite uno nuevo (nuevo `code_hash`);
   no se recupera el anterior. Si el voucher antiguo tenía hijos vivos, se revocan en cascada y se
   liberan sus slots.
2. Queda traza `voucher.reissue` con referencia al voucher origen y al nuevo.

**Flujos alternativos**
- **FA-13.1 — Emisión masiva.** Lote de N vouchers para N padres; una entrada de auditoría por lote y
  una por voucher; cada padre respeta `max_children_per_parent` y la emisión es atómica por lote
  (todo o nada).
- **FA-13.2 — Caducidad anticipada.** Se puede acortar `valid_to` (nunca ampliarlo más allá de 90
  días desde `valid_from`).
- **FA-13.3 — Voucher ya `redeemed`.** No se puede reactivar; se emite uno nuevo.

**Flujos de excepción**
- **EX-13.1 — Padre inexistente o no `active`.** HTTP **409** `reason='parent_stream_not_active'`.
- **EX-13.2 — `max_children` fuera de 1..10.** HTTP **422**.
- **EX-13.3 — Caducidad inválida (`valid_to ≤ valid_from` o > 90 días).** HTTP **422**.
- **EX-13.4 — Fuerza bruta de canje contra un voucher del operador.** 5 fallos/IP+MAC observada en
  15 min → 429, bloqueo y `alert.provisional_abuse` (RNF-26/D36); el voucher no se invalida por
  intentos ajenos.
- **EX-13.5 — Revocación de voucher ya revocado.** HTTP **200** idempotente sin nuevos comandos.
- **EX-13.6 — Caducidad de voucher por `valid_to`.** El job de caducidad (CU-19) pasa el voucher a
  `expired`, revoca las sesiones hijas vivas con `disconnect_reason='expired'` y libera los slots.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Emisión por CLI/API admin
  Dado un operador "admin" y una sesión padre "active"
  Cuando emite un voucher con max_children 2 y caducidad 90 días
  Entonces la respuesta HTTP es 201 y contiene un código de 12 caracteres
  Y vouchers.created_by es el operator_id
  Y la respuesta de listado posterior no contiene el código ni su hash

Escenario: Revocación de voucher con hijos activos
  Dado un voucher "active" con 1 hijo "voucher_child" activo
  Cuando el operador lo revoca con motivo "fraud"
  Entonces vouchers.status es "revoked"
  Y el hijo pasa a "revoked"
  Y audit_log registra "voucher.revoke" con el operator_id

Escenario: Reemisión sin recuperar el código anterior
  Dado un voucher "active" cuyo código se perdió
  Cuando el operador solicita reemitir
  Entonces se crea un voucher nuevo con code_hash distinto
  Y el voucher anterior queda "revoked"
  Y audit_log registra "voucher.reissue" con ambos voucher_id

Escenario: Cupo inválido
  Dado un operador "operator"
  Cuando crea un voucher con max_children 11
  Entonces la respuesta HTTP es 422 con reason "invalid_max_children"
  Y no se inserta ninguna fila en vouchers

Escenario: Límite global de hijos del padre desde administración
  Dado un padre con max_children_per_parent 5 y 5 hijos vivos
  Cuando el operador intenta emitir un voucher para ese padre
  Entonces la respuesta HTTP es 409 con reason "max_children_per_parent_exceeded"
  Y no se inserta ninguna fila en vouchers

Escenario: Caducidad superior a 90 días
  Dado un operador que fija valid_to = valid_from + 91 días
  Cuando guarda el voucher
  Entonces la respuesta HTTP es 422 con reason "valid_to_exceeds_max"
  Y no se guarda el voucher

Escenario: Intento de fuerza bruta sobre el canje
  Dado 5 canjes fallidos en 15 min desde la misma IP y MAC
  Cuando llega el sexto intento
  Entonces la respuesta HTTP es 429
  Y audit_log registra "security.voucher_bruteforce"
  Y el voucher sigue "active" para canjes legítimos
```

**Restricciones del sistema (EARS)**

- El sistema deberá devolver el código en claro solo en la respuesta de creación y **nunca** en
  listados, logs o auditoría.
- El sistema deberá validar `1 ≤ max_children ≤ 10` y `1 ≤ bandwidth_percent ≤ 100`.
- El sistema deberá limitar la caducidad por defecto a **90 días** desde `valid_from`.
- Cuando se revoque un voucher, el sistema deberá revocar sus hijos activos en cascada.
- Si el padre no está `active`, entonces el sistema deberá denegar la emisión.
- El sistema deberá registrar emisión, revocación y reemisión en `audit_log` con `operator_id`, sin
  código.
- El sistema deberá aplicar `max_children_per_parent` (default 5) al emitir y liberar los slots de
  los hijos cerrados (D55).
- De acuerdo con D36/RNF-26, el sistema deberá aplicar **5 intentos fallidos por IP + MAC cada 15
  min**, bloqueo temporal y alerta.

**Trazabilidad:** RF/RNF/RT cubiertos: RF-25 (incl. administración); RNF-26, D36.
Cobertura secundaria: RF-15 (API admin), RF-18 (auditoría), RF-27 (cascada), RNF-06 (idempotencia),
RNF-19 (revocación), RNF-24 (RBAC), D18/D31, D55 (cupo por sesión viva).

> **Origen del alcance administrativo (H2-18):** P11 y H-29 registran la administración de vouchers
> (listado, revocación, reemisión y emisión masiva) como capacidad exigida; se incorpora al alcance de
> RF-25 sin crear un RF nuevo, y debe reflejarse en `requerimientos.md` al sincronizar la fuente.

---

## CU-14 — Administrar operadores y roles

| Campo | Valor |
| --- | --- |
| **ID** | CU-14 |
| **Nombre** | Administrar operadores y roles |
| **Actor(es)** | Operador (primario, rol `admin`); Sistema (secundario) |
| **Objetivo** | Gestionar cuentas de operador y su RBAC (`admin`, `operator`, `readonly`, `auditor`, `dpo`), con API keys, MFA opcional, bloqueo por intentos fallidos y auditoría de login y acciones. |
| **Requisitos** | RF-15; RNF-24 |

**Precondiciones**
1. Operador autenticado con rol `admin`.
2. Secretos TOTP por referencia (`totp_secret_ref`) en Secret Manager.

**Postcondiciones**
1. Fila en `operators` con `username` (UK), `email`, `password_hash` (Argon2/bcrypt), `role`,
   `is_active`, `totp_secret_ref` (opcional) y las columnas de API key `api_key_hash`,
   `api_key_prefix`, `api_key_scopes`, `api_key_expires_at`, `api_key_last_used_at`,
   `api_key_revoked_at` (D49).
2. API key emitida por operador: se persiste **solo** `api_key_hash` + `api_key_prefix` (el valor se
   muestra una vez), con `api_key_scopes` y caducidad `api_key_expires_at`.
3. `audit_log` con `action='operator.create'|'operator.update_role'|'operator.disable'|'auth.login'`.

**Flujo principal — alta**
1. El `admin` crea un operador con `username`, `email`, rol y contraseña temporal.
2. El sistema valida política de contraseña, unicidad de `username` y rol permitido de los cinco
   valores (`admin`, `operator`, `readonly`, `auditor`, `dpo`).
3. Almacena `password_hash` con Argon2/bcrypt (nunca en claro) y emite API key mostrada **una sola
   vez**, guardando `api_key_hash`, `api_key_prefix`, `api_key_scopes` y `api_key_expires_at`; cada
   uso actualiza `api_key_last_used_at` y la revocación fija `api_key_revoked_at`.
4. El operador queda `is_active` y debe cambiar la contraseña en el primer login.

**Flujo principal — login**
1. El operador introduce usuario y contraseña (y TOTP si está habilitado).
2. El sistema valida, actualiza `last_login_at` y audita `auth.login` con IP.
3. Tras **5 intentos fallidos** en 15 min, bloquea la cuenta temporalmente y alerta.
4. Emite sesión de operador con TTL y CSRF; el rol determina los CUs permitidos.

**Flujo principal — cambio de rol / baja**
1. El `admin` cambia el rol o desactiva (`is_active=false`).
2. Las sesiones activas del operador se revocan y sus API keys se invalidan.
3. `audit_log` guarda rol anterior y nuevo (sin secretos).

**Flujos alternativos**
- **FA-14.1 — MFA opcional.** Si `totp_secret_ref` está configurado, el login exige TOTP de 6 dígitos
  con ventana de 30 s y tolerancia ±1.
- **FA-14.2 — Rotación de API key.** Se emite una nueva y se invalida la anterior fijando
  `api_key_revoked_at`; se conservan el prefijo y las fechas, nunca el valor antiguo.
- **FA-14.3 — Separación mínima de funciones (D38).** El Director puede asumir `admin`, `dpo` y
  custodia de claves; se registra como riesgo aceptado y se documenta la separación mínima.

**Flujos de excepción**
- **EX-14.1 — `username` duplicado.** HTTP **409** (UK).
- **EX-14.2 — Rol inválido.** HTTP **422** con la lista de roles permitidos.
- **EX-14.3 — Contraseña débil.** HTTP **422** con los requisitos incumplidos.
- **EX-14.4 — 5 intentos fallidos de login en 15 min.** HTTP **429** y cuenta bloqueada
  temporalmente; `audit_log` `action='security.login_blocked'`.
- **EX-14.5 — Intento de autoasignarse `admin`.** HTTP **403** y auditoría; solo un `admin` puede
  otorgar `admin`.
- **EX-14.6 — Operador desactivado intenta operar.** HTTP **401** con sesión revocada.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Alta de operador con rol operator
  Dado un operador "admin" autenticado
  Cuando crea un operador "soporte" con rol "operator"
  Entonces la respuesta HTTP es 201 y operators.role es "operator"
  Y password_hash no contiene la contraseña en claro
  Y la API key se muestra una sola vez y operators.api_key_hash no es nulo
  Y api_key_prefix, api_key_scopes y api_key_expires_at quedan persistidos
  Y audit_log registra "operator.create"

Escenario: Login correcto con MFA
  Dado un operador con totp_secret_ref configurado
  Cuando introduce contraseña válida y un TOTP válido
  Entonces la respuesta HTTP es 200
  Y last_login_at se actualiza
  Y audit_log registra "auth.login"

Escenario: Bloqueo por intentos fallidos
  Dado 5 intentos de login fallidos en 15 min para "soporte"
  Cuando se intenta el sexto
  Entonces la respuesta HTTP es 429
  Y la cuenta queda bloqueada temporalmente
  Y audit_log registra "security.login_blocked"

Escenario: Rol inválido
  Dado un operador "admin"
  Cuando crea un operador con rol "superuser"
  Entonces la respuesta HTTP es 422
  Y no se inserta ninguna fila en operators

Escenario: Baja de operador
  Dado un operador "operator" con sesión activa y API key
  Cuando el "admin" lo desactiva
  Entonces is_active pasa a false
  Y su sesión activa se revoca
  Y api_key_revoked_at queda con fecha y la API key deja de autenticar
  Y audit_log registra "operator.disable"

Escenario: Un operator no puede crear admin
  Dado un operador con rol "operator"
  Cuando intenta crear un usuario con rol "admin"
  Entonces la respuesta HTTP es 403
  Y audit_log registra "security.rbac_denied"
```

**Restricciones del sistema (EARS)**

- El sistema deberá almacenar solo `password_hash` con Argon2/bcrypt y `totp_secret_ref` como
  referencia.
- El sistema deberá emitir API keys por operador y mostrarlas una sola vez, persistiendo
  `api_key_hash`, `api_key_prefix`, `api_key_scopes`, `api_key_expires_at`,
  `api_key_last_used_at` y `api_key_revoked_at` en `operators` (D49).
- El sistema deberá aceptar exactamente cinco roles: `admin`, `operator`, `readonly`, `auditor` y
  `dpo` (D49/RNF-24).
- Cuando se acumulen **5 intentos fallidos en 15 min**, el sistema deberá bloquear la cuenta
  temporalmente y auditar.
- Mientras un operador esté `is_active = false`, el sistema deberá rechazar su autenticación y
  revocar sus sesiones y API keys.
- Si el rol no está en {`admin`,`operator`,`readonly`,`auditor`,`dpo`}, entonces el sistema deberá
  rechazar el alta con 422.
- De acuerdo con RNF-24, el sistema deberá auditar login y acciones, y aplicar RBAC en cada endpoint.
- El sistema deberá permitir MFA opcional por TOTP sin bloquear a los operadores que no lo activen.

**Trazabilidad:** RF/RNF/RT cubiertos: RF-15; RNF-24.
Cobertura secundaria: RF-18 (auditoría), RNF-02/RNF-18 (secretos), RNF-10 (seguridad API), RNF-12
(minimización de datos de operador), RNF-25 (sesión web), D33/D38.

---

## CU-15 — Atender el derecho de supresión RGPD

| Campo | Valor |
| --- | --- |
| **ID** | CU-15 |
| **Nombre** | Atender el derecho de supresión RGPD |
| **Actor(es)** | Titular de los datos (primario); Operador/DPO (primario); Sistema (secundario) |
| **Objetivo** | Localizar y suprimir o seudonimizar los datos personales (MAC/IP, wallet y derivados) de un titular a petición suya, respetando la retención de 30 días (PII) y 12 meses (`audit_log` de seguridad), el orden transaccional que resuelve las FK `RESTRICT` y dejando evidencia de la supresión. |
| **Requisitos** | RNF-12, RNF-25; D10, D27, D52 |

**Precondiciones**
1. El titular **solicita por el canal publicado** (formulario del portal y mostrador del operador) y
   acredita identidad o titularidad (firma con la wallet vinculada, o verificación presencial para
   huéspedes sin wallet).
2. Existe una petición registrada con `request_id`, fecha, **canal** (`portal`/`mostrador`/`email`) y
   alcance; el titular recibe acuse con plazo de 30 días.
3. El DPO/operador con rol `dpo` (o `admin`) está autenticado y el aviso de privacidad ya informó del
   derecho y del canal.

**Postcondiciones**
1. La PII de las tablas operativas se **borra físicamente**: `devices` (`mac_address`, `last_ip`),
   `portal_sessions` (`mac_address`, `ip_address`, `user_agent`), `auth_challenges` (mensaje/firma
   ligados), `device_bindings`, `hotspot_sessions`, `session_health_checks`, `voucher_redemptions` y
   **payloads de `access_commands` (`request_payload`/`response_payload`)** (D52/H2-14).
2. `flow_events` y `flow_subscriptions` se **seudonimizan** (`sender_wallet`/`receiver_wallet` →
   hash no reversible y `pseudonymized_at` no nulo), porque el dato on-chain es inmutable y la fila se
   conserva para trazabilidad. `audit_log` se conserva 12 meses con MAC/IP seudonimizadas (D52).
3. `radacct` (si aplica) se trata según la misma regla que las tablas operativas.
4. `audit_log` con `action='gdpr.erasure'`, `entity_type='data_subject'`, referencia seudónima y
   resultado; **sin** reproducir los datos suprimidos. La traza de seguridad (`audit_log`) se
   conserva **12 meses** con MAC/IP seudonimizadas.
5. Respuesta al titular en un plazo máximo de **30 días** (coherente con la retención de PII), con
   justificación si alguna categoría se conserva por obligación legal y con la **limitación del
   derecho por la inmutabilidad on-chain** (la wallet permanece en los contratos y en la cadena).

**Flujo principal**
1. El titular solicita por el canal publicado; el DPO registra la solicitud con `request_id`,
   canal y alcance e identificadores de búsqueda (MAC, IP, wallet o `session_id`), y emite acuse.
2. El orquestador ejecuta una búsqueda de alcance sobre las 20 tablas y devuelve el inventario de
   coincidencias con recuento por tabla (sin volcar PII innecesaria en pantalla).
3. El DPO revisa el inventario y confirma el alcance (todo o parte).
4. El sistema ejecuta el borrado/seudonimización en **una transacción** con el orden que respeta las
   FK `RESTRICT` del DDL: primero **`hotspot_sessions`** (hijos y después el padre; arrastra
   `session_health_checks` y deja `access_commands` con `SET NULL`, cuyos payloads se limpian),
   después **`voucher_redemptions`** (se marca `released_at` para liberar el cupo y se borran; el
   borrado del padre arrastra `vouchers` por `ON DELETE CASCADE`, por lo que la liberación se registra
   en el mismo paso, antes de la cascada), **`device_bindings`**, **`portal_sessions`**, **`devices`**
   y `auth_challenges`; por último se **seudonimizan** `flow_events`/`flow_subscriptions` con
   `pseudonymized_at` y se anonimiza `audit_log`, en lotes de 1 000 filas (RB-35). Nunca se borra
   `device_bindings` antes de la `hotspot_session` que lo referencia (`device_binding_id` es NOT NULL
   con `ON DELETE RESTRICT`).
5. La transacción confirma; se recalculan contadores y se verifica que no quedan coincidencias, ni
   siquiera en `flow_events.payload`.
6. Se emite evidencia: `audit_log` con resultado, número de filas por tabla y `request_id`; se
   responde al titular con la limitación on-chain informada.
7. El job diario de purga (03:00 UTC) elimina además los datos que superen la retención: PII 30 días,
   `audit_log` de seguridad 12 meses con MAC/IP seudonimizadas, logs con PII cifrados (D52).

**Flujos alternativos**
- **FA-15.1 — Supresión parcial.** Se suprimen solo las categorías indicadas; el resto queda con
  base legal documentada.
- **FA-15.2 — Titular sin wallet (huésped).** Solicitud por el mostrador o el formulario del portal;
  verificación por el operador con registro de la comprobación y mismo `request_id`; mismos pasos.
- **FA-15.3 — Datos en backups.** Se documenta que el backup diario con retención de 30 días se
  purga por rotación; la restauración de un backup reaplica la supresión antes de volver a producción.
- **FA-15.4 — Ejercicio de otros derechos (acceso/rectificación).** Se atienden por el mismo canal con
  su propia entrada de auditoría.

**Flujos de excepción**
- **EX-15.1 — Identidad no acreditada.** HTTP **403**; no se revela si existen datos; se audita el
  intento.
- **EX-15.2 — Conflicto con retención legal/contable.** Se documenta la base legal, se conserva lo
  mínimo indispensable y se informa al titular; el resto se suprime.
- **EX-15.3 — Fallo transaccional a mitad.** Rollback completo; no se deja supresión parcial; HTTP
  **500** sin detalles internos y alerta al DPO.
- **EX-15.4 — FK `RESTRICT` no resuelta por orden de borrado.** La transacción falla con detalle
  técnico en logs internos (sin PII) y se reintenta tras ajustar el orden; nunca se usa
  `TRUNCATE ... CASCADE` sobre datos de terceros.
- **EX-15.5 — Solicitud duplicada.** Se detecta por `request_id` y se devuelve el resultado previo sin
  repetir el borrado.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Supresión completa de un titular
  Dado un titular identificado por la MAC "00:11:22:33:44:55" con datos en 8 tablas, incluida una wallet en flow_events
  Cuando el DPO confirma la supresión total
  Entonces la transacción confirma y 0 filas conservan esa MAC en claro
  Y flow_events y flow_subscriptions tienen sender_wallet/receiver_wallet seudonimizadas con pseudonymized_at no nulo
  Y access_commands no conserva MAC/IP en request_payload ni response_payload
  Y audit_log registra "gdpr.erasure" con el número de filas por tabla
  Y la respuesta al titular se emite en un plazo máximo de 30 días

Escenario: Solicitud del titular por el canal publicado
  Dado un titular sin wallet que solicita la supresión por el formulario del portal
  Cuando el DPO registra la solicitud con canal "portal"
  Entonces se genera un request_id y se emite acuse al titular
  Y audit_log registra "gdpr.request_received" con el canal y sin PII

Escenario: Aviso de privacidad antes de capturar MAC/IP
  Dado un dispositivo que abre el portal cautivo
  Cuando el portal registra la aceptación del aviso versión "v1" y después llama a POST /v1/portal/sessions con notice_version "v1" y notice_accepted_at
  Entonces portal_sessions persiste la MAC/IP solo después de ese registro
  Y sin notice_version vigente o sin notice_accepted_at la petición responde 409 con reason "privacy_notice_missing"

Escenario: Conservación de la traza de seguridad
  Dado un audit_log de seguridad con MAC/IP de hace 11 meses
  Cuando se ejecuta la purga diaria
  Entonces la entrada se conserva con la MAC/IP seudonimizada
  Y a los 12 meses la entrada se elimina

Escenario: Orden transaccional con FK RESTRICT
  Dado un titular con hotspot_sessions y access_commands asociados
  Cuando se ejecuta la supresión
  Entonces no se produce error de violación de clave foránea
  Y se eliminan primero las hotspot_sessions hijas y después la padre
  Y después se borran voucher_redemptions, device_bindings, portal_sessions y devices

Escenario: Identidad no acreditada
  Dado un solicitante que no puede acreditar la titularidad
  Cuando el operador intenta ejecutar la supresión
  Entonces la respuesta HTTP es 403
  Y no se modifica ninguna fila
  Y audit_log registra el intento sin revelar datos

Escenario: Purga automática a los 30 días borra físicamente la PII operativa
  Dado un dispositivo con last_seen_at hace 31 días
  Cuando se ejecuta el job diario de purga a las 03:00 UTC
  Entonces 0 filas conservan la MAC del dispositivo en devices, portal_sessions, device_bindings y hotspot_sessions
  Y el job procesa como máximo 1000 filas por transacción

Escenario: Purga automática a los 30 días seudonimiza los flows
  Dado un flow_events con sender_wallet de hace 31 días
  Cuando se ejecuta el job diario de purga a las 03:00 UTC
  Entonces flow_events.sender_wallet y receiver_wallet quedan sustituidas por un hash no reversible
  Y flow_events.pseudonymized_at y flow_subscriptions.pseudonymized_at quedan no nulos

Escenario: Fallo a mitad de la supresión
  Dado un error inducido en la tabla hotspot_sessions
  Cuando se ejecuta la supresión
  Entonces la transacción hace rollback completo
  Y ninguna tabla queda parcialmente suprimida
  Y audit_log registra "alert.gdpr_erasure_failed" con details.severity "critical"

Escenario: La evidencia no reproduce los datos suprimidos
  Dado un registro de supresión completado
  Cuando el auditor consulta audit_log de "gdpr.erasure"
  Entonces la entrada contiene request_id, tablas afectadas y recuentos
  Y no contiene la MAC ni la IP suprimidas
```

**Restricciones del sistema (EARS)**

- El sistema deberá suprimir o anonimizar los datos personales en **una transacción** con orden que
  respete las FK `RESTRICT`.
- Cuando se ejecute la supresión, el sistema deberá procesar como máximo **1 000 filas por
  transacción** y verificar 0 coincidencias al final.
- El sistema deberá aplicar la **matriz de retención** (D52): PII **30 días**; `audit_log` de
  seguridad **12 meses** con MAC/IP seudonimizadas; logs con PII **cifrados**; y ejecutar el job de
  purga diario a las 03:00 UTC.
- El sistema deberá incluir `flow_events`, `flow_subscriptions` (seudonimización de wallets con
  `pseudonymized_at`) y los payloads de `access_commands` en el alcance de la supresión.
- El sistema deberá informar en el aviso de privacidad de la **inmutabilidad on-chain de la wallet** y
  de la limitación del derecho de supresión que implica.
- El sistema deberá mostrar el aviso de privacidad **antes** de capturar MAC/IP y registrar la
  evidencia (versión y timestamp).
- Si la identidad no está acreditada, entonces el sistema deberá denegar la operación sin revelar la
  existencia de datos.
- El sistema **no deberá** incluir PII suprimida en `audit_log`, logs, métricas ni trazas.
- De acuerdo con D10/D27 y RNF-12, el sistema deberá documentar la base legal, la minimización, el
  inventario de PII y la decisión sobre EIPD.
- Si una restauración de backup reintroduce datos suprimidos, entonces el sistema deberá reaplicar la
  supresión antes de volver a producción.

**Trazabilidad:** RF/RNF/RT cubiertos: RNF-12, RNF-25; D10, D27, D52.
Cobertura secundaria: RF-01/RF-03 (datos personales capturados), RF-18 (auditoría), RNF-17 (backups),
RNF-02 (secretos), RT-04 (PostgreSQL/Cloud SQL), H2-14 (alcance ampliado del borrado),
H2-37 (actor titular y canal).

---

## CU-16 — Indexar eventos y validar flujos

| Campo | Valor |
| --- | --- |
| **ID** | CU-16 |
| **Nombre** | Indexar eventos y validar flujos |
| **Actor(es)** | Sistema (primario); Chain (secundario) |
| **Objetivo** | Indexar de forma idempotente y sin huecos los eventos de flujo (`FlowCreated/Paused/Resumed/Closed/Settled/Claimed` normalizados a `flow_event_type`), emparejar la wallet emisora con el binding y validar el flujo antes de autorizar. |
| **Requisitos** | RF-07, RF-08, RF-09; RNF-05 |

**Precondiciones**
1. `indexer_checkpoints` con cursor para `(chain_id, contract_address)`; lease libre o expirado.
2. RPC resuelto **por `chain_id`** desde la configuración data-driven (`RPC_URLS_BY_CHAIN`, H2-23),
   con timeout 8 s y `INDEXER_CONFIRMATIONS=2`, `INDEXER_REORG_WINDOW=12`.
3. La lista de contratos a indexar se deriva de los `gateways` activos
   (`chain_id` + `super_token_address`), no de variables únicas de entorno.
4. Existen `device_bindings` y `gateway_tariffs` vigentes para validar.

**Postcondiciones**
1. `flow_events` con una fila por `(chain_id, tx_hash, log_index)` y `processing_status`
   `processed`/`ignored`/`failed`; los eventos huérfanos por reorg quedan `ignored` con
   `processing_error='reorg'` (no se borran).
2. `flow_subscriptions` actualizado por flow con `flow_rate_wei_s`, `status`, `accumulated_wei` y
   `last_event_id` recalculado tras una reorg.
3. `indexer_checkpoints.last_processed_block` avanzado de forma monotónica con CAS de `version` y
   lease vigente.
4. Cada flow validado produce una decisión (`valid`, `wrong_sender`, `wrong_receiver`,
   `rate_below_tariff`, `wrong_token`, `inactive_flow`) registrada y auditable.
5. Si un evento confirmado que sostenía una sesión `active` desaparece por reorg, se ejecuta la
   compensación de H2-21 (revalidación on-chain y, si procede, `revoking` + `disconnect`).

**Flujo principal**
1. El Job (Cloud Run Job + Cloud Scheduler, `* * * * *` — cada 1 min, D42) toma el lease en
   `indexer_checkpoints` con `leased_by` y `lease_expires_at`; enumera los contratos de los gateways
   activos y resuelve el RPC por `chain_id` (H2-23).
2. Calcula el rango `[last_processed_block + 1, min(latest - 2, last + 5000)]` y ejecuta
   `eth_getLogs`.
3. Normaliza los eventos del contrato al enum `flow_event_type`
   (`FlowCreated → flow_created`, `FlowPaused → flow_paused`, `FlowResumed → flow_resumed`,
   `FlowClosed → flow_deleted`, `Settled → settled`, `Claimed → claimed`).
4. Inserta en `flow_events` con `ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING` (idempotencia
   RB-30).
5. Para cada evento nuevo, empareja `sender` con `device_bindings` `active` por wallet y MAC/IP
   (RF-08); rechaza flujos de wallets no ligadas.
6. Valida el flujo (RF-09): `flowRate >= min_rate_required_wei`, `receiver == payout_wallet`,
   Super Token esperado y `status == Active` (RB-14).
7. Actualiza `flow_subscriptions` y el `processing_status` del evento; avanza el checkpoint con CAS
   (`WHERE version = :version`).
8. Si el evento implica pausa/cierre/insolvencia, delega en CU-18; si implica creación/resume válido,
   habilita CU-17.

**Flujos alternativos**
- **FA-16.1 — Reorg dentro de 12 bloques (con compensación, H2-21).** Se detecta cambio de
  `block_hash`; los eventos afectados se marcan `ignored` con `processing_error='reorg'` y se
  reprocesan; `flow_subscriptions.last_event_id` se recalcula. Si el evento desaparecido sostenía una
  sesión `active`, se **revalida on-chain** (`getFlow`/`getAccountInfo`): si el flow ya no es
  solvente, la sesión pasa a `revoking`, se envía `disconnect` idempotente y se audita
  `action='flow.reorg_compensated'`. Si desaparece un `Settled`, se revierte `accumulated_wei`/
  `earnedUnclaimed` del read model, se registra la compensación y se audita; el estado autoritativo
  sigue siendo la cadena.
- **FA-16.2 — Evento duplicado.** `ON CONFLICT DO NOTHING`; no se duplica ni se reemite comando.
- **FA-16.3 — Evento de una wallet no ligada.** `processing_status='ignored'`, se audita
  `action='flow.unbound_wallet'`; no se autoriza nada.
- **FA-16.4 — Rango vacío.** Se actualiza `updated_at` y se libera el lease sin avanzar bloque.

**Flujos de excepción**
- **EX-16.1 — RPC timeout (8 s) o error 5xx.** 3 reintentos con backoff + jitter; si persiste, se
  libera el lease, se marca el ciclo como fallido, se emite `alert.rpc_degraded` y se reintenta en el
  siguiente ciclo (≤ 1 min).
- **EX-16.2 — Lease tomado por otra instancia.** El job no procesa y sale sin error (anti-solapamiento).
- **EX-16.3 — Rango > 5 000 bloques.** Se parte en varios ciclos; nunca se pide un rango mayor.
- **EX-16.4 — Checkpoint no monotónico (bloque menor al último).** Se descarta la lectura y se emite
  `alert.checkpoint_stalled` (RNF-20).
- **EX-16.5 — Evento con `flowRate` negativo o payload inválido.** `processing_status='failed'` con
  `processing_error`, `alert.checkpoint_stalled`/`alert.event_invalid` y sin efecto sobre sesiones.
- **EX-16.6 — Fallo de validación de flow.** Se registra el motivo, no se autoriza y se escala a
  CU-18 si ya había sesión.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Indexación sin huecos con confirmaciones
  Dado un checkpoint en el bloque 1000 y un head en el bloque 1010
  Cuando el indexador ejecuta un ciclo
  Entonces procesa hasta el bloque 1008 (head - 2)
  Y flow_events contiene una fila por cada log del rango
  Y last_processed_block avanza a 1008 y version se incrementa en 1

Escenario: Idempotencia ante doble ejecución
  Dado un evento (chain_id 81234, tx_hash "0xabc...", log_index 3) ya indexado
  Cuando el indexador vuelve a procesar el mismo bloque
  Entonces no se inserta una segunda fila
  Y no se emite un segundo access_command

Escenario: Evento de una wallet no ligada
  Dado un FlowCreated cuyo sender "0xDeF...0002" no tiene binding activo
  Cuando el indexador procesa el evento
  Entonces flow_events.processing_status es "ignored"
  Y no se autoriza ninguna sesión
  Y audit_log registra "flow.unbound_wallet"

Escenario: Validación de tasa por debajo de la tarifa
  Dado un flow con flowRate 999999999999 y min_rate_required_wei 1000000000000
  Y una hotspot_session "active" asociada a ese flow
  Cuando el validador evalúa el evento
  Entonces la decisión es "rate_below_tariff"
  Y no se habilita autorización
  Y la sesión pasa a "revoking" y, con ACK, a "revoked" con disconnect_reason "low_rate"

Escenario: Reorg de 3 bloques sobre una sesión activa y un Settled
  Dado un FlowCreated indexado en el bloque 1005 con block_hash "0xaaa" que sostiene una sesión "active"
  Y un evento "Settled" indexado en ese mismo bloque
  Cuando el bloque 1005 cambia a block_hash "0xbbb" dentro de la ventana de 12
  Entonces el FlowCreated anterior queda "ignored" con processing_error "reorg" y se reprocesa
  Y flow_subscriptions.last_event_id se recalcula con el estado final del nuevo bloque
  Y la sesión "active" pasa a "revoking" y luego a "revoked" con disconnect_reason "flow_deleted"
  Y el accumulated_wei del Settled revertido se compensa y audit_log registra "flow.reorg_compensated"

Escenario: Rango mayor de 5000 bloques
  Dado un checkpoint 3000 bloques por detrás del head confirmado
  Cuando el indexador calcula el rango
  Entonces solicita como máximo 5000 bloques en la llamada eth_getLogs
  Y completa el atraso en varios ciclos

Escenario: RPC caído
  Dado un RPC que no responde en 8 s durante 3 intentos
  Cuando finaliza el ciclo
  Entonces el checkpoint no avanza
  Y el lease se libera
  Y audit_log registra "alert.rpc_degraded" con details.severity "warning"
  Y alerts_total{type="rpc_degraded"} se incrementa
```

**Restricciones del sistema (EARS)**

- El sistema deberá indexar por **polling con checkpoint** y no depender de `eth_subscribe` (D8).
- El sistema deberá considerar confirmado un evento a **2 bloques** y tolerar reorg de **12 bloques**.
- El sistema deberá garantizar idempotencia por UK `(chain_id, tx_hash, log_index)`.
- El sistema deberá solicitar `eth_getLogs` con un máximo de **5 000 bloques** por llamada.
- Cuando el lease de `indexer_checkpoints` esté tomado, el sistema no deberá procesar el mismo rango
  en paralelo.
- El sistema deberá emparejar `sender` con un binding `active` y rechazar wallets no ligadas (RF-08).
- El sistema deberá validar `flowRate >= min_rate_required_wei`, `receiver == payout_wallet` y
  Super Token esperado antes de habilitar cualquier autorización (RF-09).
- Si el evento no es válido o el RPC falla, entonces el sistema deberá registrar el motivo y no
  autorizar.
- Cuando un evento confirmado que sostenía una sesión desaparezca por reorg, el sistema deberá
  revalidar on-chain y, si procede, revocar con `disconnect` idempotente; si es un `Settled`, deberá
  compensar el read model (H2-21).
- El sistema deberá enumerar contratos y resolver RPC por `chain_id` de forma data-driven, sin
  variables únicas de entorno (H2-23).
- De acuerdo con RNF-16, el sistema deberá mantener el disclaimer legal y la licencia MIT visibles en
  el portal y el README del índice.

**Trazabilidad:** RF/RNF/RT cubiertos: RF-07, RF-08, RF-09; RNF-05.
Cobertura secundaria: RF-10/RF-12 (habilitación de autorización), RF-13 (solvencia), RNF-06
(idempotencia), RNF-09 (logs con `tx_hash`), RNF-16 (disclaimer, verificado en CU-04/CU-06),
RNF-20 (RPC), D8, H2-21 (reorg), H2-23 (data-driven), RT-03/RT-12.

---

## CU-17 — Ordenar autorización y revocación al gateway

| Campo | Valor |
| --- | --- |
| **ID** | CU-17 |
| **Nombre** | Ordenar autorización y revocación al gateway |
| **Actor(es)** | Sistema (primario); Gateway/NAS (secundario) |
| **Objetivo** | Traducir una decisión de validación en comandos idempotentes al gateway (`authorize`, `confirm`, `disconnect`, `coa`, `pod`), con reintentos, fallback de transporte y ACK verificado antes de declarar `revoked`. |
| **Requisitos** | RF-10, RF-11, RF-12, RF-20; RNF-19 |

**Precondiciones**
1. Decisión de validación `valid` (CU-16) o de revocación (CU-12/CU-18/CU-05/CU-06).
2. Gateway `online` con `vendor` y transporte declarados.
3. `hotspot_sessions` con MAC, IP, `sender_wallet`, `receiver_wallet` y `flow_rate_wei_s`.

**Postcondiciones**
1. `access_commands` con una fila por intento lógico: `command_type`, `transport`, `idempotency_key`
   (UK), `status`, `attempts`, `latency_ms`, `radius_code`.
2. `hotspot_sessions.router_session_id` o `radacct_session_id` cuando el gateway lo devuelve.
3. `revoked` solo con ACK; sin ACK, `degraded` y corte de emergencia.
4. Métrica `revocation_command_latency_ms` registrada desde la detección.

**Flujo principal — autorización**
1. El orquestador compone el comando `authorize` con `Calling-Station-Id = MAC`,
   `Framed-IP-Address`, `NAS-IP-Address`, `Session-Timeout` (provisional 60 s) y
   `WISPr-Bandwidth-Max-Down/Up` (50/10 Mbps; 25/5 en hijos).
2. Genera `idempotency_key = SHA-256(session_id|command_type|transport|intent)`; si ya existe una fila
   en `success`, devuelve el resultado sin reenviar.
3. Envía por el adaptador: MikroTik `POST /rest/ip/hotspot/active/login` o RADIUS `Access-Accept`/CoA.
4. Espera ACK con timeout 2 s; en éxito guarda `router_session_id`/`radius_code`, `latency_ms` y
   `status='success'`.
5. Devuelve el resultado al llamador (CU-03/CU-08).

**Flujo principal — revocación**
1. El orquestador recibe la orden de desconexión con `disconnect_reason`.
2. Crea `access_command(disconnect|coa|pod)` con clave idempotente y la envía.
3. Si no hay ACK en 2 s: reintenta hasta 3 veces con backoff 1/2/4 s + jitter.
4. Si el transporte falla, hace fallback CoA/PoD ↔ REST (mismo `session_id`, clave distinta por
   transporte).
5. Con ACK, marca `revoked`; sin ACK tras la gracia de 30 s, marca `degraded`, ejecuta corte de
   emergencia por address-list y alerta.

**Flujos alternativos**
- **FA-17.1 — Comando duplicado.** Misma `idempotency_key` → se devuelve la fila existente, sin
  segundo efecto en el gateway.
- **FA-17.2 — Gateway `mock`.** Responde con latencias simuladas y códigos deterministas; usado en
  CI/E2E (D16).
- **FA-17.3 — RADIUS con accounting.** Tras `authorize`, se registra `Acct-Session-Id` y se enlaza con
  `radacct` (RF-21).
- **FA-17.4 — Reauthorize por cambio de tarifa.** Se emite `reauthorize`/CoA sin cortar la sesión.

**Flujos de excepción**
- **EX-17.1 — Timeout en los 3 intentos.** `access_commands.status='timeout'`; fallback; si persiste,
  la sesión queda `degraded` y se emite `alert.revocation_no_ack`.
- **EX-17.2 — Gateway responde error de credenciales (401 RADIUS / 401 REST).** No se reintenta con
  las mismas credenciales; se marca `failed`, se emite `alert.gateway_auth_failed` y se revisa
  `*_secret_ref` (sin loguear el secreto).
- **EX-17.3 — Respuesta RADIUS con `Message-Authenticator` inválido.** Se descarta el ACK y se trata
  como fallo.
- **EX-17.4 — Fallback también falla.** La sesión pasa a `degraded`, se aplica corte de emergencia y
  se emite `alert.revocation_no_ack`; la sesión no se marca `revoked` sin ACK.
- **EX-17.5 — Comando sobre sesión ya terminal.** Se responde con la fila existente (idempotente) sin
  enviar nada al gateway.
- **EX-17.6 — Respuesta duplicada del gateway.** Se deduplica por `idempotency_key` y
  `router_session_id`.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Autorización exitosa con ACK
  Dado un hotspot_session "provisional" con MAC "00:11:22:33:44:55" e IP "10.20.0.7"
  Cuando el adaptador mock responde Access-Accept en 150 ms
  Entonces access_commands guarda un "authorize" con status "success", attempts 1 y latency_ms 150
  Y radius_code es "Access-Accept"
  Y la sesión conserva provisional_until

Escenario: Idempotencia de autorización
  Dado un access_command "authorize" ya en status "success" con idempotency_key "K1"
  Cuando se reintenta el mismo comando con la misma clave "K1"
  Entonces no se envía una segunda petición al gateway
  Y la respuesta devuelve la fila existente
  Y attempts permanece en 1

Escenario: Reintentos con backoff en revocación
  Dado un gateway que falla las 2 primeras veces y responde ACK a la tercera
  Cuando se revoca una sesión
  Entonces se realizan 3 intentos con esperas de 1 s, 2 s y 4 s más jitter
  Y access_commands.status es "success" con attempts 3
  Y revoked se marca solo tras el ACK

Escenario: Sin ACK tras la gracia
  Dado un gateway que no responde a ningún intento ni al fallback
  Cuando transcurren 30 s de gracia
  Entonces la sesión pasa a "degraded"
  Y se aplica corte de emergencia por address-list
  Y audit_log registra "alert.revocation_no_ack" con details.severity "critical"
  Y access_commands.status es "timeout"

Escenario: Fallback de CoA/PoD a REST
  Dado un gateway RADIUS que no responde al Disconnect-Request
  Y el mismo gateway con REST disponible
  Cuando se agota el primer transporte
  Entonces se emite el comando por REST
  Y se registra un segundo access_command con transport "mikrotik_rest"

Escenario: Credenciales inválidas
  Dado un gateway que responde 401 por secreto incorrecto
  Cuando se intenta autorizar
  Entonces access_commands.status es "failed"
  Y no se reintenta con las mismas credenciales
  Y audit_log registra "alert.gateway_auth_failed" sin registrar el secreto

Escenario: Doble métrica de revocación registrada
  Dado un gateway mock con ACK en 150 ms y una detección de insolvencia en el inicio del Job
  Cuando se revoca una sesión
  Entonces revocation_command_latency_ms registra el tramo detección → ACK
  Y service_cutoff_latency_ms registra el tramo inicio de insolvencia → ACK
  Y ambas métricas se exponen en /metrics como histogramas
```

**Restricciones del sistema (EARS)**

- El sistema deberá enviar cada comando con una `idempotency_key` única y no duplicarlo si ya existe
  en `success`.
- El sistema deberá registrar en `access_commands` tipo, transporte, intentos, latencia, código
  RADIUS, error y resultado.
- Cuando no reciba ACK en 2 s, el sistema deberá reintentar hasta 3 veces con backoff 1/2/4 s +
  jitter.
- Si el transporte principal falla, entonces el sistema deberá hacer fallback CoA/PoD ↔ REST.
- El sistema deberá marcar `revoked` **solo** con ACK; sin ACK deberá pasar a `degraded`, dejar el
  comando en `timeout`/`failed` y ejecutar corte de emergencia.
- El sistema deberá medir `revocation_command_latency_ms` desde la detección hasta el ACK y
  `service_cutoff_latency_ms` desde el inicio de la insolvencia hasta el corte efectivo (D43).
- El sistema deberá aceptar únicamente el vocabulario cerrado de `disconnect_reason`
  (`flow_deleted`, `flow_paused`, `insolvent`, `low_rate`, `user_closed`, `admin`, `timeout`,
  `reconciliation`, `expired`) y mapear los motivos de operador a `admin` (H2-32).
- El sistema deberá declarar los transportes por gateway en `metadata.transports` y emitir un
  `access_command` por transporte e intento (H2-35).
- El sistema deberá aplicar `WISPr-Bandwidth-Max-Down/Up` o `rate-limit` con magnitudes absolutas
  (50/10 Mbps y 25/5 Mbps para hijos).
- El sistema **no deberá** registrar secretos, `Message-Authenticator` completo ni credenciales en
  logs o `access_commands`.

**Trazabilidad:** RF/RNF/RT cubiertos: RF-10, RF-11, RF-12, RF-20; RNF-19.
Cobertura secundaria: RF-21 (accounting RADIUS), RF-23 (mock), RNF-02/RNF-18 (secretos), RNF-06
(idempotencia), RNF-09 (logs/métricas), RNF-22 (alertas), D24, RT-06/RT-07.

---

## CU-18 — Gestionar insolvencia/pausa y revocación en cascada

| Campo | Valor |
| --- | --- |
| **ID** | CU-18 |
| **Nombre** | Gestionar insolvencia/pausa y revocación en cascada |
| **Actor(es)** | Sistema (primario); Chain, Gateway/NAS y Portal (secundarios) |
| **Objetivo** | Detectar insolvencia, pausa o caída del stream y revocar el acceso del padre y de todos sus hijos con **doble métrica**: ACK p95 < 10 s desde la detección y corte efectivo p95 < 75 s desde el inicio de la insolvencia, con causa registrada y sin dejar sesiones huérfanas. |
| **Requisitos** | RF-13, RF-19, RF-27; RNF-03, RNF-21 |

**Precondiciones**
1. Sesión `active` o `provisional` con `hotspot_sessions.sender_wallet`, `receiver_wallet`,
   `min_rate_required_wei` y `flow_rate_wei_s`.
2. Job de health-check activo con cadencia de **1 min** (`* * * * *`, D42) y acceso al RPC.
3. Existen hijos (`voucher_child`) enlazados por `parent_hotspot_session_id`, si aplica; su solvencia
   se hereda del padre (H2-34).

**Postcondiciones**
1. `session_health_checks` con `checked_at`, `flow_rate_wei_s`, `min_rate_required_wei`,
   `virtual_balance_wei`, `is_solvent` y `action` (`disconnect`, `degrade`, `none`).
2. Sesión padre y todos sus hijos en `revoking` → `revoked` con `disconnect_reason` ∈
   {`insolvent`, `flow_deleted`, `flow_paused`, `low_rate`, `timeout`}.
3. `access_commands` con `disconnect` en `success` (o `timeout`/`failed` si no hay ACK).
4. `vouchers` del padre pasan a **`revoked`** (regla de cascada única: revocación → vouchers
   `revoked`); los hijos no pueden seguir canjeándose.
5. `audit_log` `action='session.auto_revoked'` con la causa y el `session_id`.

**Flujo principal**
1. El health-check (Job de 1 min) agrupa las lecturas por cuenta (multicall/`eth_call` batch), con
   concurrencia máxima **8** y timeout 8 s; lee `getFlow(sender, receiver)` y
   `virtualBalanceOf(sender)` una vez por wallet y reutiliza el resultado entre sesiones del mismo
   `sender` (D44/H2-24).
2. Evalúa el predicado cerrado RB-14: `status == Active ∧ flowRate >= min_rate_required_wei ∧
   virtualBalanceOf(sender) > 0`.
3. Si el predicado es falso, registra la muestra con `is_solvent=false` y la causa concreta, y pasa la
   sesión a `revoking`.
4. Emite `disconnect` (CU-17) al gateway para el padre con la causa; en paralelo, revoca a los hijos
   con la misma causa y su propio comando. Los hijos **no se muestrean**: heredan la solvencia del
   padre (`session_health_checks` del padre; H2-34).
5. Con ACK, padre e hijos pasan a `revoked`; se actualizan `disconnected_at`, bindings y vouchers
   (`revoked`).
6. Se registran `revocation_command_latency_ms` y `service_cutoff_latency_ms`; si el p95 supera 10 s /
   75 s se emite `alert.revocation_slo_breach` (RNF-03/D43).
7. El portal muestra al usuario "sesión finalizada por insolvencia/pausa" y el saldo restante.
8. Los eventos `FlowDeleted`/`FlowPaused` del indexador (CU-16) actúan como disparador alternativo y
   como confirmación del cierre.

**Flujos alternativos**
- **FA-18.1 — Insolvencia con margen.** Si `virtualBalanceOf > 0` pero `flowRate < tarifa`, se revoca
  con causa `low_rate`.
- **FA-18.2 — Pausa voluntaria.** `FlowPaused` revoca con causa `paused` (RB-15); reanudar exige
  CU-05.
- **FA-18.3 — Cierre del padre por el usuario.** Se comporta como CU-06 y arrastra a los hijos.
- **FA-18.4 — Falso positivo por RPC lento.** Antes de revocar se confirma con una segunda lectura
  (o con el evento indexado); si la segunda lectura es solvente, no se revoca y se registra
  `action='none'`.

**Flujos de excepción**
- **EX-18.1 — RPC no responde en 8 s.** Se reintenta con backoff; si no hay lectura fiable, se aplica
  la política de degradación (no se revoca a ciegas salvo `FlowDeleted` confirmado).
- **EX-18.2 — Hijo sin comando posible (gateway caído).** La sesión se marca `degraded`, el comando
  `timeout`, se aplica corte de emergencia y se emite `alert.revocation_no_ack`; se reintenta en el
  siguiente ciclo (1 min).
- **EX-18.3 — Padre ya `revoked` y hijo aún `active` (divergencia).** Se revoca el hijo y se registra
  la inconsistencia para CU-19.
- **EX-18.4 — Insolvencia durante la ventana provisional.** Se revoca sin confirmar y se audita.
- **EX-18.5 — Reintento de revocación sobre sesión terminal.** Idempotente, sin nuevo comando.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Revocación por insolvencia del padre
  Dado un padre "active" con flowRate 1000000000000 y min_rate 1000000000000
  Y virtualBalanceOf(sender) = 0
  Cuando el health-check evalúa la sesión
  Entonces session_health_checks registra is_solvent false y action "disconnect"
  Y el padre pasa a "revoking" y, con ACK, a "revoked" con disconnect_reason "insolvent"
  Y access_commands contiene un "disconnect" en status "success"
  Y se registra la muestra de revocation_command_latency_ms y service_cutoff_latency_ms

Escenario: Revocación en cascada de hijos
  Dado un padre con 2 hijos "voucher_child" activos
  Cuando el padre se revoca por insolvencia
  Entonces los 2 hijos pasan a "revoking" y, con ACK, a "revoked"
  Y se emiten 2 access_commands "disconnect" con status "success"
  Y sus device_bindings pasan a "revoked"

Escenario: Pausa detectada por evento
  Dado un padre "active" con 2 hijos
  Cuando el indexador procesa FlowPaused del padre
  Entonces el padre pasa a "revoking" y luego a "revoked" con disconnect_reason "flow_paused"
  Y los hijos pasan a "revoked"
  Y los vouchers asociados pasan a "revoked"

Escenario: flowRate por debajo de la tarifa
  Dado un flow "Active" con flowRate 500000000000 y min_rate 1000000000000
  Cuando el health-check evalúa
  Entonces la causa registrada es "low_rate"
  Y la sesión pasa a "revoked"

Escenario: Falso positivo por lectura lenta
  Dado un RPC que responde en 9 s en la primera lectura y en 300 ms con datos solventes en la segunda
  Cuando el health-check evalúa
  Entonces no se revoca la sesión
  Y session_health_checks.action es "none"
  Y no se emite ningún disconnect

Escenario: RPC no disponible
  Dado un RPC que no responde tras 3 reintentos
  Cuando finaliza el ciclo de health-check
  Entonces no se revoca ninguna sesión por insolvencia
  Y audit_log registra "alert.rpc_degraded" con details.severity "warning"
  Y se registra el ciclo fallido

Escenario: Cascada determinista con ACK
  Dado un padre con 2 hijos y un gateway mock que responde ACK
  Cuando el padre se revoca por FlowDeleted
  Entonces el 100 % de los hijos termina en "revoked"
  Y el 100 % de los access_commands "disconnect" queda en status "success"
  Y los vouchers del padre quedan en "revoked"
```

**Restricciones del sistema (EARS)**

- El sistema deberá evaluar la solvencia con cadencia de **1 min** (Job + Scheduler, D42) y el
  predicado RB-14, agrupando lecturas por cuenta con concurrencia máxima 8 (D44/H2-24).
- El sistema deberá registrar los **ciclos incompletos** como métrica
  (`healthcheck_incomplete_cycles_total`) y no revocar a ciegas por un ciclo incompleto.
- Cuando el predicado sea falso, el sistema deberá revocar el acceso y registrar la causa concreta.
- El sistema deberá revocar en cascada **todos** los hijos del padre revocado.
- El sistema deberá medir la latencia desde la detección (`revocation_command_latency_ms`, p95 < 10 s)
  y desde el inicio de la insolvencia (`service_cutoff_latency_ms`, p95 < 75 s) (D43).
- Si no hay ACK, entonces el sistema deberá degradar la sesión, dejar el comando en `timeout`,
  aplicar corte de emergencia y emitir `alert.revocation_no_ack`, sin declarar `revoked`.
- Mientras la sesión esté `revoked`, el sistema deberá impedir nuevas autorizaciones para esa MAC.
- Si el RPC no ofrece una lectura fiable, entonces el sistema no deberá revocar por insolvencia sin
  una segunda confirmación o un evento `FlowDeleted`/`FlowPaused`.
- De acuerdo con RNF-21, el sistema deberá tratar `pauseFlow` como corte efectivo (no como pausa de
  servicio).
- El sistema deberá invalidar los vouchers del padre cuando su stream deje de estar activo.

**Trazabilidad:** RF/RNF/RT cubiertos: RF-13, RF-19, RF-27; RNF-03, RNF-21.
Cobertura secundaria: RF-11 (revocación), RF-24 (notificación), RNF-07 (consistencia), RNF-09
(métricas), RNF-19 (ACK/fallback), RNF-22 (alertas), D9/D20/D23, RT-03/RT-07.

---

## CU-19 — Reconciliar router ↔ BD y health-check

| Campo | Valor |
| --- | --- |
| **ID** | CU-19 |
| **Nombre** | Reconciliar router ↔ BD y health-check |
| **Actor(es)** | Sistema (primario); Gateway/NAS y PostgreSQL (secundarios) |
| **Objetivo** | Comparar el estado de las sesiones en BD con el estado real del gateway cada **1 min**, corregir divergencias (fantasmas y huérfanas), detectar deriva de IP/MAC, caducar vouchers y sesiones por vigencia, verificar el health de gateways y alimentar el SLO/alertas. |
| **Requisitos** | RF-13; RNF-07, RNF-08 |

**Precondiciones**
1. Acceso de lectura al gateway (`GET /rest/ip/hotspot/active` o accounting RADIUS
   `radacct`/`Acct-Session-Id`).
2. `hotspot_sessions` con `router_session_id`/`radacct_session_id` cuando exista.
3. Ciclo programado (`* * * * *` en Scheduler — cada 1 min, D42) y lease para evitar solapamiento.

**Postcondiciones**
1. Informe de reconciliación con: sesiones `active` en BD sin correlato en gateway, sesiones en
   gateway sin sesión `active` en BD, y coincidencias.
2. Divergencia corregida en **≤ 1 ciclo (60 s)**: se revoca la fantasma o se cierra la huérfana con
   causa `reconciliation`.
3. `gateways.last_health_at` y `status` actualizados; `access_commands` con la acción correctiva.
4. `audit_log` `action='system.reconciliation'` con recuentos y resultado.

**Flujo principal**
1. El job toma el lease y lee la lista de sesiones activas del gateway (adaptador correspondiente).
2. Lee `v_active_sessions` de la BD para el mismo gateway.
3. Calcula el diff por `(mac_address, router_session_id)` y compara además la **IP observada** en el
   gateway con `device_bindings.ip_address`; si difiere, marca la sesión `degraded`, audita
   `security.ip_mac_drift` y exige `/v1/session/revalidate` en ≤ 60 s (H2-25).
4. Para cada sesión **activa en BD sin correlato**: emite `disconnect` (idempotente) y marca
   `revoked` con `disconnect_reason='reconciliation'`; si el gateway no responde, `degraded` + alerta.
5. Para cada sesión **en gateway sin fila activa en BD**: cierra la sesión en el gateway (`logout`/
   `PoD`) con causa `reconciliation` y audita la huérfana; si hay MAC con binding activo, se invita al
   portal.
6. Ejecuta `healthcheck()` por gateway y actualiza `last_health_at`/`status`; registra latencia.
7. Publica métricas `reconciliation_divergences`, `healthcheck_latency_ms` y
   `healthcheck_incomplete_cycles_total`; alimenta el SLO 99,5 % con la **sonda sintética declarada**
   (`GET /healthz` cada 60 s desde 2 regiones, timeout 5 s, éxito = 200 en ≤ 2 s; SLO mensual =
   minutos con sonda OK / minutos del mes).
8. Si hay divergencias recurrentes (> 3 en 3 ciclos), emite `alert.reconciliation_divergence` y
   degrada el gateway (sin usar el valor `degraded` en `gateways.status`).
9. Ejecuta el **job de caducidad**: vouchers con `valid_to < now()` pasan a `expired` y revocan sus
   sesiones hijas (`disconnect_reason='expired'`); sesiones `pending`/`provisional` que superan su
   ventana sin servicio pasan a `expired` y liberan la cuota de provisional.

**Flujos alternativos**
- **FA-19.1 — Gateway sin API de listado (RADIUS puro).** La reconciliación usa `radacct`
  (`acctstarttime` sin `acctstoptime`) y `Acct-Session-Id`.
- **FA-19.2 — Divergencia por despliegue.** Tras reinicio del orquestador, se reconcilian todas las
  sesiones activas y se adoptan las que coinciden.
- **FA-19.3 — Sesión `provisional` sin fila en gateway.** Se revoca (nunca navegó) y se libera la
  cuota.
- **FA-19.4 — Modo mantenimiento.** El gateway se marca `maintenance`; no se autorizan nuevas
  sesiones y se reconcilian las existentes.
- **FA-19.5 — Deriva de IP/MAC (H2-25).** Si la IP observada en el gateway no coincide con el binding,
  se exige `/v1/session/revalidate`; si no se re-autentica en 60 s, se revoca con
  `disconnect_reason='timeout'`.
- **FA-19.6 — Caducidad.** El job de caducidad pasa vouchers a `expired` y sesiones sin servicio a
  `expired`, con auditoría y liberación de cuota (productor canónico de `expired`).

**Flujos de excepción**
- **EX-19.1 — Timeout del gateway en el listado.** No se corrigen sesiones a ciegas; se registra el
  fallo, se emite `alert.gateway_offline` y se reintenta en el siguiente ciclo.
- **EX-19.2 — BD no disponible.** El job aborta sin acciones; se emite `alert.db_unavailable`; no se
  toca el gateway.
- **EX-19.3 — Divergencia masiva (> 20 % de sesiones).** Se detiene la corrección automática, se
  escala a operación (CU-11) y se emite `alert.reconciliation_divergence` como incidente.
- **EX-19.4 — Lease tomado por otra instancia.** El job sale sin procesar (anti-solapamiento).
- **EX-19.5 — Sesión huérfana con MAC bloqueada.** Se cierra igualmente y se registra el conflicto.

**Criterios de aceptación (Gherkin)**

```gherkin
Escenario: Sesión fantasma en BD
  Dado un hotspot_session "active" con router_session_id "S-1"
  Y el gateway no tiene la sesión "S-1" en su listado
  Cuando se ejecuta la reconciliación
  Entonces la sesión pasa a "revoked" con disconnect_reason "reconciliation"
  Y se registra access_commands con el comando correctivo
  Y audit_log registra "system.reconciliation" con 1 divergencia

Escenario: Sesión huérfana en el gateway
  Dado el gateway con la sesión "S-2" activa
  Y no existe hotspot_session "active" con router_session_id "S-2"
  Cuando se ejecuta la reconciliación
  Entonces se cierra "S-2" en el gateway con causa "reconciliation"
  Y audit_log registra la huérfana con su MAC

Escenario: Divergencia corregida en un ciclo
  Dado un gateway mock con una divergencia forzada
  Cuando se ejecuta el ciclo de 60 s
  Entonces la divergencia se corrige en el mismo ciclo
  Y v_active_sessions ya no muestra la sesión fantasma

Escenario: Caducidad de voucher y sesión
  Dado un voucher con valid_to vencido y una sesión hija "active"
  Cuando se ejecuta el job de caducidad
  Entonces vouchers.status es "expired"
  Y la sesión hija pasa a "revoking" y luego a "revoked" con disconnect_reason "expired"
  Y children_used se libera

Escenario: Gateway no disponible
  Dado un gateway que no responde al listado en 8 s
  Cuando se ejecuta la reconciliación
  Entonces no se modifica ninguna sesión
  Y audit_log registra "alert.gateway_offline" con details.severity "warning"
  Y se registra el ciclo fallido

Escenario: Umbral de divergencia masiva
  Dado el 25 % de las sesiones con divergencia
  Cuando se ejecuta la reconciliación
  Entonces se detiene la corrección automática
  Y se escala a operación
  Y audit_log registra "alert.reconciliation_divergence" con details.severity "critical"

Escenario: Health-check y cálculo del SLO
  Dado un mes con 43 200 minutos y 216 minutos con la sonda sintética en fallo
  Cuando el job calcula el SLO mensual
  Entonces el SLO es 99,5 %
  Y gateways.last_health_at se actualiza en todos los gateways online
  Y reconciliation_divergences y healthcheck_incomplete_cycles_total se publican en /metrics
```

**Restricciones del sistema (EARS)**

- El sistema deberá reconciliar router ↔ BD al menos cada **1 min** (D42).
- Ninguna sesión `active` deberá quedar sin correlato en el gateway más de **1 ciclo (60 s)**
  (RNF-07).
- Cuando detecte una divergencia, el sistema deberá corregirla con un comando idempotente y registrar
  la causa `reconciliation`.
- Si el gateway o la BD no responden, entonces el sistema no deberá corregir a ciegas y deberá
  alertar.
- Si la divergencia supera el **20 %** de las sesiones, el sistema deberá detener la corrección
  automática y escalar a operación.
- El sistema deberá calcular el SLO de **99,5 % mensual** con la sonda sintética declarada
  (`GET /healthz` cada 60 s, timeout 5 s, 2 regiones) y publicar las métricas en `/metrics`.
- El sistema deberá usar lease para evitar reconciliaciones simultáneas.
- De acuerdo con RT-12, el sistema deberá exponer `/healthz` público y `/readyz` **protegido**
  (IAM/OIDC o resumen agregado sin detalle interno); `/metrics` no será público (H2-41).
- El sistema deberá ser el **productor canónico de `expired`** para vouchers y sesiones sin servicio
  mediante el job de caducidad.

**Trazabilidad:** RF/RNF/RT cubiertos: RF-13; RNF-07, RNF-08.
Cobertura secundaria: RF-10/RF-11 (comandos), RF-18 (auditoría), RNF-06 (idempotencia), RNF-09
(observabilidad), RNF-19 (degradación), RNF-22 (métricas y runbook), RNF-23 (capacidad), D29, RT-12.

---

## 4. Riesgos y ambigüedades residuales

Las ambigüedades de la versión auditada (H2-34, H2-20, H2-27, H2-14) quedaron cerradas por las
decisiones D42–D56 y se registran con propietario y fecha en
[`registro_decisiones.md`](registro_decisiones.md) (D53). Quedan como riesgos vivos:

1. **Modo del oráculo en Besu 81234 (D56/ENV-02).** El oráculo es único por modo (`MEMPOOL_MODE`):
   `visible` usa `eth_getTransactionByHash` y `receipt` usa `eth_getTransactionReceipt`, para conceder
   y para confirmar/revocar. El modo debe fijarse empíricamente en H2 antes de escribir el test de
   provisional; no se admiten ramas mezcladas.
2. **Cuota de provisional y reintento legítimo.** "1 provisional por MAC + wallet cada 15 min" no
   distingue fallo de red de abuso; la cuota se aplica a todo intento. Riesgo de producto registrado
   (sin decisión de cambio en v1).
3. **UX del 202 Accepted (D44).** El portal debe consultar `GET /v1/session/{id}` para conocer el paso
   de `pending` a `provisional`/`failed`; se cubre con *polling* de 60 s y el estado `pending` como
   valor observable, no con una respuesta síncrona de validación.
4. **Deriva IP/MAC (H2-25).** La detección depende de que el NAS exponga la IP vigente en
   `ip/hotspot/active` (post-autorización); si el gateway no la reporta, la re-autenticación solo
   puede exigirse en el nuevo bind (no por reconciliación). Es un límite conocido del adaptador.
5. **Accounting RADIUS (D46).** RF-21 sigue siendo SHOULD y no se exige el camino
   FreeRADIUS→Cloud SQL: `radacct` en Cloud SQL solo se puebla si el operador despliega el módulo
   `sql`; CU-06/CU-19 degradan a estimación on-chain si no existe.

---

## 5. Matriz de trazabilidad

> **Leyenda de estado.** ✅ Cubierto por un CU con criterio ejecutable · 🔁 Cubierto de forma
> secundaria (el comportamiento existe en el CU, aunque el requisito sea de otra naturaleza) ·
> ➖ `sin CU` justificado (no es comportamiento de caso de uso).
> **Tipos de prueba.** `Forge` (contratos) · `Vitest` (orquestador/lógica) · `Integración` (mock
> gateway/FreeRADIUS, reloj controlado) · `Playwright` (portal E2E) · `axe` (accesibilidad) · `k6`
> (carga) · `Seguridad` (grep de secretos, RBAC, rate-limit) · `Job` (purga/backup) · `CI`
> (cobertura/validador).

### 5.1 Requerimientos funcionales (27)

| Req. | Descripción breve | CU | Tipo de prueba previsto | Estado |
|---|---|---|---|---|
| RF-01 | Captura MAC+IP y crea `portal_session` | CU-01 | Playwright + Vitest | ✅ |
| RF-02 | Conectar wallet y mostrar red esperada | CU-01 | Playwright | ✅ |
| RF-03 | Challenge SIWE + binding terna | CU-01 | Vitest + Playwright | ✅ |
| RF-04 | Envolver BRLT en BRLTx 1:1 | CU-02 | Forge + Playwright | ✅ |
| RF-05 | Abrir flow con `flowRate >= tarifa` | CU-03 | Vitest + Integración | ✅ |
| RF-06 | Mostrar estado y disclaimer | CU-01, CU-04, CU-06 | Playwright | ✅ |
| RF-07 | Indexador con checkpoint y sin duplicados | CU-16 | Vitest + Integración | ✅ |
| RF-08 | Emparejar wallet con MAC/IP y rechazar no ligadas | CU-16 | Vitest | ✅ |
| RF-09 | Validador de flujo (tasa, receptor, token) | CU-03, CU-16 | Vitest | ✅ |
| RF-10 | Autorización de gateway auditada | CU-17 | Integración + mock | ✅ |
| RF-11 | Revocación de gateway | CU-12, CU-17 | Integración + mock | ✅ |
| RF-12 | Provisional 60 s endurecido + cuota | CU-03, CU-17 | Vitest + reloj controlado | ✅ |
| RF-13 | Reconciliación y health-check cada 1 min | CU-18, CU-19 | Vitest + Integración | ✅ |
| RF-14 | API REST de portal y operadores | CU-04, CU-05, CU-11 | Vitest + Playwright | ✅ |
| RF-15 | Administración de gateways/tarifas con RBAC | CU-09, CU-10, CU-14 | Seguridad + Vitest | ✅ |
| RF-16 | Múltiples gateways y adaptadores | CU-09 | Integración | ✅ |
| RF-17 | Anti-suplantación MAC con terna verificada en el NAS | CU-01 (D45, EX-01.3), CU-08 | Vitest + Seguridad | ✅ |
| RF-18 | Auditoría completa de comandos y acciones | CU-11, CU-12 | Vitest + revisión | ✅ |
| RF-19 | Cierre por insolvencia/pausa y causa | CU-05, CU-12, CU-18 | Integración + reloj | ✅ |
| RF-20 | Reintentos idempotentes con backoff | CU-17 | Integración | ✅ |
| RF-21 | Accounting RADIUS opcional (`radacct`) | CU-06 (paso 7), CU-17 (FA-17.3) | Integración FreeRADIUS | 🔁 |
| RF-22 | BRLT/BRLTx/Factory adaptados y desplegados | CU-02 (secundaria) | Forge + `check-deployments` | 🔁 |
| RF-23 | Adaptador `mock` obligatorio | CU-09 (FA-09.3), CU-17 (FA-17.2) | CI + Integración | 🔁 |
| RF-24 | Notificaciones de revocación/fallo/caída | CU-12, CU-18 | Vitest + revisión de logs | 🔁 |
| RF-25 | Vouchers padre/hijo (12 chars, 2 hijos, 50 %) + administración | CU-07, CU-08, CU-13 | Vitest + Playwright | ✅ |
| RF-26 | QoS de hijos con magnitud absoluta | CU-08 | Integración mock RADIUS | ✅ |
| RF-27 | Revocación en cascada | CU-07, CU-08, CU-18 | Integración | ✅ |

### 5.2 Requerimientos no funcionales (27)

| Req. | Descripción breve | CU | Tipo de prueba previsto | Estado |
|---|---|---|---|---|
| RNF-01 | Seguridad de contratos (Slither 0 high/medium) | CU-02 (cadena de contrato) | Forge + Slither | 🔁 |
| RNF-02 | Sin claves/secretos en repo, bundle ni logs | CU-01, CU-02, CU-09, CU-14 | Seguridad (grep CI) | ✅ |
| RNF-03 | Doble métrica: ACK p95 < 10 s desde detección y corte p95 < 75 s desde insolvencia | CU-03, CU-18 | Integración con reloj + spec k6 §5.9 | ✅ |
| RNF-04 | `authorize_validation_latency` p95 < 10 s con `/v1/session/authorize` 202 + worker | CU-03 | Spec k6 §5.9 | ✅ |
| RNF-05 | Índice sin huecos, 2 bloques, reorg 12, lease, Job de 1 min | CU-16 | Vitest + reindexado | ✅ |
| RNF-06 | Idempotencia de comandos | CU-17 | Integración | ✅ |
| RNF-07 | Consistencia router↔BD en 1 ciclo (60 s) | CU-19 | Vitest + divergencia forzada | ✅ |
| RNF-08 | SLO 99,5 % mensual por sonda sintética (`GET /healthz` cada 60 s, 2 regiones, timeout 5 s) | CU-19 | Job de cálculo + revisión de dashboards | 🔁 |
| RNF-09 | Logs JSON con `session_id`/`tx_hash`, métricas | CU-11 (FA-11.3), CU-17, CU-18 | Revisión de logs/dashboards | 🔁 |
| RNF-10 | Seguridad de API (auth, validación, rate-limit, CORS) | CU-01 | Seguridad + Vitest | ✅ |
| RNF-11 | ISO 25010 + cobertura ≥ 80 % en CI | — | `coverage-check` en CI | ➖ no es CU: meta-requisito de calidad medido en CI |
| RNF-12 | RGPD: aviso previo, minimización, matriz de retención (PII 30 d / auditoría 12 m) | CU-01, CU-15 | Job de purga + test de supresión | ✅ |
| RNF-13 | Accesibilidad axe A/AA, i18n es/en | CU-04 | axe + Playwright | ✅ |
| RNF-14 | Portabilidad con `docker-compose` | — | `docker compose up` en limpio | ➖ no es CU: requisito de infraestructura |
| RNF-15 | Todo RF-MUST con ≥ 1 test nombrado | — | meta-test `coverage-check` | ➖ no es CU: meta-requisito de la matriz |
| RNF-16 | Licencia MIT + disclaimer visible | CU-01 | grep en build + Playwright | ✅ |
| RNF-17 | Backup diario 30 días, RTO 4 h / RPO 24 h | CU-15 (secundaria) | Prueba de restauración + política Cloud SQL | 🔁 proceso de infraestructura; el CU-15 documenta la reaplicación de supresión tras restaurar |
| RNF-18 | Secretos por referencia y verificación CI | CU-09, CU-17 | Seguridad (grep CI) | ✅ |
| RNF-19 | Revocación robusta: 3 intentos, fallback, ACK | CU-08, CU-12, CU-17 | Integración con reloj | ✅ |
| RNF-20 | Resiliencia RPC (8 s, 3 reintentos, ≤ 5000 bloques) | CU-03, CU-16 | Integración de degradación | ✅ |
| RNF-21 | Pausa = corte (padre e hijos) | CU-03, CU-05, CU-18 | Integración `pauseFlow` | ✅ |
| RNF-22 | Métricas nombradas, alertas (`alert.*` + `alerts_total`), runbook, MTTR | CU-11 | Revisión de runbook + alertas instrumentadas | 🔁 |
| RNF-23 | Capacidad 100 sesiones/50 hijos/10 gateways/5 ev/s | CU-11 | k6 | ✅ |
| RNF-24 | API admin con API keys persistidas (`api_key_*`), MFA opcional, RBAC de 5 roles | CU-14, CU-15 | Seguridad + Vitest | ✅ |
| RNF-25 | PII y sesión web (SameSite, CSRF, rotación JWT, EIPD decidida) | CU-01, CU-15 | Playwright + Seguridad | ✅ |
| RNF-26 | Anti-fuerza-bruta de vouchers 5/15 min | CU-07, CU-08, CU-13 | Vitest + rate-limit | ✅ |
| RNF-27 | Reentrancia (ReentrancyGuard + CEI) | CU-03 (cadena de contrato) | Forge + Slither + fuzz | ✅ |

### 5.3 Requerimientos técnicos (12) — verificación, no casos de uso

| Req. | Descripción breve | CU | Tipo de prueba previsto | Estado |
|---|---|---|---|---|
| RT-01 | Solidity 0.8.28 + Foundry + OZ 5.1 | CU-02 | Forge build/test | 🔁 |
| RT-02 | Besu 81234; prod L2 por `chain_id` | CU-03, CU-16 | Integración RPC | 🔁 |
| RT-03 | Node 22 + TS + ethers + UDP/REST | CU-17 | Vitest/Integración | 🔁 |
| RT-04 | PostgreSQL 15+ con migraciones | CU-15, CU-19 | Validación SQL/CI | 🔁 |
| RT-05 | Next.js 15 + wagmi + viem | CU-01, CU-04 | Playwright | 🔁 |
| RT-06 | MikroTik RouterOS v7 REST | CU-09, CU-17 | Integración mock MikroTik | 🔁 |
| RT-07 | FreeRADIUS RFC 5176 + `radacct` | CU-09, CU-17 | Integración FreeRADIUS | 🔁 |
| RT-08 | Config centralizada por entorno | CU-09 | Revisión de configuración | 🔁 |
| RT-09 | ABI y direcciones sincronizadas | CU-02 | `sync-abi` + `check-deployments` | 🔁 |
| RT-10 | Forge + Vitest + Playwright + contenedores | Todos | Pipeline CI | 🔁 |
| RT-11 | `docker-compose` con 5 servicios | CU-09 | `docker compose up` | 🔁 |
| RT-12 | Logs JSON + `/metrics` (OIDC) + `/healthz` público + `/readyz` protegido | CU-19 | Revisión + sonda | 🔁 |

> **Cobertura.** **27/27 RF** con CU: 23 con criterio directo, 3 con cobertura secundaria
> (RF-21, RF-23, RF-24) y RF-22 con cobertura secundaria en CU-02 (requisito de
> construcción/despliegue). **27/27 RNF** con CU o justificación explícita: 20 directos, 5
> secundarios (RNF-01, RNF-09, RNF-16, RNF-17, RNF-22) y 2 sin CU por no ser comportamiento de caso
> de uso (RNF-11, RNF-14; RNF-15 es meta-requisito de la propia matriz). **12/12 RT** verificados por
> herramienta. Toda fila 🔁/➖ de esta matriz coincide con la trazabilidad declarada en la ficha del
> CU correspondiente (H2-17); la fuente canónica CU→requisitos es la fila **Requisitos** de cada
> ficha, y `documento_tecnico.md` §7.2 se genera desde ella.

### 5.4 Criterios reescritos durante la elaboración

| Criterio inicial (no testeable) | Reescritura aplicada |
|---|---|
| "El acceso es rápido" | respuesta **202 Accepted** en `/v1/session/authorize` (criterio funcional, CU-03) y `authorize_validation_latency` p95 < 10 s en el spec k6 §5.9 (D44) |
| "La revocación es casi inmediata" | `revocation_command_latency_ms` p95 < 10 s desde la detección y `service_cutoff_latency_ms` p95 < 75 s desde la insolvencia (CU-18; spec k6 §5.9) |
| "El portal es accesible" | 0 violaciones axe A/AA en la vista de estado, es/en (CU-04) |
| "El voucher es seguro" | 12 chars Crockford Base32 + SHA-256 + 5 intentos/15 min + código mostrado una vez (CU-07/CU-08) |
| "La QoS del hijo es la mitad" | 25 000 000 bps bajada / 5 000 000 bps subida en `WISPr-Bandwidth-Max-*` (CU-08) |
| "Los datos se borran" | 0 filas con la MAC en claro en las 20 tablas (incl. `flow_events`/`flow_subscriptions` con `pseudonymized_at`) + recuento por tabla en `audit_log` (CU-15) |

---
