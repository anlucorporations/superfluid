# 02 — Requisitos atómicos EARS (FASE 1) — REQ-WALLET-NN

> Proyecto: dApp Superfluid Brlt / ANLU corporations. Idioma: español.
> Alcance QA: dApp web en desktop + extensiones Chrome/Firefox/Edge, con wallets inyectadas del mercado
> (MetaMask, Phantom, Rabby, Coinbase, Trust, OKX, Brave). El proyecto **no tiene wallet propia**:
> la etiqueta `@wallet:<proyecto>` **no aplica** y se documenta como tal (N/A en la matriz de trazabilidad).
> Red de pruebas: Anvil vm-blockchain, **chainId 31337**, RPC `http://100.85.239.67:8545` (Cloud Run: `http://10.140.0.4:8546`).
> Combinaciones inexistentes por catálogo → `N/A` (nunca FAIL). `E2E_TEST_SEED_PHRASE` no definida → FASE 5 BLOCKED.
> Plantillas EARS: **Ubicuo / Evento / Estado / No deseado / Opcional**. Cada requisito es atómico y verificable,
> con fuente (CU + ruta de código `archivo:línea` o `[SUPUESTO]`).

---

## 1. Detección de wallet

**REQ-WALLET-01 · Ubicuo** — El sistema debe detectar la wallet EIP-1193 inyectada (`window.ethereum`) en `/entrar`, `/login` y `/suite/login` y, donde no la detecte, mostrar el aviso de instalación y mantener deshabilitado el botón de acceso sin iniciar sesión.
Fuente: CU-01/CU-13 · `web/src/lib/client/wallet.ts:18-25`, `web/src/components/EntryLogin.tsx:110-114,139`, `web/src/components/AdminLoginFlow.tsx:113-118`.

**REQ-WALLET-02 · Evento** — Cuando el usuario pulsa "Entrar con wallet", el sistema debe solicitar las cuentas con `eth_requestAccounts` y, si la wallet no devuelve ninguna cuenta, mostrar el error sin crear sesión.
Fuente: CU-01 · `web/src/lib/client/wallet.ts:27-33`.

## 2. Red y cambio de red (31337)

**REQ-WALLET-03 · Estado** — Mientras el chainId activo de la wallet sea distinto del esperado (31337), el sistema debe invocar `wallet_switchEthereumChain` antes de habilitar cualquier operación firmable o de lectura que exija red.
Fuente: CU-01/CU-13 (H-25) · `web/src/lib/client/wallet.ts:42-53` (`ensureChain`).

**REQ-WALLET-04 · No deseado** — Si `wallet_switchEthereumChain` falla con código 4902 (red no añadida), el sistema debe solicitar `wallet_addEthereumChain` con chainId 31337 y el RPC de pruebas configurado; si la red se añade, continuar el flujo sin recargar.
Fuente: CU-01/CU-13 (H-25) · `web/src/lib/client/wallet.ts:54-69` (`[SUPUESTO]` valores reales de `NEXT_PUBLIC_RPC_URL` en el entorno de pruebas, `lib/env.ts:26-27`).

**REQ-WALLET-05 · No deseado** — Si el usuario rechaza el cambio de red en la wallet, el sistema debe abortar el acceso con mensaje y no solicitar ninguna firma ni crear sesión.
Fuente: CU-01-A2 · `web/src/components/EntryLogin.tsx:86-89` (catch genérico).

**REQ-WALLET-06 · Opcional** — Donde la wallet muestre la red añadida con la etiqueta enviada por la dApp, el sistema debe aceptar que la red 31337 se muestre con el nombre "Besu Codecrypto" y moneda `CC` tal como lo envía `wallet_addEthereumChain` (etiqueta heredada del código, no del entorno).
Fuente: · `web/src/lib/client/wallet.ts:60-67`; anomalía A2 de `01_analisis_proyecto.md`.

## 3. Entrada única con redirección por rol

**REQ-WALLET-07 · Evento** — Cuando la wallet se conecta en `/entrar`, el sistema debe consultar el rol vía `POST /api/auth/role` y redirigir: wallet en allowlist admin → `/admin`; wallet de empleado activo o en ventana de retiro → `/suite`; sin acceso → mensaje genérico sin revelar el motivo.
Fuente: CU-01/CU-13/CU-16 · `web/src/components/EntryLogin.tsx:55-63`, `web/src/app/api/auth/role/route.ts:19-39`.

