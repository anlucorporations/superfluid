# FASE 2 — Feature 03: Validación continua de wallet en /suite
# Módulo: Suite del Empleado — eth_accounts al montar, evento accountsChanged, poll cada 10 s,
#   aviso "Wallet distinta a tu sesión", bloqueo de firmas, sesión inválida → /entrar.
# Requisitos cubiertos: REQ-WALLET-16, 17, 18, 19.
# Objetivo primario: la dApp Superfluid Brlt (/suite) en el navegador con la wallet inyectada.
#   @wallet:<proyecto> NO APLICA: el proyecto es una dApp web sin wallet propia.
# Regla 9: @modo:real (MetaMask, Rabby, Brave nativo) / @modo:simulada (Phantom, Coinbase, Trust, OKX).
# Red: Anvil vm-blockchain, chainId 31337 (0x7a69), RPC http://100.85.239.67:8545.
# Textos reales de la dApp: "Wallet distinta a tu sesión", "La wallet conectada (0x…) no es la de tu sesión (0x…). Cambia de cuenta en MetaMask o vuelve a entrar."
# Captura por escenario (regla 5): <ID>_<wallet>_<plataforma>_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-16 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: La Suite lee la cuenta activa al montar con eth_accounts y por poll cada 10 segundos
  Given el empleado 0x89Dd…4eBe está dentro de "/suite" con sesión vigente de 8 horas y MetaMask conectada (chainId 31337)
  When la Suite termina de montar
  Then el sistema consulta eth_accounts y compara la cuenta activa 0x89Dd…4eBe con la wallet de la sesión (lowercase) marcando walletOk = true
  And sin ningún evento del usuario, el poll de 10 segundos repite la comparación y la Suite permanece operable sin banner de aviso
  # captura: ESC-051_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-17 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Al dispararse accountsChanged la Suite muestra el aviso "Wallet distinta a tu sesión" y bloquea la operación
  Given el empleado 0x89Dd…4eBe está dentro de "/suite" con sesión vigente y MetaMask conectada
  When el usuario cambia la cuenta activa de MetaMask a la cuenta empleado #3 0xc4d4…FB41 y se dispara el evento accountsChanged
  Then la Suite muestra el banner "Wallet distinta a tu sesión" con enlace para revalidar en "/entrar"
  And la operación del portal queda bloqueada hasta revalidar
  # captura: ESC-052_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-17 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: El poll de 10 segundos detecta la cuenta distinta incluso sin evento accountsChanged
  Given el empleado 0x89Dd…4eBe está dentro de "/suite" con sesión vigente y MetaMask conectada
  When la cuenta activa de MetaMask pasa a 0xf100…2C28 en una situación donde el evento accountsChanged no es observado por la Suite
  Then el poll de 10 segundos (eth_accounts + setInterval) detecta que la cuenta activa no coincide con la wallet de la sesión
  And la Suite muestra el banner "Wallet distinta a tu sesión" y bloquea la operación hasta revalidar en "/entrar"
  # captura: ESC-053_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-18 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Intento de cobro con wallet distinta a la sesión se impide antes de firmar
  Given el empleado 0x89Dd…4eBe está dentro de "/suite" con sesión vigente pero la cuenta activa de MetaMask es 0xc4d4…FB41
  And el empleado tiene BrltX en cartera y disponible del tope 80% mayor que 0
  When el usuario introduce 100.000000 BRLT en el importe de "Downgrade de flujos" y pulsa "Descargar"
  Then el sistema impide la firma con el mensaje "La wallet conectada (0xc4d4…FB41) no es la de tu sesión (0x89Dd…4eBe). Cambia de cuenta en MetaMask o vuelve a entrar."
  And no se envía ninguna transacción a la cadena ni aparece la ventana de firma en MetaMask
  # captura: ESC-054_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-19 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Sesión expirada o revocada redirige a /entrar antes de mostrar datos del empleado
  Given el empleado 0x89Dd…4eBe abrió "/suite" hace más de 8 horas (TTL de sesión empleado vencida) o su sesión fue revocada
  When la Suite comprueba la validez de la sesión al cargar
  Then el sistema redirige a "/entrar" antes de mostrar cualquier dato del empleado (saldo, flujos o perfil)
  # captura: ESC-055_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-16 @plataforma:extension-firefox @navegador:firefox @wallet:metamask @modo:real @prioridad:media
Escenario: Lectura de cuenta activa al montar y poll de 10 s en Firefox con MetaMask
  Given el empleado 0x89Dd…4eBe está dentro de "/suite" en Firefox con la extensión MetaMask (build descargable) y sesión vigente
  When la Suite termina de montar y transcurren al menos 10 segundos sin acciones del usuario
  Then eth_accounts devuelve 0x89Dd…4eBe, coincide con la wallet de la sesión y la Suite permanece operable
  # captura: ESC-056_metamask_extension-firefox_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-17 @plataforma:extension-edge @navegador:edge @wallet:rabby @modo:real @prioridad:media
Escenario: Cambio de cuenta en Rabby en Edge dispara el aviso "Wallet distinta a tu sesión"
  Given el empleado 0x89Dd…4eBe está dentro de "/suite" en Edge con la extensión Rabby y sesión vigente
  When el usuario cambia la cuenta activa de Rabby a 0xc4d4…FB41
  Then la Suite recibe el cambio (evento accountsChanged o poll de 10 s) y muestra el banner "Wallet distinta a tu sesión" con enlace a "/entrar"
  And la operación queda bloqueada hasta revalidar
  # captura: ESC-057_rabby_extension-edge_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-18 @plataforma:extension-chrome @navegador:brave @wallet:brave @modo:real @prioridad:media
Escenario: Intento de cobro con cuenta distinta se impide en el navegador Brave
  Given el empleado 0x89Dd…4eBe está dentro de "/suite" en el navegador Brave con sesión vigente pero la cuenta activa de Brave Wallet es 0xf100…2C28
  When el usuario intenta descargar 50.000000 BRLT desde "Downgrade de flujos"
  Then el sistema impide la firma con el mensaje "La wallet conectada (0xf100…2C28) no es la de tu sesión (0x89Dd…4eBe). Cambia de cuenta en MetaMask o vuelve a entrar."
  And no se envía ninguna transacción
  # captura: ESC-058_brave_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-16 @plataforma:extension-chrome @navegador:chrome @wallet:okx @modo:simulada @prioridad:media
Escenario: Poll de validación continua en Chrome con OKX Wallet (instalación manual → simulada)
  Given el empleado 0x89Dd…4eBe está dentro de "/suite" en Chrome con la extensión OKX Wallet y sesión vigente
  When transcurren al menos 10 segundos sin acciones del usuario
  Then el poll de 10 segundos consulta eth_accounts de OKX, la cuenta 0x89Dd…4eBe coincide con la sesión y la Suite permanece operable
  # captura: ESC-059_okx_extension-chrome_YYYY-MM-DD_HHMMSS.png

# ---------------------------------------------------------------- N/A

@na @REQ-WALLET-16 @plataforma:extension-edge @navegador:edge @wallet:coinbase @modo:simulada @prioridad:baja
Escenario: N/A — validación continua no ejecutable con Coinbase en Edge (combinación inexistente)
  Given la combinación Coinbase Wallet + extension-edge no existe en el catálogo oficial
  When se intenta planificar la validación continua de wallet en esa combinación
  Then el caso se registra como N/A (no ejecutable, nunca FAIL) para todos los REQ del módulo validación continua
  And la alternativa documentada es Coinbase en extension-chrome
  # captura: ESC-060_coinbase_extension-edge_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)
