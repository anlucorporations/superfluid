# 01 · Tecnología — plataforma y stack

## Tecnología de la plataforma

### Arquitectura general
#### Componentes

La plataforma consta de tres piezas:

- **Contratos Solidity** (`sc/`): `Brlt.sol` (token ERC-20 con tope y minter) y
  `BrltX.sol` (envoltorio 1:1 con streaming de nómina tipo CFA simplificado).
- **App web** (`web/`): Next.js 15 App Router con **tres superficies**: entrada única
  `/entrar`, panel admin (`/admin/*`, look AdminLTE) y Portal del Empleado
  (`/suite/*`, identidad visual propia), con APIs REST en `web/src/app/api/**`.
- **Infraestructura**: red EVM (Besu 81234 por defecto; el despliegue actual opera contra
  Anvil 31337 vía proxy, ver `04-despliegue.md`), MongoDB (estado administrativo
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
  (`sc/src/BrltX.sol:144`, evento `Downgraded` en `sc/src/BrltX.sol:99`, llama el
  empleado desde el Portal H5).
- El **tope de downgrade del 80%** es una regla de producto aplicada por el backend
  (`web/src/lib/downgrade-limit.ts`), no por el contrato: el acumulado cobrado no puede
  superar el 80% del total asignado a la cuenta; se exige en `/api/suite/actions` antes
  de auditar (`422 tope_80_superado`).
- La **entrada es única por wallet**: `/entrar` conecta la wallet, consulta
  `POST /api/auth/role` y redirige admin → `/admin`, empleado → `/suite`, sin alta →
  error (`web/src/components/EntryLogin.tsx`). En `/suite` la cuenta activa de la wallet
  se valida de forma **continua** (eth_accounts + `accountsChanged` + poll de 10 s) contra
  la sesión (`web/src/app/suite/page.tsx:117-141`).

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

- Identidad: `/api/auth/*` (nonce/verify/logout/me y **`/api/auth/role`**, decisión de
  portal sin firma), `/api/suite/me` (H5, con `limites` del tope 80%),
  `/api/suite/actions` (auditoría de cobro/liquidación con exigencia del tope).
- Datos: `/api/employees[/id][/wallet]`, `/api/projects[/id]`, allowlist,
  `/api/suite/profile`, `/api/suite/erase`.
- Flujos: `/api/flows`, `/api/flows/[id]`, `/api/flows/actions`, `/api/scheduled-flows`,
  `/api/batches[/id]` (H4).
- Operación: `/api/jobs` (H6), `/api/health`.

#### Estilo

- `handle()`/`ok()`/`readJson()` en `web/src/lib/http.ts` unifican errores `ApiError`
  con códigos estables (`rate_limit`, `tx_no_verificada`, `tope_80_superado`,
  `importe_invalido`, …).
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

- Entrada única: `web/src/app/entrar/page.tsx` + `web/src/components/EntryLogin.tsx`
  (wallet decide portal; SIWE del propósito correspondiente).
- Panel admin: `web/src/app/admin/**` (layout con nav y guardas de sesión cliente,
  tokens `adminlte.*`).
- Portal del Empleado: `web/src/app/suite/page.tsx` (página única con resumen, Downgrade
  de flujos con tope 80%, cobro autónomo, flujos, ficha y perfil GDPR; tokens
  `empleado.*` en `web/tailwind.config.ts:45-52`).
- UI kit interno: `web/src/components/ui.tsx` (Button/Card/Alert/Badge/Input…) y
  `web/src/components/adminlte.tsx` (componentes del estilo del panel).

#### Estado

- `apiFetch` (`web/src/lib/client/api.ts`) para llamadas con CSRF implícito.
- Refresco 5 s en `/suite` (`RF-08`), polling declarativo con `setInterval`.
- Validación continua de wallet en `/suite`: `eth_accounts` + evento `accountsChanged`
  + poll de 10 s (`web/src/app/suite/page.tsx:117-141`); si la cuenta activa diverge de
  la sesión, se exige revalidar en `/entrar`.

---

*Actualizado 2026-11-17 · commit aab670e*
