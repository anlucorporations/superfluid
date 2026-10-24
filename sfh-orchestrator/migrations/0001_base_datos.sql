-- =============================================================================
-- base_datos.sql — SFhostpot (Superfluid Hotspot v1)
-- =============================================================================
-- Propósito : Crear la base relacional PostgreSQL 15+ del orquestador de hotspot
--             Pay-As-You-Go: configuración de gateways/tarifas, identidad y
--             anti-spoofing, sesiones de red y solvencia, índice de eventos
--             blockchain, comandos de acceso, auditoría y accounting RADIUS.
-- Motor     : PostgreSQL 15+ (compatible 14+; validado en Cloud SQL 15.18).
-- Uso       : psql "postgresql://<user>@<host>:5432/<db>" -v ON_ERROR_STOP=1 -f SFhostpot/base_datos.sql
-- Nota      : El estado autoritativo de los flujos vive en la blockchain
--             (BarloventoTx.sol, adaptado del proyecto v1); este esquema es el
--             centro de operaciones off-chain. Sin credenciales ni secretos:
--             los secretos se referencian (mgmt_secret_ref, radius_secret_ref)
--             y se resuelven por Secret Manager / entorno.
--
-- Changelog :
--   v1.0 (Fase 1 · Concepto) — Esquema inicial de 18 tablas + 13 enums + vista
--        + triggers de updated_at + seeds de desarrollo (gateway mock + tarifa).
--        Sincronizado con diccionario_datos.md y diagrama_er.md.
--   v1.1 (Fase 1 · entrevista P1–P9 resuelta, 2026-10-15) — Token propio
--        BarloventoToken BRLT / Super Token BRLTx (D2); vouchers/códigos de
--        canje (P5) → +2 tablas y enum voucher_status (total 20 tablas,
--        14 enums). Resto de decisiones ratificadas sin cambio de esquema.
--   v1.2 (Fase 1 · cierre P10–P13, 2026-10-15) — Modelo padre/hijo: la wallet
--        abre el stream y el voucher habilita equipos hijos sin wallet (hasta
--        max_children, bandwidth_percent=50 %) mientras dure el stream padre.
--        +enums binding_type y session_access_mode (16 enums); columnas de
--        sesión (access_mode, parent_hotspot_session_id, voucher_id,
--        bandwidth_percent) y de voucher (parent_hotspot_session_id,
--        max_children, children_used, bandwidth_percent). Sin cambio de nº de
--        tablas (20).
--   v1.3 (Fase 1-bis · resolución auditoría V1, 2026-10-16) — H-05 (bandwidth
--        base por plan), H-08 (nas.secret -> secret_ref), H-11 (lease/version en
--        indexer_checkpoints), H-20 (UNIQUE voucher+mac), H-21 (exclusividad
--        estricta en device_bindings), H-24 (se retira payout_wallet de
--        gateways; la tarifa es la autoridad). Sin cambio de nº de tablas/enums.
--   v1.4 (validación real, 2026-10-17) — Ejecutado contra el PostgreSQL global
--        de GCP (Cloud SQL truekeate-db-dev, PostgreSQL 15.18) en esquema
--        aislado: 130 sentencias x 2 pasadas sin errores, 20 tablas, 16 enums,
--        1 vista y trigger updated_at OK. Evidencia:
--        SFhostpot/pruebas/validacion_base_datos_gcp.log (H-35 cerrado).
--   v1.5 (Fase 2-bis · resolución auditoría V2, 2026-10-17) — D49 operator_role
--        a 5 valores + columnas api_key_* en operators; D55
--        max_children_per_parent en gateway_tariffs; D52 pseudonymized_at en
--        flow_events/flow_subscriptions; D56 índice único parcial flow<->sesión.
--   v1.6 (Fase 2-ter · cierre re-auditoría V2, 2026-10-17) — V2-03 índice
--        flow<->sesión restringido a access_mode='wallet_stream'; V2-04
--        voucher_redemptions.released_at + índice parcial vivo + trigger de
--        cupo (children_used); V2-10 notice_version/notice_accepted_at en
--        portal_sessions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extensiones
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- compatibilidad uuid_generate_v4()

