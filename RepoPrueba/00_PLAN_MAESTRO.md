# 00 — PLAN MAESTRO (FASE 4) · Batería de pruebas wallet/dApp

> Proyecto: **dApp Superfluid Brlt / ANLU corporations** (nómina en streaming BRLT sobre BrltX). Idioma: español.
> Este documento consolida las FASES 0–3 (`01_analisis_proyecto.md`, `02_requisitos_ears.md`, `03_features/`, `04_script_automatizacion/`)
> y es la **puerta de autorización bloqueante** para la FASE 5 (ejecución). **No se ha ejecutado nada.**
> Red de pruebas: Anvil vm-blockchain, **chainId 31337**, RPC `http://100.85.239.67:8545` (Cloud Run: `http://10.140.0.4:8546`).
> Fecha: 2026-11-18.

---

## 1. Resumen del análisis y alcance confirmado por el usuario

**Sistema analizado**: dApp web Next.js 15 (App Router, React 19) con Portal Admin (`/admin`), Portal del Empleado (`/suite`),
entrada única con redirección por rol (`/entrar`), backend API con SIWE (EIP-4361), sesiones opacas en MongoDB y contratos
`Brlt.sol` (ERC20 BRLT) y `BrltX.sol` (super token con `wrapAndCreateFlow`/`updateFlow`/`deleteFlow`/`settleFlow`/`downgrade`).
Todas las operaciones on-chain se firman **desde el navegador** con la wallet del usuario (ethers 5.7.2); el backend nunca custodia transacciones.

**Objetivo primario de la batería**: la **dApp** ejecutándose en cada navegador con **wallets inyectadas del mercado**.
El proyecto **NO tiene wallet propia**: la etiqueta `@wallet:<proyecto>` **no aplica** y se documenta como tal (no aparece en ningún escenario).

**Alcance confirmado por el usuario**:

- **Plataformas**: `desktop`, `extension-chrome`, `extension-firefox`, `extension-edge` — **sin Android/iOS**.
- **Wallets del mercado**: MetaMask, Phantom, Rabby, Coinbase Wallet, Trust Wallet, OKX Wallet, Brave Wallet (selección representativa completa).
- **Combinaciones inexistentes por catálogo** (Trust/Firefox, Trust/Edge, Phantom/Edge, Coinbase/Edge, Brave solo dentro del navegador Brave, y wallets sin app de escritorio) → **N/A, nunca FAIL**.
- **RPC de prueba**: `http://100.85.239.67:8545` (Anvil, chainId 31337); en Cloud Run `http://10.140.0.4:8546`.
- **`E2E_TEST_SEED_PHRASE` no está definida**: la FASE 5 quedará **BLOCKED** hasta definirla (no se inventa).
- **Idioma**: español. Salidas en `RepoPrueba/`. Hasta la autorización: solo documentación y scripts listos.

**Base cuantitativa del plan**: 41 requisitos `REQ-WALLET-01..41` (EARS), 8 features Gherkin, **125 escenarios** (101 ejecutables + 24 N/A; 83 en modo real, 18 en modo simulada), runner Playwright 1.55 con catálogo verificador y salida NDJSON.

---

## 2. Matriz plataformas × wallets × navegadores (catálogo)

Leyenda: **S** = soportado (combinación en alcance) · **N/A** = combinación inexistente (nunca FAIL) · **modo**: `real` (build descargable cargable con `--load-extension`, o wallet nativa del navegador) / `simulada` (proveedor EIP-1193 mock de `wallet-mock.ts`, porque solo hay instalación manual desde tienda o la automatización GUI no está disponible).

### 2.1 Matriz

