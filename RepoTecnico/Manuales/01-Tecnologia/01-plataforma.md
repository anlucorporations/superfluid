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
  y reconciliación) y Cloud Run como destino de despliegue (revisión vigente
  `brltv2-00041-87c`, 2026-11-18).

```text
Navegador (MetaMask) ──firma──► Anvil/Besu (Brlt/BrltX, chainId 31337 en el entorno actual)
      │  HTTP (cookies SIWE) + mensajes SIWE/EIP-712 explicados (clear signing)
      ▼
Next.js (Cloud Run) ──eth_call──► Red EVM (lectura/reconciliación)
      │  MongoDB
      ▼
Estado administrativo (empleados, flujos, jobs, auditoría) + scripts operativos (scripts/*.py)
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
  de auditar (`422 tope_80_superado`). El acumulado compara `actorWallet` **sin
  distinción de mayúsculas/minúsculas** (regex case-insensitive,
  `downgrade-limit.ts:43-49`) — bug corregido el 2026-11-18 tras la simulación
  operativa, que lo destapó (cobros registrados con wallet checksummed no contaban).
- La **entrada es única por wallet**: `/entrar` conecta la wallet, consulta
  `POST /api/auth/role` y redirige admin → `/admin`, empleado → `/suite`, sin alta →
  error (`web/src/components/EntryLogin.tsx`). En `/suite` la cuenta activa de la wallet
  se valida de forma **continua** (eth_accounts + `accountsChanged` + poll de 10 s) contra
  la sesión (`web/src/app/suite/page.tsx:117-141`).

### Stack Web3
#### Red y contratos

- Código base: red Besu con chainId **81234** (`web/src/lib/rpc.ts:3`), RPC de práctica
  `https://besu.alumnos.codecrypto.academy`; gas price 1.000 wei.
- Despliegue real de los contratos en Anvil compartido (chainId **31337**, bloque 56395,
  ver `RepoTecnico/INFORME_ENTREGA_FINAL.md` §1.3); el despliegue Besu del bloque
  6.412.104 es el histórico de práctica (`sc/deployments/81234.json`).
- **Pendiente de decisión (no cambiar por ahora):** SIWE firma con `chainId 81234`
  (`web/src/lib/siwe.ts:6`) mientras la app/red opera con 31337; ambos lados validan
  81234 y funciona, pero la alineación queda como decisión del usuario (recomendación
  nº 2 de `INFORME_ENTREGA_FINAL.md`). No se propone cambio inmediato.
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
- **Clear signing** (commit `7da4a76`): todo punto de firma muestra un resumen en
  lenguaje humano ANTES de firmar — sub-sección «Clear signing» más abajo.

### Clear signing (mensajes personalizados de la billetera)
#### Componente y plantillas

Inventario completo de los 13 puntos de firma: `RepoTecnico/CLEAR_SIGNING.md`
(4 SIWE `[AUTH]`, 3 EIP-712 `[PERM]`, 6 llamadas on-chain `[PERM]/[XFER]/[DEFI]/[GOV]`;
sin `eth_sign` en ningún flujo).

- **SIWE con statements de propósito** (`web/src/app/api/auth/nonce/route.ts:8-13`):
  cada propósito lleva su texto, p. ej. «Acceder a tu Portal del Empleado de Superfluid
  Brlt. Esta firma solo prueba que esta wallet es tuya. No mueve fondos ni autoriza
  gastos.» (ASCII sin acentos por requisito EIP-4361). El alta de admin en la allowlist
  usa su propio statement en `/api/admin/allowlist/challenge` («Confirmar esta wallet
  como administradora…»).
- **Componente `FirmaResumen`** (`web/src/components/firma-resumen.tsx:9-36`): ficha
  reutilizable (título + filas qué/quién/vigencia + nota por defecto «La firma es
  gratuita: no mueve fondos ni autoriza gastos.») usada en los 4 flujos de firma:
  entrada única (`EntryLogin.tsx:123`), login admin (`AdminLoginFlow.tsx`), login
  empleado (`LoginFlow.tsx`) y páginas admin de empleados/sistema (EIP-712 de cambio de
  wallet y alta en allowlist, `web/src/app/admin/empleados/page.tsx`).
- Las transacciones on-chain (approve, flujos, cobros) acompañan la petición con
  lenguaje humano en `/admin` y `/suite` (tabla de textos en `CLEAR_SIGNING.md` §2.4).

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

## Tecnología operativa (datos y pruebas)

### Scripts operativos (Python + cast)
#### Inyección y simulación

- `scripts/inyectar_datos_operativos.py`: inyección base aprobada (allowlist #0/#1,
  proyecto `Nomina ANLU`, empleados #2..#4, mint con la cuenta owner). Seguridad:
  `MONGODB_URI` solo por entorno, mnemónico por `ANVIL_MNEMONIC` o secreto
  `--leer-secreto` (nunca se imprime), confirmación interactiva, `--dry-run` sin
  escritura y log sin secretos en `RepoTecnico/BaseOperaciones/inyeccion_datos.log`.
- `scripts/simular_actividades.py` (commit `83f54e4`): reinicio controlado de la BD con
  respaldo JSON previo (`RepoTecnico/BaseOperaciones/respaldo_*/`) + reinyección base
  (fase `reset`) + actividades operativas (fase `actividades`): altas de empleados de
  reserva #5/#6, proyecto, flujos on-chain con pausa/cobro/reanudación, terminación y
  flujos programados. Respeta la regla de no reiniciar el Anvil ni redesplegar
  contratos; registro vivo en `RepoTecnico/BaseOperaciones/estado_inyeccion.md`.

### Batería de pruebas (RepoPrueba/)
#### Arquitectura de la batería

- Commit `fb59f40` + `1d5aeb6`: 41 REQ EARS (`REQ-WALLET-01..41`), 8 features Gherkin
  con 125 escenarios, matriz de trazabilidad bidireccional, runner Playwright con
  **aprobación bloqueante** del usuario antes de ejecutar y wallet-mock EIP-1193 para
  el modo simulado (sin extensiones reales).
- Primera ejecución (2026-11-18): 3 PASS · 0 FAIL · 54 BLOCKED · 43 NOT_RUN · 25 N/A —
  informe en `RepoPrueba/05_informe_anomalias.md` (0 anomalías de la app; faltas de
  material de wallets reales y de intérprete de pasos) y estado vivo en
  `RepoPrueba/06_estado_ejecucion.md`.

---

*Actualizado 2026-11-18 · análisis completo v2 (clear signing, batería de pruebas,
simulación operativa y fix del tope 80%; commit `83f54e4` · despliegue `brltv2-00041-87c`)*