-- ---------------------------------------------------------------------------
-- 2. Tipos enumerados (idempotentes)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gateway_vendor') THEN
        CREATE TYPE gateway_vendor AS ENUM ('mikrotik_rest', 'radius', 'mock', 'generic');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gateway_status') THEN
        CREATE TYPE gateway_status AS ENUM ('online', 'offline', 'maintenance', 'disabled');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'portal_session_status') THEN
        CREATE TYPE portal_session_status AS ENUM
            ('pending', 'challenge_issued', 'wallet_linked', 'bound', 'consumed', 'expired', 'rejected');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'binding_status') THEN
        CREATE TYPE binding_status AS ENUM ('active', 'revoked', 'superseded');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hotspot_session_status') THEN
        CREATE TYPE hotspot_session_status AS ENUM
            ('pending', 'provisional', 'active', 'degraded', 'revoking', 'revoked', 'closed', 'expired', 'failed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_command_type') THEN
        CREATE TYPE access_command_type AS ENUM
            ('authorize', 'reauthorize', 'confirm', 'disconnect', 'coa', 'pod',
             'address_list_add', 'address_list_remove', 'login', 'logout');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_transport') THEN
        CREATE TYPE access_transport AS ENUM
            ('mikrotik_rest', 'radius_coa', 'radius_pod', 'radius_access_accept', 'ssh', 'mock');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'command_status') THEN
        CREATE TYPE command_status AS ENUM ('pending', 'success', 'failed', 'timeout', 'retrying');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flow_event_type') THEN
        CREATE TYPE flow_event_type AS ENUM
            ('flow_created', 'flow_updated', 'flow_paused', 'flow_resumed',
             'flow_closed', 'flow_deleted', 'settled', 'claimed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flow_status') THEN
        CREATE TYPE flow_status AS ENUM ('active', 'paused', 'closed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_processing_status') THEN
        CREATE TYPE event_processing_status AS ENUM ('received', 'processed', 'ignored', 'failed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'operator_role') THEN
        CREATE TYPE operator_role AS ENUM ('admin', 'operator', 'readonly', 'auditor', 'dpo');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'health_action') THEN
        CREATE TYPE health_action AS ENUM ('none', 'grant_provisional', 'confirm', 'degrade', 'disconnect');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'voucher_status') THEN
        CREATE TYPE voucher_status AS ENUM ('active', 'redeemed', 'expired', 'revoked');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'binding_type') THEN
        CREATE TYPE binding_type AS ENUM ('wallet', 'voucher');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_access_mode') THEN
        CREATE TYPE session_access_mode AS ENUM ('wallet_stream', 'voucher_child');
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Función de auditoría temporal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- D55: mantiene `vouchers.children_used` como cupo VIVO a partir de las redenciones.
-- Alta (released_at NULL) suma; liberación (released_at se rellena) resta.
CREATE OR REPLACE FUNCTION sync_voucher_children()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.released_at IS NULL THEN
            UPDATE vouchers SET children_used = children_used + 1, updated_at = now()
             WHERE id = NEW.voucher_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.released_at IS NULL AND NEW.released_at IS NOT NULL THEN
            UPDATE vouchers SET children_used = GREATEST(children_used - 1, 0), updated_at = now()
             WHERE id = NEW.voucher_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.released_at IS NULL THEN
            UPDATE vouchers SET children_used = GREATEST(children_used - 1, 0), updated_at = now()
             WHERE id = OLD.voucher_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 4. Configuración de red
-- ---------------------------------------------------------------------------

-- 4.1 gateways — routers/NAS gestionados (RF-16)
CREATE TABLE IF NOT EXISTS gateways (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid,
    name                 text NOT NULL UNIQUE,
    vendor               gateway_vendor NOT NULL,
    status               gateway_status NOT NULL DEFAULT 'offline',
    location             text,
    description          text,
    chain_id             bigint NOT NULL DEFAULT 81234,
    super_token_address  text NOT NULL CHECK (super_token_address ~ '^0x[0-9a-fA-F]{40}$'),
    mgmt_url             text,
    mgmt_username        text,
    mgmt_secret_ref      text,
    radius_nas_ip        inet,
    radius_secret_ref    text,
    radius_coa_port      integer NOT NULL DEFAULT 3799 CHECK (radius_coa_port BETWEEN 1 AND 65535),
    radius_auth_port     integer NOT NULL DEFAULT 1812 CHECK (radius_auth_port BETWEEN 1 AND 65535),
    radius_acct_port     integer NOT NULL DEFAULT 1813 CHECK (radius_acct_port BETWEEN 1 AND 65535),
    last_health_at       timestamptz,
    metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_gateways_mikrotik_url
        CHECK (vendor <> 'mikrotik_rest' OR mgmt_url IS NOT NULL),
    CONSTRAINT chk_gateways_radius_ip
        CHECK (vendor <> 'radius' OR radius_nas_ip IS NOT NULL)
);

-- 4.2 gateway_tariffs — precio por segundo (D4, D12, D13)
CREATE TABLE IF NOT EXISTS gateway_tariffs (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_id             uuid NOT NULL REFERENCES gateways (id) ON DELETE CASCADE ON UPDATE CASCADE,
    name                   text NOT NULL,
    price_per_second_wei   numeric(38,0) NOT NULL CHECK (price_per_second_wei > 0),
    token_address          text NOT NULL CHECK (token_address ~ '^0x[0-9a-fA-F]{40}$'),
    payout_wallet          text NOT NULL CHECK (payout_wallet ~ '^0x[0-9a-fA-F]{40}$'),
    bandwidth_down_bps     integer NOT NULL DEFAULT 50000000 CHECK (bandwidth_down_bps > 0),
    bandwidth_up_bps       integer NOT NULL DEFAULT 10000000 CHECK (bandwidth_up_bps > 0),
    max_children_per_parent integer NOT NULL DEFAULT 5 CHECK (max_children_per_parent BETWEEN 1 AND 50),
    min_deposit_wei        numeric(38,0) NOT NULL DEFAULT 0 CHECK (min_deposit_wei >= 0),
    provisional_seconds    integer NOT NULL DEFAULT 60 CHECK (provisional_seconds BETWEEN 0 AND 300),
    buffer_seconds         integer NOT NULL DEFAULT 3600 CHECK (buffer_seconds > 0),
    active                 boolean NOT NULL DEFAULT true,
    valid_from             timestamptz NOT NULL DEFAULT now(),
    valid_to               timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_gateway_tariffs_name UNIQUE (gateway_id, name),
    CONSTRAINT chk_gateway_tariffs_validity CHECK (valid_to IS NULL OR valid_to > valid_from)
);

