# 01 — Análisis del proyecto (FASE 0)

> Proyecto: **dApp Superfluid Brlt / ANLU corporations** (nómina en streaming BRLT sobre BrltX).
> Alcance QA: batería de pruebas de wallet/dApp. Idioma: español. Entorno objetivo: **Anvil vm-blockchain, chainId 31337, RPC `http://100.85.239.67:8545`** (Cloud Run: `http://10.140.0.4:8546`).
> Fuente: `RepoTecnico/` (casos_uso.md, requerimientos.md, documento_tecnico.md, diccionario_datos.md, CLEAR_SIGNING.md, Manuales/), código `web/src/`, contratos `sc/src/Brlt.sol` y `sc/src/BrltX.sol`.
> Fecha de análisis: 2026-11-18. Solo documentación: **no se ejecutó nada**.

---

## 1. Resumen del sistema

Aplicación web Next.js 15 (App Router, React 19, TypeScript, Tailwind) con:

- **Portal Admin** (`/admin`, look AdminLTE): empleados, proyectos, flujos, finanzas, sistema, jobs, auditoría. Todas las operaciones on-chain se firman con la wallet del admin desde el navegador (ethers 5.7.2 + ABI propio de BrltX; el backend nunca custodia transacciones, RF-18).
- **Portal del Empleado** (`/suite`, identidad visual propia): saldo BRLT/BrltX, downgrade de flujos con tope del 80%, cobro autónomo, mis flujos, ficha y perfil (datos personales).
- **Entrada única** (`/entrar`): conecta la wallet, consulta el rol por backend y redirige al portal que corresponde con **una única firma SIWE**.
- **Backend API** (`web/src/app/api/**`): SIWE (EIP-4361), sesiones opacas en MongoDB con cookies `Secure`/`HttpOnly`/`SameSite=Strict` + CSRF double-submit, rate-limit, allowlist de admins, reconciliación on-chain de operaciones firmadas.
- **Contratos** (`sc/src/`): `Brlt.sol` (ERC20, 18 decimales, `MAX_SUPPLY = 50_000_000e18`, mint solo `minter`) y `BrltX.sol` (super token Opción B: `upgrade`, `downgrade`, `wrapAndCreateFlow`, `updateFlow`, `deleteFlow`, `settleFlow`, `changeReceiver`, `pause/unpause` owner, `ReentrancyGuard` + CEI + `Pausable`; la pausa bloquea crear/actualizar flujos pero **no** `downgrade`/`settleFlow`/`deleteFlow`, AC-07).

Nota de entorno: la documentación original (casos_uso.md, requerimientos.md, documento_tecnico.md) describe la red **Besu Codecrypto chainId 81234**; el código de `siwe.ts` mantiene ese 81234 interno, pero `CLEAR_SIGNING.md` (actualizado 2026-11-18) y el alcance confirmado indican que la plataforma opera hoy contra **Anvil vm-blockchain chainId 31337** con cuentas de `BaseOperaciones/cuentas_anvil.md`. La batería se diseña para 31337; la discrepancia del SIWE se registra como anomalía (§8).

## 2. Actores

