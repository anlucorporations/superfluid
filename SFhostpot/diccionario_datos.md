# Diccionario de Datos — SFhostpot (Superfluid Hotspot v1)

> **Fuente de verdad única** junto con `diagrama_er.md` y `base_datos.sql` (sincronizados).
> Modelo híbrido:
> - **On-chain (adaptado de v1)**: `BarloventoToken.sol` (BRLT), `BarloventoTx.sol` (BRLTx) y
>   `BarloventoFactory.sol`, derivados de `Euro.sol`/`EuroX.sol`/`EuroxFactory.sol` (decisión P2).
> - **Off-chain (nuevo)**: base relacional **PostgreSQL 16** con 20 tablas para sesiones,
>   identidad, eventos indexados, comandos de gateway, auditoría y accounting RADIUS.
> Convenciones: `snake_case`, tablas en plural, PK `id`, FK `<tabla_singular>_id`,
> timestamps `created_at`/`updated_at`, direcciones EVM `text` con CHECK regex,
> cantidades wei en `numeric(38,0)` (nunca float).

---

## PARTE A — Modelo lógico on-chain (reutilizado del proyecto v1)

### BRLT_TOKEN — Token ERC20 base `BarloventoToken` (`BarloventoToken.sol`)

> Adaptado de `sc/src/Euro.sol` de v1; símbolo **BRLT**, 18 decimales. Redespliegue con el nuevo
> nombre (decisión P2).

| Campo | Tipo Solidity | Descripción | Reglas |
|---|---|---|---|
| `totalSupply` | uint256 | Supply (inicial 10.000.000e18; hard-cap) | inmutable salvo mint/burn dentro del cap |
| `decimals` | uint8 | 18 | fijo |
| `owner` | address | Admin mint/burn | una cuenta |
| `balanceOf[account]` | mapping(address→uint256) | Saldo BRLT por cuenta | ≥ 0 |
| `allowance[owner][spender]` | mapping 2D | Aprobaciones ERC20 | ERC20 estándar |

### BRLTX_SUPER_TOKEN — Super Token `BRLTx` (`BarloventoTx.sol`)

> Adaptado de `sc/src/EuroX.sol` de v1; envuelve 1:1 el BRLT.

| Campo | Tipo | Descripción | Reglas |
|---|---|---|---|
| `underlying` | address | BRLT envuelto | inmutable |
| `decimals` | uint8 | 18 | |
| `realBalanceOf[account]` | mapping | BRLT custodiados por cuenta (reserva 1:1) | Σ real == totalSupplyX |
| `virtualBalanceOf[account]` | mapping (vista) | Balance presente devengado | derivado, no almacenado |
| `earnedUnclaimed[receiver][sender]` | mapping uint128 | Devengo liquidado no reclamado | pasa a real solo en close/settle+claim |
| `totalSupplyX()` | vista | Suministro de BRLTx | == BRLT retenido (custodia) |

### FLOW — Stream CFA-simplificado (`_flows[sender][receiver]`)

| Campo | Tipo | Descripción | Reglas |
|---|---|---|---|
| `sender` | address | Emisor del flujo (wallet del usuario) | PK compuesto 1 |
| `receiver` | address | Receptor (`gateway_tariffs.payout_wallet`) | PK compuesto 2; ≠ sender |
| `flowRate` | int96 | wei/segundo | ≥ `price_per_second_wei` para autorizar |
| `status` | enum uint8 | Active(0)/Paused(1)/Closed(2) | pausado retiene garantía y no devenga |
| `lastUpdateTimestamp` | uint40 | Último liquidado | monotónico |
| `accumulatedBalance` | uint128 | BRLTx liquidados al receptor | invariable si Paused |

### AGGREGATOR — Resumen por cuenta (`_aggregators[account]`)

| Campo | Tipo | Descripción |
|---|---|---|
| `account` | address | Titular (PK) |
| `netFlowRate` | int96 | Σ rates solo activos |
| `netOutflowGarantizado` | int96 | Σ rates salientes activos+pausados |
| `depositTotal` | uint256 | `netOutflowGarantizado × 3600` (sin techo) |
| `settledUpTo` | uint40 | Timestamp liquidado (solo marca temporal) |
| `pendingDeficit` | uint256 | wei impagados tras settle |
| `pendingPool` | uint128 | Residuos < 1 wei del prorrateo |