**REQ-WALLET-08 · No deseado** — Si el rol consultado es "ninguno", el sistema debe mostrar "Esta wallet no tiene acceso a ninguna suite. Pide alta al administrador." sin diferenciar entre wallet no registrada, inactiva o de baja vencida (superficie de rechazo genérica, H-21).
Fuente: CU-13-A1/A2 · `web/src/components/EntryLogin.tsx:59-63`, `web/src/app/api/auth/role/route.ts:38`.

## 4. SIWE de los 3 propósitos

**REQ-WALLET-09 · Evento** — Cuando la dApp pide nonce para un propósito (`admin`, `suite` o confirmación de allowlist), el servidor debe emitir un nonce EIP-4361 de un solo uso con vigencia de **5 minutos** y devolver el mensaje SIWE ya preparado con el statement del propósito.
Fuente: CU-01/CU-13/CU-11 (AC-08) · `web/src/app/api/auth/nonce/route.ts:21-39`, `web/src/lib/env.ts:16`.

**REQ-WALLET-10 · Evento** — Cuando el usuario firma el mensaje SIWE, el sistema debe usar `personal_sign` desde la cuenta conectada y mostrar antes un resumen claro (wallet, red, caducidad, "La firma es gratuita", sin mover fondos).
Fuente: CU-01/CU-13 + CLEAR_SIGNING · `web/src/lib/client/wallet.ts:79-81`, `web/src/components/EntryLogin.tsx:122-135`, `web/src/components/firma-resumen.tsx`, `RepoTecnico/CLEAR_SIGNING.md §2.1`.

**REQ-WALLET-11 · Ubicuo** — El sistema debe usar statements SIWE ASCII sin acentos y distinguibles por propósito: (a) "Acceder al panel de administracion de Superfluid Brlt. Esta firma solo prueba que esta wallet es tuya. No mueve fondos ni autoriza gastos."; (b) "Acceder a tu Portal del Empleado de Superfluid Brlt. Esta firma solo prueba que esta wallet es tuya. No mueve fondos ni autoriza gastos."; (c) "Confirmar esta wallet como administradora de Superfluid Brlt. Esta firma no mueve fondos ni autoriza gastos."
Fuente: CU-01/CU-13/CU-11 + CLEAR_SIGNING · `web/src/app/api/auth/nonce/route.ts:7-14`, `web/src/app/api/admin/allowlist/challenge/route.ts:18-25`.

**REQ-WALLET-12 · Evento** — Cuando la firma SIWE llegue a `POST /api/auth/verify`, el sistema debe verificarla con ecrecover, comprobar dominio, nonce de un solo uso y wallet del mensaje, consumir el nonce y crear una sesión opaca con cookie `Secure`/`HttpOnly`/`SameSite=Strict` y token CSRF double-submit.
Fuente: CU-01/CU-13 (RNF-07, AC-08) · `web/src/app/api/auth/verify/route.ts:18-120`, `web/src/lib/auth.ts:60-136`, `web/src/lib/siwe.ts:42-84`.

**REQ-WALLET-13 · No deseado** — Si la firma es rechazada por el usuario o el nonce venció (5 min), el sistema debe permitir reintentar con un nonce nuevo en la misma pantalla y aplicar el rate-limit de **5 intentos / 15 min** por wallet+IP.
Fuente: CU-01-A4/CU-13-A3 (AC-08) · `web/src/components/EntryLogin.tsx:86-89`, `web/src/lib/repositories/guards.ts`, `web/src/lib/repositories/rate-limit.ts`.

**REQ-WALLET-14 · Evento** — Cuando el SIWE verifique un propósito `admin`, el sistema debe exigir que la wallet esté activa en la allowlist de admins y crear sesión admin con TTL de **2 h**; con propósito `suite`, que sea empleado activo o en ventana de retiro y crear sesión de **8 h**.
Fuente: CU-01/CU-13 (AC-08) · `web/src/app/api/auth/verify/route.ts:58-120`, `web/src/lib/env.ts:17-18`.

**REQ-WALLET-15 · Estado** — Mientras la sesión esté vigente, el sistema debe servir los datos solo del rol autenticado y redirigir por rol en la navegación: sesión admin → `/admin` (secciones autorizadas de la allowlist), sesión empleado → `/suite`, sin sesión → `/entrar`.
Fuente: CU-01/CU-13 · `web/src/app/admin/layout.tsx:37-70`, `web/src/app/suite/page.tsx:92-115`, `web/src/lib/permisos.ts:40-69`.

## 5. Validación continua de wallet en /suite

