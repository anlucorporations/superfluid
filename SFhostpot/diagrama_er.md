# Diagrama Entidad-Relación — SFhostpot (Superfluid Hotspot v1)

> Modelo completo, por dominios, en Mermaid (`erDiagram`). Nombres de entidades y atributos
> **idénticos** a `diccionario_datos.md` y `base_datos.sql` (sincronizados).
> Incluye el modelo lógico **on-chain** (Parte A, token propio BRLT / BRLTx adaptado de v1) y el
> modelo relacional **PostgreSQL nuevo** (Parte B, 20 tablas).

---

## 1. Vista global (entidades principales)

```mermaid
erDiagram
    GATEWAYS ||--o{ GATEWAY_TARIFFS : "define tarifas"
    GATEWAYS ||--o{ NAS : "es NAS RADIUS"
    GATEWAYS ||--o{ PORTAL_SESSIONS : "sirve portales"
    GATEWAYS ||--o{ HOTSPOT_SESSIONS : "autoriza sesiones"
    GATEWAYS ||--o{ ACCESS_COMMANDS : "recibe comandos"
    GATEWAYS ||--o{ FLOW_EVENTS : "publica eventos"
    GATEWAYS ||--o{ DEVICES : "ultimo gateway visto"

    DEVICES ||--o{ PORTAL_SESSIONS : "origina"
    PORTAL_SESSIONS ||--o{ AUTH_CHALLENGES : "emite challenge"
    PORTAL_SESSIONS ||--o{ DEVICE_BINDINGS : "liga"
    PORTAL_SESSIONS ||--o{ HOTSPOT_SESSIONS : "deriva en"

    DEVICE_BINDINGS ||--o{ HOTSPOT_SESSIONS : "habilita"
    GATEWAY_TARIFFS ||--o{ HOTSPOT_SESSIONS : "tarifa"
    HOTSPOT_SESSIONS ||--o{ SESSION_HEALTH_CHECKS : "mide solvencia"
    HOTSPOT_SESSIONS ||--o{ ACCESS_COMMANDS : "genera"

    GATEWAYS ||--o{ VOUCHERS : "emite"
    GATEWAY_TARIFFS ||--o{ VOUCHERS : "aplica"
    OPERATORS ||--o{ VOUCHERS : "crea"
    HOTSPOT_SESSIONS ||--o{ VOUCHERS : "padre origina"
    VOUCHERS ||--o{ VOUCHER_REDEMPTIONS : "se canjea en"
    VOUCHERS ||--o{ DEVICE_BINDINGS : "liga hijos"
    PORTAL_SESSIONS ||--o{ VOUCHER_REDEMPTIONS : "registra"
    HOTSPOT_SESSIONS ||--o{ HOTSPOT_SESSIONS : "padre a hijos"

    FLOW_EVENTS ||--o{ FLOW_SUBSCRIPTIONS : "actualiza"

    OPERATORS ||--o{ AUDIT_LOG : "ejecuta"

    GATEWAYS {
        uuid id PK
        uuid tenant_id "multi-tenant futuro (D11)"
        text name UK
        gateway_vendor vendor "mikrotik_rest|radius|mock|generic"
        gateway_status status "online|offline|maintenance|disabled"
        bigint chain_id "default 81234 (D1)"
        text super_token_address "CHECK EVM"
        text mgmt_url "REST MikroTik"
        inet radius_nas_ip "si vendor=radius"
        int radius_coa_port "default 3799"
        timestamptz created_at
        timestamptz updated_at
    }

    PORTAL_SESSIONS {
        uuid id PK
        uuid gateway_id FK
        uuid device_id FK
        macaddr mac_address
        inet ip_address
        text wallet_address "CHECK EVM"
        text session_token_hash UK "SHA-256 del token"
        portal_session_status status
        timestamptz expires_at
        timestamptz created_at
    }

    DEVICE_BINDINGS {
        uuid id PK
        uuid portal_session_id FK
        binding_type binding_type "wallet|voucher"
        text wallet_address "nullable; CHECK EVM"
        uuid voucher_id FK "si binding_type=voucher"
        macaddr mac_address "un binding activo por MAC"
        inet ip_address
        text binding_hash UK "wallet|mac|ip|token"
        binding_status status
        timestamptz verified_at
    }

    HOTSPOT_SESSIONS {
        uuid id PK
        uuid gateway_id FK
        uuid tariff_id FK
        session_access_mode access_mode "wallet_stream|voucher_child"
        uuid parent_hotspot_session_id FK "null en padre"
        uuid voucher_id FK "si es hijo"
        integer bandwidth_percent "hijo 50; CHECK 1..100"
        macaddr mac_address "una sesion no terminal por MAC"
        inet ip_address
        text wallet_address "responsable; CHECK EVM"
        numeric flow_rate_wei_s "hijo: 0"
        numeric min_rate_required_wei
        hotspot_session_status status
        timestamptz authorized_at
        timestamptz disconnected_at
        text disconnect_reason
    }

    VOUCHERS {
        uuid id PK
        text code_hash UK "SHA-256 del codigo"
        uuid gateway_id FK
        uuid tariff_id FK
        uuid parent_hotspot_session_id FK "stream padre"
        integer max_children "default 2"
        integer children_used
        integer bandwidth_percent "default 50"
        voucher_status status
        timestamptz valid_to "default +90 dias"
    }

    VOUCHER_REDEMPTIONS {
        uuid id PK
        uuid voucher_id FK
        uuid portal_session_id FK "UK con voucher_id"
        uuid hotspot_session_id FK "sesion hija"
        macaddr mac_address
        inet ip_address
        timestamptz redeemed_at
        timestamptz released_at "NULL = redencion viva (D55)"
    }

    ACCESS_COMMANDS {
        uuid id PK
        uuid hotspot_session_id FK
        uuid gateway_id FK
        access_command_type command_type
        access_transport transport
        text idempotency_key UK
        command_status status
        int attempts
        int latency_ms
    }

    OPERATORS {
        uuid id PK
        text username UK
        text password_hash
        operator_role role
        boolean is_active
    }

    AUDIT_LOG {
        bigserial id PK
        uuid operator_id FK
        text actor
        text action
        jsonb details
        timestamptz created_at
    }

    FLOW_EVENTS {
        bigserial id PK
        bigint chain_id
        flow_event_type event_type "normalizado brief+v1"
        text tx_hash "UK con log_index"
        int log_index "UK con tx_hash"
        bigint block_number
        text sender_wallet "CHECK EVM"
        text receiver_wallet "CHECK EVM"
        numeric flow_rate_wei_s
        event_processing_status processing_status
    }
```