### BRLT_FACTORY — Registro de pares (`BarloventoFactory.sol`)

| Campo | Tipo | Descripción |
|---|---|---|
| `underlying` | address | BRLT_TOKEN (PK) |
| `superToken` | address | BRLTx del par |
| `owner` | address | Registrador de pares |

### PROYECCIONES DE LECTURA (usadas por el orquestador)

- `getFlow(sender, receiver)` → `{flowRate, status, accumulatedBalance, virtualDevengo}`.
- `getAccountInfo(account)` → `{netFlowRate, netOutflowGarantizado, depositTotal, settledUpTo, pendingDeficit}`.
- `virtualBalanceOf(account)` → saldo presente (gate de solvencia, RF-13/RF-19).
- `incomingUnclaimed(receiver, senders[])` → devengo pendiente de cobro.

> **Mapeo de eventos brief → v1**: `FlowUpdated(rate>0)` ⟵ `FlowCreated`/`FlowResumed`;
> `FlowUpdated(rate=0)` ⟵ `FlowPaused`; `FlowDeleted` ⟵ `FlowClosed`. El indexador normaliza a
> `flow_event_type` (ver `flow_events`). No se modifican los contratos.

---

## PARTE B — Modelo relacional PostgreSQL (nuevo)

### B.1 Tipos enumerados

| Enum | Valores |
|---|---|
| `gateway_vendor` | `mikrotik_rest`, `radius`, `mock`, `generic` |
| `gateway_status` | `online`, `offline`, `maintenance`, `disabled` |
| `portal_session_status` | `pending`, `challenge_issued`, `wallet_linked`, `bound`, `consumed`, `expired`, `rejected` |
| `binding_status` | `active`, `revoked`, `superseded` |
| `hotspot_session_status` | `pending`, `provisional`, `active`, `degraded`, `revoking`, `revoked`, `closed`, `expired`, `failed` |
| `access_command_type` | `authorize`, `reauthorize`, `confirm`, `disconnect`, `coa`, `pod`, `address_list_add`, `address_list_remove`, `login`, `logout` |
| `access_transport` | `mikrotik_rest`, `radius_coa`, `radius_pod`, `radius_access_accept`, `ssh`, `mock` |
| `command_status` | `pending`, `success`, `failed`, `timeout`, `retrying` |
| `flow_event_type` | `flow_created`, `flow_updated`, `flow_paused`, `flow_resumed`, `flow_closed`, `flow_deleted`, `settled`, `claimed` |
| `flow_status` | `active`, `paused`, `closed` |
| `event_processing_status` | `received`, `processed`, `ignored`, `failed` |
| `operator_role` | `admin`, `operator`, `readonly`, `auditor`, `dpo` |
| `health_action` | `none`, `grant_provisional`, `confirm`, `degrade`, `disconnect` |
| `voucher_status` | `active`, `redeemed`, `expired`, `revoked` |
| `binding_type` | `wallet`, `voucher` |
| `session_access_mode` | `wallet_stream`, `voucher_child` |

### B.2 Configuración de red

#### `gateways` — Routers/NAS gestionados (RF-16)

| Campo | Tipo | Nulo | Descripción / regla |
|---|---|---|---|
| `id` | uuid | no | PK, `gen_random_uuid()` |
| `tenant_id` | uuid | sí | multi-tenant futuro (D11) |
| `name` | text | no | UK; nombre lógico del gateway |
| `vendor` | gateway_vendor | no | selecciona el `GatewayAdapter` |
| `status` | gateway_status | no | default `offline` |
| `location` | text | sí | ubicación física |
| `description` | text | sí | |
| `chain_id` | bigint | no | default 81234 (D1) |
| `super_token_address` | text | no | CHECK `^0x[0-9a-fA-F]{40}$` |
| `mgmt_url` | text | sí | base REST MikroTik; obligatorio si `vendor='mikrotik_rest'` |
| `mgmt_username` | text | sí | |
| `mgmt_secret_ref` | text | sí | **referencia** a secreto (nunca el secreto) |
| `radius_nas_ip` | inet | sí | obligatorio si `vendor='radius'` |
| `radius_secret_ref` | text | sí | referencia al shared secret |
| `radius_coa_port` | int | no | default 3799 |
| `radius_auth_port` | int | no | default 1812 |
| `radius_acct_port` | int | no | default 1813 |
| `last_health_at` | timestamptz | sí | último health-check OK |
| `metadata` | jsonb | no | default `{}` |
| `created_at` | timestamptz | no | default `now()` |
| `updated_at` | timestamptz | no | default `now()`; trigger |

