# FASE 2 — Feature 01: Conexión de wallet
# Módulo: detección de wallet EIP-1193 (W1) y conexión (W2) en /entrar, /login, /suite/login.
# Requisitos cubiertos: REQ-WALLET-01, REQ-WALLET-02.
# Objetivo primario: la dApp Superfluid Brlt (Next.js, /entrar) ejecutándose en el navegador con la wallet
#   inyectada. El proyecto NO tiene wallet propia: la etiqueta @wallet:<proyecto> NO APLICA (dApp web).
# Regla de modo (regla 9): @modo:real cuando la extensión es automatizable con build descargable
#   (MetaMask, Rabby; Brave Wallet nativa en navegador Brave). @modo:simulada cuando solo hay instalación
#   manual desde tienda (Phantom, Coinbase, Trust, OKX).
# Red de pruebas: Anvil vm-blockchain, chainId 31337 (hex 0x7a69), RPC http://100.85.239.67:8545
#   (Cloud Run: http://10.140.0.4:8546). Direcciones: ver BaseOperaciones/cuentas_anvil.md
#   (admin #0 0xb4eCE9…200DF, admin sistema #1 0x9423…15cEF, empleados #2..#4 0x89Dd…4eBe, 0xc4d4…FB41, 0xf100…2C28).
# Captura por escenario (regla 5): RepoPrueba/capturas/<ID>_<wallet>_<plataforma>_YYYY-MM-DD_HHMMSS.png
# Combinaciones inexistentes del catálogo → escenario @na marcado N/A (nunca FAIL).