| Plataforma (navegador) | metamask | phantom | rabby | coinbase | trust | okx | brave |
|---|---|---|---|---|---|---|---|
| **desktop** (Chromium sin extensión) | N/A — no existe app de escritorio de MetaMask (ESC-027, ESC-050) | S · **simulada** — Phantom Desktop existe pero requiere instalación manual y su automatización GUI no está disponible (ESC-018; ESC-114 es N/A si la app no es automatizable) | S · **real** — Rabby Desktop tiene build descargable (ESC-017) | N/A — sin app de escritorio objetivo (ESC-028, ESC-073) | N/A — sin app de escritorio objetivo (ESC-029, ESC-074) | S · **simulada** — OKX Desktop requiere instalación manual, automatización GUI limitada (ESC-019) | N/A — Brave Wallet es nativa del navegador Brave, no hay app de escritorio (ESC-030) |
| **extension-chrome** (Chrome / Brave) | S · **real** — build oficial descargable con `--load-extension`; wallet de referencia (54 escenarios) | S · **simulada** — solo tienda Chrome Web Store, sin build automatizable (ESC-007) | S · **real** — build descargable (GitHub releases) (ESC-005) | S · **simulada** — solo tienda, sin build automatizable (ESC-008) | S · **simulada** — solo tienda, sin build automatizable (ESC-009) | S · **simulada** — solo tienda, sin build automatizable (ESC-006) | S · **real** — **nativa dentro del navegador Brave** (`channel: brave`); N/A en Chrome estándar (ESC-010 real; ESC-024 y ESC-090 son @na) |
| **extension-firefox** (Firefox) | S · **real** — build Firefox (XPI/perfil preparado `E2E_FIREFOX_PROFILE`; Playwright no soporta `--load-extension` en Firefox stock) | S · **simulada** — solo tienda Firefox, instalación manual (ESC-012) | S · **real** — build Firefox descargable (catálogo: existe; sin escenario representativo asignado en FASE 2, quedará NOT_RUN) | N/A — Coinbase no publica extensión para Firefox (catálogo) | N/A — Trust solo publica extensiones Chromium (ESC-020, ESC-049) | S · **simulada** — solo tienda Firefox (ESC-013) | N/A — Brave Wallet solo existe dentro del navegador Brave (ESC-025, ESC-107) |
| **extension-edge** (Edge) | S · **real** — build Chromium reutilizable (ESC-014) | N/A — no existe extensión Phantom para Edge (ESC-021, ESC-048, ESC-072) | S · **real** — build descargable (ESC-015) | N/A — no existe extensión Coinbase para Edge (ESC-022, ESC-060, ESC-089) | N/A — Trust solo publica extensiones Chromium (ESC-023, ESC-106) | S · **simulada** — solo tienda Edge Add-ons (ESC-016) | N/A — Brave Wallet solo existe dentro del navegador Brave (ESC-026, ESC-125) |

### 2.2 Notas de la matriz

- **`@wallet:<proyecto>` NO APLICA**: el proyecto es una dApp web Next.js **sin wallet propia**. El objetivo primario es la dApp operada con las wallets anteriores inyectadas en cada navegador; la etiqueta se documenta aquí como no aplicable y no aparece en ningún escenario (decisión confirmada por el usuario).
- **Modo real**: exige build descomprimido de la extensión (`E2E_WALLET_BUILD_*`) o el navegador nativo (Brave, `E2E_BRAVE_PATH`). Sin build/perfil → el escenario queda **BLOCKED**, no FAIL.
- **Modo simulada**: wallet solo instalable manualmente desde tienda (Phantom, Coinbase, Trust, OKX) o plataforma desktop: `wallet-mock.ts` inyecta un proveedor EIP-1193 con `eth_chainId 0x7a69`, `wallet_switchEthereumChain`, **4902** en otra red, `personal_sign` y `eth_signTypedData_v4` **deterministas**. Limitación: esas firmas no son ECDSA reales, por lo que los flujos que exigen verificación criptográfica del backend (SIWE `verify`, doble firma EIP-712) solo se validan a fondo en modo real con seed definida (§5).
- **Coinbase/Firefox**: el catálogo de disponibilidad (`catalogo-wallets.ts`) la marca inexistente (solo extensión Chromium); se documenta como N/A de catálogo, nunca FAIL.
- **Rabby/Firefox**: existe según catálogo (build Firefox); FASE 2 no le asignó escenario representativo, por lo que se ejecutará como **NOT_RUN** salvo que FASE 5 lo amplié (§6, riesgo R3).
- **Combinaciones N/A totales**: 24 escenarios `@na` (detalle en `matriz_trazabilidad.md` §3.3). Nunca cuentan como fallo.

---

## 3. Contadores del plan

