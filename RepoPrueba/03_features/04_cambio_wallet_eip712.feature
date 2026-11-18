# FASE 2 — Feature 04: Cambio de wallet del empleado (doble firma EIP-712)
# Módulo: /admin/empleados — nonce purpose "wallet_change", dominio EIP-712 "Superfluid Brlt Streaming" v2,
#   mensajes ChangeWallet (wallet nueva) y AdminStepUp action="change_wallet" (admin), changeReceiver atómico.
# Requisitos cubiertos: REQ-WALLET-20, 21, 22, 23.
# Objetivo primario: la dApp Superfluid Brlt (panel /admin/empleados) en el navegador con wallets inyectadas.
#   @wallet:<proyecto> NO APLICA: el proyecto es una dApp web sin wallet propia.
# Regla 9: @modo:real (MetaMask, Rabby, Brave nativo) / @modo:simulada (Phantom, Coinbase, Trust, OKX).
# Red: Anvil vm-blockchain, chainId 31337 (0x7a69), RPC http://100.85.239.67:8545.
# Datos concretos: empleado #2 0x89Dd…4eBe (wallet antigua), wallet nueva #4 0xf100…2C28,
#   admin step-up #0 0xb4eCE9…200DF, verifyingContract BrltX 0x6080788bc70756dD3c73b4AF2936D0eeA135bE71.
# Captura por escenario (regla 5): <ID>_<wallet>_<plataforma>_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-20 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Preparar el cambio de wallet emite nonce de un solo uso y los dos mensajes EIP-712 ligados al empleado
  Given el admin con la wallet #0 0xb4eCE9…200DF (rol super_admin) está en "/admin/empleados" con MetaMask conectada (chainId 31337)
  And el empleado #2 0x89Dd…4eBe tiene registrada la wallet antigua 0x89Dd…4eBe
  When el admin inicia el cambio de wallet hacia la nueva 0xf100…2C28 y el sistema llama al endpoint de autorización
  Then el backend emite un nonce de un solo uso con propósito "wallet_change" (no válido para login)
  And devuelve el dominio EIP-712 {name: "Superfluid Brlt Streaming", version: "2", chainId: 31337, verifyingContract: "0x6080788bc70756dD3c73b4AF2936D0eeA135bE71"}
  And devuelve los dos mensajes ligados a employeeId + oldWallet 0x89Dd…4eBe + newWallet 0xf100…2C28 + nonce + issuedAt: ChangeWallet (para la wallet nueva) y AdminStepUp con action="change_wallet" (para la wallet admin)
  # captura: ESC-061_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-21 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Ejecución del cambio de wallet con las dos firmas signTypedData_v4 (wallet nueva y admin)
  Given el admin #0 0xb4eCE9…200DF preparó el cambio de wallet del empleado #2 hacia 0xf100…2C28 con nonce vigente
  And la wallet nueva 0xf100…2C28 está disponible en la cuenta activa de MetaMask
  When la wallet nueva 0xf100…2C28 firma ChangeWallet con signTypedData_v4 en MetaMask
  And la wallet admin 0xb4eCE9…200DF firma el step-up AdminStepUp con action="change_wallet" con signTypedData_v4 en MetaMask
  Then el backend verifica ambas firmas por ecrecover (recuperando 0xf100…2C28 y 0xb4eCE9…200DF) antes de persistir el cambio
  And la wallet del empleado #2 queda actualizada a 0xf100…2C28 en MongoDB
  # captura: ESC-062_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-21 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Los campos EIP-712 que muestra la wallet coinciden con el resumen previo de la dApp (CLEAR_SIGNING)
  Given el admin preparó el cambio de wallet del empleado #2 hacia 0xf100…2C28 con el resumen de firma visible (FirmaResumen)
  When MetaMask abre la ventana de firma typed-data del mensaje ChangeWallet
  Then los campos visibles en MetaMask coinciden con el resumen previo: employeeId, oldWallet 0x89Dd…4eBe, newWallet 0xf100…2C28, nonce y issuedAt
  And el dominio mostrado es "Superfluid Brlt Streaming" v2 con chainId 31337 y verifyingContract 0x6080788bc70756dD3c73b4AF2936D0eeA135bE71
  And la dApp informa antes que la firma es gratuita (no mueve fondos ni autoriza gastos)
  # captura: ESC-063_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-22 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: La wallet nueva rechaza la firma ChangeWallet y la operación se cancela sin cambios
  Given el admin preparó el cambio de wallet del empleado #2 hacia 0xf100…2C28 con nonce vigente
  When la wallet nueva 0xf100…2C28 rechaza la firma ChangeWallet en MetaMask
  Then el sistema cancela la operación manteniendo la wallet anterior 0x89Dd…4eBe
  And el flujo activo original del empleado sigue intacto y el registro en MongoDB no cambia
  # captura: ESC-064_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-22 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:media
Escenario: El admin rechaza el step-up AdminStepUp y la operación se cancela sin cambios
  Given el admin #0 0xb4eCE9…200DF preparó el cambio de wallet del empleado #2 hacia 0xf100…2C28
  And la wallet nueva 0xf100…2C28 ya firmó ChangeWallet correctamente
  When la wallet admin 0xb4eCE9…200DF rechaza la firma AdminStepUp en MetaMask
  Then el sistema cancela la operación manteniendo la wallet anterior 0x89Dd…4eBe, el flujo activo y el registro en MongoDB sin cambios
  # captura: ESC-065_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-23 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Cambio de wallet con flujo activo se ejecuta con la transacción atómica changeReceiver
  Given el empleado #2 0x89Dd…4eBe tiene un flujo activo (flowId FLW-EMPLEADO-2 creado con wrapAndCreateFlow) y el cambio de wallet ya tiene las dos firmas verificadas
  When el sistema ejecuta el cambio
  Then la wallet admin firma la transacción atómica changeReceiver hacia 0xf100…2C28 que liquida el flujo antiguo y abre el nuevo en la misma tx
  And la confirmación devuelve el nuevo flowId y la UI muestra el flujo apuntando a 0xf100…2C28
  # captura: ESC-066_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-23 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:media
