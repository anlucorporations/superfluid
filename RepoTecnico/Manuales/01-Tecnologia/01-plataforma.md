# 01 · Tecnología — plataforma y stack

## Tecnología de la plataforma

### Arquitectura general
#### Componentes

La plataforma consta de tres piezas:

- **Contratos Solidity** (`sc/`): `Brlt.sol` (token ERC-20 con tope y minter) y
  `BrltX.sol` (envoltorio 1:1 con streaming de nómina tipo CFA simplificado).
- **App web** (`web/`): Next.js 15 App Router, panel admin (`/admin/*`) y Suite del
  Empleado (`/suite/*`), con APIs REST en `web/src/app/api/**`.
- **Infraestructura**: Besu Codecrypto (chainId 81234), MongoDB (estado administrativo
  y reconciliación) y Cloud Run como destino de despliegue (H7).

```text
Navegador (MetaMask) ──firma──► Besu 81234 (Brlt/BrltX)
      │  HTTP (cookies SIWE)
      ▼
Next.js (Cloud Run) ──eth_call──► Besu (lectura/reconciliación)
      │  MongoDB
      ▼
Estado administrativo (empleados, flujos, jobs, auditoría)
```

#### Decisiones de plataforma

- La **verdad del estado de flujos es el contrato**: MongoDB solo es caché/historia
  (`web/src/lib/repositories/flows.ts`, función `syncDoc`).
- El **servidor nunca custodia claves**: las escrituras on-chain se firman en el
  navegador (`web/src/lib/client/contracts.ts`).
- El **cobro del empleado** es `downgrade` de BrltX → BRLT en la misma tx
  (`sc/src/BrltX.sol:144`, llama el empleado desde la Suite H5).

### Stack Web3
#### Red y contratos

- Red Besu con chainId **81234** (`web/src/lib/rpc.ts:3`), RPC de práctica
  `https://besu.alumnos.codecrypto.academy`; gas price 1.000 wei.
- Despliegue real en el bloque **6.412.104** (ver `sc/deployments/81234.json`).
- ABIs mínimas compartidas cliente/servidor en `web/src/lib/contracts.ts`
  (funciones + eventos de BrltX para extraer `flowId` y verificar recibos).

#### Lecturas y reconciliación

- `eth_call` crudo con `ethers.utils.Interface` sin provider pesado
  (`web/src/lib/flows-onchain.ts:16`).
- `deriveFlowStatus` (mismo archivo): `terminated → pausado → vencido → activo`.

#### Firmas del navegador

- `ethers 5.7.2` + EIP-1193 (MetaMask), `ensureChain` y `connectWallet`
  (`web/src/lib/client/wallet.ts`).
- Todas las escrituras envían `gasLimit` fijo por operación (hardening H6: Besu
  subestima `eth_estimateGas` con accesos en frío).

## Tecnología del backend (App Router)

### APIs REST
#### Inventario

- Identidad: `/api/auth/*` (nonce/verify/logout/me), `/api/suite/me` (H5).
- Datos: `/api/employees[/id][/wallet]`, `/api/projects[/id]`, allowlist.
- Flujos: `/api/flows`, `/api/flows/[id]`, `/api/flows/actions`, `/api/scheduled-flows`,
  `/api/batches[/id]` (H4).
- Operación: `/api/jobs` (H6), `/api/health`.

#### Estilo

- `handle()`/`ok()`/`readJson()` en `web/src/lib/http.ts` unifican errores `ApiError`
  con códigos estables (`rate_limit`, `tx_no_verificada`, …).
- Validación de entrada con **Zod** en `web/src/lib/validation.ts`.

### Seguridad de sesión
#### SIWE + sesión opaca

- SIWE con nonce de un uso de 5 min (`web/src/lib/siwe.ts`, `repositories/nonces.ts`).
- Sesión opaca: cookie `sf_session` HttpOnly, en Mongo solo su SHA-256
  (`web/src/lib/auth.ts`).
- CSRF double-submit (`sf_csrf` + `x-csrf-token`), rate limit 5/15 min
  (`repositories/rate-limit.ts`).

## Tecnología del frontend

### Pattern del front
#### Rutas UI

- Panel admin: `web/src/app/admin/**` (layout con nav y guardas de sesión cliente).
- Suite: `web/src/app/suite/**` (página de cobro autónomo + perfil GDPR).
- UI kit interno: `web/src/components/ui.tsx` (Button/Card/Alert/Badge/Input…).

#### Estado

- `apiFetch` (`web/src/lib/client/api.ts`) para llamadas con CSRF implícito.
- Refresco 5 s en la Suite (`RF-08`), polling declarativo con `setInterval`.