---

## 2. Modelo on-chain (Parte A — token propio BRLT / BRLTx, adaptado de v1)

```mermaid
erDiagram
    BRLT_TOKEN ||--o| BRLT_FACTORY : "registrado en"
    BRLT_FACTORY ||--|| BRLTX_SUPER_TOKEN : "crea par"
    BRLTX_SUPER_TOKEN ||--o{ FLOW : "transporta"
    BRLTX_SUPER_TOKEN ||--o{ AGGREGATOR : "agrega por cuenta"
    AGGREGATOR ||--o{ FLOW : "garantiza"

    BRLT_TOKEN {
        address contract_address PK "BarloventoToken.sol (BRLT)"
        uint256 total_supply "hard-cap 10_000_000e18"
        uint8 decimals "18"
        address owner "mint/burn"
    }

    BRLT_FACTORY {
        address underlying PK_FK "BRLT_TOKEN 1:1 por par"
        address superToken "BRLTx del par"
        address owner "registro de pares"
    }

    BRLTX_SUPER_TOKEN {
        address contract_address PK "BarloventoTx.sol (BRLTx)"
        address underlying FK "BRLT_TOKEN"
        uint8 decimals "18"
        uint256 totalSupplyX "== BRLT retenido (custodia)"
    }

    FLOW {
        address sender PK_FK "wallet del usuario (emisor)"
        address receiver PK_FK "payout_wallet del gateway"
        int96 flowRate "wei/s >= tariff"
        uint8 status "Active(0) Paused(1) Closed(2)"
        uint40 lastUpdateTimestamp
        uint128 accumulatedBalance
    }

    AGGREGATOR {
        address account PK
        int96 netFlowRate "solo activos"
        int96 netOutflowGarantizado "activos+pausados"
        uint256 depositTotal "netOutflowGarantizado x 3600"
        uint40 settledUpTo "solo timestamp"
        uint256 pendingDeficit
        uint128 pendingPool
    }
```

> El brief habla de `FlowUpdated`/`FlowDeleted`; el indexador los normaliza desde
> `FlowCreated/Resumed` (updated, rate>0), `FlowPaused` (updated, rate=0) y `FlowClosed`
> (deleted). Ver `flow_events.event_type`.

---

## 3. Dominio: configuración de red

