# FASE 2 — Feature 08: Red de pruebas 31337 y cambio de red
# Módulo: ensureChain — eth_chainId, wallet_switchEthereumChain, wallet_addEthereumChain (código 4902),
#   rechazo del switch, etiqueta de red "Besu Codecrypto" / moneda CC (anomalía A2), gap sin listener chainChanged.
# Requisitos cubiertos: REQ-WALLET-03, 04, 05, 06.
# Objetivo primario: la dApp Superfluid Brlt en el navegador con la wallet inyectada.
#   @wallet:<proyecto> NO APLICA: el proyecto es una dApp web sin wallet propia.
# Regla 9: @modo:real (MetaMask, Rabby, Brave nativo) / @modo:simulada (Phantom, Coinbase, Trust, OKX).
# Red: Anvil vm-blockchain, chainId 31337 (hex 0x7a69), RPC http://100.85.239.67:8545 (Cloud Run: http://10.140.0.4:8546).
# Datos concretos: red incorrecta de partida = chainId 1 (Ethereum mainnet en la wallet); red esperada = 0x7a69.
# Captura por escenario (regla 5): <ID>_<wallet>_<plataforma>_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-03 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Con una red distinta de 31337 el sistema pide el cambio de red antes de habilitar operaciones
  Given la dApp Superfluid Brlt está desplegada en http://100.85.239.67 con MetaMask conectada pero con la red activa chainId 1 (Ethereum)
  When el usuario hace clic en "Entrar con wallet" y la dApp ejecuta ensureChain
  Then el sistema lee eth_chainId, detecta 1 ≠ 31337 y llama a wallet_switchEthereumChain con chainId "0x7a69"
  And MetaMask muestra la solicitud de cambio de red y al aprobarse la wallet queda en chainId 31337
  Y ninguna operación firmable o de lectura que exija red se habilita antes de completar el switch
  # captura: ESC-115_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-03 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:media
