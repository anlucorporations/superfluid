# 04 — Script de automatización (FASE 3) · Batería de Caja Negra funcional

> Proyecto: dApp Superfluid Brlt / ANLU corporations. Idioma: español.
> Esta carpeta contiene el **runner + helpers** que EJECUTARÍAN los `.feature` de `03_features/`
> por plataforma y wallet. **NO se ha ejecutado nada en FASE 3**: es documentación + scripts listos.
> La ejecución real (FASE 5) exige la autorización del `00_PLAN_MAESTRO.md` (regla 1).
>
> ⚠️ Esto es una batería de **Caja Negra funcional sobre la UI** de la dApp (Next.js):
> se interactúa con la interfaz como lo haría un usuario (navegación, clics, textos visibles,
> `window.ethereum`). **NO son pruebas unitarias** ni acceden al código interno de la aplicación.

## 1. Arquitectura de la carpeta

```
04_script_automatizacion/
├── runner.mjs                  ← punto de entrada (autorización → inventario → ejecución → NDJSON)
├── README.md                   ← este documento
└── helpers/
    ├── catalogo-wallets.ts     ← catálogo plataformas × wallets (alcance confirmado) + cuentas Anvil públicas
    ├── gherkin.ts              ← parser ligero de Gherkin (sin dependencias externas)
    ├── navegadores.ts          ← lanzamiento Playwright 1.55 por plataforma (--load-extension, perfil dedicado)
    ├── wallet-mock.ts          ← proveedor EIP-1193 simulado (modo simulada) con firmas deterministas
    ├── anvil-reset.ts          ← estado determinista de Anvil (anvil_setBalance / anvil_setIntervalMining / anvil_mine)
    ├── capturar.ts             ← PNG por escenario con la convención de la regla 5
    ├── resultados.ts           ← escritura NDJSON a 05_resultados/
    └── pasos.ts                ← intérprete de pasos de caja negra (navegar, clic, afirmar texto/ethereum/botón)
```

Los helpers están en TypeScript **sin transpilar**: Node 22+ (instalado: v22.23) ejecuta `.ts`
con *type stripping* nativo. No hay dependencias nuevas: Playwright **1.55** ya está en
`/home/lucci/workspace/superfluid/web/node_modules` y se carga por ruta absoluta.

## 2. Preparación del entorno (FASE 5)

1. **dApp**: servir la web en `E2E_BASE_URL` (por defecto `http://localhost:3000`;
   alternativa Cloud Run). Verificar que responde `/entrar`.
2. **Anvil**: `E2E_RPC_URL=http://100.85.239.67:8545` (local/VM) o `http://10.140.0.4:8546` (Cloud Run).
   El runner comprueba `eth_chainId` = `0x7a69` (31337) al arrancar.
3. **Builds de wallets descomprimidos** (modo real): descargar y descomprimir y apuntar las variables:
   - `E2E_WALLET_BUILD_METAMASK` → carpeta del build de MetaMask (Chrome/Edge) o `.xpi`/perfil (Firefox).
   - `E2E_WALLET_BUILD_RABBY` → build de Rabby (GitHub releases).
   - Para builds específicos de Firefox: `E2E_WALLET_BUILD_<WALLET>_FIREFOX`.
4. **Navegadores**: Chrome/Firefox/Edge instalados; para Brave, `E2E_BRAVE_PATH` apuntando
   al ejecutable de Brave (o Playwright usa `channel: 'brave'`).
5. **Semilla**: `E2E_TEST_SEED_PHRASE` **NO está definida**. Según la regla 7 y la decisión del
   usuario, **no se inventa**: los escenarios que usan cuentas reales quedan **BLOCKED** hasta que
   FASE 5 la defina. ⚠️ La semilla **nunca se imprime en logs, capturas ni NDJSON** (ver §6).

## 3. Matriz de variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3000` | Base de la dApp (alternativa: Cloud Run). |
| `E2E_RPC_URL` | `http://100.85.239.67:8545` | RPC de Anvil (chainId 31337 = `0x7a69`). Cloud Run: `http://10.140.0.4:8546`. |
| `E2E_TEST_SEED_PHRASE` | *(sin definir)* | Semilla de las cuentas de prueba. No definida → escenarios con cuentas reales BLOCKED. **Nunca se imprime.** |
| `E2E_PLATFORMS` | `desktop,extension-chrome,extension-firefox,extension-edge` | Plataformas a ejecutar (sin Android/iOS). |
| `E2E_WALLETS` | `metamask,phantom,rabby,coinbase,trust,okx,brave` | Wallets del mercado a ejecutar. |
| `E2E_PRIORIDAD` | `alta,media,baja` | Filtro de prioridad de los tags `@prioridad:*`. |
| `E2E_HEADLESS` | `false` | Las extensiones requieren ventana visible; solo usar `true` para desktop/simulada. |
| `E2E_TIMEOUT_MS` | `60000` | Timeout global por escenario. |
| `E2E_WALLET_BUILD_METAMASK` | — | Ruta del build descomprimido de MetaMask. |
| `E2E_WALLET_BUILD_RABBY` | — | Ruta del build descomprimido de Rabby. |
| `E2E_WALLET_BUILD_<WALLET>_FIREFOX` | — | Build/XPI específico para Firefox (si aplica). |
| `E2E_BRAVE_PATH` | — | Ejecutable del navegador Brave (Brave Wallet es nativa del navegador). |
| `E2E_FIREFOX_PROFILE` | — | Perfil de Firefox preparado con la extensión instalada (ver limitación §7). |