```mermaid
erDiagram
    GATEWAYS ||--o{ GATEWAY_TARIFFS : "define"
    GATEWAYS ||--o{ NAS : "se autentica contra"

    GATEWAYS {
        uuid id PK
        uuid tenant_id
        text name UK
        gateway_vendor vendor
        gateway_status status
        text location
        text description
        bigint chain_id
        text super_token_address
        text mgmt_url
        text mgmt_username
        text mgmt_secret_ref "referencia a secreto"
        inet radius_nas_ip
        text radius_secret_ref
        int radius_coa_port
        int radius_auth_port
        int radius_acct_port
        timestamptz last_health_at
        jsonb metadata
        timestamptz created_at
        timestamptz updated_at
    }

    GATEWAY_TARIFFS {
        uuid id PK
        uuid gateway_id FK
        text name UK
        numeric price_per_second_wei "CHECK > 0"
        text token_address "CHECK EVM"
        text payout_wallet "autoridad unica (H-24)"
        integer bandwidth_down_bps "default 50 Mbps (H-05)"
        integer bandwidth_up_bps "default 10 Mbps (H-05)"
        integer max_children_per_parent "default 5 (D55)"
        numeric min_deposit_wei
        int provisional_seconds "default 60 (D5)"
        int buffer_seconds "default 3600"
        boolean active
        timestamptz valid_from
        timestamptz valid_to
        timestamptz created_at
        timestamptz updated_at
    }

    NAS {
        bigserial id PK
        text nasname UK
        text shortname
        text type
        int ports
        text secret_ref "referencia a secreto (H-08)"
        text server
        text description
        timestamptz created_at
    }
```

---

## 4. Dominio: identidad y anti-spoofing

```mermaid
erDiagram
    DEVICES ||--o{ PORTAL_SESSIONS : "origina"
    GATEWAYS ||--o{ DEVICES : "ultimo visto"
    GATEWAYS ||--o{ PORTAL_SESSIONS : "sirve"
    PORTAL_SESSIONS ||--o{ AUTH_CHALLENGES : "emite"
    PORTAL_SESSIONS ||--o{ DEVICE_BINDINGS : "liga"
    DEVICES ||--o{ DEVICE_BINDINGS : "se liga a"
    VOUCHERS ||--o{ DEVICE_BINDINGS : "liga hijos"

    DEVICES {
        uuid id PK
        macaddr mac_address UK
        text label
        inet last_ip
        uuid last_gateway_id FK
        timestamptz first_seen_at
        timestamptz last_seen_at
        boolean blocked
        timestamptz created_at
        timestamptz updated_at
    }

    PORTAL_SESSIONS {
        uuid id PK
        uuid gateway_id FK
        uuid device_id FK
        macaddr mac_address
        inet ip_address
        text user_agent
        text notice_version "aviso previo (D52)"
        timestamptz notice_accepted_at
        text wallet_address
        text session_token_hash UK
        portal_session_status status
        timestamptz expires_at
        timestamptz bound_at
        timestamptz consumed_at
        timestamptz created_at
        timestamptz updated_at
    }

    AUTH_CHALLENGES {
        uuid id PK
        uuid portal_session_id FK
        text nonce UK
        text message "EIP-4361"
        text wallet_address
        timestamptz issued_at
        timestamptz expires_at
        timestamptz consumed_at
        text signature
    }

    DEVICE_BINDINGS {
        uuid id PK
        uuid device_id FK
        uuid portal_session_id FK
        binding_type binding_type "wallet|voucher"
        text wallet_address "nullable; CHECK EVM"
        uuid voucher_id FK "si binding_type=voucher"
        macaddr mac_address "UK parcial activo"
        inet ip_address
        text binding_hash UK
        binding_status status
        timestamptz verified_at
        timestamptz revoked_at
        timestamptz created_at
    }
```

---

## 5. Dominio: sesión de red y solvencia