**REQ-WALLET-16 · Estado** — Mientras la Suite del Empleado esté abierta con sesión válida, el sistema debe leer la cuenta activa de la wallet con `eth_accounts` al montar, ante cada evento `accountsChanged` y mediante poll cada **10 segundos**, comparándola con la wallet de la sesión.
Fuente: CU-13 ampliado · `web/src/app/suite/page.tsx:117-141`.

**REQ-WALLET-17 · Evento** — Cuando la cuenta activa de la wallet deje de coincidir con la wallet de la sesión, el sistema debe mostrar el aviso "Wallet distinta a tu sesión" con enlace a revalidar en `/entrar` y bloquear la operación del portal hasta revalidar.
Fuente: CU-13 ampliado · `web/src/app/suite/page.tsx:327-335`.

**REQ-WALLET-18 · No deseado** — Si el empleado intenta firmar una transacción (cobro o downgrade) con una wallet distinta a la de la sesión, el sistema debe impedir la firma con el mensaje "La wallet conectada (0x…) no es la de tu sesión (0x…). Cambia de cuenta en MetaMask o vuelve a entrar." sin enviar la transacción.
Fuente: CU-13 ampliado / CU-16 · `web/src/app/suite/page.tsx:158-170`.

**REQ-WALLET-19 · Evento** — Cuando la sesión no sea válida (expirada, revocada o sin cookie), el sistema debe redirigir a `/entrar` antes de mostrar cualquier dato del empleado.
Fuente: CU-13-A4 · `web/src/app/suite/page.tsx:103-105`, `web/src/lib/auth.ts:84-100`.

## 6. Cambio de wallet del empleado (doble firma EIP-712)

**REQ-WALLET-20 · Evento** — Cuando el admin prepare el cambio de wallet de un empleado, el sistema debe emitir un nonce de un solo uso con propósito `wallet_change` y devolver el dominio EIP-712 (`Superfluid Brlt Streaming` v2, chainId de la config, `verifyingContract = BrltX`) y los dos mensajes: `ChangeWallet` (wallet nueva) y `AdminStepUp` con `action="change_wallet"` (admin), ambos ligados a `employeeId + oldWallet + newWallet + nonce + issuedAt`.
Fuente: CU-03 (AC-03) · `web/src/app/api/employees/[id]/wallet/authorization/route.ts:19-59`, `web/src/lib/eip712.ts:3-46`.

**REQ-WALLET-21 · Evento** — Cuando se ejecute el cambio de wallet, el sistema debe exigir las **dos firmas** con `signTypedData_v4`: la wallet nueva firma `ChangeWallet` y la wallet admin firma el step-up `AdminStepUp`; el backend las verifica por ecrecover antes de persistir el cambio.
Fuente: CU-03 4.i/4.ii (AC-03) · `web/src/lib/eip712.ts:52-59`, `RepoTecnico/CLEAR_SIGNING.md §2.3`.

**REQ-WALLET-22 · No deseado** — Si la wallet nueva rechaza la firma o el admin rechaza el step-up, o el nonce vence, el sistema debe cancelar la operación manteniendo la wallet anterior, el flujo activo original y el registro en MongoDB sin cambios.
Fuente: CU-03-A2 · casos_uso.md:341-346; `[SUPUESTO]` flujo de cancelación en `web/src/app/admin/empleados/page.tsx` (validar en FASE 2).

**REQ-WALLET-23 · Estado** — Mientras el empleado tenga un flujo activo, el cambio de wallet debe ejecutarse con la transacción atómica `changeReceiver` (liquida el flujo antiguo y abre el nuevo en la misma tx); sin flujo activo, solo se actualiza MongoDB sin transacción.
Fuente: CU-03-A3/A6 (AC-03) · `web/src/lib/client/contracts.ts:192-213`, casos_uso.md:361-372.

## 7. Allowlist de admins con firma

**REQ-WALLET-24 · Evento** — Cuando un Super Admin dé de alta una wallet en la allowlist, el sistema debe pedir un mensaje SIWE de confirmación ("Confirmar esta wallet como administradora…") **firmado por la wallet candidata**, verificarlo y consumir su nonce antes de guardar la entrada con su rol.
Fuente: CU-11 (AC-15) · `web/src/app/api/admin/allowlist/challenge/route.ts:12-28`, `web/src/app/api/admin/allowlist/route.ts:24-71`.

**REQ-WALLET-25 · No deseado** — Si la wallet candidata no firma, el nonce expira o la wallet ya figura en la allowlist, el sistema debe rechazar el alta sin crear la entrada (409 `wallet_ya_existe` para duplicada).
Fuente: CU-11-A6 · `web/src/app/api/admin/allowlist/route.ts:29-54`.