## 4. Plataformas y lanzamiento de navegador

| Plataforma (tag) | Navegador Playwright | Carga de wallet | Modo por wallet |
|---|---|---|---|
| `extension-chrome` | Chromium (`--load-extension`, perfil dedicado en `.e2e/perfiles/…`) | build de la wallet | MetaMask/Rabby: real · Phantom/Coinbase/Trust/OKX: simulada |
| `extension-edge` | Chromium `channel: 'msedge'` (`--load-extension`) | build de la wallet | MetaMask/Rabby: real · OKX: simulada |
| `@navegador:brave` (dentro de `extension-chrome`) | Chromium `channel: 'brave'` | **nativa**: no se carga build | Brave: real |
| `extension-firefox` | Firefox | perfil preparado (`E2E_FIREFOX_PROFILE`) | MetaMask: real · Phantom/OKX: simulada |
| `desktop` | Chromium plano **sin extensión** | proveedor EIP-1193 **simulado** inyectado | todas: simulada |

- **desktop**: la automatización GUI de wallets de escritorio reales (Rabby Desktop, Phantom Desktop,
  OKX Desktop) queda como **OPCIÓN MANUAL** (documentada, no automatizada): se ejecutaría a mano
  siguiendo los pasos del `.feature` y adjuntando la captura PNG con el mismo patrón de nombre.
  En el runner, desktop = Chromium + wallet simulada (wallet-mock.ts).
- **wallet del proyecto**: `@wallet:<proyecto>` **NO APLICA** — el proyecto es una dApp web **sin
  wallet propia**. El objetivo primario es la dApp en cada navegador con wallets inyectadas del mercado.

## 5. Modo real vs modo simulada (regla 9)

- **`@modo:real`**: hay build descargable (MetaMask, Rabby) o navegador nativo (Brave).
  Playwright carga la extensión con `--disable-extensions-except` + `--load-extension` en un
  perfil dedicado, previamente configurado con chainId 31337 y `E2E_RPC_URL`.