#### `gateway_tariffs` — Precio por segundo (D4, D12, D13)

| Campo | Tipo | Nulo | Descripción / regla |
|---|---|---|---|
| `id` | uuid | no | PK |
| `gateway_id` | uuid | no | FK→`gateways` ON DELETE CASCADE |
| `name` | text | no | UK por gateway |
| `price_per_second_wei` | numeric(38,0) | no | CHECK > 0; tarifa mínima |
| `token_address` | text | no | Super Token esperado; CHECK EVM |
| `payout_wallet` | text | no | **autoridad única** del receptor (H-24); CHECK EVM |
| `bandwidth_down_bps` | integer | no | ancho de banda base de bajada; default 50.000.000 (H-05) |
| `bandwidth_up_bps` | integer | no | ancho de banda base de subida; default 10.000.000 (H-05) |
| `min_deposit_wei` | numeric(38,0) | no | default 0; CHECK ≥ 0 |
| `max_children_per_parent` | integer | no | default **5**; CHECK 1..50; límite global de hijos por wallet padre (D55) |
| `provisional_seconds` | int | no | default 60 (D5); CHECK 0..300 |
| `buffer_seconds` | int | no | default 3600; CHECK > 0 |
| `active` | boolean | no | default true |
| `valid_from` | timestamptz | no | default `now()` |
| `valid_to` | timestamptz | sí | CHECK `valid_to > valid_from` |
| `created_at` | timestamptz | no | default `now()` |
| `updated_at` | timestamptz | no | default `now()`; trigger |

#### `nas` — Clientes RADIUS (RT-07)

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | bigserial | no | PK |
| `nasname` | text | no | UK; IP/host del NAS |
| `shortname` | text | sí | |
| `type` | text | no | default `other` |
| `ports` | int | sí | |
| `secret_ref` | text | no | **referencia** al shared secret (Secret Manager); nunca en claro (H-08) |
| `server` | text | sí | |
| `community` | text | sí | |
| `description` | text | sí | |
| `created_at` | timestamptz | no | |

### B.3 Identidad y anti-spoofing (RF-01..03, RF-17)

#### `devices` — Dispositivos conocidos

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | uuid | no | PK |
| `mac_address` | macaddr | no | UK |
| `label` | text | sí | |
| `last_ip` | inet | sí | |
| `last_gateway_id` | uuid | sí | FK→`gateways` ON DELETE SET NULL |
| `first_seen_at` | timestamptz | no | default `now()` |
| `last_seen_at` | timestamptz | no | default `now()` |
| `blocked` | boolean | no | default false |
| `created_at` | timestamptz | no | default `now()` |
| `updated_at` | timestamptz | no | default `now()`; trigger |

#### `portal_sessions` — Sesión del portal cautivo (RF-01)

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | uuid | no | PK |
| `gateway_id` | uuid | no | FK→`gateways` RESTRICT |
| `device_id` | uuid | sí | FK→`devices` SET NULL |
| `mac_address` | macaddr | no | capturada |
| `ip_address` | inet | no | DHCP |
| `user_agent` | text | sí | |
| `notice_version` | text | no | versión del aviso de privacidad aceptada **antes** de persistir MAC/IP (D52/V2-10) |
| `notice_accepted_at` | timestamptz | no | timestamp de aceptación del aviso (D52) |
| `wallet_address` | text | sí | CHECK EVM; se llena al vincular |
| `session_token_hash` | text | no | UK; SHA-256 del token (nunca el token) |
| `status` | portal_session_status | no | default `pending` |
| `expires_at` | timestamptz | no | caducidad del portal |
| `bound_at` | timestamptz | sí | fin del binding |
| `consumed_at` | timestamptz | sí | token consumido |
| `created_at` | timestamptz | no | default `now()` |
| `updated_at` | timestamptz | no | default `now()`; trigger |