**REQ-WALLET-26 · No deseado** — Si el actor de la sesión no es `super_admin` (o la entrada de allowlist no está activa), el sistema debe rechazar la gestión de la allowlist con 403 (`super_admin_requerido` / `seccion_no_autorizada`).
Fuente: H12 · `web/src/lib/permisos.ts:55-82`, `web/src/app/api/admin/allowlist/route.ts:25-26`.

## 8. Transacciones del admin

**REQ-WALLET-27 · Evento** — Cuando el admin inicie un flujo sin allowance vigente suficiente, el sistema debe solicitar primero la firma de `approve` de BRLT hacia BrltX y después la de `wrapAndCreateFlow` en la misma sesión, y extraer el `flowId` del evento `FlowCreated` al confirmarse.
Fuente: CU-06 (RF-03) · `web/src/lib/client/contracts.ts:100-144`, casos_uso.md:631-635.

**REQ-WALLET-28 · Evento** — Cuando el admin pause o reanude un flujo, el sistema debe firmar `updateFlow(flowId, 0)` para pausar y `updateFlow(flowId, rateGuardado)` para reanudar, reflejando el estado tras la confirmación (el contrato prolonga `endsAt` por el tiempo pausado).
Fuente: CU-07 (H-07) · `web/src/lib/client/contracts.ts:146-164`, casos_uso.md:709-719.

**REQ-WALLET-29 · Evento** — Cuando el admin termine un flujo, el sistema debe firmar `deleteFlow(flowId)`; cuando el flujo esté vencido, ofrecer `settleFlow(flowId)` (público, AC-02) en lugar de Terminar.
Fuente: CU-08 · `web/src/lib/client/contracts.ts:166-190`, casos_uso.md:783-820.

**REQ-WALLET-30 · Evento** — Cuando el admin mintee o queme BRLT, el sistema debe firmar `mint`/`burn` con la wallet minter y el contrato debe revertir cualquier mint que deje `totalSupply` por encima de 50.000.000 BRLT (tope de mint).
Fuente: CU-02 (AC-16) · `web/src/lib/client/contracts.ts:215-236`, `sc/src/Brlt.sol:25,63-65`.

**REQ-WALLET-31 · No deseado** — Si una transacción on-chain revierte (saldo, gas, allowance, estado del flujo o contrato pausado), el sistema debe mostrar el error sin registrar nada en la auditoría y mantener el estado previo de la interfaz.
Fuente: CU-06-A7/CU-08-A4 (H-08) · `web/src/app/api/suite/actions/route.ts:24-36` (verificación contra cadena), casos_uso.md:649-654.

## 9. Cobro del empleado (CU-16) y tope 80% (CU-17)

**REQ-WALLET-32 · Evento** — Cuando el empleado cobre (cobro autónomo), el sistema debe firmar `downgrade(importe)` con su propia wallet (gas fijo 250.000), quitar BrltX y acreditar BRLT en la misma wallet, y registrar el cobro en la auditoría solo si la transacción se verifica contra la cadena (firmante = wallet de sesión y evento correcto).
Fuente: CU-16 (RF-21, RF-18) · `web/src/lib/client/contracts.ts:173-183`, `web/src/app/api/suite/actions/route.ts:16-62`, `web/src/lib/flows-onchain.ts`.

**REQ-WALLET-33 · Ubicuo** — El sistema debe aplicar el **tope acumulado del 80%** sobre el total asignado a la cuenta del empleado (suma de `deposited` de todos sus flujos, con floor al wei): `máximo = floor(asignado × 80 / 100)`, `disponible = máximo − ya cobrado` (reconstruido de la auditoría de cobros), y exponer los cuatro valores (asignado, tope 80%, ya descargado, disponible) en el panel "Downgrade de flujos".
Fuente: CU-17 · `web/src/lib/downgrade-limit.ts:19-78`, `web/src/app/suite/page.tsx:386-399`.

**REQ-WALLET-34 · No deseado** — Si el cobro/downgrade haría superar el tope del 80%, el sistema debe rechazarlo con error **422 `tope_80_superado`** (indicando disponible y solicitado), sin registrar el cobro en la auditoría, aunque la transacción se haya firmado on-chain.
Fuente: CU-17 · `web/src/lib/downgrade-limit.ts:84-97`, `web/src/app/api/suite/actions/route.ts:41-44`.

