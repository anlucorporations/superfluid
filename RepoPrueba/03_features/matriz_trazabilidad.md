# Matriz de trazabilidad bidireccional — FASE 2 (Gherkin)

> Proyecto: dApp Superfluid Brlt / ANLU corporations. Idioma: español.
> Fuente: `02_requisitos_ears.md` (41 requisitos REQ-WALLET-01..41) → `03_features/*.feature` (125 escenarios: **101 ejecutables + 24 N/A**).
> Regla 3: cada requisito EARS tiene **mínimo un escenario**. Regla 4: trazabilidad bidireccional (REQ → escenario y escenario → REQ).
> Red de pruebas: Anvil vm-blockchain, chainId 31337, RPC `http://100.85.239.67:8545` (Cloud Run: `http://10.140.0.4:8546`).
> Regla 5: cada escenario ejecutable genera captura en `RepoPrueba/capturas/<ID>_<wallet>_<plataforma>_YYYY-MM-DD_HHMMSS.png`.

## 0. Notas de alcance

- **Objetivo primario**: la dApp Superfluid Brlt (Next.js) ejecutándose en el navegador con la wallet del mercado inyectada.
- **`@wallet:<proyecto>` NO APLICA**: el proyecto es una dApp web **sin wallet propia**. No existe wallet objetivo del proyecto que descargar/automatizar; la etiqueta se documenta aquí como tal y no aparece en ningún escenario (decisión confirmada por el usuario).
- **Tags obligatorios por escenario** (reglas de FASE 2): `@REQ-WALLET-NN @plataforma:<x> @navegador:<y> @wallet:<target> @modo:real|simulada @prioridad:<alta|media|baja>`.
- **`@modo:real`** (83 escenarios): extensión automatizable con build descargable — MetaMask (Chrome/Firefox/Edge), Rabby (Chrome/Firefox/Edge/desktop), Brave Wallet nativa en navegador Brave. **`@modo:simulada`** (18 escenarios): solo instalación manual desde tienda (Phantom, Coinbase, Trust, OKX) — regla 9.
- **`@na`** (24 escenarios): combinaciones inexistentes del catálogo → N/A, **nunca FAIL** (regla del catálogo §1.3).
- Datos concretos usados: chainId 31337 (hex `0x7a69`), direcciones de `BaseOperaciones/cuentas_anvil.md` (admin #0 `0xb4eCE9…200DF`, admin #1 `0x9423…15cEF`, empleados `0x89Dd…4eBe`, `0xc4d4…FB41`, `0xf100…2C28`), BrltX `0x6080788bc70756dD3c73b4AF2936D0eeA135bE71`, textos reales de UI ("Wallet distinta a tu sesión", "No mueve fondos ni autoriza gastos", botón "Máximo", rechazo `tope_80_superado`, `tx_no_verificada`, "Esta wallet no tiene acceso a ninguna suite. Pide alta al administrador.", "No hay nada descargable ahora mismo…", "Ficha dada de baja… Puedes consultar y retirar tu saldo durante 90 días", etiqueta de red "Besu Codecrypto" / moneda `CC`).
- `E2E_TEST_SEED_PHRASE` **no definida** → FASE 5 quedará **BLOCKED** hasta definirla (no se inventa).

## 1. Tabla REQ → escenarios (trazabilidad directa)

| Requisito EARS | Tipo | Feature | Escenarios (n) | Ejecutables | N/A |
|---|---|---|---|---|---|
| REQ-WALLET-01 | Ubicuo | 01 conexión | ESC-001, ESC-002, ESC-005, ESC-006, ESC-007, ESC-008, ESC-009, ESC-010, ESC-011, ESC-012, ESC-013, ESC-014, ESC-015, ESC-016, ESC-017, ESC-018, ESC-019, ESC-020, ESC-021, ESC-022, ESC-023, ESC-024, ESC-025, ESC-026, ESC-027, ESC-028, ESC-029, ESC-030 (28) | 17 | 11 |
| REQ-WALLET-02 | Evento | 01 conexión | ESC-003, ESC-004 (2) | 2 | 0 |
| REQ-WALLET-03 | Estado | 08 red | ESC-115, ESC-116, ESC-120, ESC-123, ESC-124, ESC-125 (6) | 5 | 1 |
| REQ-WALLET-04 | No deseado | 08 red | ESC-117, ESC-121 (2) | 2 | 0 |
| REQ-WALLET-05 | No deseado | 08 red | ESC-118, ESC-122 (2) | 2 | 0 |
| REQ-WALLET-06 | Opcional | 08 red | ESC-119 (1) | 1 | 0 |
| REQ-WALLET-07 | Evento | 02 entrada única | ESC-031, ESC-032, ESC-044, ESC-048, ESC-049, ESC-050 (6) | 3 | 3 |
| REQ-WALLET-08 | No deseado | 02 entrada única | ESC-033 (1) | 1 | 0 |
| REQ-WALLET-09 | Evento | 02 entrada única | ESC-034 (1) | 1 | 0 |
| REQ-WALLET-10 | Evento | 02 entrada única | ESC-035, ESC-043 (2) | 2 | 0 |
| REQ-WALLET-11 | Ubicuo | 02 entrada única | ESC-036 (1) | 1 | 0 |
| REQ-WALLET-12 | Evento | 02 entrada única | ESC-037, ESC-045 (2) | 2 | 0 |
| REQ-WALLET-13 | No deseado | 02 entrada única | ESC-038, ESC-039 (2) | 2 | 0 |
| REQ-WALLET-14 | Evento | 02 entrada única | ESC-040 (1) | 1 | 0 |
| REQ-WALLET-15 | Estado | 02 entrada única | ESC-041, ESC-046 (2) | 2 | 0 |
| REQ-WALLET-16 | Estado | 03 validación | ESC-051, ESC-056, ESC-059, ESC-060 (4) | 3 | 1 |
| REQ-WALLET-17 | Evento | 03 validación | ESC-052, ESC-053, ESC-057 (3) | 3 | 0 |
| REQ-WALLET-18 | No deseado | 03 validación | ESC-054, ESC-058 (2) | 2 | 0 |
| REQ-WALLET-19 | Evento | 03 validación | ESC-055 (1) | 1 | 0 |
| REQ-WALLET-20 | Evento | 04 cambio wallet | ESC-061, ESC-071, ESC-072, ESC-073, ESC-074 (5) | 2 | 3 |
| REQ-WALLET-21 | Evento | 04 cambio wallet | ESC-062, ESC-063, ESC-068, ESC-070 (4) | 4 | 0 |
| REQ-WALLET-22 | No deseado | 04 cambio wallet | ESC-064, ESC-065 (2) | 2 | 0 |
| REQ-WALLET-23 | Estado | 04 cambio wallet | ESC-066, ESC-067, ESC-069 (3) | 3 | 0 |
| REQ-WALLET-24 | Evento | 05 admin | ESC-075, ESC-086 (2) | 2 | 0 |
| REQ-WALLET-25 | No deseado | 05 admin | ESC-076 (1) | 1 | 0 |
| REQ-WALLET-26 | No deseado | 05 admin | ESC-077 (1) | 1 | 0 |
| REQ-WALLET-27 | Evento | 05 admin | ESC-078, ESC-084, ESC-085, ESC-089, ESC-090 (5) | 3 | 2 |
| REQ-WALLET-28 | Evento | 05 admin | ESC-079 (1) | 1 | 0 |
| REQ-WALLET-29 | Evento | 05 admin | ESC-080 (1) | 1 | 0 |
| REQ-WALLET-30 | Evento | 05 admin | ESC-081, ESC-087 (2) | 2 | 0 |
| REQ-WALLET-31 | No deseado | 05 admin | ESC-082, ESC-088 (2) | 2 | 0 |
| REQ-WALLET-32 | Evento | 06 tope80 | ESC-093, ESC-094, ESC-100, ESC-105, ESC-106, ESC-107 (6) | 4 | 2 |
| REQ-WALLET-33 | Ubicuo | 06 tope80 | ESC-091, ESC-103 (2) | 2 | 0 |
| REQ-WALLET-34 | No deseado | 06 tope80 | ESC-095, ESC-101 (2) | 2 | 0 |
| REQ-WALLET-35 | Estado | 06 tope80 | ESC-096, ESC-104 (2) | 2 | 0 |
| REQ-WALLET-36 | Evento | 06 tope80 | ESC-092, ESC-102 (2) | 2 | 0 |
| REQ-WALLET-37 | Evento | 06 tope80 | ESC-097 (1) | 1 | 0 |
| REQ-WALLET-38 | Estado | 06 tope80 | ESC-098, ESC-099 (2) | 2 | 0 |
| REQ-WALLET-39 | Evento | 07 perfil | ESC-108, ESC-109, ESC-110, ESC-111, ESC-112, ESC-113, ESC-114 (7) | 6 | 1 |
| REQ-WALLET-40 | Evento | 02 entrada única | ESC-042, ESC-047 (2) | 2 | 0 |
| REQ-WALLET-41 | Estado | 05 admin | ESC-083 (1) | 1 | 0 |

**Cobertura: 41/41 requisitos con al menos un escenario ejecutable; 0 requisitos sin escenario (obligatorio = 0).**

## 2. Tabla escenario → REQ (trazabilidad inversa)

| ID | Feature | Escenario | Wallet | Plataforma | Navegador | Modo | Prioridad | REQ cubiertos |
|---|---|---|---|---|---|---|---|---|
| ESC-001 | 01 conexión | Detección de la wallet MetaMask inyectada en la entrada única | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-01 |
| ESC-002 | 01 conexión | Sin wallet inyectada se muestra el aviso de instalación y el acceso queda deshabilitado | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-01 |
| ESC-003 | 01 conexión | Pulsar "Entrar con wallet" solicita cuentas con eth_requestAccounts y la wallet devuelve una cuenta | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-02 |
| ESC-004 | 01 conexión | La wallet no devuelve ninguna cuenta y el sistema muestra el error sin crear sesión | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-02 |
| ESC-005 | 01 conexión | Detección y conexión de la wallet Rabby inyectada en Chrome | rabby | extension-chrome | chrome | real | media | REQ-WALLET-01 |
| ESC-006 | 01 conexión | Detección y conexión de la wallet OKX inyectada en Chrome (instalación manual desde tienda) | okx | extension-chrome | chrome | simulada | media | REQ-WALLET-01 |
| ESC-007 | 01 conexión | Detección y conexión de la wallet Phantom inyectada en Chrome (instalación manual desde tienda) | phantom | extension-chrome | chrome | simulada | media | REQ-WALLET-01 |
| ESC-008 | 01 conexión | Detección y conexión de la wallet Coinbase inyectada en Chrome (instalación manual desde tienda) | coinbase | extension-chrome | chrome | simulada | media | REQ-WALLET-01 |
| ESC-009 | 01 conexión | Detección y conexión de la wallet Trust inyectada en Chrome (instalación manual desde tienda) | trust | extension-chrome | chrome | simulada | media | REQ-WALLET-01 |
| ESC-010 | 01 conexión | Detección y conexión de Brave Wallet nativa dentro del navegador Brave | brave | extension-chrome | brave | real | media | REQ-WALLET-01 |
| ESC-011 | 01 conexión | Detección y conexión de MetaMask en Firefox | metamask | extension-firefox | firefox | real | media | REQ-WALLET-01 |
| ESC-012 | 01 conexión | Detección y conexión de Phantom en Firefox (instalación manual desde tienda) | phantom | extension-firefox | firefox | simulada | media | REQ-WALLET-01 |
| ESC-013 | 01 conexión | Detección y conexión de OKX Wallet en Firefox (instalación manual desde tienda) | okx | extension-firefox | firefox | simulada | media | REQ-WALLET-01 |
| ESC-014 | 01 conexión | Detección y conexión de MetaMask en Edge | metamask | extension-edge | edge | real | media | REQ-WALLET-01 |
| ESC-015 | 01 conexión | Detección y conexión de Rabby en Edge | rabby | extension-edge | edge | real | media | REQ-WALLET-01 |
| ESC-016 | 01 conexión | Detección y conexión de OKX Wallet en Edge (instalación manual desde tienda) | okx | extension-edge | edge | simulada | media | REQ-WALLET-01 |
| ESC-017 | 01 conexión | Detección y conexión con la app de escritorio Rabby Desktop | rabby | desktop | desktop | real | media | REQ-WALLET-01 |
| ESC-018 | 01 conexión | Detección y conexión con la app de escritorio Phantom Desktop (automatización limitada → simulada) | phantom | desktop | desktop | simulada | baja | REQ-WALLET-01 |
| ESC-019 | 01 conexión | Detección y conexión con la app de escritorio OKX Desktop (automatización limitada → simulada) | okx | desktop | desktop | simulada | baja | REQ-WALLET-01 |
| ESC-020 | 01 conexión | N/A — Trust Wallet no existe como extensión para Firefox | trust | extension-firefox | firefox | simulada | baja | REQ-WALLET-01 *(N/A)* |
| ESC-021 | 01 conexión | N/A — Phantom no existe como extensión para Edge | phantom | extension-edge | edge | simulada | baja | REQ-WALLET-01 *(N/A)* |
| ESC-022 | 01 conexión | N/A — Coinbase Wallet no existe como extensión para Edge | coinbase | extension-edge | edge | simulada | baja | REQ-WALLET-01 *(N/A)* |
| ESC-023 | 01 conexión | N/A — Trust Wallet no existe como extensión para Edge | trust | extension-edge | edge | simulada | baja | REQ-WALLET-01 *(N/A)* |
| ESC-024 | 01 conexión | N/A — Brave Wallet no está disponible en Chrome normal (solo dentro del navegador Brave) | brave | extension-chrome | chrome | simulada | baja | REQ-WALLET-01 *(N/A)* |
| ESC-025 | 01 conexión | N/A — Brave Wallet no está disponible en Firefox (solo dentro del navegador Brave) | brave | extension-firefox | firefox | simulada | baja | REQ-WALLET-01 *(N/A)* |
| ESC-026 | 01 conexión | N/A — Brave Wallet no está disponible en Edge (solo dentro del navegador Brave) | brave | extension-edge | edge | simulada | baja | REQ-WALLET-01 *(N/A)* |
| ESC-027 | 01 conexión | N/A — MetaMask no tiene app de escritorio | metamask | desktop | desktop | simulada | baja | REQ-WALLET-01 *(N/A)* |
| ESC-028 | 01 conexión | N/A — Coinbase Wallet no tiene app de escritorio objetivo de la batería | coinbase | desktop | desktop | simulada | baja | REQ-WALLET-01 *(N/A)* |
| ESC-029 | 01 conexión | N/A — Trust Wallet no tiene app de escritorio objetivo de la batería | trust | desktop | desktop | simulada | baja | REQ-WALLET-01 *(N/A)* |
| ESC-030 | 01 conexión | N/A — Brave Wallet no tiene app de escritorio (es nativa del navegador Brave) | brave | desktop | desktop | simulada | baja | REQ-WALLET-01 *(N/A)* |
| ESC-031 | 02 entrada única | Wallet de la allowlist admin redirige a /admin tras conectar en /entrar | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-07 |
| ESC-032 | 02 entrada única | Wallet de empleado activo redirige a /suite tras conectar en /entrar | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-07 |
| ESC-033 | 02 entrada única | Wallet sin acceso recibe el mensaje genérico sin revelar el motivo | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-08 |
| ESC-034 | 02 entrada única | El nonce SIWE se emite de un solo uso con vigencia de 5 minutos y el mensaje llega preparado | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-09 |
| ESC-035 | 02 entrada única | Resumen previo claro antes de firmar el SIWE con personal_sign | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-10 |
| ESC-036 | 02 entrada única | Los statements SIWE son ASCII sin acentos y distinguibles por propósito | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-11 |
| ESC-037 | 02 entrada única | La firma SIWE verificada crea una sesión opaca con cookies seguras y CSRF | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-12 |
| ESC-038 | 02 entrada única | Rechazo de la firma SIWE permite reintentar con nonce nuevo y aplica el rate-limit 5/15 | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-13 |
| ESC-039 | 02 entrada única | Nonce SIWE vencido a los 5 minutos obliga a reintentar con nonce nuevo | metamask | extension-chrome | chrome | real | media | REQ-WALLET-13 |
| ESC-040 | 02 entrada única | Sesión admin TTL 2 horas y sesión empleado TTL 8 horas según el propósito SIWE | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-14 |
| ESC-041 | 02 entrada única | Navegación por rol con sesión vigente y redirección a /entrar sin sesión | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-15 |
| ESC-042 | 02 entrada única | Pulsar "Salir" revoca la sesión y devuelve a /entrar exigiendo una nueva firma SIWE | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-40 |
| ESC-043 | 02 entrada única | Resumen previo antes de firmar SIWE en Firefox con MetaMask | metamask | extension-firefox | firefox | real | media | REQ-WALLET-10 |
| ESC-044 | 02 entrada única | Empleado entra por /entrar con Rabby en Edge y es redirigido a /suite | rabby | extension-edge | edge | real | media | REQ-WALLET-07 |
| ESC-045 | 02 entrada única | La firma SIWE verificada crea sesión en el navegador Brave con Brave Wallet nativa | brave | extension-chrome | brave | real | media | REQ-WALLET-12 |
| ESC-046 | 02 entrada única | Navegación por rol en Chrome con OKX Wallet (instalación manual → simulada) | okx | extension-chrome | chrome | simulada | media | REQ-WALLET-15 |
| ESC-047 | 02 entrada única | Pulsar "Salir" en /suite con Rabby Desktop revoca la sesión y vuelve a /entrar | rabby | desktop | desktop | real | media | REQ-WALLET-40 |
| ESC-048 | 02 entrada única | N/A — flujo de entrada única no ejecutable con Phantom en Edge (combinación inexistente) | phantom | extension-edge | edge | simulada | baja | REQ-WALLET-07 *(N/A)* |
| ESC-049 | 02 entrada única | N/A — flujo de entrada única no ejecutable con Trust Wallet en Firefox (combinación inexistente) | trust | extension-firefox | firefox | simulada | baja | REQ-WALLET-07 *(N/A)* |
| ESC-050 | 02 entrada única | N/A — flujo de entrada única no ejecutable con MetaMask en desktop (combinación inexistente) | metamask | desktop | desktop | simulada | baja | REQ-WALLET-07 *(N/A)* |
| ESC-051 | 03 validación | La Suite lee la cuenta activa al montar con eth_accounts y por poll cada 10 segundos | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-16 |
| ESC-052 | 03 validación | Al dispararse accountsChanged la Suite muestra el aviso "Wallet distinta a tu sesión" y bloquea la operación | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-17 |
| ESC-053 | 03 validación | El poll de 10 segundos detecta la cuenta distinta incluso sin evento accountsChanged | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-17 |
| ESC-054 | 03 validación | Intento de cobro con wallet distinta a la sesión se impide antes de firmar | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-18 |
| ESC-055 | 03 validación | Sesión expirada o revocada redirige a /entrar antes de mostrar datos del empleado | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-19 |
| ESC-056 | 03 validación | Lectura de cuenta activa al montar y poll de 10 s en Firefox con MetaMask | metamask | extension-firefox | firefox | real | media | REQ-WALLET-16 |
| ESC-057 | 03 validación | Cambio de cuenta en Rabby en Edge dispara el aviso "Wallet distinta a tu sesión" | rabby | extension-edge | edge | real | media | REQ-WALLET-17 |
| ESC-058 | 03 validación | Intento de cobro con cuenta distinta se impide en el navegador Brave | brave | extension-chrome | brave | real | media | REQ-WALLET-18 |
| ESC-059 | 03 validación | Poll de validación continua en Chrome con OKX Wallet (instalación manual → simulada) | okx | extension-chrome | chrome | simulada | media | REQ-WALLET-16 |
| ESC-060 | 03 validación | N/A — validación continua no ejecutable con Coinbase en Edge (combinación inexistente) | coinbase | extension-edge | edge | simulada | baja | REQ-WALLET-16 *(N/A)* |
| ESC-061 | 04 cambio wallet | Preparar el cambio de wallet emite nonce de un solo uso y los dos mensajes EIP-712 ligados al empleado | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-20 |
| ESC-062 | 04 cambio wallet | Ejecución del cambio de wallet con las dos firmas signTypedData_v4 (wallet nueva y admin) | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-21 |
| ESC-063 | 04 cambio wallet | Los campos EIP-712 que muestra la wallet coinciden con el resumen previo de la dApp (CLEAR_SIGNING) | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-21 |
| ESC-064 | 04 cambio wallet | La wallet nueva rechaza la firma ChangeWallet y la operación se cancela sin cambios | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-22 |
| ESC-065 | 04 cambio wallet | El admin rechaza el step-up AdminStepUp y la operación se cancela sin cambios | metamask | extension-chrome | chrome | real | media | REQ-WALLET-22 |
| ESC-066 | 04 cambio wallet | Cambio de wallet con flujo activo se ejecuta con la transacción atómica changeReceiver | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-23 |
| ESC-067 | 04 cambio wallet | Cambio de wallet de un empleado sin flujo activo solo actualiza MongoDB sin transacción | metamask | extension-chrome | chrome | real | media | REQ-WALLET-23 |
| ESC-068 | 04 cambio wallet | Doble firma EIP-712 del cambio de wallet en Firefox con MetaMask | metamask | extension-firefox | firefox | real | media | REQ-WALLET-21 |
| ESC-069 | 04 cambio wallet | changeReceiver atómico del cambio de wallet en Edge con Rabby | rabby | extension-edge | edge | real | media | REQ-WALLET-23 |
| ESC-070 | 04 cambio wallet | Doble firma EIP-712 del cambio de wallet en el navegador Brave | brave | extension-chrome | brave | real | media | REQ-WALLET-21 |
| ESC-071 | 04 cambio wallet | Nonce wallet_change y mensajes EIP-712 con OKX Wallet en Chrome (instalación manual → simulada) | okx | extension-chrome | chrome | simulada | media | REQ-WALLET-20 |
| ESC-072 | 04 cambio wallet | N/A — cambio de wallet no ejecutable con Phantom en Edge (combinación inexistente) | phantom | extension-edge | edge | simulada | baja | REQ-WALLET-20 *(N/A)* |
| ESC-073 | 04 cambio wallet | N/A — cambio de wallet no ejecutable con Coinbase en desktop (combinación inexistente) | coinbase | desktop | desktop | simulada | baja | REQ-WALLET-20 *(N/A)* |
| ESC-074 | 04 cambio wallet | N/A — cambio de wallet no ejecutable con Trust en desktop (combinación inexistente) | trust | desktop | desktop | simulada | baja | REQ-WALLET-20 *(N/A)* |
| ESC-075 | 05 admin | Alta de admin en la allowlist con SIWE firmado por la wallet candidata | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-24 |
| ESC-076 | 05 admin | Alta de allowlist rechazada si la candidata no firma o ya figura en la allowlist | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-25 |
| ESC-077 | 05 admin | Gestión de allowlist rechazada si el actor no es super_admin | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-26 |
| ESC-078 | 05 admin | Iniciar flujo sin allowance vigente pide primero approve y luego wrapAndCreateFlow | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-27 |
| ESC-079 | 05 admin | Pausar y reanudar un flujo firma updateFlow con rate 0 y el rate guardado | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-28 |
| ESC-080 | 05 admin | Terminar un flujo firma deleteFlow y un flujo vencido ofrece settleFlow público | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-29 |
| ESC-081 | 05 admin | Mint y burn de BRLT con la wallet minter y revert del mint por encima de 50M | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-30 |
| ESC-082 | 05 admin | Una transacción on-chain que revierte muestra el error sin registrar nada en la auditoría | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-31 |
| ESC-083 | 05 admin | Con el contrato BrltX pausado por el owner se permite cobrar/liquidar/terminar y se rechazan crear/pausar/cambiar receptor | metamask | extension-chrome | chrome | real | media | REQ-WALLET-41 |
| ESC-084 | 05 admin | approve + wrapAndCreateFlow en Firefox con MetaMask | metamask | extension-firefox | firefox | real | media | REQ-WALLET-27 |
| ESC-085 | 05 admin | approve + wrapAndCreateFlow en Edge con Rabby | rabby | extension-edge | edge | real | media | REQ-WALLET-27 |
| ESC-086 | 05 admin | Alta de allowlist con SIWE firmado por la candidata en el navegador Brave | brave | extension-chrome | brave | real | media | REQ-WALLET-24 |
| ESC-087 | 05 admin | Mint y burn de BRLT con OKX Wallet en Chrome (instalación manual → simulada) | okx | extension-chrome | chrome | simulada | media | REQ-WALLET-30 |
| ESC-088 | 05 admin | Revert de transacción admin se muestra sin registrar auditoría con Rabby Desktop | rabby | desktop | desktop | real | media | REQ-WALLET-31 |
| ESC-089 | 05 admin | N/A — transacciones admin no ejecutables con Coinbase en Edge (combinación inexistente) | coinbase | extension-edge | edge | simulada | baja | REQ-WALLET-27 *(N/A)* |
| ESC-090 | 05 admin | N/A — transacciones admin no ejecutables con Brave Wallet dentro de Chrome estándar | brave | extension-chrome | chrome | simulada | baja | REQ-WALLET-27 *(N/A)* |
| ESC-091 | 06 tope80 | El panel "Downgrade de flujos" muestra los cuatro valores del tope del 80% con floor al wei | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-33 |
| ESC-092 | 06 tope80 | El botón "Máximo" rellena el importe con el menor entre BrltX en cartera y disponible del tope | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-36 |
| ESC-093 | 06 tope80 | Cobro autónomo exitoso firma downgrade, quita BrltX, acredita BRLT y se registra en auditoría | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-32 |
| ESC-094 | 06 tope80 | Cobro no verificable contra la cadena se rechaza con 422 tx_no_verificada | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-32 |
| ESC-095 | 06 tope80 | Un cobro que superaría el tope del 80% se rechaza con 422 tope_80_superado sin auditoría | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-34 |
| ESC-096 | 06 tope80 | Máximo descargable ≤ 0 deshabilita importe y botones con el aviso de que no hay nada descargable | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-35 |
| ESC-097 | 06 tope80 | El empleado liquida un flujo vencido con settleFlow y la Suite se refresca | metamask | extension-chrome | chrome | real | media | REQ-WALLET-37 |
| ESC-098 | 06 tope80 | Empleado de baja dentro de la ventana de retiro de 90 días accede solo a consultar y retirar | metamask | extension-chrome | chrome | real | media | REQ-WALLET-38 |
| ESC-099 | 06 tope80 | Transcurridos 90 días desde la baja el login de Suite se deniega | metamask | extension-chrome | chrome | real | media | REQ-WALLET-38 |
| ESC-100 | 06 tope80 | Cobro autónomo con downgrade firmado en Firefox con MetaMask | metamask | extension-firefox | firefox | real | media | REQ-WALLET-32 |
| ESC-101 | 06 tope80 | Rechazo tope_80_superado al superar el tope en Edge con Rabby | rabby | extension-edge | edge | real | media | REQ-WALLET-34 |
| ESC-102 | 06 tope80 | Botón "Máximo" rellena el importe correcto en el navegador Brave | brave | extension-chrome | brave | real | media | REQ-WALLET-36 |
| ESC-103 | 06 tope80 | Cuatro valores del tope del 80% en Chrome con OKX Wallet (instalación manual → simulada) | okx | extension-chrome | chrome | simulada | media | REQ-WALLET-33 |
| ESC-104 | 06 tope80 | Aviso "No hay nada descargable ahora mismo…" en Firefox con Phantom (instalación manual → simulada) | phantom | extension-firefox | firefox | simulada | media | REQ-WALLET-35 |
| ESC-105 | 06 tope80 | Cobro autónomo con downgrade firmado en Rabby Desktop | rabby | desktop | desktop | real | media | REQ-WALLET-32 |
| ESC-106 | 06 tope80 | N/A — cobro del empleado no ejecutable con Trust en Edge (combinación inexistente) | trust | extension-edge | edge | simulada | baja | REQ-WALLET-32 *(N/A)* |
| ESC-107 | 06 tope80 | N/A — cobro del empleado no ejecutable con Brave Wallet en Firefox (combinación inexistente) | brave | extension-firefox | firefox | simulada | baja | REQ-WALLET-32 *(N/A)* |
| ESC-108 | 07 perfil | Guardar el perfil persiste email y teléfono validados con consentimiento | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-39 |
| ESC-109 | 07 perfil | "Borrar mis datos" con confirmación elimina los datos personales de inmediato sin tocar flujos | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-39 |
| ESC-110 | 07 perfil | Retirar el consentimiento del tratamiento de datos personales | metamask | extension-chrome | chrome | real | media | REQ-WALLET-39 |
| ESC-111 | 07 perfil | Guardar perfil en Firefox con Phantom (instalación manual → simulada) | phantom | extension-firefox | firefox | simulada | media | REQ-WALLET-39 |
| ESC-112 | 07 perfil | "Borrar mis datos" en Edge con OKX Wallet (instalación manual → simulada) | okx | extension-edge | edge | simulada | baja | REQ-WALLET-39 |
| ESC-113 | 07 perfil | Guardar perfil en el navegador Brave con Brave Wallet nativa | brave | extension-chrome | brave | real | baja | REQ-WALLET-39 |
| ESC-114 | 07 perfil | N/A — perfil no ejecutable con Phantom Desktop si la automatización GUI no está disponible | phantom | desktop | desktop | simulada | baja | REQ-WALLET-39 *(N/A)* |
| ESC-115 | 08 red | Con una red distinta de 31337 el sistema pide el cambio de red antes de habilitar operaciones | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-03 |
| ESC-116 | 08 red | Con chainId 31337 ya activo no se solicita cambio de red | metamask | extension-chrome | chrome | real | media | REQ-WALLET-03 |
| ESC-117 | 08 red | Switch fallido con código 4902 añade la red 31337 con wallet_addEthereumChain y continúa sin recargar | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-04 |
| ESC-118 | 08 red | Rechazo del cambio de red aborta el acceso sin firmas ni sesión | metamask | extension-chrome | chrome | real | alta | REQ-WALLET-05 |
| ESC-119 | 08 red | La red añadida se muestra con la etiqueta "Besu Codecrypto" y moneda CC tal como la envía la dApp | metamask | extension-chrome | chrome | real | baja | REQ-WALLET-06 |
| ESC-120 | 08 red | Cambio de red a 31337 en Firefox con MetaMask antes de habilitar operaciones | metamask | extension-firefox | firefox | real | media | REQ-WALLET-03 |
| ESC-121 | 08 red | Añadir la red 31337 con código 4902 en Edge con Rabby | rabby | extension-edge | edge | real | media | REQ-WALLET-04 |
| ESC-122 | 08 red | Rechazo del cambio de red en el navegador Brave aborta el acceso sin sesión | brave | extension-chrome | brave | real | media | REQ-WALLET-05 |
| ESC-123 | 08 red | Cambio de red a 31337 en Chrome con OKX Wallet (instalación manual → simulada) | okx | extension-chrome | chrome | simulada | media | REQ-WALLET-03 |
| ESC-124 | 08 red | Cambio de red a 31337 en Rabby Desktop antes de habilitar operaciones | rabby | desktop | desktop | real | media | REQ-WALLET-03 |
| ESC-125 | 08 red | N/A — gestión de red no ejecutable con Brave Wallet en Edge (combinación inexistente) | brave | extension-edge | edge | simulada | baja | REQ-WALLET-03 *(N/A)* |

## 3. Resumen de cobertura

| Métrica | Valor |
|---|---|
| Requisitos EARS (02) | 41 |
| Requisitos con ≥1 escenario ejecutable | **41** |
| Requisitos sin escenario | **0** ✔ (obligatorio) |
| Features (.feature) | 8 |
| Escenarios totales | 125 |
| Escenarios ejecutables | 101 |
| Escenarios N/A (`@na`, no ejecutables, nunca FAIL) | 24 |
| Modo real / simulada (ejecutables) | 83 / 18 |
| Prioridad alta / media / baja (ejecutables) | 44 / 52 / 5 |

### 3.1 Escenarios por plataforma (ejecutables)

| Plataforma | Escenarios |
|---|---|
| extension-chrome | 73 |
| extension-firefox | 11 |
| extension-edge | 10 |
| desktop | 7 |
| **Total** | **101** |

### 3.2 Escenarios por plataforma × wallet (ejecutables)

| Plataforma | Wallet | Escenarios | Modo habitual |
|---|---|---|---|
| desktop | okx | 1 | simulada (solo tienda) |
| desktop | phantom | 1 | simulada (solo tienda) |
| desktop | rabby | 5 | real (build descargable) |
| extension-chrome | brave | 8 | real (nativa en Brave) |
| extension-chrome | coinbase | 1 | simulada (solo tienda) |
| extension-chrome | metamask | 54 | real (build descargable) |
| extension-chrome | okx | 7 | simulada (solo tienda) |
| extension-chrome | phantom | 1 | simulada (solo tienda) |
| extension-chrome | rabby | 1 | real (build descargable) |
| extension-chrome | trust | 1 | simulada (solo tienda) |
| extension-edge | metamask | 1 | real (build descargable) |
| extension-edge | okx | 2 | simulada (solo tienda) |
| extension-edge | rabby | 7 | real (build descargable) |
| extension-firefox | metamask | 7 | real (build descargable) |
| extension-firefox | okx | 1 | simulada (solo tienda) |
| extension-firefox | phantom | 3 | simulada (solo tienda) |
| **Total** |  | **101** | |

Nota: el peso de **MetaMask en Chrome (54 escenarios)** es deliberado: es el objetivo de referencia (wallet EIP-1193 canónica, build descargable) para cubrir los 41 requisitos a fondo; el resto de wallets cubren los mismos flujos en su combinación representativa.

### 3.3 Combinaciones N/A del catálogo (24 escenarios @na, nunca FAIL)

| Combinación inexistente | Motivo (catálogo) | Escenarios @na | Alternativa documentada |
|---|---|---|---|
| Trust Wallet + Firefox | Solo extensiones Chromium | ESC-020, ESC-049 | Trust en Chrome (ESC-009) |
| Trust Wallet + Edge | Solo extensiones Chromium | ESC-023, ESC-106 | Trust en Chrome (ESC-009) |
| Trust Wallet + desktop | Sin app de escritorio objetivo | ESC-029, ESC-074 | Trust en Chrome (ESC-009) |
| Phantom + Edge | No existe extensión Edge | ESC-021, ESC-048, ESC-072 | Phantom en Chrome (ESC-007) / Firefox (ESC-012) |
| Coinbase + Edge | No existe extensión Edge | ESC-022, ESC-060, ESC-089 | Coinbase en Chrome (ESC-008) |
| Coinbase + desktop | Sin app de escritorio objetivo | ESC-028, ESC-073 | Coinbase en Chrome (ESC-008) |
| MetaMask + desktop | Solo extensión y móvil | ESC-027, ESC-050 | MetaMask en Chrome/Firefox/Edge (ESC-001) |
| Brave Wallet + Chrome estándar | Nativa solo del navegador Brave | ESC-024, ESC-090 | Brave en navegador Brave (ESC-010) |
| Brave Wallet + Firefox | Nativa solo del navegador Brave | ESC-025, ESC-107 | Brave en navegador Brave (ESC-010) |
| Brave Wallet + Edge | Nativa solo del navegador Brave | ESC-026, ESC-125 | Brave en navegador Brave (ESC-010) |
| Brave Wallet + desktop | Nativa del navegador (se cubre como navegador Brave) | ESC-030 | Brave en navegador Brave (ESC-010) |
| Phantom + desktop (automatización GUI limitada) | App de escritorio solo con instalación manual; si no hay automatización GUI disponible → BLOCKED, y si la app no es instalable/automatizable → N/A | ESC-114 | Phantom en Chrome (ESC-007) |

Los escenarios `@na` **no cuentan como cobertura ejecutable** y su estado en `06_estado_ejecucion.md` siempre será `N/A` (nunca `FAIL`).

## 4. Cobertura por módulo (feature)

| Feature | Módulo | REQ cubiertos | Escenarios (ejec./N/A) |
|---|---|---|---|
| `01_conexion_wallet.feature` | 01 conexión | REQ-WALLET-01, 02 | 30 (19/11) |
| `02_entrada_unica.feature` | 02 entrada única | REQ-WALLET-07, 08, 09, 10, 11, 12, 13, 14, 15, 40 | 20 (17/3) |
| `03_validacion_wallet.feature` | 03 validación | REQ-WALLET-16, 17, 18, 19 | 10 (9/1) |
| `04_cambio_wallet_eip712.feature` | 04 cambio wallet | REQ-WALLET-20, 21, 22, 23 | 14 (11/3) |
| `05_flujos_admin.feature` | 05 admin | REQ-WALLET-24, 25, 26, 27, 28, 29, 30, 31, 41 | 16 (14/2) |
| `06_downgrade_tope80.feature` | 06 tope80 | REQ-WALLET-32, 33, 34, 35, 36, 37, 38 | 17 (15/2) |
| `07_perfil_datos.feature` | 07 perfil | REQ-WALLET-39 | 7 (6/1) |
| `08_cambio_red.feature` | 08 red | REQ-WALLET-03, 04, 05, 06 | 11 (10/1) |
| **Total** | | **41 REQ** | **125 (101/24)** |

## 5. Convención de capturas (regla 5)

- Cada escenario ejecutable declara en un comentario `# captura:` el PNG esperado en `RepoPrueba/capturas/`:
  `<ID>_<wallet>_<plataforma>_YYYY-MM-DD_HHMMSS.png` (p. ej. `ESC-095_metamask_extension-chrome_2026-11-18_131615.png`).
- Los escenarios `@na` no se ejecutan y su línea de captura dice explícitamente que no aplica.
- El timestamp `YYYY-MM-DD_HHMMSS` se completa en la ejecución (FASE 5); si un escenario genera varias capturas, se sufija `_02`, `_03`, …

## 6. Pendientes para FASE 3–5

- FASE 3: runner Playwright por plataforma con `--load-extension`, capturas a `RepoPrueba/capturas/` y NDJSON a `RepoPrueba/05_resultados/`.
- FASE 5: **BLOCKED** hasta definir `E2E_TEST_SEED_PHRASE` (seed de prueba de Anvil; no se inventa).
- Anomalías del análisis (A1 chainId SIWE 81234 vs 31337, A2 etiqueta "Besu Codecrypto"/`CC`, A3 sin listener `chainChanged`, A5 tope 80% backend-only) ya se verifican en escenarios concretos (ESC-119, ESC-116, ESC-123, ESC-095).