#### `auth_challenges` — Challenge SIWE (RF-03, D6)

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | uuid | no | PK |
| `portal_session_id` | uuid | no | FK→`portal_sessions` CASCADE |
| `nonce` | text | no | UK; aleatorio de un solo uso |
| `message` | text | no | mensaje EIP-4361 |
| `wallet_address` | text | sí | CHECK EVM |
| `issued_at` | timestamptz | no | default `now()` |
| `expires_at` | timestamptz | no | CHECK `> issued_at` |
| `consumed_at` | timestamptz | sí | marca de uso único |
| `signature` | text | sí | firma devuelta por la wallet |

#### `device_bindings` — Binding de identidad (wallet o voucher) (RF-03, RF-17, D6, D18)

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | uuid | no | PK |
| `device_id` | uuid | sí | FK→`devices` SET NULL |
| `portal_session_id` | uuid | no | FK→`portal_sessions` CASCADE |
| `binding_type` | binding_type | no | default `wallet`; `voucher` para equipos hijos |
| `wallet_address` | text | sí | CHECK EVM; obligatorio si `binding_type='wallet'` |
| `voucher_id` | uuid | sí | FK→`vouchers` SET NULL; obligatorio si `binding_type='voucher'` |
| `mac_address` | macaddr | no | |
| `ip_address` | inet | no | |
| `binding_hash` | text | no | UK; hash de `wallet|mac|ip|token` o `voucher|mac|ip|token` |
| `status` | binding_status | no | default `active` |
| `verified_at` | timestamptz | no | default `now()` |
| `revoked_at` | timestamptz | sí | |
| `created_at` | timestamptz | no | |

> CHECK `chk_device_bindings_owner`: o hay wallet (binding de wallet) o hay voucher (binding hijo),
> nunca ambos ni ninguno.

> **Regla anti-spoofing**: índice único parcial — como máximo **un binding `active` por MAC**
> (`uq_device_bindings_active_mac`). Reutilizar una MAC con otra wallet exige revocar el binding
> anterior y queda auditado (RF-17).

### B.4 Sesión y solvencia (RF-05, RF-10..13, RF-19)

#### `hotspot_sessions` — Sesión de red autorizada

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | uuid | no | PK |
| `portal_session_id` | uuid | no | FK→`portal_sessions` |
| `device_binding_id` | uuid | no | FK→`device_bindings` |
| `gateway_id` | uuid | no | FK→`gateways` |
| `tariff_id` | uuid | sí | FK→`gateway_tariffs` SET NULL |
| `access_mode` | session_access_mode | no | default `wallet_stream`; `voucher_child` para hijos |
| `parent_hotspot_session_id` | uuid | sí | FK→`hotspot_sessions` CASCADE; obligatorio si es hijo |
| `voucher_id` | uuid | sí | FK→`vouchers` SET NULL; voucher que habilitó al hijo |
| `bandwidth_percent` | integer | no | default 100; hijos 50; CHECK 1..100 |
| `mac_address` | macaddr | no | |
| `ip_address` | inet | no | |
| `wallet_address` | text | no | CHECK EVM |
| `super_token_address` | text | no | CHECK EVM |
| `sender_wallet` | text | no | CHECK EVM |
| `receiver_wallet` | text | no | CHECK EVM (`payout_wallet`) |
| `flow_rate_wei_s` | numeric(38,0) | no | CHECK ≥ 0 |
| `min_rate_required_wei` | numeric(38,0) | no | CHECK > 0 |
| `status` | hotspot_session_status | no | default `pending` |
| `authorized_at` | timestamptz | sí | |
| `provisional_until` | timestamptz | sí | fin de la ventana provisional (D5) |
| `confirmed_at` | timestamptz | sí | inclusión confirmada |
| `last_health_at` | timestamptz | sí | |
| `disconnected_at` | timestamptz | sí | |
| `disconnect_reason` | text | sí | `flow_deleted`, `insolvent`, `admin`, `timeout`… |
| `router_session_id` | text | sí | id en `/ip/hotspot/active` |
| `radacct_session_id` | text | sí | `Acct-Session-Id` |
| `tx_hash` | text | sí | CHECK hash EVM |
| `created_at` | timestamptz | no | default `now()` |
| `updated_at` | timestamptz | no | default `now()`; trigger |

