# sfh-orchestrator — Orquestador SFhostpot (H2)

Backend Node 22 + TypeScript + Fastify del hotspot: identidad de red, sesiones, autorización
durable, indexador, health-check, vouchers y API v1.

## Estado H2+H3 (core entregado)

- [x] Config tipada (zod) + secretos por entorno (`INTERNAL_SECRET`, `GATEWAY_HMAC_SECRETS`).
- [x] Dominio puro con tests: solvencia (H-01/D43), tarifa/QoS (RF-09/RF-26), voucher (D55),
      provisional con oráculo único `MEMPOOL_MODE` (D56), `openingCollateralWei` = rate×3600 (D54).
- [x] Auth: HMAC del NAS + `bind_token` JWT (D45/V2-01), nonces anti-replay, API keys hasheadas (D49).
- [x] Capa de datos `pg` con transacciones (`withTx`).
- [x] Cliente de cadena `ethers` v6 (ABI de BarloventoTx) e indexador con **lease/CAS** (D42).
- [x] Health-check con muestras y revocación (D43).
- [x] Job durable de autorización (validator + gateway + expiración) (D44).
- [x] Cloud Tasks (`CloudTasksQueue`) con fallback en memoria para dev/test.
- [x] API v1: bind, portal sessions (aviso previo), `/session/authorize` **202**, pausa/reanudación,
      consulta de sesión, vouchers (crear/canjear atómico), admin (gateways/tarifas/operadores),
      jobs internos. Contrato congelado en [`openapi.yaml`](openapi.yaml) (D48).
- [x] Migración `migrations/0001_base_datos.sql` (DDL v1.6, 20 tablas/16 enums).
- [x] Build `tsc` limpio y **42 tests Vitest verdes**.

## H3 — Adaptadores de gateway

- [x] `MikrotikRestAdapter` (Opción A): `POST /rest/ip/hotspot/active/login`, fallback
      `/rest/ip/firewall/address-list`, `DELETE` de la sesión activa por MAC, health por
      `/rest/system/resource`, timeouts y QoS best-effort en `rate-limit`.
- [x] `RadiusGatewayAdapter` (Opción B): **CoA-Request (RFC 5176)** y **Disconnect-Request (PoD)** por
      UDP con `Message-Authenticator` (RFC 3579), verificación de Response Authenticator,
      `Calling-Station-Id`, `Framed-IP-Address`, `Session-Timeout` y **WISPr-Bandwidth-Max-Down/Up**.
- [x] `ResilientGateway`: 3 intentos 1/2/4 s + jitter, **fallback CoA↔REST**, `revoked` solo con ACK.
- [x] `createAdapterRegistry` por `vendor` + `fallbackVendor`, con `MockGatewayAdapter` para CI.
- [x] Tests: MikroTik contra servidor HTTP real, RADIUS contra servidor UDP real, fallback y timeouts.
- [ ] Pendiente de H3: FreeRADIUS en `sfh-infra` y verificación de alcance **VPC Connector + UDP 3799**
      (P-06; depende del entorno del operador).

## Pendiente de H2/H3

- Verificación de **scopes RBAC** por endpoint (hoy valida API key, no permiso fino).
- Runner de migraciones y prueba de integración contra Cloud SQL en Node (bloqueo de entorno;
  el DDL ya se validó con `SFhostpot/tools/validar_sql_gcp.py`).
- Cobertura ≥80 % medida en CI (falta `@vitest/coverage-v8`).

## Comandos

```bash
npm ci
cp .env.example .env          # ajustar DATABASE_URL y secretos
npm run typecheck
npm run build
npm test
npm run dev                   # servidor
node dist/main.js indexer     # Cloud Run Job: indexador (1 min)
node dist/main.js health      # Cloud Run Job: health-check (1 min)
```
