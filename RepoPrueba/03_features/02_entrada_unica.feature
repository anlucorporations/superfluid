# FASE 2 — Feature 02: Entrada única con redirección por rol + SIWE (EIP-4361)
# Módulo: /entrar (EntryLogin), roles vía POST /api/auth/role, SIWE 3 propósitos, sesiones, logout.
# Requisitos cubiertos: REQ-WALLET-07, 08, 09, 10, 11, 12, 13, 14, 15, 40.
# Objetivo primario: la dApp Superfluid Brlt (Next.js) en el navegador con la wallet inyectada.
#   @wallet:<proyecto> NO APLICA: el proyecto es una dApp web sin wallet propia.
# Regla 9: @modo:real (MetaMask, Rabby, Brave nativo — build descargable/automatizable);
#          @modo:simulada (Phantom, Coinbase, Trust, OKX — solo instalación manual de tienda).
# Red: Anvil vm-blockchain, chainId 31337 (0x7a69), RPC http://100.85.239.67:8545.
# Textos reales de la dApp usados en los pasos: "Entrar con wallet", "No mueve fondos ni autoriza gastos",
#   "La firma es gratuita", "Esta wallet no tiene acceso a ninguna suite. Pide alta al administrador.", "Salir".
# Captura por escenario (regla 5): <ID>_<wallet>_<plataforma>_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-07 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Wallet de la allowlist admin redirige a /admin tras conectar en /entrar
  Given la dApp Superfluid Brlt está desplegada en http://100.85.239.67 con MetaMask conectada (chainId 31337)
  And la wallet conectada es la cuenta admin #0 de Anvil 0xb4eCE9…200DF, activa en admin_allowlist con rol super_admin
  When el usuario hace clic en "Entrar con wallet" y el sistema consulta POST /api/auth/role
  Then el sistema recibe el rol "admin" y redirige a "/admin"
  And el panel admin muestra las secciones autorizadas para super_admin (incluida la sección "sistema")
  # captura: ESC-031_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-07 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Wallet de empleado activo redirige a /suite tras conectar en /entrar
  Given la dApp está desplegada con MetaMask conectada (chainId 31337)
  And la wallet conectada es la cuenta empleado #2 0x89Dd…4eBe, dada de alta como empleado activo con flujo vigente
  When el usuario hace clic en "Entrar con wallet" y el sistema consulta POST /api/auth/role
  Then el sistema recibe el rol "empleado" y redirige a "/suite"
  And la Suite muestra el saldo BRLT/BrltX y el panel "Downgrade de flujos" del empleado
  # captura: ESC-032_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-08 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Wallet sin acceso recibe el mensaje genérico sin revelar el motivo
  Given la dApp está desplegada con MetaMask conectada (chainId 31337)
  And la wallet conectada es una cuenta de Anvil NO registrada ni como admin ni como empleado (por ejemplo la cuenta #9 de Anvil)
  When el usuario hace clic en "Entrar con wallet" y el sistema consulta POST /api/auth/role
  Then el sistema recibe el rol "ninguno" y muestra "Esta wallet no tiene acceso a ninguna suite. Pide alta al administrador."
  And el mensaje no diferencia entre wallet no registrada, inactiva o de baja vencida
  And no se crea ninguna sesión
  # captura: ESC-033_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-09 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: El nonce SIWE se emite de un solo uso con vigencia de 5 minutos y el mensaje llega preparado
  Given el usuario está en "/entrar" con la wallet admin #0 0xb4eCE9…200DF conectada (chainId 31337)
  When el sistema solicita POST /api/auth/nonce con propósito "admin"
  Then el backend devuelve un nonce EIP-4361 nuevo con vigencia de 5 minutos (SIWE_NONCE_TTL_SECONDS = 300) y el mensaje SIWE preparado con el statement del propósito "admin"
  And el mismo nonce marcado como usado no puede solicitarse de nuevo para verificar (consumo único con usedAt)
  # captura: ESC-034_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-10 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Resumen previo claro antes de firmar el SIWE con personal_sign
  Given el usuario está en "/entrar" con la wallet empleado #2 0x89Dd…4eBe conectada (chainId 31337) y el nonce SIWE cargado
  When el sistema muestra el resumen de firma (componente FirmaResumen) antes de abrir MetaMask
  Then el resumen muestra la wallet 0x89Dd…4eBe, la red 31337, la caducidad de la firma, el texto "La firma es gratuita" y que no se mueven fondos
  And al confirmar, la dApp firma el mensaje SIWE con personal_sign desde la cuenta conectada y MetaMask muestra el mensaje EIP-4361
  # captura: ESC-035_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-11 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Los statements SIWE son ASCII sin acentos y distinguibles por propósito
  Given el sistema construye los mensajes SIWE en el servidor para los 3 propósitos
  When se pide un nonce para el propósito "admin"
  Then el mensaje firmado contiene exactamente "Acceder al panel de administracion de Superfluid Brlt. Esta firma solo prueba que esta wallet es tuya. No mueve fondos ni autoriza gastos."
  When se pide un nonce para el propósito "suite"
  Then el mensaje firmado contiene exactamente "Acceder a tu Portal del Empleado de Superfluid Brlt. Esta firma solo prueba que esta wallet es tuya. No mueve fondos ni autoriza gastos."
  When se pide un nonce para el propósito "admin" desde el alta de allowlist en /admin/sistema
  Then el mensaje firmado contiene exactamente "Confirmar esta wallet como administradora de Superfluid Brlt. Esta firma no mueve fondos ni autoriza gastos."
  And ninguno de los tres statements contiene acentos ni caracteres no ASCII
  # captura: ESC-036_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-12 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: La firma SIWE verificada crea una sesión opaca con cookies seguras y CSRF
  Given el usuario en "/entrar" firma el mensaje SIWE del propósito "suite" con la wallet 0x89Dd…4eBe y MetaMask lo confirma
  When la firma llega a POST /api/auth/verify
  Then el backend la verifica con ecrecover comprobando dominio, nonce de un solo uso y wallet del mensaje
  And el nonce queda consumido (usedAt) y no es reutilizable
  And se crea una sesión opaca con token hasheado en MongoDB y cookies Secure/HttpOnly/SameSite=Strict más token CSRF double-submit
  And el usuario queda dentro de "/suite" con su rol empleado
  # captura: ESC-037_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-13 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Rechazo de la firma SIWE permite reintentar con nonce nuevo y aplica el rate-limit 5/15
  Given el usuario está en "/entrar" con la wallet 0x89Dd…4eBe y la pantalla muestra el resumen de firma
  When el usuario rechaza la firma personal_sign en MetaMask
  Then el sistema aborta el acceso mostrando el error de cancelación y permanece en "/entrar" sin sesión
  And el sistema permite reintentar solicitando un nonce nuevo en la misma pantalla
  And al acumular 5 intentos por wallet 0x89Dd…4eBe + IP en 15 minutos, el backend rechaza nuevos nonces y verificaciones con el rate-limit AUTH_RATE_LIMIT
  # captura: ESC-038_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-13 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:media
Escenario: Nonce SIWE vencido a los 5 minutos obliga a reintentar con nonce nuevo
  Given el usuario en "/entrar" obtuvo un nonce SIWE y espera más de 5 minutos (SIWE_NONCE_TTL_SECONDS = 300) antes de firmar
  When el usuario firma el mensaje con la wallet 0xb4eCE9…200DF y la firma llega a POST /api/auth/verify
  Then el backend rechaza la verificación porque el nonce está vencido
  And la pantalla "/entrar" permite reintentar con un nonce nuevo sin recargar la página
  # captura: ESC-039_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-14 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Sesión admin TTL 2 horas y sesión empleado TTL 8 horas según el propósito SIWE
  Given la wallet admin #0 0xb4eCE9…200DF está activa en admin_allowlist y la wallet #2 0x89Dd…4eBe es empleado activo
  When 0xb4eCE9…200DF firma el SIWE con propósito "admin" y verifica
  Then se crea una sesión admin con TTL de 2 horas
  When 0x89Dd…4eBe firma el SIWE con propósito "suite" y verifica
  Then se crea una sesión empleado con TTL de 8 horas
  And ninguna de las dos sesiones acepta el rol contrario (la sesión admin no sirve para /suite y la de empleado no para /admin)
  # captura: ESC-040_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-15 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Navegación por rol con sesión vigente y redirección a /entrar sin sesión
  Given la dApp está desplegada en http://100.85.239.67 con chainId 31337
  When un usuario con sesión admin vigente (0xb4eCE9…200DF) abre "/admin"
  Then el sistema sirve los datos solo de las secciones autorizadas por la allowlist de su rol
  When un usuario con sesión empleado vigente (0x89Dd…4eBe) abre "/suite"
  Then el sistema sirve solo los datos de su propio empleado
  When un usuario sin cookie de sesión abre "/suite" o "/admin"
  Then el sistema redirige a "/entrar" antes de mostrar cualquier dato
  # captura: ESC-041_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-40 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Pulsar "Salir" revoca la sesión y devuelve a /entrar exigiendo una nueva firma SIWE
  Given el empleado 0x89Dd…4eBe está dentro de "/suite" con sesión vigente
  When el usuario hace clic en el botón "Salir"
  Then el backend ejecuta POST /api/auth/logout revocando la sesión en MongoDB e invalidando la cookie
  And el usuario es devuelto a "/entrar"
  And una nueva visita a "/suite" exige una nueva firma SIWE (la cookie anterior ya no vale)
  # captura: ESC-042_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-10 @plataforma:extension-firefox @navegador:firefox @wallet:metamask @modo:real @prioridad:media
Escenario: Resumen previo antes de firmar SIWE en Firefox con MetaMask
  Given el usuario está en "/entrar" en Firefox con la extensión MetaMask (build descargable) conectada (chainId 31337) y la wallet admin #1 0x9423…15cEF
  When el sistema muestra el resumen previo de firma
  Then el resumen muestra wallet 0x9423…15cEF, red 31337, caducidad y "La firma es gratuita"
  And MetaMask en Firefox muestra el mensaje SIWE ASCII y firma con personal_sign al confirmar
  # captura: ESC-043_metamask_extension-firefox_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-07 @plataforma:extension-edge @navegador:edge @wallet:rabby @modo:real @prioridad:media
Escenario: Empleado entra por /entrar con Rabby en Edge y es redirigido a /suite
  Given la extensión Rabby está activa en Edge con chainId 31337 y la wallet empleado #2 0x89Dd…4eBe
  When el usuario hace clic en "Entrar con wallet", aprueba la conexión y firma el SIWE de propósito "suite"
  Then el sistema consulta el rol, verifica la firma y redirige a "/suite"
  And la Suite muestra "Wallet conectada" con la cuenta 0x89Dd…4eBe
  # captura: ESC-044_rabby_extension-edge_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-12 @plataforma:extension-chrome @navegador:brave @wallet:brave @modo:real @prioridad:media
Escenario: La firma SIWE verificada crea sesión en el navegador Brave con Brave Wallet nativa
  Given el usuario está en "/entrar" en el navegador Brave con Brave Wallet nativa conectada (chainId 31337) y la wallet empleado #3 0xc4d4…FB41
  When el usuario firma el mensaje SIWE del propósito "suite"
  Then Brave Wallet firma con personal_sign desde 0xc4d4…FB41 y el backend verifica y crea la sesión de 8 horas
  And el usuario queda dentro de "/suite"
  # captura: ESC-045_brave_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-15 @plataforma:extension-chrome @navegador:chrome @wallet:okx @modo:simulada @prioridad:media
Escenario: Navegación por rol en Chrome con OKX Wallet (instalación manual → simulada)
  Given la extensión OKX Wallet está activa en Chrome con chainId 31337 y la wallet empleado #4 0xf100…2C28
  When el empleado con sesión vigente abre "/suite"
  Then el sistema sirve solo los datos del empleado 0xf100…2C28
  And un usuario sin sesión que abre "/suite" es redirigido a "/entrar"
  # captura: ESC-046_okx_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-40 @plataforma:desktop @navegador:desktop @wallet:rabby @modo:real @prioridad:media
Escenario: Pulsar "Salir" en /suite con Rabby Desktop revoca la sesión y vuelve a /entrar
  Given el empleado 0x89Dd…4eBe está dentro de "/suite" abierto en el navegador embebido de Rabby Desktop con sesión vigente
  When el usuario hace clic en "Salir"
  Then la sesión se revoca, la cookie se invalida y el usuario vuelve a "/entrar"
  And la siguiente visita exige una nueva firma SIWE en Rabby Desktop
  # captura: ESC-047_rabby_desktop_YYYY-MM-DD_HHMMSS.png

# ---------------------------------------------------------------- N/A

@na @REQ-WALLET-07 @plataforma:extension-edge @navegador:edge @wallet:phantom @modo:simulada @prioridad:baja
Escenario: N/A — flujo de entrada única no ejecutable con Phantom en Edge (combinación inexistente)
  Given la combinación Phantom + extension-edge no existe en el catálogo oficial
  When se intenta planificar el flujo de entrada única en esa combinación
  Then el caso se registra como N/A (no ejecutable, nunca FAIL) para todos los REQ del módulo entrada única
  And la alternativa documentada es Phantom en extension-chrome o extension-firefox
  # captura: ESC-048_phantom_extension-edge_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-07 @plataforma:extension-firefox @navegador:firefox @wallet:trust @modo:simulada @prioridad:baja
Escenario: N/A — flujo de entrada única no ejecutable con Trust Wallet en Firefox (combinación inexistente)
  Given la combinación Trust Wallet + extension-firefox no existe en el catálogo oficial
  When se intenta planificar el flujo de entrada única en esa combinación
  Then el caso se registra como N/A (no ejecutable, nunca FAIL) para todos los REQ del módulo entrada única
  And la alternativa documentada es Trust Wallet en extension-chrome
  # captura: ESC-049_trust_extension-firefox_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-07 @plataforma:desktop @navegador:desktop @wallet:metamask @modo:simulada @prioridad:baja
Escenario: N/A — flujo de entrada única no ejecutable con MetaMask en desktop (combinación inexistente)
  Given la combinación MetaMask + desktop no existe en el catálogo oficial (MetaMask solo extensión y móvil)
  When se intenta planificar el flujo de entrada única en esa combinación
  Then el caso se registra como N/A (no ejecutable, nunca FAIL) para todos los REQ del módulo entrada única
  And la alternativa documentada es MetaMask en extension-chrome/firefox/edge
  # captura: ESC-050_metamask_desktop_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)