> **Regla**: índice único parcial — **una sola sesión no terminal por MAC** (`status IN
> ('pending','provisional','active','degraded','revoking')`).
>
> **Modelo padre/hijo (D18)**: la sesión `wallet_stream` es la **padre**: su wallet abre el stream
> hacia `payout_wallet`. Las sesiones `voucher_child` cuelgan de ella (`parent_hotspot_session_id`),
> **no tienen stream propio** (`flow_rate_wei_s = 0`), heredan `sender_wallet`/`super_token_address`
> del padre y navegan con `bandwidth_percent` (50 % por defecto). Si el stream del padre cae, el
> `ON DELETE CASCADE` y el health-check revocan a todos los hijos. `wallet_address` de un hijo = la
> wallet responsable (la del padre).
>
> **Unicidad flow ↔ sesión (D56)**: índice único parcial `uq_hotspot_sessions_active_flow` sobre
> `(super_token_address, sender_wallet, receiver_wallet)` para sesiones no terminales: un flow activo
> autoriza **una sola sesión padre**; los demás dispositivos del usuario entran por voucher como
> hijos. La solvencia del hijo se evalúa sobre la sesión padre viva y solvente (D34).
>
> **Cupo de hijos por sesión viva (D55)**: `vouchers.children_used` cuenta hijos **conectados** y
> decrece al desconectarse (permite reconexión), con tope `max_children` (2) y límite global
> `gateway_tariffs.max_children_per_parent` (default 5). El contador lo mantiene el trigger
> `sync_voucher_children()` a partir de las redenciones vivas (`voucher_redemptions.released_at IS NULL`).

#### `session_health_checks` — Muestras de solvencia (RF-13)

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | bigserial | no | PK |
| `hotspot_session_id` | uuid | no | FK→`hotspot_sessions` CASCADE |
| `checked_at` | timestamptz | no | default `now()` |
| `flow_rate_wei_s` | numeric(38,0) | no | leído on-chain |
| `min_rate_required_wei` | numeric(38,0) | no | tarifa vigente |
| `virtual_balance_wei` | numeric(38,0) | no | `virtualBalanceOf(sender)` |
| `is_solvent` | boolean | no | |
| `action` | health_action | no | default `none`; acción tomada |
| `latency_ms` | int | sí | latencia del ciclo |
| `details` | jsonb | no | default `{}` |

### B.5 Puente blockchain (RF-07, RF-08)

#### `flow_events` — Eventos EVM indexados

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | bigserial | no | PK |
| `chain_id` | bigint | no | |
| `contract_address` | text | no | CHECK EVM |
| `event_type` | flow_event_type | no | normalizado (brief + v1) |
| `tx_hash` | text | no | CHECK `^0x[0-9a-fA-F]{64}$` |
| `log_index` | int | no | CHECK ≥ 0 |
| `block_number` | bigint | no | |
| `block_hash` | text | sí | |
| `sender_wallet` | text | sí | CHECK EVM |
| `receiver_wallet` | text | sí | CHECK EVM |
| `flow_rate_wei_s` | numeric(38,0) | sí | |
| `amount_wei` | numeric(38,0) | sí | para Settled/Claimed/Wrapped |
| `payload` | jsonb | no | default `{}`; log crudo |
| `processing_status` | event_processing_status | no | default `received` |
| `processing_error` | text | sí | |
| `observed_at` | timestamptz | no | default `now()` |
| `processed_at` | timestamptz | sí | |
| `pseudonymized_at` | timestamptz | sí | marca de seudonimización RGPD de wallet/datos personales (D52) |

> **UK `(chain_id, tx_hash, log_index)`** garantiza idempotencia del indexador (RNF-05).