| Métrica | Valor |
|---|---|
| Requisitos EARS (`REQ-WALLET-01..41`) | **41** |
| Requisitos con ≥1 escenario ejecutable | 41 (cobertura 100 %, 0 sin escenario) |
| Features (`.feature`) | **8** (01 conexión, 02 entrada única, 03 validación, 04 cambio wallet EIP-712, 05 flujos admin, 06 downgrade tope 80 %, 07 perfil, 08 cambio red) |
| Escenarios totales | **125** |
| — Ejecutables | 101 |
| — N/A (`@na`, catálogo) | 24 |
| — Modo real / simulada (ejecutables) | 83 / 18 |
| — Prioridad alta / media / baja (ejecutables) | 44 / 52 / 5 |

### 3.1 Escenarios ejecutables por plataforma × wallet (matriz de trazabilidad)

| Plataforma | metamask | phantom | rabby | coinbase | trust | okx | brave | Total |
|---|---|---|---|---|---|---|---|---|
| desktop | N/A | 1 | 5 | N/A | N/A | 1 | N/A | **7** |
| extension-chrome | 54 | 1 | 1 | 1 | 1 | 7 | 8 | **73** |
| extension-firefox | 7 | 3 | (catálogo, sin escenario) | N/A | N/A | 1 | N/A | **11** |
| extension-edge | 1 | N/A | 7 | N/A | N/A | 2 | N/A | **10** |
| **Total** | **62** | **5** | **13** | **1** | **1** | **11** | **8** | **101** |

Nota: el peso de MetaMask en Chrome (54) es deliberado: es la wallet de referencia EIP-1193 canónica con build descargable, usada para cubrir a fondo los 41 requisitos; el resto de wallets cubren los mismos flujos en su combinación representativa.

---

## 4. Requisitos del entorno (previos a FASE 5)