- **`@modo:simulada`**: solo instalación manual desde tienda (Phantom, Coinbase, Trust, OKX) y
  toda la plataforma desktop. `wallet-mock.ts` inyecta un proveedor **EIP-1193 mock** que responde:
  - `eth_accounts` / `eth_requestAccounts` → cuenta de prueba (empleado #2 de Anvil),
  - `eth_chainId` → `0x7a69` (31337), `net_version` → `31337`,
  - `wallet_switchEthereumChain` → OK para 31337; **4902** para otra red (habilita probar REQ-WALLET-04),
  - `wallet_addEthereumChain` → OK con la etiqueta que envía la dApp ("Besu Codecrypto" / `CC`),
  - `personal_sign` → **firma determinista** de la cuenta de prueba,
  - `eth_signTypedData_v4` → **firma EIP-712 determinista**,
  - eventos `accountsChanged` / `chainChanged`, y anuncio EIP-6963.
- **Limitación criptográfica (importante)**: las firmas deterministas del mock **no son ECDSA
  reales** y el `ecrecover` del backend no las verificará. En modo simulada se valida la **detección,
  conexión y UX**; los flujos que exigen verificación criptográfica del backend (SIWE `verify`,
  doble firma EIP-712 del cambio de wallet) requieren build real de wallet + semilla definida.
  Esto se documenta como limitación del plan maestro y aparece en el `detalle` del resultado.

## 6. Reglas de la batería implementadas en el runner

1. **Regla 1 — autorización**: el runner ABORTA (exit 2) si `00_PLAN_MAESTRO.md` no existe o no
   contiene la línea `[x] Autorizo ejecutar`. No se ejecuta nada sin el plan maestro aprobado.
2. **Regla 5 — capturas**: cada escenario genera PNG en `RepoPrueba/capturas/` con el patrón
   `<ID>_<wallet>_<plataforma>_YYYY-MM-DD_HHMMSS.png` (p. ej. `ESC-001_metamask_extension-chrome_2026-11-18_143012.png`).
   Los estados N/A y NOT_RUN no generan captura (convenio de la matriz §5).
3. **Regla 7 — seed y builds**: sin `E2E_TEST_SEED_PHRASE` (no definida — no se inventa) los
   escenarios que usan cuentas reales quedan **BLOCKED**; sin build de wallet en modo real → **BLOCKED**.
4. **Catálogo → N/A, nunca FAIL**: los 24 escenarios `@na` (Trust/Firefox, Trust/Edge,
   Phantom/Edge, Coinbase/Edge, Brave solo en Brave, y las wallet sin app de escritorio) se
   registran **N/A**. El runner re-verifica con `catalogo-wallets.ts` aunque falte el tag.
5. **Regla 9 — modo**: los tags `@modo:real|simulada` deciden el lanzamiento (§5).

## 7. Limitaciones documentadas

- **Firefox**: Playwright 1.55 no soporta `--load-extension` en Firefox stock. Se requiere un
  perfil preparado (instalar la extensión manualmente una vez en un perfil de pruebas y apuntar
  `E2E_FIREFOX_PROFILE`). Sin ese perfil, los escenarios Firefox quedan **BLOCKED** (no FAIL).
- **Aprobaciones de popup en modo real**: el esqueleto de FASE 3 no automatiza los popups de las
  extensiones reales (MetaMask/Rabby exigen automatización específica por wallet — driver de la
  propia extensión o build de prueba). Los pasos "aprueba la solicitud…" en modo real quedan
  pendientes y se reportan como **NOT_RUN** con detalle; automatizarlos es trabajo de FASE 5.
- **Wallets solo-tienda** (Phantom, Coinbase, Trust, OKX): siempre modo simulada (§5).
- **desktop**: solo wallet simulada; wallets de escritorio reales → opción manual (§4).
- **Pasos sin intérprete**: el intérprete de caja negra cubre navegación, clics por texto,
  afirmaciones de textos visibles/ocultos, `window.ethereum` y estado de botones. Los pasos no
  cubiertos **no fallan** el escenario: lo dejan **NOT_RUN** con el detalle del primer paso
  pendiente (listado completo disponible al ejecutar). Ampliar el intérprete es incremental.
- **Sin Android/iOS**: fuera del alcance confirmado por el usuario.

## 8. Cómo se reporta a NDJSON

Cada escenario produce **una línea** NDJSON en `RepoPrueba/05_resultados/resultados_<YYYY-MM-DD>.ndjson`:

```json
{"id":"ESC-001","feature":"01_conexion_wallet.feature","escenario":"Detección de la wallet MetaMask inyectada en la entrada única","wallet":"metamask","plataforma":"extension-chrome","modo":"real","estado":"PASS","duracion_ms":4213,"captura":"/home/lucci/workspace/superfluid/RepoPrueba/capturas/ESC-001_metamask_extension-chrome_2026-11-18_143012.png","detalle":""}
```

- Estados: `PASS` (todo lo interpretado superado) · `FAIL` (afirmación fallida) · `BLOCKED`
  (falta seed/build/perfil — regla 7) · `N/A` (catálogo, nunca FAIL) · `NOT_RUN` (filtrado o con
  pasos sin intérprete).
- `05_resultados/` alimenta `06_estado_ejecucion.md` (FASE 5) y la matriz de trazabilidad.
- El cierre en stdout imprime el recuento por estado; el NDJSON es la fuente de verdad.

## 9. Cómo se lanzaría (ejemplos — NO ejecutar en FASE 3)

```bash
cd /home/lucci/workspace/superfluid

# A) Solo Chrome + MetaMask (alta prioridad), RPC de la VM, dApp local:
E2E_PLATFORMS=extension-chrome E2E_WALLETS=metamask E2E_PRIORIDAD=alta \
E2E_WALLET_BUILD_METAMASK=/ruta/metamask-build \
E2E_RPC_URL=http://100.85.239.67:8545 E2E_BASE_URL=http://localhost:3000 \
node RepoPrueba/04_script_automatizacion/runner.mjs

# B) Modo simulada (todas las wallets sin build) en desktop:
E2E_PLATFORMS=desktop E2E_RPC_URL=http://100.85.239.67:8545 \
E2E_BASE_URL=http://localhost:3000 node RepoPrueba/04_script_automatizacion/runner.mjs

# C) Cloud Run (dApp desplegada + Anvil accesible por proxy):
E2E_PLATFORMS=extension-chrome,extension-edge E2E_BASE_URL=https://<cloud-run-url> \
E2E_RPC_URL=http://10.140.0.4:8546 node RepoPrueba/04_script_automatizacion/runner.mjs
```

**Recordatorio**: el primero de los lanzamientos abortará (regla 1) hasta que `00_PLAN_MAESTRO.md`
(FASE 5) exista y contenga `[x] Autorizo ejecutar`. Eso es el comportamiento previsto.

## 10. Nota final

Es una **batería de Caja Negra funcional sobre la UI**, no pruebas unitarias: no se importa código
de `web/src`, no se mockea el backend (salvo el proveedor de wallet en modo simulada) y todas las
comprobaciones pasan por lo que un usuario real vería en el navegador.
