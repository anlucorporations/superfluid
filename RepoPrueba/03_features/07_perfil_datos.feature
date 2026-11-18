# FASE 2 — Feature 07: Perfil y datos personales del empleado (CU-15)
# Módulo: /suite — sección perfil: email/teléfono validados, consentimiento explícito,
#   "Borrar mis datos" con window.confirm (borrado inmediato sin tocar el registro del empleado ni sus flujos).
# Requisitos cubiertos: REQ-WALLET-39.
# Objetivo primario: la dApp Superfluid Brlt (/suite) en el navegador con la wallet inyectada.
#   @wallet:<proyecto> NO APLICA: el proyecto es una dApp web sin wallet propia.
# Regla 9: @modo:real (MetaMask, Rabby, Brave nativo) / @modo:simulada (Phantom, Coinbase, Trust, OKX).
# Red: Anvil vm-blockchain, chainId 31337 (0x7a69), RPC http://100.85.239.67:8545.
# Datos concretos: empleado #2 0x89Dd…4eBe; email de prueba carlos.anlu@ejemplo.com; teléfono +34 600 123 456.
# Captura por escenario (regla 5): <ID>_<wallet>_<plataforma>_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-39 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Guardar el perfil persiste email y teléfono validados con consentimiento
  Given el empleado #2 0x89Dd…4eBe está dentro de "/suite" con sesión vigente y MetaMask conectada (chainId 31337)
  When el empleado abre la sección "Mi perfil" e introduce email carlos.anlu@ejemplo.com y teléfono +34 600 123 456
  And marca el consentimiento explícito de tratamiento de datos y pulsa "Guardar"
  Then el backend (PATCH /api/suite/profile) persiste email y teléfono validados junto al consentimiento del empleado 0x89Dd…4eBe
  And la Suite confirma el guardado y al recargar los datos siguen presentes
  # captura: ESC-108_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-39 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: "Borrar mis datos" con confirmación elimina los datos personales de inmediato sin tocar flujos
  Given el empleado #2 0x89Dd…4eBe tiene email carlos.anlu@ejemplo.com y teléfono +34 600 123 456 guardados con consentimiento
  And el empleado tiene flujos vigentes registrados en Mongo
  When el empleado pulsa "Borrar mis datos" y acepta la confirmación window.confirm
  Then el backend (POST /api/suite/erase) elimina los datos personales de inmediato
  And el registro del empleado 0x89Dd…4eBe y sus flujos permanecen intactos
  And la sección de perfil queda vacía tras la operación
  # captura: ESC-109_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-39 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:media
Escenario: Retirar el consentimiento del tratamiento de datos personales
  Given el empleado #2 0x89Dd…4eBe tiene consentimiento activo con sus datos guardados
  When el empleado pulsa "Retirar consentimiento" en la sección "Mi perfil"
  Then el consentimiento queda retirado y los campos de datos personales no vuelven a aceptarse como guardados hasta un nuevo consentimiento
  # captura: ESC-110_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-39 @plataforma:extension-firefox @navegador:firefox @wallet:phantom @modo:simulada @prioridad:media
Escenario: Guardar perfil en Firefox con Phantom (instalación manual → simulada)
  Given el empleado #2 0x89Dd…4eBe está en "/suite" en Firefox con la extensión Phantom y sesión vigente
  When el empleado guarda email carlos.anlu@ejemplo.com y teléfono +34 600 123 456 con consentimiento marcado
  Then el backend persiste los datos validados y la Suite confirma el guardado
  # captura: ESC-111_phantom_extension-firefox_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-39 @plataforma:extension-edge @navegador:edge @wallet:okx @modo:simulada @prioridad:baja
Escenario: "Borrar mis datos" en Edge con OKX Wallet (instalación manual → simulada)
  Given el empleado #2 0x89Dd…4eBe está en "/suite" en Edge con la extensión OKX Wallet y datos personales guardados
  When el empleado pulsa "Borrar mis datos" y acepta la confirmación window.confirm
  Then los datos personales se eliminan de inmediato y el registro del empleado y sus flujos permanecen intactos
  # captura: ESC-112_okx_extension-edge_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-39 @plataforma:extension-chrome @navegador:brave @wallet:brave @modo:real @prioridad:baja
Escenario: Guardar perfil en el navegador Brave con Brave Wallet nativa
  Given el empleado #2 0x89Dd…4eBe está en "/suite" en el navegador Brave con sesión vigente
  When el empleado guarda email carlos.anlu@ejemplo.com con consentimiento marcado
  Then el backend persiste los datos validados y la Suite confirma el guardado
  # captura: ESC-113_brave_extension-chrome_YYYY-MM-DD_HHMMSS.png

# ---------------------------------------------------------------- N/A

@na @REQ-WALLET-39 @plataforma:desktop @navegador:desktop @wallet:phantom @modo:simulada @prioridad:baja
Escenario: N/A — perfil no ejecutable con Phantom Desktop si la automatización GUI no está disponible
  Given la app Phantom Desktop existe pero la combinación desktop + automatización de perfil puede no estar disponible (instalación manual, sin build de pruebas)
  When se intenta planificar el flujo de perfil y datos personales en desktop con Phantom
  Then el caso se planifica como @modo:simulada y si la automatización GUI no está disponible se registra BLOCKED, nunca FAIL
  And si la app no puede instalarse/automatizarse, se registra N/A documentando la alternativa Phantom en extension-chrome
  # captura: ESC-114_phantom_desktop_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)