| # | Requisito | Estado | Detalle |
|---|---|---|---|
| E1 | **Anvil** accesible: `E2E_RPC_URL=http://100.85.239.67:8545` (vm-blockchain, chainId 31337 = `0x7a69`); en Cloud Run `http://10.140.0.4:8546` (proxy VPC) | ✅ Definido | El runner comprueba `eth_chainId = 0x7a69` al arrancar; cuentas de referencia en `BaseOperaciones/cuentas_anvil.md` (admin #0 `0xb4eCE9…200DF`, empleado #2 `0x89Dd…4eBe`, …). Sin faucet necesario (≈10.000 ETH por cuenta). |
| E2 | **`E2E_TEST_SEED_PHRASE`** — seed de PRUEBA (funds de testnet/Anvil) | ⛔ **PENDIENTE → BLOCKED** | **No está definida y NO se inventa**. Hasta que el usuario la defina, los escenarios que usan cuentas reales quedan **BLOCKED** (regla 7). Debe ser una seed exclusiva de pruebas; **nunca se imprime en logs, capturas ni NDJSON**. |
| E3 | **Builds descomprimidos de extensiones** (modo real) | ⚠️ **PENDIENTE: rutas** | `E2E_WALLET_BUILD_METAMASK` (Chrome/Edge + variante Firefox), `E2E_WALLET_BUILD_RABBY` (+ Firefox), `E2E_BRAVE_PATH` (ejecutable de Brave). Descargar de las fuentes oficiales y apuntar las variables. Sin build → **BLOCKED**. |
| E4 | **Playwright 1.55** | ✅ Disponible | Ya instalado en `web/node_modules`; se carga por ruta absoluta. Node 22+ (instalado v22.23, ejecuta `.ts` por *type stripping*). Sin dependencias nuevas. |
| E5 | **MongoDB para la dApp** | ⚠️ A configurar | Local o en memoria; debe contener `system_config` (direcciones Brlt/BrltX), `admin_allowlist` con ≥1 `super_admin` activo y datos de empleados/flujos de prueba. |
| E6 | **dApp servida** en `E2E_BASE_URL` (default `http://localhost:3000`) | ⚠️ A configurar | Verificar que responde `/entrar`. Para cookies `Secure`/`HttpOnly` en pruebas HTTP se asume `NODE_ENV != production` ([SUPUESTO] S8). |
| E7 | **Navegadores**: Chrome, Firefox, Edge instalados; Brave instalado (nativo) | ⚠️ A verificar | Firefox requiere **perfil preparado** con la extensión instalada (`E2E_FIREFOX_PROFILE`): Playwright 1.55 no soporta `--load-extension` en Firefox stock. Sin perfil → escenarios Firefox **BLOCKED**. |
| E8 | **Variables `E2E_*`** | ✅ Definidas | Ver matriz completa en `04_script_automatizacion/README.md` §3: `E2E_BASE_URL`, `E2E_RPC_URL`, `E2E_TEST_SEED_PHRASE`, `E2E_PLATFORMS`, `E2E_WALLETS`, `E2E_PRIORIDAD`, `E2E_HEADLESS`, `E2E_TIMEOUT_MS`, `E2E_WALLET_BUILD_*`, `E2E_BRAVE_PATH`, `E2E_FIREFOX_PROFILE`. |

**Seguridad de la seed**: `E2E_TEST_SEED_PHRASE` debe ser una seed de **PRUEBA** (funds de testnet/Anvil), nunca una seed con fondos reales; el runner no la registra en NDJSON, logs ni capturas.

---

## 5. Limitaciones explícitas

1. **Wallets solo-tienda en modo simulada**: Phantom, Coinbase, Trust y OKX (extensiones) no tienen build descargable automatizable → siempre `@modo:simulada` con proveedor EIP-1193 mock; se valida detección, conexión y UX, no el flujo criptográfico completo.
2. **Limitación criptográfica del mock**: las firmas deterministas no superan el `ecrecover` del backend; SIWE `verify` y la doble firma EIP-712 del cambio de wallet requieren wallet real (build) + seed definida.
3. **iOS/Android fuera de alcance** (confirmado por el usuario): no se generan escenarios móviles.
4. **desktop con wallet simulada**: en el runner, `desktop` = Chromium plano + wallet simulada. Las wallets de escritorio reales (Rabby Desktop, Phantom Desktop, OKX Desktop) quedan como **OPCIÓN MANUAL**: ejecutar a mano los pasos del `.feature` y adjuntar la captura PNG con el patrón de nombre de la regla 5.
5. **Firefox sin `--load-extension`**: requiere perfil pre-configurado; sin él, escenarios Firefox → **BLOCKED** (no FAIL).
6. **Popups de extensiones en modo real**: el esqueleto de FASE 3 no automatiza los popups de MetaMask/Rabby (exigen driver propio por wallet); esos pasos se reportan **NOT_RUN** con detalle hasta FASE 5.
7. **Intérprete de pasos de caja negra**: cubre navegación, clics por texto, afirmaciones visibles, `window.ethereum` y estado de botones; pasos no cubiertos dejan el escenario **NOT_RUN** (no fallan).
8. **Estados posibles**: `PASS` · `FAIL` · `BLOCKED` (falta seed/build/perfil) · `N/A` (catálogo, nunca FAIL) · `NOT_RUN` (filtrado o pasos sin intérprete).

---

## 6. Riesgos y [SUPUESTO] pendientes de confirmar

### 6.1 Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | `E2E_TEST_SEED_PHRASE` sin definir → FASE 5 BLOCKED para todo escenario con cuentas reales. | Usuario la define antes de ejecutar; se verifica que es seed de PRUEBA. |
| R2 | Builds de extensiones sin rutas → escenarios modo real BLOCKED. | Descargar builds oficiales y fijar `E2E_WALLET_BUILD_*` / `E2E_BRAVE_PATH`. |
| R3 | Rabby/Firefox existe por catálogo pero no tiene escenario asignado en FASE 2 → NOT_RUN. | Decidir en FASE 5: ampliar features o aceptar cobertura representativa. |
| R4 | Automatización de popups de MetaMask/Rabby incompleta en modo real → NOT_RUN. | Trabajo incremental de FASE 5 (driver de la extensión o build de prueba). |
| R5 | Anomalía A5 (tope 80 % backend-only): la tx on-chain puede mover saldo aunque el backend rechace auditar (`tope_80_superado`). | ESC-095 verifica el comportamiento; confirmar con el equipo si es defecto aceptado. |
| R6 | Anomalía A1: SIWE declara chainId 81234 interno sobre red 31337. | ESC-119/ESC-116 la ejercitan; confirmar documento vs código. |
| R7 | Mongo del entorno de pruebas sin `system_config`/allowlist bootstrap → fallos masivos de sesión. | Verificar E5 y [SUPUESTO] S2/S3 antes de ejecutar. |

### 6.2 [SUPUESTO] del análisis (de `01_analisis_proyecto.md` §9, pendientes de confirmar)

1. [SUPUESTO] `NEXT_PUBLIC_CHAIN_ID=31337` y `NEXT_PUBLIC_RPC_URL=http://100.85.239.67:8545` en el entorno de pruebas (defaults del código: 81234/Besu).
2. [SUPUESTO] BrltX `0x6080788bc70756dD3c73b4AF2936D0eeA135bE71` y BRLT asociados en `system_config`; se leen de `/api/system` al empezar.
3. [SUPUESTO] Existe ≥1 `super_admin` activo en `admin_allowlist` antes del primer SIWE (cuenta #0 de Anvil).
4. [SUPUESTO] Cambio de red con sesión abierta no bloquea en vivo (no hay listener `chainChanged`); el bloqueo ocurre al operar.
5. [SUPUESTO] Rate limit por IP estable en pruebas locales (en Cloud Run depende de `x-forwarded-for`).
6. [SUPUESTO] Ventana de retiro: la constante de código (90 días en ms) es la fuente de verdad.
7. [SUPUESTO] `verifyWalletAction` exige RPC alcanzable y evento `Downgraded` parseable; sin RPC, la auditoría del cobro falla aunque la tx ocurriera.
8. [SUPUESTO] En pruebas sobre `http://100.85.239.67` se asume `NODE_ENV != production` para que la cookie de sesión se establezca.
9. [SUPUESTO] Empleado de baja >90 días: solo se verifica el rechazo de login (no hay job de anonimización observable).
10. [SUPUESTO] Controles exactos de `/admin/flujos` y `/admin/empleados` validados contra la página al ejecutar (afecta REQ-WALLET-22/36).
11. [SUPUESTO] `E2E_TEST_SEED_PHRASE` no definida; FASE 5 BLOCKED hasta definirla (no se inventa).
12. [SUPUESTO] No hay banner específico de "contrato pausado" en la Suite; el error llega como revert genérico al cobrar.

---

## 7. Aprobación (BLOQUEANTE)

> El runner **aborta (exit 2)** mientras la primera casilla no esté marcada `[x]` en este archivo (regla 1, `runner.mjs`).

## Aprobación
- [x] Autorizo ejecutar la batería de pruebas (entorno testnet/simulado). — Autorizado por el usuario 2026-11-18
- [ ] Confirmo que E2E_TEST_SEED_PHRASE es una seed de PRUEBA (funds de testnet/Anvil). — PENDIENTE: seed no definida; los escenarios con cuentas reales quedan BLOCKED
- [x] Confirmo el alcance: desktop, extension-chrome, extension-firefox, extension-edge × metamask, phantom, rabby, coinbase, trust, okx, brave. — 2026-11-18

Firma/fecha: ____________

---

## 8. Resultados vivos (se actualiza en FASE 5)

**Ejecución 1 (2026-11-18, autorizada):** 3 PASS · 0 FAIL · 54 BLOCKED (falta build MetaMask) · 25 N/A · 43 NOT_RUN.
Informe: `05_informe_anomalias.md` · Estado por escenario: `06_estado_ejecucion.md`.

> Fuente de verdad: NDJSON de `RepoPrueba/05_resultados/`. Inicial: todo **NOT_RUN** (y **N/A** donde el catálogo lo marca; nunca FAIL).
> Leyenda: P=PASS · F=FAIL · B=BLOCKED · NA=N/A · NR=NOT_RUN.

| Plataforma | Wallet | Estado combo | P | F | B | NA | NR | Total |
|---|---|---|---|---|---|---|---|---|
| desktop | metamask | N/A (catálogo: sin app escritorio) | 0 | 0 | 0 | 2 | 0 | 2 |
| desktop | phantom | En alcance (simulada; ESC-114 es @na) | 0 | 0 | 0 | 2 | 0 | 2 |
| desktop | rabby | En alcance (real, Rabby Desktop) | 0 | 0 | 0 | 0 | 5 | 5 |
| desktop | coinbase | N/A (catálogo) | 0 | 0 | 0 | 2 | 0 | 2 |
| desktop | trust | N/A (catálogo) | 0 | 0 | 0 | 2 | 0 | 2 |
| desktop | okx | En alcance (simulada) | 0 | 0 | 0 | 0 | 1 | 1 |
| desktop | brave | N/A (catálogo: nativa del navegador) | 0 | 0 | 0 | 1 | 0 | 1 |
| extension-chrome | metamask | En alcance (real) | 0 | 0 | 54 | 0 | 0 | 54 |
| extension-chrome | phantom | En alcance (simulada) | 1 | 0 | 0 | 0 | 0 | 1 |
| extension-chrome | rabby | En alcance (real) | 0 | 0 | 0 | 0 | 1 | 1 |
| extension-chrome | coinbase | En alcance (simulada) | 1 | 0 | 0 | 0 | 0 | 1 |
| extension-chrome | trust | En alcance (simulada) | 1 | 0 | 0 | 0 | 0 | 1 |
| extension-chrome | okx | En alcance (simulada) | 0 | 0 | 0 | 0 | 7 | 7 |
| extension-chrome | brave | En alcance (real, navegador Brave; ESC-024/090 @na en Chrome estándar) | 0 | 0 | 0 | 2 | 8 | 10 |
| extension-firefox | metamask | En alcance (real, perfil preparado) | 0 | 0 | 0 | 0 | 7 | 7 |
| extension-firefox | phantom | En alcance (simulada) | 0 | 0 | 0 | 0 | 3 | 3 |
| extension-firefox | rabby | En alcance (catálogo; sin escenario asignado → NOT_RUN) | 0 | 0 | 0 | 0 | 0 | 0 |
| extension-firefox | coinbase | N/A (catálogo) | 0 | 0 | 0 | 0 | 0 | 0 |
| extension-firefox | trust | N/A (catálogo) | 0 | 0 | 0 | 2 | 0 | 2 |
| extension-firefox | okx | En alcance (simulada) | 0 | 0 | 0 | 0 | 1 | 1 |
| extension-firefox | brave | N/A (catálogo) | 0 | 0 | 0 | 2 | 0 | 2 |
| extension-edge | metamask | En alcance (real) | 0 | 0 | 0 | 0 | 1 | 1 |
| extension-edge | phantom | N/A (catálogo) | 0 | 0 | 0 | 3 | 0 | 3 |
| extension-edge | rabby | En alcance (real) | 0 | 0 | 0 | 0 | 7 | 7 |
| extension-edge | coinbase | N/A (catálogo) | 0 | 0 | 0 | 3 | 0 | 3 |
| extension-edge | trust | N/A (catálogo) | 0 | 0 | 0 | 2 | 0 | 2 |
| extension-edge | okx | En alcance (simulada) | 0 | 0 | 0 | 0 | 2 | 2 |
| extension-edge | brave | N/A (catálogo) | 0 | 0 | 0 | 2 | 0 | 2 |
| **TOTAL** | | | **3** | **0** | **54** | **25** | **43** | **125** |

Notas de la tabla viva:

- La columna **NR** inicial equivale a los escenarios ejecutables de la combinación (§3.1); pasará a PASS/FAIL/BLOCKED al ejecutarse.
- La columna **NA** ya está cargada con los 24 escenarios `@na` del catálogo: **no se ejecutan y nunca serán FAIL**.
- Rabby/Firefox y Coinbase/Firefox no tienen escenarios asignados en la matriz de trazabilidad ( Total 0): se ejecutarán solo si FASE 5 los amplía (riesgo R3).
- Bloqueos esperados al arrancar sin preparar el entorno: sin seed → B en escenarios con cuentas reales; sin build → B en modo real; sin perfil Firefox → B en extension-firefox.

---

*Fin de FASE 4. Para autorizar la ejecución, marcar la primera casilla del §7 como `[x]` (y, idealmente, las tres), firmar con fecha, y definir `E2E_TEST_SEED_PHRASE` + rutas de builds (§4). FASE 5 permanecerá BLOCKED hasta entonces.*