```mermaid
erDiagram
    PORTAL_SESSIONS ||--o{ HOTSPOT_SESSIONS : "deriva en"
    DEVICE_BINDINGS ||--o{ HOTSPOT_SESSIONS : "habilita"
    GATEWAYS ||--o{ HOTSPOT_SESSIONS : "autoriza"
    GATEWAY_TARIFFS ||--o{ HOTSPOT_SESSIONS : "aplica"
    HOTSPOT_SESSIONS ||--o{ SESSION_HEALTH_CHECKS : "mide"
    HOTSPOT_SESSIONS ||--o{ HOTSPOT_SESSIONS : "padre a hijos"
    HOTSPOT_SESSIONS ||--o{ VOUCHERS : "padre origina"

    HOTSPOT_SESSIONS {
        uuid id PK
        uuid portal_session_id FK
        uuid device_binding_id FK
        uuid gateway_id FK
        uuid tariff_id FK
        session_access_mode access_mode "wallet_stream|voucher_child"
        uuid parent_hotspot_session_id FK "null en padre"
        uuid voucher_id FK "si es hijo"
        integer bandwidth_percent "hijo 50; CHECK 1..100"
        macaddr mac_address "UK parcial no terminal"
        inet ip_address
        text wallet_address "responsable; CHECK EVM"
        text super_token_address
        text sender_wallet
        text receiver_wallet
        numeric flow_rate_wei_s "hijo: 0"
        numeric min_rate_required_wei
        hotspot_session_status status "pending..revoked"
        timestamptz authorized_at
        timestamptz provisional_until
        timestamptz confirmed_at
        timestamptz last_health_at
        timestamptz disconnected_at
        text disconnect_reason
        text router_session_id
        text radacct_session_id
        text tx_hash
        timestamptz created_at
        timestamptz updated_at
    }

    SESSION_HEALTH_CHECKS {
        bigserial id PK
        uuid hotspot_session_id FK
        timestamptz checked_at
        numeric flow_rate_wei_s
        numeric min_rate_required_wei
        numeric virtual_balance_wei
        boolean is_solvent
        health_action action
        int latency_ms
        jsonb details
    }
```

---

## 6. Dominio: puente blockchain (índice de eventos)

```mermaid
erDiagram
    FLOW_EVENTS ||--o{ FLOW_SUBSCRIPTIONS : "aplica ultimo evento"
    GATEWAYS ||--o{ FLOW_EVENTS : "chain+contrato"

    FLOW_EVENTS {
        bigserial id PK
        bigint chain_id
        text contract_address "CHECK EVM"
        flow_event_type event_type "normalizado brief+v1"
        text tx_hash "UK con log_index"
        int log_index "UK con tx_hash"
        bigint block_number
        text block_hash
        text sender_wallet
        text receiver_wallet
        numeric flow_rate_wei_s
        numeric amount_wei
        jsonb payload
        event_processing_status processing_status
        text processing_error
        timestamptz observed_at
        timestamptz processed_at
        timestamptz pseudonymized_at "RGPD (D52)"
    }

    FLOW_SUBSCRIPTIONS {
        uuid id PK
        bigint chain_id
        text contract_address
        text sender_wallet
        text receiver_wallet
        numeric flow_rate_wei_s
        flow_status status "active|paused|closed"
        timestamptz last_update_timestamp
        numeric accumulated_wei
        bigint last_event_id FK
        timestamptz pseudonymized_at "RGPD (D52)"
        timestamptz updated_at
    }
```

```mermaid
erDiagram
    INDEXER_CHECKPOINTS {
        bigserial id PK
        bigint chain_id "UK con contract_address"
        text contract_address "UK con chain_id"
        bigint last_processed_block
        int last_processed_log_index "default -1"
        text leased_by "lease del Job (H-11)"
        timestamptz lease_expires_at
        bigint version "CAS optimista (H-11)"
        timestamptz updated_at
    }
```

> `indexer_checkpoints` no tiene relaciones físicas (cursor por contrato). La **vista**
> `v_active_sessions` (definida en `base_datos.sql`) es una proyección de `hotspot_sessions` +
> `gateways` + `gateway_tariffs` + `devices`, documentada en `diccionario_datos.md` §B.9.

---

## 7. Dominio: comandos, operadores y RADIUS

```mermaid
erDiagram
    HOTSPOT_SESSIONS ||--o{ ACCESS_COMMANDS : "genera"
    GATEWAYS ||--o{ ACCESS_COMMANDS : "recibe"
    OPERATORS ||--o{ AUDIT_LOG : "ejecuta"

    ACCESS_COMMANDS {
        uuid id PK
        uuid hotspot_session_id FK
        uuid gateway_id FK
        access_command_type command_type
        access_transport transport
        text idempotency_key UK
        jsonb request_payload
        jsonb response_payload
        text radius_code
        command_status status
        int attempts
        int latency_ms
        text error
        timestamptz created_at
        timestamptz completed_at
    }

    OPERATORS {
        uuid id PK
        text username UK
        text email
        text password_hash "Argon2/bcrypt"
        operator_role role "admin|operator|readonly|auditor|dpo (D49)"
        boolean is_active
        text totp_secret_ref
        text api_key_hash "SHA-256 (D49)"
        text api_key_prefix
        jsonb api_key_scopes
        timestamptz api_key_expires_at
        timestamptz api_key_last_used_at
        timestamptz api_key_revoked_at
        timestamptz last_login_at
        timestamptz created_at
        timestamptz updated_at
    }

    AUDIT_LOG {
        bigserial id PK
        uuid operator_id FK
        text actor
        text action
        text entity_type
        text entity_id
        jsonb details
        inet ip_address
        timestamptz created_at
    }

    NAS {
        bigserial id PK
        text nasname UK
        text secret_ref "referencia (H-08)"
    }

    RADCHECK {
        bigserial id PK
        text username "MAC"
        text attribute
        char op
        text value
    }

    RADREPLY {
        bigserial id PK
        text username "MAC"
        text attribute
        char op
        text value
    }

    RADACCT {
        bigserial radacctid PK
        text acctsessionid
        text acctuniqueid UK
        text username
        inet nasipaddress
        timestamptz acctstarttime
        timestamptz acctstoptime
        bigint acctsessiontime
        bigint acctinputoctets
        bigint acctoutputoctets
        text callingstationid "MAC"
        text acctterminatecause
        inet framedipaddress
    }
```