#### `flow_subscriptions` — Read model del estado de cada flow

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | uuid | no | PK |
| `chain_id` | bigint | no | |
| `contract_address` | text | no | CHECK EVM |
| `sender_wallet` | text | no | CHECK EVM |
| `receiver_wallet` | text | no | CHECK EVM |
| `flow_rate_wei_s` | numeric(38,0) | no | default 0; CHECK ≥ 0 |
| `status` | flow_status | no | default `active` |
| `last_update_timestamp` | timestamptz | no | |
| `accumulated_wei` | numeric(38,0) | no | default 0 |
| `last_event_id` | bigint | sí | FK→`flow_events` SET NULL |
| `pseudonymized_at` | timestamptz | sí | marca de seudonimización RGPD (D52) |
| `updated_at` | timestamptz | no | |

> UK `(chain_id, contract_address, sender_wallet, receiver_wallet)`.

#### `indexer_checkpoints` — Cursor del indexador (RF-07, D8)

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | bigserial | no | PK |
| `chain_id` | bigint | no | |
| `contract_address` | text | no | CHECK EVM |
| `last_processed_block` | bigint | no | default 0 |
| `last_processed_log_index` | int | no | default -1 |
| `leased_by` | text | sí | instancia/Job que posee el lease; vacío si libre (H-11) |
| `lease_expires_at` | timestamptz | sí | caducidad del lease (H-11) |
| `version` | bigint | no | default 0; CAS optimista del cursor (H-11) |
| `updated_at` | timestamptz | no | default `now()` |

> UK `(chain_id, contract_address)`.

### B.6 Comandos y auditoría (RF-10, RF-11, RF-18, RF-20)

#### `access_commands` — Comandos enviados al gateway

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | uuid | no | PK |
| `hotspot_session_id` | uuid | sí | FK→`hotspot_sessions` SET NULL |
| `gateway_id` | uuid | no | FK→`gateways` |
| `command_type` | access_command_type | no | |
| `transport` | access_transport | no | adaptador usado |
| `idempotency_key` | text | no | UK; evita duplicados (RNF-06) |
| `request_payload` | jsonb | no | default `{}` |
| `response_payload` | jsonb | sí | |
| `radius_code` | text | sí | Access-Accept / CoA-ACK / Disconnect-ACK… |
| `status` | command_status | no | default `pending` |
| `attempts` | int | no | default 0; CHECK ≥ 0 |
| `latency_ms` | int | sí | |
| `error` | text | sí | |
| `created_at` | timestamptz | no | default `now()` |
| `completed_at` | timestamptz | sí | |

#### `operators` — Usuarios administradores (RF-15)

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | uuid | no | PK |
| `username` | text | no | UK |
| `email` | text | sí | |
| `password_hash` | text | no | Argon2/bcrypt |
| `role` | operator_role | no | default `operator` |
| `is_active` | boolean | no | default true |
| `totp_secret_ref` | text | sí | referencia a secreto |
| `api_key_hash` | text | sí | SHA-256 de la API key (D49) |
| `api_key_prefix` | text | sí | prefijo visible para identificar la key (D49) |
| `api_key_scopes` | jsonb | no | default `[]`; scopes RBAC (D49) |
| `api_key_expires_at` | timestamptz | sí | caducidad de la API key (D49) |
| `api_key_last_used_at` | timestamptz | sí | último uso (D49) |
| `api_key_revoked_at` | timestamptz | sí | revocación (D49) |
| `last_login_at` | timestamptz | sí | |
| `created_at` | timestamptz | no | default `now()` |
| `updated_at` | timestamptz | no | default `now()`; trigger |

#### `audit_log` — Traza de acciones (RF-18, RNF-12)

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | bigserial | no | PK |
| `operator_id` | uuid | sí | FK→`operators` SET NULL |
| `actor` | text | no | default `system` |
| `action` | text | no | verbo de negocio |
| `entity_type` | text | sí | |
| `entity_id` | text | sí | |
| `details` | jsonb | no | default `{}` |
| `ip_address` | inet | sí | |
| `created_at` | timestamptz | no | default `now()` |

### B.7 RADIUS — autorización y accounting (RT-07, RF-21)