**REQ-WALLET-35 · Estado** — Mientras el máximo descargable sea ≤ 0 (tope agotado o BrltX en cartera = 0), el sistema debe mantener deshabilitados el importe y los botones "Descargar"/"Máximo" y mostrar el aviso "No hay nada descargable ahora mismo…" explicando que el devengo pendiente se acredita cuando el flujo se liquida on-chain.
Fuente: CU-17 · `web/src/app/suite/page.tsx:432-480`.

**REQ-WALLET-36 · Evento** — Cuando el empleado pulse el botón "Máximo", el sistema debe rellenar el importe con el menor entre su BrltX en cartera y lo disponible del tope del 80% (`min(cobrable, disponible)`), con formato parseable por la propia UI.
Fuente: CU-17 · `web/src/app/suite/page.tsx:284-287, 450-464`.

**REQ-WALLET-37 · Evento** — Cuando el empleado liquide un flujo vencido con `settleFlow` (público, AC-02), el sistema debe acreditar el devengo a su BrltX y refrescar la Suite; el remanente no devengado vuelve al admin y el flujo pasa a terminado.
Fuente: CU-08/CU-16 · `web/src/lib/client/contracts.ts:185-190`, casos_uso.md:1436-1440.

**REQ-WALLET-38 · Estado** — Mientras el empleado esté dado de baja dentro de la **ventana de retiro de 90 días**, el sistema debe permitir solo el acceso de retiro (banner "Ficha dada de baja… Puedes consultar y retirar tu saldo durante 90 días"), sin generar nuevos pagos; transcurrida la ventana, el login de Suite debe denegarse.
Fuente: CU-16-A5 (RF-20, AC-10) · `web/src/app/suite/page.tsx:339-344`, `web/src/app/api/auth/verify/route.ts:87-97`, `web/src/app/api/auth/role/route.ts:26-36`.

## 10. Perfil y datos personales (CU-15)

**REQ-WALLET-39 · Evento** — Cuando el empleado guarde su perfil, el sistema debe persistir email y teléfono validados (con consentimiento), ofrecer dar/retirar consentimiento explícito y, en "Borrar mis datos" con confirmación, eliminar los datos personales de inmediato sin tocar el registro del empleado ni sus flujos.
Fuente: CU-15 (RNF-08, AC-10) · `web/src/app/suite/page.tsx:226-274`, `web/src/app/api/suite/profile/route.ts`, `web/src/app/api/suite/erase/route.ts`.

## 11. Cierre de sesión y robustez del contrato

**REQ-WALLET-40 · Evento** — Cuando el usuario pulse "Salir" en la Suite o en el panel, el sistema debe revocar la sesión, invalidar la cookie y devolver a `/entrar`, exigiendo una nueva firma SIWE para la siguiente visita.
Fuente: CU-15-5/CU-01 · `web/src/app/suite/page.tsx:148-156`, `web/src/app/admin/layout.tsx:72-80`, `web/src/app/api/auth/logout/route.ts`.

**REQ-WALLET-41 · Estado** — Mientras el contrato BrltX esté pausado por el owner, el sistema debe permitir `downgrade`, `settleFlow` y `deleteFlow` (saldos no atrapados, AC-07) y rechazar `wrapAndCreateFlow`, `updateFlow` y `changeReceiver` con el revert del contrato.
Fuente: CU-12 (AC-07) · `sc/src/BrltX.sol:161-232` (`whenNotPaused` selectivo), casos_uso.md:1227-1231.

---

## 12. Notas de alcance para FASE 2 (matriz)

- Los 41 requisitos se evalúan por combinación plataforma × navegador × wallet: **Chrome** (MetaMask, Phantom, Rabby, Coinbase, Trust, OKX, Brave), **Firefox** (MetaMask, Phantom, Rabby, OKX), **Edge** (MetaMask, Rabby, OKX), **desktop** (Phantom, Rabby, OKX desktop + wallet simulada EIP-1193). Combinaciones inexistentes → `N/A`, nunca FAIL.
- `@wallet:<proyecto>` **no aplica**: el proyecto es una dApp sin wallet propia; el objetivo primario es la dApp con wallets inyectadas.
- Cada REQ-WALLET-NN tendrá ≥1 escenario Gherkin en FASE 2 (`03_features/`) y trazabilidad bidireccional.
- REQ-WALLET-22 y REQ-WALLET-36 dependen de textos exactos de UI: validar contra `web/src/app/admin/empleados/page.tsx` y `web/src/app/suite/page.tsx` al redactar los escenarios.
- Los hallazgos A1–A6 de `01_analisis_proyecto.md` §8 se convierten en escenarios de verificación de anomalía en FASE 2 (sin REQ propio hasta confirmación del equipo).