> `nas`, `radcheck`, `radreply` y `radacct` no llevan FK hacia el modelo propio: FreeRADIUS los
> consume por `username` (MAC) y `nasname`/`nasipaddress`.

---

## 8. Dominio: vouchers — acceso de equipos hijos (P5, D18)

```mermaid
erDiagram
    HOTSPOT_SESSIONS ||--o{ VOUCHERS : "padre origina"
    GATEWAYS ||--o{ VOUCHERS : "emite"
    GATEWAY_TARIFFS ||--o{ VOUCHERS : "aplica"
    OPERATORS ||--o{ VOUCHERS : "crea"
    VOUCHERS ||--o{ VOUCHER_REDEMPTIONS : "se canjea en"
    VOUCHERS ||--o{ DEVICE_BINDINGS : "liga hijos"
    PORTAL_SESSIONS ||--o{ VOUCHER_REDEMPTIONS : "registra"
    HOTSPOT_SESSIONS ||--o{ HOTSPOT_SESSIONS : "padre a hijos"
    HOTSPOT_SESSIONS ||--o{ VOUCHER_REDEMPTIONS : "sesion hija"

    VOUCHERS {
        uuid id PK
        text code_hash UK "SHA-256; nunca en claro"
        uuid gateway_id FK
        uuid tariff_id FK
        uuid parent_hotspot_session_id FK "stream padre"
        text plan_name
        integer max_children "default 2; 1..10"
        integer children_used "<= max_children"
        integer bandwidth_percent "default 50; 1..100"
        voucher_status status "active|redeemed|expired|revoked"
        timestamptz valid_from
        timestamptz valid_to "default +90 dias"
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
    }

    VOUCHER_REDEMPTIONS {
        uuid id PK
        uuid voucher_id FK
        uuid portal_session_id FK "UK con voucher_id"
        uuid hotspot_session_id FK "sesion hija"
        macaddr mac_address
        inet ip_address
        timestamptz redeemed_at
        timestamptz released_at "NULL = redencion viva (D55)"
    }
```

> **Regla padre/hijo**: el voucher **no** autoriza por sí solo; se crea **después** de que la wallet
> padre tenga stream activo (`parent_hotspot_session_id`). Cada canje crea una sesión
> `voucher_child` con `bandwidth_percent` del voucher (50 % por defecto) y sin stream propio. Si el
> stream del padre cae, se revocan todos los hijos.

---

## Notas de sincronía

- Clave de `FLOW` on-chain: `(sender, receiver)` dentro de cada Super Token.
- `flow_events` es idempotente por UK `(chain_id, tx_hash, log_index)`.
- `device_bindings` y `hotspot_sessions` usan **índices únicos parciales** (un binding activo por
  MAC; una sesión no terminal por MAC) — ver `base_datos.sql`.
- **Unicidad flow ↔ sesión (D56)**: `uq_hotspot_sessions_active_flow` sobre
  `(super_token_address, sender_wallet, receiver_wallet)` **solo para `access_mode='wallet_stream'`**
  (los hijos heredan la terna y no deben colisionar).
- `gateway_tariffs.payout_wallet` debe coincidir con `FLOW.receiver` on-chain; el validador lo
  verifica (RF-09).
- **Modelo padre/hijo (D18)**: `hotspot_sessions.parent_hotspot_session_id` es auto-referencia
  (`wallet_stream` → `voucher_child`); los hijos no tienen stream propio y heredan el del padre.
- Toda cantidad monetaria es `numeric(38,0)` en wei; jamás `float`/`double`.