-- 4.3 nas — clientes RADIUS (FreeRADIUS)
CREATE TABLE IF NOT EXISTS nas (
    id           bigserial PRIMARY KEY,
    nasname      text NOT NULL UNIQUE,
    shortname    text,
    type         text NOT NULL DEFAULT 'other',
    ports        integer,
    secret_ref   text NOT NULL,
    server       text,
    community    text,
    description  text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5. Identidad y anti-spoofing
-- ---------------------------------------------------------------------------

-- 5.1 devices — dispositivos conocidos
CREATE TABLE IF NOT EXISTS devices (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mac_address      macaddr NOT NULL UNIQUE,
    label            text,
    last_ip          inet,
    last_gateway_id  uuid REFERENCES gateways (id) ON DELETE SET NULL ON UPDATE CASCADE,
    first_seen_at    timestamptz NOT NULL DEFAULT now(),
    last_seen_at     timestamptz NOT NULL DEFAULT now(),
    blocked          boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 5.2 portal_sessions — sesión del portal cautivo (RF-01)
CREATE TABLE IF NOT EXISTS portal_sessions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_id          uuid NOT NULL REFERENCES gateways (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    device_id           uuid REFERENCES devices (id) ON DELETE SET NULL ON UPDATE CASCADE,
    mac_address         macaddr NOT NULL,
    ip_address          inet NOT NULL,
    user_agent          text,
    notice_version      text NOT NULL,
    notice_accepted_at  timestamptz NOT NULL,
    wallet_address      text CHECK (wallet_address IS NULL OR wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
    session_token_hash  text NOT NULL UNIQUE,
    status              portal_session_status NOT NULL DEFAULT 'pending',
    expires_at          timestamptz NOT NULL,
    bound_at            timestamptz,
    consumed_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 5.3 auth_challenges — challenge SIWE (RF-03, D6)
CREATE TABLE IF NOT EXISTS auth_challenges (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    portal_session_id  uuid NOT NULL REFERENCES portal_sessions (id) ON DELETE CASCADE ON UPDATE CASCADE,
    nonce              text NOT NULL UNIQUE,
    message            text NOT NULL,
    wallet_address     text CHECK (wallet_address IS NULL OR wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
    issued_at          timestamptz NOT NULL DEFAULT now(),
    expires_at         timestamptz NOT NULL,
    consumed_at        timestamptz,
    signature          text,
    CONSTRAINT chk_auth_challenges_expiry CHECK (expires_at > issued_at)
);

-- 5.4 device_bindings — binding (wallet o voucher, MAC, IP, token) (RF-03, RF-17, D6, D18)
CREATE TABLE IF NOT EXISTS device_bindings (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id          uuid REFERENCES devices (id) ON DELETE SET NULL ON UPDATE CASCADE,
    portal_session_id  uuid NOT NULL REFERENCES portal_sessions (id) ON DELETE CASCADE ON UPDATE CASCADE,
    binding_type       binding_type NOT NULL DEFAULT 'wallet',
    wallet_address     text CHECK (wallet_address IS NULL OR wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
    voucher_id         uuid,
    mac_address        macaddr NOT NULL,
    ip_address         inet NOT NULL,
    binding_hash       text NOT NULL UNIQUE,
    status             binding_status NOT NULL DEFAULT 'active',
    verified_at        timestamptz NOT NULL DEFAULT now(),
    revoked_at         timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_device_bindings_owner CHECK (
        (binding_type = 'wallet'  AND wallet_address IS NOT NULL AND voucher_id IS NULL) OR
        (binding_type = 'voucher' AND voucher_id IS NOT NULL AND wallet_address IS NULL)
    )
);

-- ---------------------------------------------------------------------------
-- 6. Sesión de red y solvencia
-- ---------------------------------------------------------------------------

-- 6.1 hotspot_sessions — sesión autorizada en el gateway (RF-05, RF-10..13, RF-19)
CREATE TABLE IF NOT EXISTS hotspot_sessions (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    portal_session_id      uuid NOT NULL REFERENCES portal_sessions (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    device_binding_id      uuid NOT NULL REFERENCES device_bindings (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    gateway_id             uuid NOT NULL REFERENCES gateways (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    tariff_id              uuid REFERENCES gateway_tariffs (id) ON DELETE SET NULL ON UPDATE CASCADE,
    access_mode            session_access_mode NOT NULL DEFAULT 'wallet_stream',
    parent_hotspot_session_id uuid REFERENCES hotspot_sessions (id) ON DELETE CASCADE ON UPDATE CASCADE,
    voucher_id             uuid,
    bandwidth_percent      integer NOT NULL DEFAULT 100 CHECK (bandwidth_percent BETWEEN 1 AND 100),
    mac_address            macaddr NOT NULL,
    ip_address             inet NOT NULL,
    wallet_address         text NOT NULL CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
    super_token_address    text NOT NULL CHECK (super_token_address ~ '^0x[0-9a-fA-F]{40}$'),
    sender_wallet          text NOT NULL CHECK (sender_wallet ~ '^0x[0-9a-fA-F]{40}$'),
    receiver_wallet        text NOT NULL CHECK (receiver_wallet ~ '^0x[0-9a-fA-F]{40}$'),
    flow_rate_wei_s        numeric(38,0) NOT NULL DEFAULT 0 CHECK (flow_rate_wei_s >= 0),
    min_rate_required_wei  numeric(38,0) NOT NULL CHECK (min_rate_required_wei > 0),
    status                 hotspot_session_status NOT NULL DEFAULT 'pending',
    authorized_at          timestamptz,
    provisional_until      timestamptz,
    confirmed_at           timestamptz,
    last_health_at         timestamptz,
    disconnected_at        timestamptz,
    disconnect_reason      text,
    router_session_id      text,
    radacct_session_id     text,
    tx_hash                text CHECK (tx_hash IS NULL OR tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_hotspot_sessions_mode CHECK (
        (access_mode = 'wallet_stream' AND parent_hotspot_session_id IS NULL) OR
        (access_mode = 'voucher_child' AND parent_hotspot_session_id IS NOT NULL)
    )
);

-- 6.2 session_health_checks — muestras de solvencia (RF-13)
CREATE TABLE IF NOT EXISTS session_health_checks (
    id                     bigserial PRIMARY KEY,
    hotspot_session_id     uuid NOT NULL REFERENCES hotspot_sessions (id) ON DELETE CASCADE ON UPDATE CASCADE,
    checked_at             timestamptz NOT NULL DEFAULT now(),
    flow_rate_wei_s        numeric(38,0) NOT NULL,
    min_rate_required_wei  numeric(38,0) NOT NULL,
    virtual_balance_wei    numeric(38,0) NOT NULL,
    is_solvent             boolean NOT NULL,
    action                 health_action NOT NULL DEFAULT 'none',
    latency_ms             integer,
    details                jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- 7. Puente blockchain
-- ---------------------------------------------------------------------------

-- 7.1 flow_events — eventos EVM indexados (RF-07, RF-08, RNF-05)
CREATE TABLE IF NOT EXISTS flow_events (
    id                 bigserial PRIMARY KEY,
    chain_id           bigint NOT NULL,
    contract_address   text NOT NULL CHECK (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
    event_type         flow_event_type NOT NULL,
    tx_hash            text NOT NULL CHECK (tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
    log_index          integer NOT NULL CHECK (log_index >= 0),
    block_number       bigint NOT NULL,
    block_hash         text,
    sender_wallet      text CHECK (sender_wallet IS NULL OR sender_wallet ~ '^0x[0-9a-fA-F]{40}$'),
    receiver_wallet    text CHECK (receiver_wallet IS NULL OR receiver_wallet ~ '^0x[0-9a-fA-F]{40}$'),
    flow_rate_wei_s    numeric(38,0),
    amount_wei         numeric(38,0),
    payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
    processing_status  event_processing_status NOT NULL DEFAULT 'received',
    processing_error   text,
    observed_at        timestamptz NOT NULL DEFAULT now(),
    processed_at       timestamptz,
    pseudonymized_at   timestamptz,
    CONSTRAINT uq_flow_events_log UNIQUE (chain_id, tx_hash, log_index)
);

-- 7.2 flow_subscriptions — read model del estado de cada flow
CREATE TABLE IF NOT EXISTS flow_subscriptions (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_id               bigint NOT NULL,
    contract_address       text NOT NULL CHECK (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
    sender_wallet          text NOT NULL CHECK (sender_wallet ~ '^0x[0-9a-fA-F]{40}$'),
    receiver_wallet        text NOT NULL CHECK (receiver_wallet ~ '^0x[0-9a-fA-F]{40}$'),
    flow_rate_wei_s        numeric(38,0) NOT NULL DEFAULT 0 CHECK (flow_rate_wei_s >= 0),
    status                 flow_status NOT NULL DEFAULT 'active',
    last_update_timestamp  timestamptz NOT NULL,
    accumulated_wei        numeric(38,0) NOT NULL DEFAULT 0,
    last_event_id          bigint REFERENCES flow_events (id) ON DELETE SET NULL,
    pseudonymized_at       timestamptz,
    updated_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_flow_subscriptions UNIQUE (chain_id, contract_address, sender_wallet, receiver_wallet)
);

-- 7.3 indexer_checkpoints — cursor del indexador (RF-07, D8)
CREATE TABLE IF NOT EXISTS indexer_checkpoints (
    id                        bigserial PRIMARY KEY,
    chain_id                  bigint NOT NULL,
    contract_address          text NOT NULL CHECK (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
    last_processed_block      bigint NOT NULL DEFAULT 0,
    last_processed_log_index  integer NOT NULL DEFAULT -1,
    leased_by                 text,
    lease_expires_at          timestamptz,
    version                   bigint NOT NULL DEFAULT 0,
    updated_at                timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_indexer_checkpoints UNIQUE (chain_id, contract_address)
);

-- ---------------------------------------------------------------------------
-- 8. Comandos, operadores y auditoría
-- ---------------------------------------------------------------------------

-- 8.1 access_commands — comandos enviados al gateway (RF-10, RF-11, RF-18, RF-20)
CREATE TABLE IF NOT EXISTS access_commands (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hotspot_session_id  uuid REFERENCES hotspot_sessions (id) ON DELETE SET NULL ON UPDATE CASCADE,
    gateway_id          uuid NOT NULL REFERENCES gateways (id) ON DELETE RESTRICT ON UPDATE CASCADE,
    command_type        access_command_type NOT NULL,
    transport           access_transport NOT NULL,
    idempotency_key     text NOT NULL UNIQUE,
    request_payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
    response_payload    jsonb,
    radius_code         text,
    status              command_status NOT NULL DEFAULT 'pending',
    attempts            integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    latency_ms          integer,
    error               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    completed_at        timestamptz
);

-- 8.2 operators — usuarios administradores (RF-15)
CREATE TABLE IF NOT EXISTS operators (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username          text NOT NULL UNIQUE,
    email             text,
    password_hash     text NOT NULL,
    role              operator_role NOT NULL DEFAULT 'operator',
    is_active         boolean NOT NULL DEFAULT true,
    totp_secret_ref   text,
    api_key_hash      text,
    api_key_prefix    text,
    api_key_scopes    jsonb NOT NULL DEFAULT '[]'::jsonb,
    api_key_expires_at timestamptz,
    api_key_last_used_at timestamptz,
    api_key_revoked_at timestamptz,
    last_login_at     timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 8.3 audit_log — traza de acciones (RF-18, RNF-12)
CREATE TABLE IF NOT EXISTS audit_log (
    id           bigserial PRIMARY KEY,
    operator_id  uuid REFERENCES operators (id) ON DELETE SET NULL ON UPDATE CASCADE,
    actor        text NOT NULL DEFAULT 'system',
    action       text NOT NULL,
    entity_type  text,
    entity_id    text,
    details      jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip_address   inet,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- 8.4 vouchers — códigos de acceso para equipos hijos sin wallet (P5, D18, RF-25)
--     El voucher SIEMPRE cuelga de un stream ya creado por una wallet padre
--     (parent_hotspot_session_id) y da acceso a `max_children` dispositivos
--     adicionales con ancho de banda limitado (`bandwidth_percent`).
CREATE TABLE IF NOT EXISTS vouchers (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code_hash                  text NOT NULL UNIQUE,
    gateway_id                 uuid NOT NULL REFERENCES gateways (id) ON DELETE CASCADE ON UPDATE CASCADE,
    tariff_id                  uuid REFERENCES gateway_tariffs (id) ON DELETE SET NULL ON UPDATE CASCADE,
    parent_hotspot_session_id  uuid NOT NULL REFERENCES hotspot_sessions (id) ON DELETE CASCADE ON UPDATE CASCADE,
    plan_name                  text,
    max_children               integer NOT NULL DEFAULT 2 CHECK (max_children BETWEEN 1 AND 10),
    children_used              integer NOT NULL DEFAULT 0 CHECK (children_used >= 0),
    bandwidth_percent          integer NOT NULL DEFAULT 50 CHECK (bandwidth_percent BETWEEN 1 AND 100),
    status                     voucher_status NOT NULL DEFAULT 'active',
    valid_from                 timestamptz NOT NULL DEFAULT now(),
    valid_to                   timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
    created_by                 uuid REFERENCES operators (id) ON DELETE SET NULL ON UPDATE CASCADE,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_vouchers_children CHECK (children_used <= max_children),
    CONSTRAINT chk_vouchers_validity CHECK (valid_to > valid_from)
);

-- 8.5 voucher_redemptions — canjes efectivos (sesiones hijas)
CREATE TABLE IF NOT EXISTS voucher_redemptions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id          uuid NOT NULL REFERENCES vouchers (id) ON DELETE CASCADE ON UPDATE CASCADE,
    portal_session_id   uuid NOT NULL REFERENCES portal_sessions (id) ON DELETE CASCADE ON UPDATE CASCADE,
    hotspot_session_id  uuid REFERENCES hotspot_sessions (id) ON DELETE SET NULL ON UPDATE CASCADE,
    mac_address         macaddr NOT NULL,
    ip_address          inet NOT NULL,
    redeemed_at         timestamptz NOT NULL DEFAULT now(),
    released_at         timestamptz,
    CONSTRAINT uq_voucher_redemptions UNIQUE (voucher_id, portal_session_id)
);

-- 8.6 Claves foráneas circulares (hotspot_sessions <-> vouchers): se añaden tras
--     crear ambas tablas. Idempotente.
ALTER TABLE hotspot_sessions DROP CONSTRAINT IF EXISTS fk_hotspot_sessions_voucher;
ALTER TABLE hotspot_sessions
    ADD CONSTRAINT fk_hotspot_sessions_voucher
    FOREIGN KEY (voucher_id) REFERENCES vouchers (id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE device_bindings DROP CONSTRAINT IF EXISTS fk_device_bindings_voucher;
ALTER TABLE device_bindings
    ADD CONSTRAINT fk_device_bindings_voucher
    FOREIGN KEY (voucher_id) REFERENCES vouchers (id) ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 9. RADIUS (FreeRADIUS: autorización + accounting)
-- ---------------------------------------------------------------------------

-- 9.1 radcheck — atributos de comprobación
CREATE TABLE IF NOT EXISTS radcheck (
    id         bigserial PRIMARY KEY,
    username   text NOT NULL,
    attribute  text NOT NULL DEFAULT 'Cleartext-Password',
    op         character(2) NOT NULL DEFAULT ':=',
    value      text NOT NULL,
    CONSTRAINT uq_radcheck UNIQUE (username, attribute, op)
);

-- 9.2 radreply — atributos de respuesta
CREATE TABLE IF NOT EXISTS radreply (
    id         bigserial PRIMARY KEY,
    username   text NOT NULL,
    attribute  text NOT NULL,
    op         character(2) NOT NULL DEFAULT '=',
    value      text NOT NULL,
    CONSTRAINT uq_radreply UNIQUE (username, attribute, op)
);

-- 9.3 radacct — accounting de sesiones (RF-21)
CREATE TABLE IF NOT EXISTS radacct (
    radacctid          bigserial PRIMARY KEY,
    acctsessionid      text NOT NULL,
    acctuniqueid       text NOT NULL UNIQUE,
    username           text NOT NULL,
    groupname          text,
    realm              text,
    nasipaddress       inet NOT NULL,
    nasportid          text,
    nasporttype        text,
    acctstarttime      timestamptz,
    acctupdatetime     timestamptz,
    acctstoptime       timestamptz,
    acctsessiontime    bigint,
    acctauthentic      text,
    connectinfo_start  text,
    connectinfo_stop   text,
    acctinputoctets    bigint,
    acctoutputoctets   bigint,
    calledstationid    text,
    callingstationid   text,
    acctterminatecause text,
    servicetype        text,
    framedprotocol     text,
    framedipaddress    inet
);

-- ---------------------------------------------------------------------------
-- 10. Índices
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gateways_vendor_status  ON gateways (vendor, status);
CREATE INDEX IF NOT EXISTS idx_gateways_tenant         ON gateways (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gateway_tariffs_gateway ON gateway_tariffs (gateway_id);
CREATE INDEX IF NOT EXISTS idx_gateway_tariffs_active  ON gateway_tariffs (gateway_id, active);

CREATE INDEX IF NOT EXISTS idx_devices_last_gateway    ON devices (last_gateway_id);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_mac     ON portal_sessions (mac_address);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_wallet  ON portal_sessions (wallet_address);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_status  ON portal_sessions (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_session ON auth_challenges (portal_session_id);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expiry  ON auth_challenges (expires_at);
CREATE INDEX IF NOT EXISTS idx_device_bindings_wallet  ON device_bindings (wallet_address);
CREATE INDEX IF NOT EXISTS idx_device_bindings_mac     ON device_bindings (mac_address);
CREATE INDEX IF NOT EXISTS idx_device_bindings_session ON device_bindings (portal_session_id);
CREATE INDEX IF NOT EXISTS idx_device_bindings_voucher ON device_bindings (voucher_id);

CREATE INDEX IF NOT EXISTS idx_hotspot_sessions_status ON hotspot_sessions (status, last_health_at);
CREATE INDEX IF NOT EXISTS idx_hotspot_sessions_gateway ON hotspot_sessions (gateway_id);
CREATE INDEX IF NOT EXISTS idx_hotspot_sessions_wallet  ON hotspot_sessions (wallet_address);
CREATE INDEX IF NOT EXISTS idx_hotspot_sessions_mac     ON hotspot_sessions (mac_address);
CREATE INDEX IF NOT EXISTS idx_hotspot_sessions_parent  ON hotspot_sessions (parent_hotspot_session_id);
CREATE INDEX IF NOT EXISTS idx_hotspot_sessions_voucher ON hotspot_sessions (voucher_id);
CREATE INDEX IF NOT EXISTS idx_health_checks_session    ON session_health_checks (hotspot_session_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_flow_events_chain_block  ON flow_events (chain_id, block_number);
CREATE INDEX IF NOT EXISTS idx_flow_events_type         ON flow_events (event_type);
CREATE INDEX IF NOT EXISTS idx_flow_events_sender       ON flow_events (sender_wallet);
CREATE INDEX IF NOT EXISTS idx_flow_events_receiver     ON flow_events (receiver_wallet);
CREATE INDEX IF NOT EXISTS idx_flow_events_pending      ON flow_events (processing_status) WHERE processing_status <> 'processed';
CREATE INDEX IF NOT EXISTS idx_flow_subscriptions_pair  ON flow_subscriptions (sender_wallet, receiver_wallet);
CREATE INDEX IF NOT EXISTS idx_flow_subscriptions_state ON flow_subscriptions (status, last_update_timestamp);

CREATE INDEX IF NOT EXISTS idx_access_commands_session  ON access_commands (hotspot_session_id);
CREATE INDEX IF NOT EXISTS idx_access_commands_gateway  ON access_commands (gateway_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_commands_status   ON access_commands (status) WHERE status IN ('pending', 'retrying', 'failed');
CREATE INDEX IF NOT EXISTS idx_audit_log_entity         ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created        ON audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vouchers_gateway         ON vouchers (gateway_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_status_validity ON vouchers (status, valid_to);
CREATE INDEX IF NOT EXISTS idx_vouchers_tariff          ON vouchers (tariff_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_parent          ON vouchers (parent_hotspot_session_id);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_voucher ON voucher_redemptions (voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_session ON voucher_redemptions (portal_session_id);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_mac     ON voucher_redemptions (mac_address);
-- D55: una redención viva por (voucher, MAC); al liberarse (released_at) permite reconexión.
CREATE UNIQUE INDEX IF NOT EXISTS uq_voucher_redemptions_live_mac
    ON voucher_redemptions (voucher_id, mac_address)
    WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_radcheck_username        ON radcheck (username);
CREATE INDEX IF NOT EXISTS idx_radreply_username        ON radreply (username);
CREATE INDEX IF NOT EXISTS idx_radacct_session          ON radacct (acctsessionid);
CREATE INDEX IF NOT EXISTS idx_radacct_username         ON radacct (username);
CREATE INDEX IF NOT EXISTS idx_radacct_start            ON radacct (acctstarttime DESC);

-- Índices únicos parciales: reglas anti-abuso clave
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_bindings_active_mac
    ON device_bindings (mac_address) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_hotspot_sessions_open_mac
    ON hotspot_sessions (mac_address)
    WHERE status IN ('pending', 'provisional', 'active', 'degraded', 'revoking');

-- Unicidad flow <-> sesión padre (D56): solo `wallet_stream`; los hijos heredan la terna
-- del padre y NO deben colisionar con este índice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hotspot_sessions_active_flow
    ON hotspot_sessions (super_token_address, sender_wallet, receiver_wallet)
    WHERE status IN ('pending', 'provisional', 'active', 'degraded', 'revoking')
      AND access_mode = 'wallet_stream';

-- ---------------------------------------------------------------------------
-- 11. Vista de operación
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_active_sessions AS
SELECT
    hs.id                     AS session_id,
    hs.mac_address,
    hs.ip_address,
    hs.wallet_address,
    g.name                    AS gateway_name,
    g.vendor,
    g.location,
    hs.flow_rate_wei_s,
    hs.min_rate_required_wei,
    hs.status,
    hs.authorized_at,
    hs.provisional_until,
    hs.last_health_at,
    hs.disconnect_reason,
    d.label                   AS device_label,
    EXTRACT(EPOCH FROM (now() - hs.authorized_at))::bigint AS seconds_active
FROM hotspot_sessions hs
JOIN gateways g          ON g.id = hs.gateway_id
LEFT JOIN gateway_tariffs t ON t.id = hs.tariff_id
LEFT JOIN devices d      ON d.id = (SELECT device_id FROM portal_sessions ps WHERE ps.id = hs.portal_session_id)
WHERE hs.status IN ('pending', 'provisional', 'active', 'degraded', 'revoking');

COMMENT ON VIEW v_active_sessions IS
    'Sesiones de hotspot no terminales para panel de operador y health-check (RF-13).';

-- ---------------------------------------------------------------------------
-- 12. Triggers de updated_at
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_gateways_updated_at ON gateways;
CREATE TRIGGER trg_gateways_updated_at
    BEFORE UPDATE ON gateways FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_gateway_tariffs_updated_at ON gateway_tariffs;
CREATE TRIGGER trg_gateway_tariffs_updated_at
    BEFORE UPDATE ON gateway_tariffs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_devices_updated_at ON devices;
CREATE TRIGGER trg_devices_updated_at
    BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_portal_sessions_updated_at ON portal_sessions;
CREATE TRIGGER trg_portal_sessions_updated_at
    BEFORE UPDATE ON portal_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_hotspot_sessions_updated_at ON hotspot_sessions;
CREATE TRIGGER trg_hotspot_sessions_updated_at
    BEFORE UPDATE ON hotspot_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_flow_subscriptions_updated_at ON flow_subscriptions;
CREATE TRIGGER trg_flow_subscriptions_updated_at
    BEFORE UPDATE ON flow_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_indexer_checkpoints_updated_at ON indexer_checkpoints;
CREATE TRIGGER trg_indexer_checkpoints_updated_at
    BEFORE UPDATE ON indexer_checkpoints FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_operators_updated_at ON operators;
CREATE TRIGGER trg_operators_updated_at
    BEFORE UPDATE ON operators FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_vouchers_updated_at ON vouchers;
CREATE TRIGGER trg_vouchers_updated_at
    BEFORE UPDATE ON vouchers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_voucher_redemptions_children ON voucher_redemptions;
CREATE TRIGGER trg_voucher_redemptions_children
    AFTER INSERT OR UPDATE OF released_at OR DELETE ON voucher_redemptions
    FOR EACH ROW EXECUTE FUNCTION sync_voucher_children();

-- ---------------------------------------------------------------------------
-- 13. Comentarios
-- ---------------------------------------------------------------------------
COMMENT ON TABLE gateways IS 'Routers/NAS gestionados por el orquestador (RF-16).';
COMMENT ON COLUMN gateways.mgmt_secret_ref IS 'Referencia a secreto (Secret Manager); nunca el secreto.';
COMMENT ON TABLE gateway_tariffs IS 'Tarifa por segundo de cada gateway (D4/D12/D13).';
COMMENT ON COLUMN gateway_tariffs.price_per_second_wei IS 'Tarifa mínima en wei/s; el flow debe ser >= para autorizar (RF-09).';
COMMENT ON COLUMN gateway_tariffs.payout_wallet IS 'Autoridad única del receptor del stream (H-24); debe coincidir con FLOW.receiver.';
COMMENT ON COLUMN gateway_tariffs.bandwidth_down_bps IS 'Ancho de banda base del plan (H-05); el hijo aplica bandwidth_percent.';
COMMENT ON COLUMN gateway_tariffs.bandwidth_up_bps IS 'Ancho de banda base de subida (H-05).';
COMMENT ON TABLE nas IS 'Clientes RADIUS (FreeRADIUS); el shared secret se referencia por secret_ref (H-08).';
COMMENT ON TABLE devices IS 'Dispositivos conocidos por MAC (dato personal: RGPD).';
COMMENT ON TABLE portal_sessions IS 'Sesión del portal cautivo antes del binding (RF-01); el alta exige aviso de privacidad aceptado (D52/D55).';
COMMENT ON COLUMN portal_sessions.notice_version IS 'Versión del aviso de privacidad aceptada antes de persistir MAC/IP (D52).';
COMMENT ON COLUMN portal_sessions.notice_accepted_at IS 'Timestamp de aceptación del aviso (D52).';
COMMENT ON COLUMN portal_sessions.session_token_hash IS 'SHA-256 del token de sesión; nunca se almacena el token.';
COMMENT ON TABLE auth_challenges IS 'Challenges SIWE de un solo uso para ligar wallet y dispositivo (D6).';
COMMENT ON TABLE device_bindings IS 'Binding de identidad (wallet o voucher, MAC, IP, token); máximo un binding activo por MAC (RF-17).';
COMMENT ON TABLE hotspot_sessions IS 'Sesión de red autorizada (padre con stream o hija por voucher); una sola sesión no terminal por MAC (RF-10..13).';
COMMENT ON COLUMN hotspot_sessions.access_mode IS 'wallet_stream (padre financia) o voucher_child (hereda el stream del padre).';
COMMENT ON COLUMN hotspot_sessions.bandwidth_percent IS 'Porcentaje de ancho de banda respecto al padre (hijos: 50 por defecto).';
COMMENT ON COLUMN hotspot_sessions.provisional_until IS 'Fin de la ventana de acceso provisional (D5).';
COMMENT ON TABLE session_health_checks IS 'Muestras de solvencia y acción tomada (RF-13).';
COMMENT ON TABLE flow_events IS 'Eventos EVM indexados; idempotencia por (chain_id, tx_hash, log_index) (RF-07).';
COMMENT ON TABLE flow_subscriptions IS 'Read model del estado de cada flow on-chain.';
COMMENT ON TABLE indexer_checkpoints IS 'Cursor del indexador por contrato (D8); lease/version evitan doble avance (H-11).';
COMMENT ON COLUMN indexer_checkpoints.leased_by IS 'Instancia/Job que posee el lease; vacío si libre (H-11).';
COMMENT ON COLUMN indexer_checkpoints.version IS 'Versión para CAS optimista del cursor (H-11).';
COMMENT ON TABLE access_commands IS 'Comandos enviados al gateway, idempotentes y auditados (RF-10/11/18/20).';
COMMENT ON TABLE operators IS 'Operadores del sistema con RBAC de 5 roles (D49).';
COMMENT ON COLUMN operators.api_key_hash IS 'SHA-256 de la API key; nunca en claro (D49).';
COMMENT ON COLUMN operators.api_key_prefix IS 'Prefijo visible para identificar la key (D49).';
COMMENT ON COLUMN operators.api_key_scopes IS 'Scopes RBAC en JSON (D49).';
COMMENT ON COLUMN gateway_tariffs.max_children_per_parent IS 'Límite global de hijos por wallet padre (D55).';
COMMENT ON COLUMN flow_events.pseudonymized_at IS 'Marca de seudonimización RGPD de wallet/datos personales (D52).';
COMMENT ON COLUMN flow_subscriptions.pseudonymized_at IS 'Marca de seudonimización RGPD (D52).';
COMMENT ON TABLE audit_log IS 'Traza de acciones de operador y de sistema (RF-18).';
COMMENT ON TABLE vouchers IS 'Vouchers hijos: cuelgan de un stream padre y permiten equipos sin wallet con ancho de banda limitado (D18/RF-25).';
COMMENT ON COLUMN vouchers.code_hash IS 'SHA-256 del código; nunca se almacena el código en claro.';
COMMENT ON COLUMN vouchers.parent_hotspot_session_id IS 'Sesión padre con stream activo; la vida del voucher está ligada al stream.';
COMMENT ON COLUMN vouchers.bandwidth_percent IS 'Ancho de banda de cada hijo respecto al padre (50 por defecto).';
COMMENT ON TABLE voucher_redemptions IS 'Canjes de vouchers (equipos hijos) por sesión de portal (RF-25).';
COMMENT ON TABLE radacct IS 'Accounting RADIUS (RF-21).';
COMMENT ON COLUMN radacct.callingstationid IS 'MAC del cliente (dato personal: aplicar retención RGPD).';

-- ---------------------------------------------------------------------------
-- 14. Seeds mínimos (catalogo reejecutable)
-- ---------------------------------------------------------------------------
-- 14.1 Gateway mock de desarrollo (D16) — sin secretos, apto para CI
INSERT INTO gateways (name, vendor, status, location, chain_id, super_token_address, metadata)
VALUES (
    'mock-gateway-01',
    'mock',
    'online',
    'Laboratorio SFhostpot',
    81234,
    '0x0000000000000000000000000000000000000001',
    '{"note":"gateway simulado para desarrollo y CI"}'::jsonb
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO gateway_tariffs (gateway_id, name, price_per_second_wei, token_address, payout_wallet, provisional_seconds)
SELECT g.id,
       'tarifa-demo',
       500000000000000,  -- 0.0005 unidades de 18 dec por segundo (ejemplo del brief)
       '0x0000000000000000000000000000000000000001',
       '0x0000000000000000000000000000000000000002',
       60
FROM gateways g
WHERE g.name = 'mock-gateway-01'
ON CONFLICT (gateway_id, name) DO NOTHING;

-- 14.2 Operador admin: sembrar solo con hash fuerte, nunca en claro. Descomentar y
--      sustituir <HASH_ARGON2> por el valor generado por el CLI del orquestador.
-- INSERT INTO operators (username, email, password_hash, role)
-- VALUES ('admin', 'admin@example.invalid', '<HASH_ARGON2>', 'admin')
-- ON CONFLICT (username) DO NOTHING;

-- 14.3 NAS RADIUS de ejemplo: requiere el shared secret real del operador.
-- INSERT INTO nas (nasname, shortname, type, secret, description)
-- VALUES ('10.0.0.1', 'router-lab', 'other', '<RADIUS_SECRET>', 'NAS de laboratorio')
-- ON CONFLICT (nasname) DO NOTHING;

-- =============================================================================
-- Fin del script. Verificación rápida:
--   SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;
--   SELECT * FROM v_active_sessions;
-- =============================================================================