| # | Actor | Descripción | Firma on-chain | Cómo participa en la batería |
|---|-------|-------------|----------------|------------------------------|
| 1 | **ADMIN** (panel admin) | Empresa/owner. Roles en la allowlist: `super_admin` (todo, incluida gestión de allowlist), `admin`/Administrador de sistema (todo menos sección `sistema`), `operador` (resumen, finanzas, flujos; solo lectura de operación) — `web/src/lib/permisos.ts:17-37`. | Sí (todas las tx del panel) | Wallet owner/minter de Anvil (cuenta #0 `0xb4eCE9…200DF` según `cuentas_anvil.md`) |
| 2 | **ADMIN SISTEMA** | Administrador de sistema dentro del panel (rol `admin`): alta/pausa/terminación/liquidación de flujos, cambio de wallet de empleados (step-up), sin sección `sistema`. | Sí (tx admin + step-up EIP-712) | Cuenta Anvil propuesta #1 (`0x9423…15cEF`) |
| 3 | **EMPLEADO** | Destinatario de los streams. Entra solo por wallet vía SIWE a la Suite. Firma `downgrade` (cobro / tope 80%) y, si quiere, `settleFlow` de un flujo vencido (público, AC-02). Tras la baja conserva acceso de solo retiro 90 días. | Sí (`downgrade`; opcional `settleFlow`) | Cuentas Anvil #2..#4 (`0x89Dd…4eBe`, `0xc4d4…FB41`, `0xf100…2C28`) |
| 4 | **DESPLEGADOR** | Ejecuta el deploy técnico con clave desechable separada de la wallet admin (RNF-09, Ownable2Step). Vive fusionado en CU-12. No es objetivo de la batería de wallet. | Sí (forge/cast, fuera de alcance UI) | — |
| 5 | **Sistema (backend)** | Next.js API + MongoDB: SIWE, sesiones, allowlist, rate-limit, auditoría, reconciliación RPC (`verifyWalletAction`, `downgrade-limit`). | No (construye llamadas, verifica confirmaciones) | — |
| 6 | **Contrato Brlt.sol** | Token ERC20 BRLT, 18 decimales, tope de mint 50.000.000, `minter` owner. | Sí (recibe/emite) | Objetivo de lectura (balanceOf/totalSupply) |
| 7 | **Contrato BrltX.sol** | Envoltorio con CFA simplificada; lista cerrada de operaciones; eventos `FlowCreated/Updated/Settled/Deleted/Expired`, `Upgraded/Downgraded`. | Sí (todas las tx del ciclo) | Objetivo primario de firmas on-chain |
| 8 | **Red** | Besu/Anvil de pruebas: chainId **31337**, RPC `http://100.85.239.67:8545` (Anvil compartido vm-blockchain; Cloud Run vía proxy `http://10.140.0.4:8546`). Sin faucet necesario (cuentas Anvil ≈10.000 ETH). | — | Nodo determinista con estado inyectable |

## 3. Casos de uso (CU-01..CU-17)

`casos_uso.md` documenta **CU-01..CU-16**; el código añade el **CU-17** (downgrade de flujo con tope 80%) y extiende CU-13/CU-16 con la validación continua de wallet y la ventana de retiro de 90 días.

| ID | Nombre | Actor | Fuente |
|----|--------|-------|--------|
| CU-01 | Autenticarse y conectar wallet del panel admin (SIWE, red, sesión 2 h) | ADMIN | casos_uso.md:104-175 |
| CU-02 | Mint/burn de BRLT (tope 50M, AC-16) | ADMIN | casos_uso.md:179-270 |
| CU-03 | Gestionar empleados (alta/edición/**cambio de wallet con doble firma EIP-712**/baja) | ADMIN | casos_uso.md:274-394 |
| CU-04 | Gestionar proyectos (presupuesto informativo) | ADMIN | casos_uso.md:398-459 |
| CU-05 | Programar flujo «próximo» en Mongo (periodos 6/15/30/90, floor al wei) | ADMIN | casos_uso.md:463-573 |
| CU-06 | Iniciar flujo on-chain (`wrapAndCreateFlow`, approval previa) | ADMIN | casos_uso.md:577-675 |
| CU-07 | Pausar/reanudar flujo (`updateFlow` rate 0 / rate original; `endsAt` se prolonga) | ADMIN | casos_uso.md:679-746 |
| CU-08 | Terminar/liquidar flujo (`deleteFlow` con unwrap; `settleFlow` público sobre vencido) | ADMIN, EMPLEADO | casos_uso.md:750-839 |
| CU-09 | Envío múltiple (lote ≤ 10, 1 tx por flujo, progreso y reanudación) | ADMIN | casos_uso.md:843-934 |
| CU-10 | Monitorear finanzas (balances 5 s, gasto previsto, alerta vencidos) | ADMIN | casos_uso.md:938-1033 |
| CU-11 | Configurar sistema (addresses, RPC, refresco, **allowlist con firma AC-15**, responsable alterno) | ADMIN | casos_uso.md:1037-1140 |
| CU-12 | Desplegar contratos y registrar addresses (fuera de alcance de la batería de wallet) | DESPLEGADOR, ADMIN | casos_uso.md:1144-1256 |
| CU-13 | **Acceso a la Suite del Empleado (SIWE) + Portal del Empleado + validación continua de wallet** | EMPLEADO | casos_uso.md:1262-1355; código `app/suite/page.tsx` |
| CU-14 | Consultar movimientos y flujos en la Suite (refresco 5 s) | EMPLEADO | casos_uso.md:1359-1465 |
| CU-15 | Gestionar perfil y datos personales (consentimiento, borrado inmediato, retiro de consentimiento) | EMPLEADO | casos_uso.md:1469-1566; `api/suite/profile`, `api/suite/erase` |
| CU-16 | Retirar saldo BrltX (`downgrade` firmado por el empleado; **acceso de solo retiro 90 días tras la baja**) | EMPLEADO | casos_uso.md:1570-1654; `verify/route.ts:87-97` |
| CU-17 | **Downgrade de flujo con tope del 80% acumulado** (CU-16 ampliado): descarga BRLT desde un flujo concreto; el servidor verifica el cobro contra la cadena y rechaza si el acumulado supera el 80% de lo asignado | EMPLEADO | `lib/downgrade-limit.ts`; `api/suite/actions/route.ts:38-44`; `app/suite/page.tsx:373-481` |

### 3.1 Lógica de negocio clave (reglas verificables)

| Regla | Valor / comportamiento | Fuente |
|-------|------------------------|--------|
| **Tope de downgrade 80%** | `DOWNGRADE_CAP = 80/100` con floor al wei sobre el **total asignado** (suma de `deposited` de todos los flujos del empleado, vivos o terminados). Lo ya cobrado se reconstruye de `audit_events` (operación "cobro", máx. 1000 eventos). `disponible = max(0, maximo − usado)`. Exceso → error **422 `tope_80_superado`**. | `lib/downgrade-limit.ts:19-97` |
| **Máximo descargable (UI)** | `min(BrltX en cartera, disponible del tope)`; botón «Máximo» rellena ese importe; si ≤ 0 los botones se deshabilitan con aviso "tope agotado o BrltX en cartera es 0". | `app/suite/page.tsx:284-287, 432-480` |
| **Verificación on-chain del cobro** | Antes de registrar en auditoría, `verifyWalletAction(txHash, wallet, operacion, flowId)` exige tx confirmada, firmante = wallet de sesión y evento correcto (`Downgraded`). Si no → **422 `tx_no_verificada`**. | `api/suite/actions/route.ts:24-36`; `lib/flows-onchain.ts` |
| **Nonces SIWE 5 min** | `SIWE_NONCE_TTL_SECONDS` default 300 s; un solo uso (`usedAt`); los nonces `purpose:"wallet_change"` no valen para login. | `lib/env.ts:16`; `api/auth/verify/route.ts:28-37` |
| **Rate limit 5 intentos / 15 min** | Por wallet+IP en `nonce` y `verify` (`AUTH_RATE_LIMIT`/`AUTH_RATE_WINDOW_SECONDS`). Ventana fija atómica en Mongo. | `lib/env.ts:19-20`; `lib/repositories/rate-limit.ts` |
| **Sesiones SIWE** | Admin **2 h**, empleado **8 h**; token opaco (hash en Mongo), cookies `Secure`/`HttpOnly`/`SameSite=Strict`, CSRF double-submit en mutaciones; revocación inmediata al dar de baja (`revokeSessionsByWallet`). | `lib/auth.ts:33-152` |
| **Ventana de retiro 90 días** | Tras la baja (`deactivatedAt`), el login de Suite y el endpoint `/api/suite/me` quedan habilitados solo para retiro durante 90 días; después el login se deniega. El resto de la Suite queda deshabilitado con banner. | `api/auth/verify/route.ts:87-97`; `api/auth/role/route.ts:26-36`; `app/suite/page.tsx:339-344` |
| **Validación continua de wallet** | En `/suite`: `eth_accounts` al montar, en cada evento `accountsChanged` y **poll cada 10 s**; si la cuenta activa ≠ wallet de sesión → banner de aviso y bloqueo de operación (revalidar en `/entrar`). | `app/suite/page.tsx:117-141, 327-335` |
| **Entrada única con redirección por rol** | `/entrar`: `ensureChain` → `connectWallet` → `POST /api/auth/role` (admin → `/admin`, empleado/retiro → `/suite`, ninguno → mensaje genérico) → SIWE del propósito que corresponde → verify → `router.replace(suite)`. | `components/EntryLogin.tsx:45-90`; `api/auth/role/route.ts` |
| **Floors y topes on-chain** | flowRate = floor(monto×10^18/segundos del periodo 6/15/30/90 días); mint con `MAX_SUPPLY = 50_000_000e18` (revert AC-16); pausa owner no bloquea `downgrade`/`settleFlow`/`deleteFlow`. | `requerimientos.md` RF-04/RF-01/AC-07; `sc/src/Brlt.sol:25,63-65`; `sc/src/BrltX.sol:135-299` |
| **Clear signing** | Toda firma off-chain muestra resumen previo (`FirmaResumen`: wallet, red, caducidad, "La firma es gratuita"); SIWE ASCII sin acentos, frases ≤ 120 caracteres; `eth_sign` no se usa. | `RepoTecnico/CLEAR_SIGNING.md` |

## 4. Estructura de operaciones

### 4.1 Operaciones off-chain (firma gratuita)

| Operación | Pantalla | Mecanismo | Detalle |
|-----------|----------|-----------|---------|
| **Conectar wallet** | `/entrar`, `/login`, `/suite/login`, acciones en `/suite` | EIP-1193 `eth_requestAccounts` | `lib/client/wallet.ts:27-33` |
| **Entrar por wallet (entrada única)** | `/entrar` | role → SIWE → verify → redirect | `EntryLogin.tsx` |
| **SIWE propósito `admin`** | `/entrar`, `/login` | `personal_sign` de mensaje EIP-4361: "Acceder al panel de administracion de Superfluid Brlt. Esta firma solo prueba que esta wallet es tuya. No mueve fondos ni autoriza gastos." | `api/auth/nonce/route.ts:7-14` |
| **SIWE propósito `suite`** | `/entrar`, `/suite/login` | "Acceder a tu Portal del Empleado de Superfluid Brlt. Esta firma solo prueba que esta wallet es tuya. No mueve fondos ni autoriza gastos." | idem |
| **SIWE propósito allowlist (alta de admin)** | `/admin/sistema` | "Confirmar esta wallet como administradora de Superfluid Brlt. Esta firma no mueve fondos ni autoriza gastos." Firmado por la **wallet candidata**; nonce `purpose:"admin"` dedicado. | `api/admin/allowlist/challenge/route.ts` |
| **EIP-712 cambio de wallet — firma 1** | `/admin/empleados` | `ChangeWallet{employeeId, oldWallet, newWallet, nonce, issuedAt}` firmado por la **wallet nueva** (`signTypedData_v4`). Dominio: `Superfluid Brlt Streaming` v2, chainId de config, `verifyingContract = BrltX`. | `lib/eip712.ts:18-26`; `api/employees/[id]/wallet/authorization/route.ts` |
| **EIP-712 cambio de wallet — firma 2 (step-up)** | `/admin/empleados` | `AdminStepUp{action:"change_wallet", …mismos campos}` firmado por la **wallet admin**. Doble firma exigida (AC-03). | `lib/eip712.ts:29-38` |
| **Perfil / datos personales** | `/suite` | PATCH perfil (email, teléfono), dar/retirar consentimiento, "Borrar mis datos" con `window.confirm` (efecto inmediato). | `app/suite/page.tsx:226-274` |
| **Cierre de sesión** | `/suite`, `/admin` | POST logout → cookie invalidada → redirect `/entrar`. | `app/suite/page.tsx:148-156`; `app/admin/layout.tsx:72-80` |

### 4.2 Transacciones on-chain (firma real, consume gas)

Todas construidas con ethers 5.7.2 contra el ABI propio (`lib/client/contracts.ts`), firmadas por la wallet conectada; el backend solo **verifica** el resultado contra el RPC.

| Operación | Firma | Firma (función) | Gas límite fijo | Efecto |
|-----------|-------|-----------------|-----------------|--------|
| **approve** BRLT→BrltX | ADMIN | `approveBrlt` (`contracts.ts:100-112`) | 80.000 | Permite al wrapper gastar BRLT (sin gasto real) |
| **wrapAndCreateFlow** (alta de flujo / iniciar lote) | ADMIN | `createFlow` (`contracts.ts:114-144`) | 500.000 | Envía BRLT al contrato y crea el flujo; extrae `flowId` del evento `FlowCreated` |
| **updateFlow (pausar)** | ADMIN | `pauseFlow` (`contracts.ts:146-152`) | 350.000 | `updateFlow(flowId, 0)`: deja de acumular |
| **updateFlow (reanudar)** | ADMIN | `resumeFlow` (`contracts.ts:154-164`) | 500.000 | `updateFlow(flowId, rateGuardado)`; el contrato prolonga `endsAt` |
| **deleteFlow (terminación)** | ADMIN | `terminateFlow` (`contracts.ts:166-171`) | 500.000 | Corta el flujo, acredita devengado y devuelve el remanente (unwrap) |
| **settleFlow (liquidación)** | ADMIN o EMPLEADO | `settleFlow` (`contracts.ts:185-190`) | 500.000 | Público (AC-02) sobre flujo vencido: acredita BrltX devengado al receptor |
| **downgrade (cobro / CU-16)** | EMPLEADO | `downgradeBrltx` (`contracts.ts:173-183`) | 250.000 | Quema BrltX propio y entrega BRLT en la misma wallet; cobro libre o tope 80% |
| **changeReceiver (cambio de receptor con flujo activo)** | ADMIN | `changeFlowReceiver` (`contracts.ts:192-213`) | 700.000 | Atómico: liquida flujo antiguo y abre uno nuevo; devuelve el nuevo `flowId` |
| **mint / burn** | ADMIN (owner/minter) | `mintBrlt` / `burnBrlt` (`contracts.ts:215-236`) | 150.000 | Mint con tope 50M; burn ≤ balance |

## 5. Puntos de integración con wallet (inventario QA primario)

| # | Punto | API / evento | Código | Comportamiento observable |
|---|-------|--------------|--------|---------------------------|
| W1 | Detección de wallet inyectada | `window.ethereum` (EIP-1193) | `lib/client/wallet.ts:18-25` | `hasWallet()`; sin wallet → alerta "No se detecta ninguna wallet. Instala MetaMask (u otra wallet EIP-1193) y recarga." y botón deshabilitado en `/entrar` (`EntryLogin.tsx:110-114,139`) |
| W2 | Conexión | `eth_requestAccounts` | `wallet.ts:27-33` | Devuelve cuenta normalizada con `getAddress`; sin cuentas → error "La wallet no devolvió ninguna cuenta" |
| W3 | Lectura de red | `eth_chainId` | `wallet.ts:35-40` | Parseo hex → number |
| W4 | Asegurar red | `wallet_switchEthereumChain` | `wallet.ts:42-53` (`ensureChain`) | Si chainId actual ≠ esperado (31337 en pruebas) intenta el switch |
| W5 | Alta de red | `wallet_addEthereumChain` | `wallet.ts:54-69` | Solo si el switch falla con **código 4902** (red no añadida). Parámetros: `chainName: "Besu Codecrypto"`, moneda `CC` (18 dec), `rpcUrls: [publicEnv.rpcUrl]`, sin explorer |
| W6 | Poll de cuentas en `/suite` | `eth_accounts` + evento `accountsChanged` + `setInterval 10_000 ms` | `app/suite/page.tsx:117-141` | Compara cuenta activa vs `session.wallet` (lowercase) → `walletOk` |
| W7 | Aviso y bloqueo por cuenta distinta | estado UI + guard en firma | `app/suite/page.tsx:327-335, 158-170` | Banner "Wallet distinta a tu sesión … validar tu wallet" y error antes de firmar cualquier tx |
| W8 | SIWE | `personal_sign` (`signMessage` → ethers `signer.signMessage`) | `wallet.ts:79-81` | Mensaje construido íntegramente en el servidor (dominio, uri, versión, chainId 81234 interno, nonce) |
| W9 | EIP-712 | `signTypedData_v4` (ethers `_signTypedData`) | `wallet.ts:83-90` | Doble firma cambio de wallet (ChangeWallet + AdminStepUp) |
| W10 | Cambio de red no observado en vivo | `chainChanged` | **No implementado** | La Suite no escucha `chainChanged`; un cambio de red con sesión abierta no se detecta hasta la próxima operación (gap, §7 SUPUESTO S4) |
| W11 | Direcciones de contrato | ABI local + `system_config` de Mongo | `lib/client/contracts.ts`; `lib/contracts.ts` | La UI usa `config.brltXAddress`/`config.brltAddress` cargadas de la API |

## 6. Puntos de firma e impacto (CLEAR_SIGNING)

13 puntos de firma inventariados en `CLEAR_SIGNING.md` (5 SIWE, 2 EIP-712, 6 on-chain). Reglas de la interfaz: resumen previo siempre, nota de coste 0 en firmas off-chain, texto humano antes de cada tx on-chain, sin `eth_sign`. La batería debe verificar que **lo que la wallet muestra** (statement SIWE, campos EIP-712, datos de la llamada) coincide con el resumen previo en cada wallet objetivo.

## 7. Alcance confirmado de plataformas y wallets

- Plataformas: `desktop`, `extension-chrome`, `extension-firefox`, `extension-edge`. Sin Android/iOS.
- Wallets objetivo: **MetaMask, Phantom, Rabby, Coinbase Wallet, Trust Wallet, OKX Wallet, Brave Wallet**.
- El proyecto **no tiene wallet propia** (dApp web Next.js): la etiqueta `@wallet:<proyecto>` **no aplica** y se documenta como tal; el objetivo primario es la dApp operada con wallets inyectadas en cada navegador.
- Combinaciones inexistentes por catálogo (Trust/Firefox, Trust/Edge, Phantom/Edge, Coinbase/Edge, Brave solo dentro del navegador Brave) → **N/A**, nunca FAIL.
- RPC de pruebas: `http://100.85.239.67:8545` (Anvil, chainId 31337); Cloud Run: `http://10.140.0.4:8546`.
- `E2E_TEST_SEED_PHRASE` **no definida** → FASE 5 (ejecución) quedará **BLOCKED** hasta definirla; no se inventa.

## 8. Hallazgos y discrepancias detectadas en el análisis (insumo del informe de anomalías)

| # | Hallazgo | Evidencia | Impacto en pruebas |
|---|----------|-----------|--------------------|
| A1 | `SIWE_CHAIN_ID = 81234` hardcodeado en el servidor aunque la red activa es 31337: el mensaje SIWE firmado declara chainId 81234 | `lib/siwe.ts:6,24` | `personal_sign` firma texto (la wallet no valida el chainId del mensaje), así que el login funciona; es anomalía a confirmar (documento vs código) y escenario de prueba |
| A2 | `wallet_addEthereumChain` añade la red con nombre "Besu Codecrypto" y moneda `CC` aunque el RPC sea Anvil 31337 | `wallet.ts:60-67` | La wallet mostrará la red con esa etiqueta; verificación visual por wallet |
| A3 | No hay listener de `chainChanged` | §5 W10 | Cambio de red con sesión abierta no bloquea en vivo (solo al operar) |
| A4 | La UI menciona "contrato detenido por el admin" (pausa BrltX) pero el empleado no recibe aviso dedicado de pausa en el cobro | `app/suite/page.tsx:533-536`; `BrltX.sol` `whenNotPaused` | El `downgrade` con contrato pausado revertirá on-chain y la UI mostrará el error genérico |
| A5 | El tope del 80% es **backend-only**: el contrato `BrltX.downgrade` no conoce el tope; si el RPC/auditoría no alcanza a registrar un cobro, la UI podría permitir firmar una tx que el backend luego rechaza auditar | `lib/downgrade-limit.ts`; `api/suite/actions/route.ts:41-44` | Escenario: cobro que excede tope → tx firmada pero auditoría rechazada (`tope_80_superado`); saldo on-chain sí se mueve |
| A6 | `burnFrom` existe en `Brlt.sol` sin uso aparente en la UI | `sc/src/Brlt.sol:80` | Fuera de alcance UI |

## 9. SUPUESTOS no documentados ([SUPUESTO])

1. **[SUPUESTO] Variables públicas de entorno en pruebas**: se asume `NEXT_PUBLIC_CHAIN_ID=31337` y `NEXT_PUBLIC_RPC_URL=http://100.85.239.67:8545` en el entorno de pruebas (los defaults del código apuntan a 81234/Besu: `lib/env.ts:26-27`).
2. **[SUPUESTO] Direcciones de contratos de prueba**: BrltX `0x6080788bc70756dD3c73b4AF2936D0eeA135bE71` y BRLT asociados a `system_config` en MongoDB del entorno; deben leerse de `/api/system` al empezar la ejecución.
3. **[SUPUESTO] Bootstrap de allowlist**: existe al menos un `super_admin` activo en `admin_allowlist` antes del primer SIWE (cuenta #0 de Anvil como owner/minter, según `cuentas_anvil.md` y AC-15).
4. **[SUPUESTO] Cambio de red con sesión abierta**: no bloquea en vivo (no hay `chainChanged`); el bloqueo ocurre al intentar operar (reconciliado con §5 W10).
5. **[SUPUESTO] Rate limit por IP**: en Cloud Run la IP real depende del proxy (`x-forwarded-for`); en pruebas locales la IP es estable.
6. **[SUPUESTO] Ventana de retiro exacta**: la constante de código (`90 * 24 * 3.600.000 ms`) es la fuente de verdad; los 90 días documentados en CU-16-A5 coinciden pero no había cifra cerrada en `requerimientos.md`.
7. **[SUPUESTO] Verificación de cobro**: `verifyWalletAction` requiere RPC alcanzable y evento `Downgraded` parseable; sin RPC, la auditoría del cobro falla (el cobro on-chain sí ocurrió).
8. **[SUPUESTO] Sesión cookie `Secure`**: en producción (`NODE_ENV=production`) las cookies van con `Secure`; en pruebas sobre `http://100.85.239.67` se asume `NODE_ENV != production` para que la cookie se establezca.
9. **[SUPUESTO] Empleado de baja sin flujo**: tras 90 días, además del login denegado, no hay job de anonimización de wallet observable en la batería (se limita a verificar el rechazo de login).
10. **[SUPUESTO] Máximo de lote**: CU-09 (lote ≤ 10) está en la UI admin de flujos; la lista exacta de controles de `/admin/flujos` se valida contra esa página al generar features (FASE 2).
11. **[SUPUESTO] Seed de prueba**: `E2E_TEST_SEED_PHRASE` no está definida en el entorno; FASE 5 quedará BLOCKED hasta definirla (no se inventa). La batería usará las cuentas conocidas de `BaseOperaciones/cuentas_anvil.md` solo como referencia de wallets destino.
12. **[SUPUESTO] Aviso de pausa al empleado**: no hay banner específico de "contrato pausado" en la Suite; el error llegará como revert genérico al cobrar.

---

*Fin de FASE 0. Este documento es la base de `02_requisitos_ears.md` (FASE 1) y de los `.feature` de FASE 2.*