#### `radcheck` — Atributos de comprobación (FreeRADIUS)

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | bigserial | no | PK |
| `username` | text | no | MAC (`Calling-Station-Id`) |
| `attribute` | text | no | p. ej. `Cleartext-Password` |
| `op` | char(2) | no | default `:=` |
| `value` | text | no | UK `(username, attribute, op)` |

#### `radreply` — Atributos de respuesta (FreeRADIUS)

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | bigserial | no | PK |
| `username` | text | no | MAC |
| `attribute` | text | no | p. ej. `Session-Timeout` |
| `op` | char(2) | no | default `=` |
| `value` | text | no | UK `(username, attribute, op)` |

#### `radacct` — Accounting de sesiones

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `radacctid` | bigserial | no | PK |
| `acctsessionid` | text | no | `Acct-Session-Id` |
| `acctuniqueid` | text | no | UK |
| `username` | text | no | MAC |
| `groupname` | text | sí | |
| `realm` | text | sí | |
| `nasipaddress` | inet | no | |
| `nasportid` | text | sí | |
| `nasporttype` | text | sí | |
| `acctstarttime` | timestamptz | sí | |
| `acctupdatetime` | timestamptz | sí | |
| `acctstoptime` | timestamptz | sí | |
| `acctsessiontime` | bigint | sí | segundos |
| `acctauthentic` | text | sí | |
| `connectinfo_start` | text | sí | |
| `connectinfo_stop` | text | sí | |
| `acctinputoctets` | bigint | sí | |
| `acctoutputoctets` | bigint | sí | |
| `calledstationid` | text | sí | |
| `callingstationid` | text | sí | MAC del cliente |
| `acctterminatecause` | text | sí | `User-Request`, `Session-Timeout`… |
| `servicetype` | text | sí | |
| `framedprotocol` | text | sí | |
| `framedipaddress` | inet | sí | |

### B.8 Vouchers — acceso de equipos hijos sin wallet (P5, D18, RF-25)

> **Modelo**: la wallet **padre** abre el stream y genera un **voucher**; el voucher permite conectar
> hasta `max_children` dispositivos **hijos sin wallet**, con **ancho de banda limitado**
> (`bandwidth_percent`, 50 % por defecto) y **mientras dure el stream del padre**.

#### `vouchers` — Código hijo ligado a un stream padre

| Campo | Tipo | Nulo | Descripción / regla |
|---|---|---|---|
| `id` | uuid | no | PK |
| `code_hash` | text | no | UK; SHA-256 del código (**nunca** el código en claro) |
| `gateway_id` | uuid | no | FK→`gateways` CASCADE |
| `tariff_id` | uuid | sí | FK→`gateway_tariffs` SET NULL |
| `parent_hotspot_session_id` | uuid | no | FK→`hotspot_sessions` CASCADE; **stream padre** |
| `plan_name` | text | sí | etiqueta del plan |
| `max_children` | integer | no | default **2**; CHECK 1..10 |
| `children_used` | integer | no | default 0; CHECK ≥ 0 y ≤ `max_children` |
| `bandwidth_percent` | integer | no | default **50**; CHECK 1..100 |
| `status` | voucher_status | no | default `active` |
| `valid_from` | timestamptz | no | default `now()` |
| `valid_to` | timestamptz | no | default `now() + 90 días`; CHECK `> valid_from` |
| `created_by` | uuid | sí | FK→`operators` SET NULL |
| `created_at` | timestamptz | no | default `now()` |
| `updated_at` | timestamptz | no | default `now()`; trigger |

#### `voucher_redemptions` — Canjes efectivos (alta de cada hijo)

| Campo | Tipo | Nulo | Descripción / regla |
|---|---|---|---|
| `id` | uuid | no | PK |
| `voucher_id` | uuid | no | FK→`vouchers` CASCADE |
| `portal_session_id` | uuid | no | FK→`portal_sessions` CASCADE; UK junto a `voucher_id` |
| `hotspot_session_id` | uuid | sí | FK→`hotspot_sessions` SET NULL; sesión **hija** creada |
| `mac_address` | macaddr | no | dispositivo hijo que canjea |
| `ip_address` | inet | no | |
| `redeemed_at` | timestamptz | no | default `now()` |
| `released_at` | timestamptz | sí | liberación de la redención al desconectarse (D55/V2-04); `NULL` = viva |