Escenario: Cambio de wallet de un empleado sin flujo activo solo actualiza MongoDB sin transacción
  Given el empleado #4 0xf100…2C28 no tiene ningún flujo activo y el cambio de wallet hacia 0xc4d4…FB41 ya tiene las dos firmas verificadas
  When el sistema ejecuta el cambio
  Then solo se actualiza el registro del empleado en MongoDB a 0xc4d4…FB41
  And no se solicita ninguna transacción on-chain ni se consume gas
  # captura: ESC-067_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-21 @plataforma:extension-firefox @navegador:firefox @wallet:metamask @modo:real @prioridad:media
Escenario: Doble firma EIP-712 del cambio de wallet en Firefox con MetaMask
  Given el admin #0 0xb4eCE9…200DF opera "/admin/empleados" en Firefox con la extensión MetaMask (build descargable) y chainId 31337
  When el cambio de wallet del empleado #2 hacia 0xf100…2C28 exige las dos firmas
  Then la wallet nueva firma ChangeWallet y la wallet admin firma AdminStepUp con signTypedData_v4 en MetaMask de Firefox
  And el backend verifica ambas firmas por ecrecover y persiste 0xf100…2C28 como wallet del empleado
  # captura: ESC-068_metamask_extension-firefox_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-23 @plataforma:extension-edge @navegador:edge @wallet:rabby @modo:real @prioridad:media
Escenario: changeReceiver atómico del cambio de wallet en Edge con Rabby
  Given el admin #0 0xb4eCE9…200DF opera "/admin/empleados" en Edge con la extensión Rabby y chainId 31337
  And el empleado #2 0x89Dd…4eBe tiene flujo activo y las dos firmas EIP-712 ya verificadas
  When Rabby firma la transacción changeReceiver hacia 0xf100…2C28
  Then la tx liquida el flujo antiguo y abre el nuevo en la misma confirmación y la UI muestra el nuevo flowId
  # captura: ESC-069_rabby_extension-edge_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-21 @plataforma:extension-chrome @navegador:brave @wallet:brave @modo:real @prioridad:media
Escenario: Doble firma EIP-712 del cambio de wallet en el navegador Brave
  Given el admin #0 0xb4eCE9…200DF opera "/admin/empleados" en el navegador Brave con Brave Wallet nativa y chainId 31337
  When el cambio de wallet del empleado #2 hacia 0xf100…2C28 exige las dos firmas
  Then Brave Wallet firma ChangeWallet (wallet nueva) y AdminStepUp (admin) con signTypedData_v4
  And el backend verifica ambas firmas por ecrecover y persiste el cambio
  # captura: ESC-070_brave_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-20 @plataforma:extension-chrome @navegador:chrome @wallet:okx @modo:simulada @prioridad:media
Escenario: Nonce wallet_change y mensajes EIP-712 con OKX Wallet en Chrome (instalación manual → simulada)
  Given el admin #0 0xb4eCE9…200DF opera "/admin/empleados" en Chrome con la extensión OKX Wallet y chainId 31337
  When el admin inicia el cambio de wallet del empleado #2 hacia 0xf100…2C28
  Then el sistema emite el nonce de un solo uso con propósito "wallet_change" y los mensajes ChangeWallet y AdminStepUp ligados al empleado
  And OKX Wallet firma ambos mensajes con signTypedData_v4 para completar la doble verificación
  # captura: ESC-071_okx_extension-chrome_YYYY-MM-DD_HHMMSS.png

# ---------------------------------------------------------------- N/A

@na @REQ-WALLET-20 @plataforma:extension-edge @navegador:edge @wallet:phantom @modo:simulada @prioridad:baja
Escenario: N/A — cambio de wallet no ejecutable con Phantom en Edge (combinación inexistente)
  Given la combinación Phantom + extension-edge no existe en el catálogo oficial
  When se intenta planificar el cambio de wallet EIP-712 en esa combinación
  Then el caso se registra como N/A (no ejecutable, nunca FAIL) para todos los REQ del módulo cambio de wallet
  And la alternativa documentada es Phantom en extension-chrome o extension-firefox
  # captura: ESC-072_phantom_extension-edge_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-20 @plataforma:desktop @navegador:desktop @wallet:coinbase @modo:simulada @prioridad:baja
Escenario: N/A — cambio de wallet no ejecutable con Coinbase en desktop (combinación inexistente)
  Given la combinación Coinbase Wallet + desktop no existe en el catálogo de plataformas confirmadas
  When se intenta planificar el cambio de wallet EIP-712 en esa combinación
  Then el caso se registra como N/A (no ejecutable, nunca FAIL) para todos los REQ del módulo cambio de wallet
  And la alternativa documentada es Coinbase en extension-chrome
  # captura: ESC-073_coinbase_desktop_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-20 @plataforma:desktop @navegador:desktop @wallet:trust @modo:simulada @prioridad:baja
Escenario: N/A — cambio de wallet no ejecutable con Trust en desktop (combinación inexistente)
  Given la combinación Trust Wallet + desktop no existe en el catálogo de plataformas confirmadas
  When se intenta planificar el cambio de wallet EIP-712 en esa combinación
  Then el caso se registra como N/A (no ejecutable, nunca FAIL) para todos los REQ del módulo cambio de wallet
  And la alternativa documentada es Trust Wallet en extension-chrome
  # captura: ESC-074_trust_desktop_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)