Escenario: Con chainId 31337 ya activo no se solicita cambio de red
  Given la dApp está desplegada con MetaMask conectada y la red activa ya es chainId 31337 (0x7a69, RPC http://100.85.239.67:8545)
  When el usuario hace clic en "Entrar con wallet" y la dApp ejecuta ensureChain
  Then el sistema lee eth_chainId = 31337 y NO llama a wallet_switchEthereumChain ni a wallet_addEthereumChain
  And el flujo continúa directamente hacia la consulta de rol y el SIWE
  # captura: ESC-116_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-04 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Switch fallido con código 4902 añade la red 31337 con wallet_addEthereumChain y continúa sin recargar
  Given la dApp está desplegada con MetaMask conectada con la red activa chainId 1 y la red 31337 NO está añadida en la wallet
  When ensureChain intenta wallet_switchEthereumChain con "0x7a69" y MetaMask responde con el código 4902 (red no añadida)
  Then el sistema llama a wallet_addEthereumChain con chainId "0x7a69", chainName "Besu Codecrypto", moneda nativa "CC" (18 decimales) y rpcUrls [http://100.85.239.67:8545]
  And al aceptar el usuario en MetaMask la red queda añadida y activa y el flujo continúa sin recargar la página
  # captura: ESC-117_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-05 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Rechazo del cambio de red aborta el acceso sin firmas ni sesión
  Given la dApp está desplegada con MetaMask conectada con la red activa chainId 1
  When MetaMask muestra la solicitud de cambio de red a 0x7a69 y el usuario la rechaza
  Then el sistema aborta el acceso en "/entrar" mostrando el mensaje de cancelación
  And no se solicita ninguna firma (ni SIWE ni transacciones) y no se crea ninguna sesión
  # captura: ESC-118_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-06 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:baja
Escenario: La red añadida se muestra con la etiqueta "Besu Codecrypto" y moneda CC tal como la envía la dApp
  Given la dApp añadió la red 31337 con wallet_addEthereumChain (chainName "Besu Codecrypto", moneda "CC", anomalía A2 del análisis)
  When el usuario abre el selector de redes de MetaMask
  Then la red 31337 aparece con el nombre "Besu Codecrypto" y la moneda nativa "CC" (etiqueta heredada del código de la dApp, no del entorno)
  And el flujo de la dApp no falla por esa etiqueta (verificación de aceptación por wallet)
  # captura: ESC-119_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-03 @plataforma:extension-firefox @navegador:firefox @wallet:metamask @modo:real @prioridad:media
Escenario: Cambio de red a 31337 en Firefox con MetaMask antes de habilitar operaciones
  Given la dApp está desplegada en Firefox con la extensión MetaMask (build descargable) y la red activa chainId 1
  When el usuario hace clic en "Entrar con wallet" y aprueba el cambio de red en MetaMask
  Then ensureChain completa el switch a 0x7a69 y el flujo de entrada continúa (rol y SIWE)
  # captura: ESC-120_metamask_extension-firefox_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-04 @plataforma:extension-edge @navegador:edge @wallet:rabby @modo:real @prioridad:media
Escenario: Añadir la red 31337 con código 4902 en Edge con Rabby
  Given la dApp está desplegada en Edge con la extensión Rabby con la red activa chainId 1 y la red 31337 no añadida
  When el switch a 0x7a69 responde 4902 y Rabby muestra la solicitud de añadir la red
  Then el sistema envía chainId "0x7a69", chainName "Besu Codecrypto", moneda "CC" y rpcUrls [http://100.85.239.67:8545]
  And al aceptar, la red queda activa y el flujo continúa sin recargar
  # captura: ESC-121_rabby_extension-edge_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-05 @plataforma:extension-chrome @navegador:brave @wallet:brave @modo:real @prioridad:media
Escenario: Rechazo del cambio de red en el navegador Brave aborta el acceso sin sesión
  Given la dApp está desplegada en el navegador Brave con Brave Wallet nativa y la red activa chainId 1
  When el usuario rechaza la solicitud de cambio de red a 0x7a69
  Then el sistema aborta el acceso en "/entrar" sin solicitar ninguna firma ni crear sesión
  # captura: ESC-122_brave_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-03 @plataforma:extension-chrome @navegador:chrome @wallet:okx @modo:simulada @prioridad:media
Escenario: Cambio de red a 31337 en Chrome con OKX Wallet (instalación manual → simulada)
  Given la dApp está desplegada en Chrome con la extensión OKX Wallet y la red activa chainId 1
  When el usuario hace clic en "Entrar con wallet" y aprueba el cambio de red en OKX Wallet
  Then ensureChain completa el switch a 0x7a69 y el flujo de entrada continúa
  And se verifica además que un cambio de red posterior con sesión abierta no se detecta en vivo (no hay listener chainChanged, gap W10) y solo bloquea al intentar operar
  # captura: ESC-123_okx_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-03 @plataforma:desktop @navegador:desktop @wallet:rabby @modo:real @prioridad:media
Escenario: Cambio de red a 31337 en Rabby Desktop antes de habilitar operaciones
  Given la dApp está desplegada en el navegador embebido de Rabby Desktop con la red activa chainId 1
  When el usuario hace clic en "Entrar con wallet" y aprueba el cambio de red a 0x7a69
  Then ensureChain completa el switch a chainId 31337 y el flujo de entrada continúa
  # captura: ESC-124_rabby_desktop_YYYY-MM-DD_HHMMSS.png

# ---------------------------------------------------------------- N/A

@na @REQ-WALLET-03 @plataforma:extension-edge @navegador:edge @wallet:brave @modo:simulada @prioridad:baja
Escenario: N/A — gestión de red no ejecutable con Brave Wallet en Edge (combinación inexistente)
  Given la combinación Brave Wallet + navegador Edge no existe en el catálogo (Brave Wallet es nativa solo del navegador Brave)
  When se intenta planificar la gestión de red 31337 en esa combinación
  Then el caso se registra como N/A (no ejecutable, nunca FAIL) para todos los REQ del módulo cambio de red
  And la alternativa documentada es Brave Wallet en navegador Brave (ESC-122)
  # captura: ESC-125_brave_extension-edge_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)