> **Flujo (RF-25)**: (1) la wallet abre el stream → sesión padre `wallet_stream`; (2) el padre
> solicita un voucher → se genera un código aleatorio de 12 chars Crockford Base32, se guarda su
> **SHA-256** y se devuelve **una sola vez**; (3) un equipo hijo sin wallet abre el portal, teclea el
> código → el orquestador valida `status='active'`, vigencia, `children_used < max_children` y que
> el **stream padre siga vivo**; (4) crea binding `binding_type='voucher'`, sesión
> `voucher_child` con `bandwidth_percent` del voucher, incrementa `children_used` y autoriza el
> gateway con QoS; (5) al caer el stream padre se revocan padre e hijos. El código nunca se guarda
> ni se loguea en claro.
>
> **Atomicidad (H-20)**: el canje completo ocurre en una transacción con `SELECT ... FOR UPDATE`
> sobre el voucher; `redeemed` se alcanza únicamente cuando `children_used == max_children`.
> El índice único parcial `uq_voucher_redemptions_live_mac` impide que un mismo dispositivo tenga
> **dos redenciones vivas** del mismo voucher; al liberarse (`released_at`), puede reconectar (D55/V2-04).

### B.9 Vista de operación

#### `v_active_sessions` (vista)

Proyección de `hotspot_sessions` (estados no terminales) unida a `gateways`, `gateway_tariffs` y
`devices`, con: `session_id`, `mac_address`, `ip_address`, `wallet_address`, `gateway_name`,
`vendor`, `flow_rate_wei_s`, `min_rate_required_wei`, `status`, `authorized_at`,
`provisional_until`, `last_health_at`, `seconds_active`. Usada por el panel de operador y el
health-check.

---

## Relaciones

**On-chain** (heredadas de v1):

- `EUR_TOKEN ||--o| FACTORY` (par registrado) · `FACTORY ||--|| SUPER_TOKEN` (crea par)
- `SUPER_TOKEN ||--o{ FLOW` (transporta) · `SUPER_TOKEN ||--o{ AGGREGATOR` (agrega por cuenta)
- `AGGREGATOR ||--o{ FLOW` (garantiza)

**Off-chain** (nuevas):

- `gateways ||--o{ gateway_tariffs` — cada gateway define tarifas · `gateways ||--o{ nas` (RADIUS)
- `gateways ||--o{ devices` (último gateway visto) · `gateways ||--o{ portal_sessions`
- `devices ||--o{ portal_sessions` · `portal_sessions ||--o{ auth_challenges`
- `portal_sessions ||--o{ device_bindings` · `device_bindings ||--o{ hotspot_sessions`
- `portal_sessions ||--o{ hotspot_sessions` · `gateways ||--o{ hotspot_sessions`
- `gateway_tariffs ||--o{ hotspot_sessions` · `hotspot_sessions ||--o{ session_health_checks`
- `hotspot_sessions ||--o{ access_commands` · `gateways ||--o{ access_commands`
- `flow_events ||--o{ flow_subscriptions` (último evento aplicado)
- `gateways ||--o{ flow_events` (por `chain_id`+`contract_address`, relación lógica)
- `operators ||--o{ audit_log`
- `gateways ||--o{ vouchers` · `gateway_tariffs ||--o{ vouchers` · `operators ||--o{ vouchers`
- `hotspot_sessions ||--o{ vouchers` (la sesión padre origina vouchers)
- `vouchers ||--o{ voucher_redemptions` · `portal_sessions ||--o{ voucher_redemptions`
- `hotspot_sessions ||--o{ voucher_redemptions` (sesión hija creada por el canje)
- `vouchers ||--o{ device_bindings` (binding de tipo voucher)
- `hotspot_sessions ||--o{ hotspot_sessions` (padre `wallet_stream` → hijos `voucher_child`)
- `nas`, `radcheck`, `radreply`, `radacct` — sin FK (integración FreeRADIUS por `username`/`nasipaddress`)

> Regla de sincronía: cualquier cambio en una tabla se refleja en los otros dos artefactos en el
> mismo turno.