@REQ-WALLET-01 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Detección de la wallet MetaMask inyectada en la entrada única
  Given la dApp Superfluid Brlt está desplegada en http://100.85.239.67 con la extensión MetaMask (build descargable) activa en Chrome
  And la wallet MetaMask está configurada con la red de pruebas chainId 31337 (hex 0x7a69, RPC http://100.85.239.67:8545)
  When el usuario abre la ruta "/entrar"
  Then el sistema detecta la wallet EIP-1193 vía window.ethereum y muestra el botón "Entrar con wallet" habilitado
  And no se muestra el aviso de instalación de wallet
  # captura: ESC-001_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Sin wallet inyectada se muestra el aviso de instalación y el acceso queda deshabilitado
  Given la dApp Superfluid Brlt está desplegada en http://100.85.239.67 con un perfil de Chrome SIN ninguna extensión de wallet
  When el usuario abre la ruta "/entrar"
  Then el sistema no detecta window.ethereum y muestra el aviso "No se detecta ninguna wallet. Instala MetaMask (u otra wallet EIP-1193) y recarga."
  And el botón "Entrar con wallet" permanece deshabilitado
  And no se inicia sesión ni se solicita ninguna firma
  # captura: ESC-002_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-02 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Pulsar "Entrar con wallet" solicita cuentas con eth_requestAccounts y la wallet devuelve una cuenta
  Given el usuario está en "/entrar" con MetaMask detectada (chainId 31337) y la cuenta admin #0 de Anvil 0xb4eCE9…200DF desbloqueada
  When el usuario hace clic en "Entrar con wallet" y aprueba la solicitud de conexión en MetaMask
  Then el sistema recibe las cuentas vía eth_requestAccounts y normaliza la cuenta activa 0xb4eCE9…200DF con getAddress
  And la dApp continúa el flujo de entrada única sin error
  # captura: ESC-003_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-02 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: La wallet no devuelve ninguna cuenta y el sistema muestra el error sin crear sesión
  Given el usuario está en "/entrar" con MetaMask detectada pero sin cuentas autorizadas para la dApp (permiso de conexión denegado en la configuración de MetaMask)
  When el usuario hace clic en "Entrar con wallet" y la wallet devuelve un array vacío de cuentas
  Then el sistema muestra el error "La wallet no devolvió ninguna cuenta"
  And no se crea ninguna sesión ni cookie de autenticación
  # captura: ESC-004_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:extension-chrome @navegador:chrome @wallet:rabby @modo:real @prioridad:media
Escenario: Detección y conexión de la wallet Rabby inyectada en Chrome
  Given la extensión Rabby (build descargable de GitHub) está activa en Chrome configurada con chainId 31337 y RPC http://100.85.239.67:8545
  When el usuario abre "/entrar" y hace clic en "Entrar con wallet" aprobando la conexión con la cuenta empleado #2 0x89Dd…4eBe
  Then el sistema detecta window.ethereum de Rabby, muestra el botón habilitado y obtiene la cuenta 0x89Dd…4eBe
  # captura: ESC-005_rabby_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:extension-chrome @navegador:chrome @wallet:okx @modo:simulada @prioridad:media
Escenario: Detección y conexión de la wallet OKX inyectada en Chrome (instalación manual desde tienda)
  Given la extensión OKX Wallet instalada manualmente desde la tienda (sin build descargable → modo simulada) está activa en Chrome con chainId 31337
  When el usuario abre "/entrar" y hace clic en "Entrar con wallet" aprobando la conexión con la cuenta empleado #3 0xc4d4…FB41
  Then el sistema detecta window.ethereum de OKX y obtiene la cuenta 0xc4d4…FB41
  And el resultado se registra en modo @modo:simulada como limitación del plan maestro
  # captura: ESC-006_okx_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:extension-chrome @navegador:chrome @wallet:phantom @modo:simulada @prioridad:media
Escenario: Detección y conexión de la wallet Phantom inyectada en Chrome (instalación manual desde tienda)
  Given la extensión Phantom instalada manualmente desde la tienda (sin build descargable → modo simulada) está activa en Chrome con chainId 31337
  When el usuario abre "/entrar" y hace clic en "Entrar con wallet" aprobando la conexión con la cuenta empleado #4 0xf100…2C28
  Then el sistema detecta el proveedor EIP-1193 de Phantom y obtiene la cuenta 0xf100…2C28
  # captura: ESC-007_phantom_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:extension-chrome @navegador:chrome @wallet:coinbase @modo:simulada @prioridad:media
Escenario: Detección y conexión de la wallet Coinbase inyectada en Chrome (instalación manual desde tienda)
  Given la extensión Coinbase Wallet instalada manualmente desde la tienda (sin build descargable → modo simulada) está activa en Chrome con chainId 31337
  When el usuario abre "/entrar" y hace clic en "Entrar con wallet" aprobando la conexión con la cuenta empleado #2 0x89Dd…4eBe
  Then el sistema detecta el proveedor EIP-1193 de Coinbase y obtiene la cuenta 0x89Dd…4eBe
  # captura: ESC-008_coinbase_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:extension-chrome @navegador:chrome @wallet:trust @modo:simulada @prioridad:media
Escenario: Detección y conexión de la wallet Trust inyectada en Chrome (instalación manual desde tienda)
  Given la extensión Trust Wallet instalada manualmente desde la tienda (solo extensiones Chromium, sin build descargable → modo simulada) está activa en Chrome con chainId 31337
  When el usuario abre "/entrar" y hace clic en "Entrar con wallet" aprobando la conexión con la cuenta empleado #3 0xc4d4…FB41
  Then el sistema detecta el proveedor EIP-1193 de Trust y obtiene la cuenta 0xc4d4…FB41
  # captura: ESC-009_trust_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:extension-chrome @navegador:brave @wallet:brave @modo:real @prioridad:media
Escenario: Detección y conexión de Brave Wallet nativa dentro del navegador Brave
  Given el navegador Brave está abierto con Brave Wallet nativa (proveedor window.ethereum propio, sin extensión instalable) configurada con chainId 31337
  When el usuario abre "/entrar" y hace clic en "Entrar con wallet" aprobando la conexión con la cuenta empleado #2 0x89Dd…4eBe
  Then el sistema detecta window.ethereum nativo de Brave y obtiene la cuenta 0x89Dd…4eBe
  # captura: ESC-010_brave_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:extension-firefox @navegador:firefox @wallet:metamask @modo:real @prioridad:media
Escenario: Detección y conexión de MetaMask en Firefox
  Given la extensión MetaMask (build descargable para Firefox) está activa en Firefox configurada con chainId 31337
  When el usuario abre "/entrar" y hace clic en "Entrar con wallet" aprobando la conexión con la cuenta admin #1 0x9423…15cEF
  Then el sistema detecta window.ethereum de MetaMask y obtiene la cuenta 0x9423…15cEF
  # captura: ESC-011_metamask_extension-firefox_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:extension-firefox @navegador:firefox @wallet:phantom @modo:simulada @prioridad:media
Escenario: Detección y conexión de Phantom en Firefox (instalación manual desde tienda)
  Given la extensión Phantom instalada manualmente desde la tienda está activa en Firefox con chainId 31337
  When el usuario abre "/entrar" y hace clic en "Entrar con wallet" aprobando la conexión con la cuenta empleado #4 0xf100…2C28
  Then el sistema detecta el proveedor EIP-1193 de Phantom y obtiene la cuenta 0xf100…2C28
  # captura: ESC-012_phantom_extension-firefox_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:extension-firefox @navegador:firefox @wallet:okx @modo:simulada @prioridad:media
Escenario: Detección y conexión de OKX Wallet en Firefox (instalación manual desde tienda)
  Given la extensión OKX Wallet instalada manualmente desde la tienda está activa en Firefox con chainId 31337
  When el usuario abre "/entrar" y hace clic en "Entrar con wallet" aprobando la conexión con la cuenta empleado #3 0xc4d4…FB41
  Then el sistema detecta el proveedor EIP-1193 de OKX y obtiene la cuenta 0xc4d4…FB41
  # captura: ESC-013_okx_extension-firefox_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:extension-edge @navegador:edge @wallet:metamask @modo:real @prioridad:media
Escenario: Detección y conexión de MetaMask en Edge
  Given la extensión MetaMask (build descargable) está activa en Edge configurada con chainId 31337
  When el usuario abre "/entrar" y hace clic en "Entrar con wallet" aprobando la conexión con la cuenta admin #0 0xb4eCE9…200DF
  Then el sistema detecta window.ethereum de MetaMask y obtiene la cuenta 0xb4eCE9…200DF
  # captura: ESC-014_metamask_extension-edge_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:extension-edge @navegador:edge @wallet:rabby @modo:real @prioridad:media
Escenario: Detección y conexión de Rabby en Edge
  Given la extensión Rabby (build descargable) está activa en Edge con chainId 31337
  When el usuario abre "/entrar" y hace clic en "Entrar con wallet" aprobando la conexión con la cuenta empleado #2 0x89Dd…4eBe
  Then el sistema detecta window.ethereum de Rabby y obtiene la cuenta 0x89Dd…4eBe
  # captura: ESC-015_rabby_extension-edge_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:extension-edge @navegador:edge @wallet:okx @modo:simulada @prioridad:media
Escenario: Detección y conexión de OKX Wallet en Edge (instalación manual desde tienda)
  Given la extensión OKX Wallet instalada manualmente desde la tienda está activa en Edge con chainId 31337
  When el usuario abre "/entrar" y hace clic en "Entrar con wallet" aprobando la conexión con la cuenta empleado #4 0xf100…2C28
  Then el sistema detecta el proveedor EIP-1193 de OKX y obtiene la cuenta 0xf100…2C28
  # captura: ESC-016_okx_extension-edge_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:desktop @navegador:desktop @wallet:rabby @modo:real @prioridad:media
Escenario: Detección y conexión con la app de escritorio Rabby Desktop
  Given la aplicación Rabby Desktop (build descargable de código abierto) está instalada y configurada con chainId 31337 y RPC http://100.85.239.67:8545
  When el usuario abre "/entrar" desde el navegador embebido de Rabby Desktop y hace clic en "Entrar con wallet" aprobando la conexión con la cuenta empleado #2 0x89Dd…4eBe
  Then el sistema detecta el proveedor EIP-1193 de Rabby Desktop y obtiene la cuenta 0x89Dd…4eBe
  # captura: ESC-017_rabby_desktop_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:desktop @navegador:desktop @wallet:phantom @modo:simulada @prioridad:baja
Escenario: Detección y conexión con la app de escritorio Phantom Desktop (automatización limitada → simulada)
  Given la aplicación Phantom Desktop está instalada manualmente (automatización GUI limitada → modo simulada) y configurada con chainId 31337
  When el usuario abre "/entrar" desde el navegador embebido de Phantom Desktop y hace clic en "Entrar con wallet" aprobando la conexión con la cuenta empleado #4 0xf100…2C28
  Then el sistema detecta el proveedor EIP-1193 de Phantom Desktop y obtiene la cuenta 0xf100…2C28
  And si la automatización GUI no está disponible el escenario se registra BLOCKED, nunca FAIL
  # captura: ESC-018_phantom_desktop_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-01 @plataforma:desktop @navegador:desktop @wallet:okx @modo:simulada @prioridad:baja
Escenario: Detección y conexión con la app de escritorio OKX Desktop (automatización limitada → simulada)
  Given la aplicación OKX Desktop está instalada manualmente (automatización GUI limitada → modo simulada) y configurada con chainId 31337
  When el usuario abre "/entrar" desde el navegador embebido de OKX Desktop y hace clic en "Entrar con wallet" aprobando la conexión con la cuenta empleado #3 0xc4d4…FB41
  Then el sistema detecta el proveedor EIP-1193 de OKX Desktop y obtiene la cuenta 0xc4d4…FB41
  And si la automatización GUI no está disponible el escenario se registra BLOCKED, nunca FAIL
  # captura: ESC-019_okx_desktop_YYYY-MM-DD_HHMMSS.png

# ---------------------------------------------------------------- N/A (combinaciones inexistentes del catálogo)

@na @REQ-WALLET-01 @plataforma:extension-firefox @navegador:firefox @wallet:trust @modo:simulada @prioridad:baja
Escenario: N/A — Trust Wallet no existe como extensión para Firefox
  Given la combinación Trust Wallet + extension-firefox no existe en el catálogo oficial de wallets (Trust solo publica extensiones Chromium)
  Then el caso se registra como N/A (no ejecutable, nunca FAIL) en la matriz de trazabilidad y en 06_estado_ejecucion.md
  And la alternativa documentada es Trust Wallet en extension-chrome (ESC-009)
  # captura: ESC-020_trust_extension-firefox_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-01 @plataforma:extension-edge @navegador:edge @wallet:phantom @modo:simulada @prioridad:baja
Escenario: N/A — Phantom no existe como extensión para Edge
  Given la combinación Phantom + extension-edge no existe en el catálogo oficial de wallets
  Then el caso se registra como N/A (no ejecutable, nunca FAIL)
  And la alternativa documentada es Phantom en extension-chrome (ESC-007) o extension-firefox (ESC-012)
  # captura: ESC-021_phantom_extension-edge_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-01 @plataforma:extension-edge @navegador:edge @wallet:coinbase @modo:simulada @prioridad:baja
Escenario: N/A — Coinbase Wallet no existe como extensión para Edge
  Given la combinación Coinbase Wallet + extension-edge no existe en el catálogo oficial de wallets
  Then el caso se registra como N/A (no ejecutable, nunca FAIL)
  And la alternativa documentada es Coinbase en extension-chrome (ESC-008)
  # captura: ESC-022_coinbase_extension-edge_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-01 @plataforma:extension-edge @navegador:edge @wallet:trust @modo:simulada @prioridad:baja
Escenario: N/A — Trust Wallet no existe como extensión para Edge
  Given la combinación Trust Wallet + extension-edge no existe en el catálogo oficial de wallets
  Then el caso se registra como N/A (no ejecutable, nunca FAIL)
  And la alternativa documentada es Trust Wallet en extension-chrome (ESC-009)
  # captura: ESC-023_trust_extension-edge_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-01 @plataforma:extension-chrome @navegador:chrome @wallet:brave @modo:simulada @prioridad:baja
Escenario: N/A — Brave Wallet no está disponible en Chrome normal (solo dentro del navegador Brave)
  Given la combinación Brave Wallet + navegador Chrome estándar no existe en el catálogo (Brave Wallet es nativa solo del navegador Brave)
  Then el caso se registra como N/A (no ejecutable, nunca FAIL)
  And la alternativa documentada es Brave Wallet en navegador Brave (ESC-010)
  # captura: ESC-024_brave_extension-chrome_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-01 @plataforma:extension-firefox @navegador:firefox @wallet:brave @modo:simulada @prioridad:baja
Escenario: N/A — Brave Wallet no está disponible en Firefox (solo dentro del navegador Brave)
  Given la combinación Brave Wallet + navegador Firefox no existe en el catálogo
  Then el caso se registra como N/A (no ejecutable, nunca FAIL)
  And la alternativa documentada es Brave Wallet en navegador Brave (ESC-010)
  # captura: ESC-025_brave_extension-firefox_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-01 @plataforma:extension-edge @navegador:edge @wallet:brave @modo:simulada @prioridad:baja
Escenario: N/A — Brave Wallet no está disponible en Edge (solo dentro del navegador Brave)
  Given la combinación Brave Wallet + navegador Edge no existe en el catálogo
  Then el caso se registra como N/A (no ejecutable, nunca FAIL)
  And la alternativa documentada es Brave Wallet en navegador Brave (ESC-010)
  # captura: ESC-026_brave_extension-edge_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-01 @plataforma:desktop @navegador:desktop @wallet:metamask @modo:simulada @prioridad:baja
Escenario: N/A — MetaMask no tiene app de escritorio
  Given la combinación MetaMask + desktop no existe en el catálogo (MetaMask solo ofrece extensión y móvil)
  Then el caso se registra como N/A (no ejecutable, nunca FAIL)
  And la alternativa documentada es MetaMask en extension-chrome (ESC-001)
  # captura: ESC-027_metamask_desktop_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-01 @plataforma:desktop @navegador:desktop @wallet:coinbase @modo:simulada @prioridad:baja
Escenario: N/A — Coinbase Wallet no tiene app de escritorio objetivo de la batería
  Given la combinación Coinbase Wallet + desktop no existe en el catálogo de plataformas confirmadas (escritorio no soportado)
  Then el caso se registra como N/A (no ejecutable, nunca FAIL)
  And la alternativa documentada es Coinbase en extension-chrome (ESC-008)
  # captura: ESC-028_coinbase_desktop_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-01 @plataforma:desktop @navegador:desktop @wallet:trust @modo:simulada @prioridad:baja
Escenario: N/A — Trust Wallet no tiene app de escritorio objetivo de la batería
  Given la combinación Trust Wallet + desktop no existe en el catálogo de plataformas confirmadas (escritorio no soportado)
  Then el caso se registra como N/A (no ejecutable, nunca FAIL)
  And la alternativa documentada es Trust Wallet en extension-chrome (ESC-009)
  # captura: ESC-029_trust_desktop_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-01 @plataforma:desktop @navegador:desktop @wallet:brave @modo:simulada @prioridad:baja
Escenario: N/A — Brave Wallet no tiene app de escritorio (es nativa del navegador Brave)
  Given la combinación Brave Wallet + desktop no existe en el catálogo (se cubre como navegador Brave en extension-chrome)
  Then el caso se registra como N/A (no ejecutable, nunca FAIL)
  And la alternativa documentada es Brave Wallet en navegador Brave (ESC-010)
  # captura: ESC-030_brave_desktop_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)
