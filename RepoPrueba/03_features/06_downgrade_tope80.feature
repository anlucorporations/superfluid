# FASE 2 — Feature 06: Cobro del empleado (downgrade) y tope acumulado del 80% (CU-16/CU-17)
# Módulo: /suite — panel "Downgrade de flujos": 4 valores del tope, botón "Máximo", downgrade firmado,
#   verificación on-chain del cobro, rechazo 422 tope_80_superado, aviso tope agotado, settleFlow,
#   ventana de retiro 90 días.
# Requisitos cubiertos: REQ-WALLET-32, 33, 34, 35, 36, 37, 38.
# Objetivo primario: la dApp Superfluid Brlt (/suite) en el navegador con la wallet inyectada.
#   @wallet:<proyecto> NO APLICA: el proyecto es una dApp web sin wallet propia.
# Regla 9: @modo:real (MetaMask, Rabby, Brave nativo) / @modo:simulada (Phantom, Coinbase, Trust, OKX).
# Red: Anvil vm-blockchain, chainId 31337 (0x7a69), RPC http://100.85.239.67:8545.
# Datos concretos: empleado #2 0x89Dd…4eBe con asignación total 10.000,000000 BRLT → tope 80% = 8.000,000000,
#   BrltX en cartera 1.000,000000; candidato de exceso: solicitar 8.500,000000 BRLT.
# Captura por escenario (regla 5): <ID>_<wallet>_<plataforma>_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-33 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: El panel "Downgrade de flujos" muestra los cuatro valores del tope del 80% con floor al wei
  Given el empleado #2 0x89Dd…4eBe está dentro de "/suite" con sesión vigente y MetaMask conectada (chainId 31337)
  And sus flujos suman un total asignado (deposited) de 10.000,000000 BRLT y ya cobró 3.000,000000 BRLT según la auditoría
  When la Suite carga el panel "Downgrade de flujos"
  Then muestra asignado = 10.000,000000, tope 80% = 8.000,000000 (floor(asignado × 80 / 100) al wei), ya descargado = 3.000,000000 y disponible = 5.000,000000
  And los cuatro valores provienen del backend (downgrade-limit) y no los calcula la UI
  # captura: ESC-091_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-36 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: El botón "Máximo" rellena el importe con el menor entre BrltX en cartera y disponible del tope
  Given el empleado #2 0x89Dd…4eBe está en "/suite" con asignado 10.000,000000 BRLT, ya descargado 7.200,000000, disponible 800,000000 y 1.000,000000 BRLX en cartera
  When el empleado pulsa el botón "Máximo" del panel "Downgrade de flujos"
  Then el importe se rellena con 800,000000 (min(1.000,000000 BrltX en cartera, 800,000000 disponible del tope))
  And el valor rellenado es parseable por la propia UI (aceptado al pulsar "Descargar")
  # captura: ESC-092_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-32 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Cobro autónomo exitoso firma downgrade, quita BrltX, acredita BRLT y se registra en auditoría
  Given el empleado #2 0x89Dd…4eBe está en "/suite" con 1.000,000000 BRLX en cartera, disponible 5.000,000000 y MetaMask conectada (chainId 31337)
  When el empleado introduce 100,000000 y pulsa "Descargar" y firma downgrade(100,000000) en MetaMask (gas fijo 250.000)
  Then la transacción se confirma, la cartera baja a 900,000000 BRLX y la misma wallet 0x89Dd…4eBe recibe 100,000000 BRLT
  And el backend verifica la tx contra la cadena (firmante = wallet de sesión y evento Downgraded) y registra el cobro en la auditoría de operaciones
  # captura: ESC-093_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-32 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Cobro no verificable contra la cadena se rechaza con 422 tx_no_verificada
  Given el empleado #2 0x89Dd…4eBe firmó un downgrade que se confirmó on-chain
  And el RPC de verificación no está alcanzable en el momento de la auditoría (o la tx fue firmada por otra cuenta)
  When el backend intenta verificarWalletAction(txHash, 0x89Dd…4eBe, "cobro", flowId)
  Then el backend rechaza el registro con el error 422 "tx_no_verificada" sin registrar el cobro en la auditoría
  And la Suite muestra el error al empleado indicando que el cobro no pudo validarse contra la cadena
  # captura: ESC-094_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-34 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Un cobro que superaría el tope del 80% se rechaza con 422 tope_80_superado sin auditoría
  Given el empleado #2 0x89Dd…4eBe tiene asignado 10.000,000000 BRLT, ya descargado 7.800,000000 y disponible 200,000000
  And el empleado aún tiene 2.500,000000 BRLX en cartera y la UI (backend-only del tope) permite introducir un importe mayor
  When el empleado firma downgrade(8.500,000000) y la transacción se confirma on-chain
  Then el backend rechaza la auditoría del cobro con el error 422 "tope_80_superado" indicando disponible 200,000000 y solicitado 8.500,000000
  And el cobro no queda registrado en la auditoría aunque la transacción sí se movió on-chain (hallazgo A5 del análisis)
  And la Suite muestra el rechazo "tope_80_superado" con el detalle de disponible y solicitado
  # captura: ESC-095_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-35 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Máximo descargable ≤ 0 deshabilita importe y botones con el aviso de que no hay nada descargable
  Given el empleado #2 0x89Dd…4eBe tiene disponible del tope 0,000000 (tope 80% agotado) o 0,000000 BRLX en cartera
  When la Suite carga el panel "Downgrade de flujos"
  Then el campo de importe y los botones "Descargar" y "Máximo" permanecen deshabilitados
  And se muestra el aviso "No hay nada descargable ahora mismo…" explicando que el devengo pendiente se acredita cuando el flujo se liquida on-chain
  # captura: ESC-096_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-37 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:media
Escenario: El empleado liquida un flujo vencido con settleFlow y la Suite se refresca
  Given el empleado #2 0x89Dd…4eBe tiene el flujo FLW-EMPLEADO-5 vencido (endsAt en el pasado) con devengo pendiente por acreditar
  When el empleado pulsa "Liquidar" sobre el flujo vencido y firma settleFlow(FLW-EMPLEADO-5) en MetaMask (gas fijo 500.000, público AC-02)
  Then la transacción se confirma acreditando el devengo a su BrltX y el remanente no devengado vuelve al admin
  And el flujo pasa a estado terminado y la Suite se refresca (refresco 5 s) mostrando el nuevo saldo BrltX
  # captura: ESC-097_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-38 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:media
Escenario: Empleado de baja dentro de la ventana de retiro de 90 días accede solo a consultar y retirar
  Given el empleado #4 0xf100…2C28 fue dado de baja hace 30 días (deactivatedAt registrada) y su cuenta conserva saldo BrltX
  When el empleado hace login de Suite con SIWE (wallet #4 0xf100…2C28, chainId 31337) y abre "/suite"
  Then el sistema permite el acceso de retiro y muestra el banner "Ficha dada de baja… Puedes consultar y retirar tu saldo durante 90 días"
  And el resto de la Suite (flujos, perfil completo) queda deshabilitado y no se generan nuevos pagos
  # captura: ESC-098_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-38 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:media
Escenario: Transcurridos 90 días desde la baja el login de Suite se deniega
  Given el empleado #4 0xf100…2C28 fue dado de baja hace más de 90 días (ventana de retiro vencida)
  When el empleado intenta hacer login de Suite con SIWE (wallet #4 0xf100…2C28)
  Then el backend deniega el login (rol "ninguno") y la pantalla "/entrar" muestra el mensaje genérico "Esta wallet no tiene acceso a ninguna suite. Pide alta al administrador."
  And no se crea ninguna sesión de Suite
  # captura: ESC-099_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-32 @plataforma:extension-firefox @navegador:firefox @wallet:metamask @modo:real @prioridad:media
Escenario: Cobro autónomo con downgrade firmado en Firefox con MetaMask
  Given el empleado #3 0xc4d4…FB41 está en "/suite" en Firefox con la extensión MetaMask (build descargable), 500,000000 BRLX en cartera y disponible 2.000,000000
  When el empleado descarga 250,000000 firmando downgrade(250,000000) en MetaMask de Firefox
  Then la tx se confirma, la cartera baja a 250,000000 BRLX y la auditoría registra el cobro tras la verificación on-chain
  # captura: ESC-100_metamask_extension-firefox_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-34 @plataforma:extension-edge @navegador:edge @wallet:rabby @modo:real @prioridad:media
Escenario: Rechazo tope_80_superado al superar el tope en Edge con Rabby
  Given el empleado #3 0xc4d4…FB41 está en "/suite" en Edge con la extensión Rabby, disponible 100,000000 y 1.500,000000 BRLX en cartera
  When el empleado firma downgrade(1.000,000000) y la tx se confirma on-chain
  Then el backend rechaza la auditoría con 422 "tope_80_superado" (disponible 100,000000, solicitado 1.000,000000)
  And la Suite muestra el rechazo sin registrar el cobro en la auditoría
  # captura: ESC-101_rabby_extension-edge_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-36 @plataforma:extension-chrome @navegador:brave @wallet:brave @modo:real @prioridad:media
Escenario: Botón "Máximo" rellena el importe correcto en el navegador Brave
  Given el empleado #2 0x89Dd…4eBe está en "/suite" en el navegador Brave con asignado 10.000,000000, disponible 4.000,000000 y 1.000,000000 BRLX en cartera
  When el empleado pulsa el botón "Máximo"
  Then el importe se rellena con 1.000,000000 (min(1.000,000000 cartera, 4.000,000000 disponible)) y es parseable por la UI
  # captura: ESC-102_brave_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-33 @plataforma:extension-chrome @navegador:chrome @wallet:okx @modo:simulada @prioridad:media
Escenario: Cuatro valores del tope del 80% en Chrome con OKX Wallet (instalación manual → simulada)
  Given el empleado #2 0x89Dd…4eBe está en "/suite" en Chrome con la extensión OKX Wallet, asignado 10.000,000000 y ya descargado 8.000,000000
  When la Suite carga el panel "Downgrade de flujos"
  Then muestra asignado 10.000,000000, tope 80% 8.000,000000, ya descargado 8.000,000000 y disponible 0,000000
  # captura: ESC-103_okx_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-35 @plataforma:extension-firefox @navegador:firefox @wallet:phantom @modo:simulada @prioridad:media
Escenario: Aviso "No hay nada descargable ahora mismo…" en Firefox con Phantom (instalación manual → simulada)
  Given el empleado #4 0xf100…2C28 está en "/suite" en Firefox con la extensión Phantom, disponible 0,000000 y 0,000000 BRLX en cartera
  When la Suite carga el panel "Downgrade de flujos"
  Then los botones "Descargar" y "Máximo" están deshabilitados y se muestra el aviso "No hay nada descargable ahora mismo…"
  # captura: ESC-104_phantom_extension-firefox_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-32 @plataforma:desktop @navegador:desktop @wallet:rabby @modo:real @prioridad:media
Escenario: Cobro autónomo con downgrade firmado en Rabby Desktop
  Given el empleado #2 0x89Dd…4eBe está en "/suite" en el navegador embebido de Rabby Desktop con 1.000,000000 BRLX y disponible 5.000,000000 (chainId 31337)
  When el empleado descarga 300,000000 firmando downgrade(300,000000) en Rabby Desktop
  Then la tx se confirma, la cartera baja a 700,000000 BRLX y la auditoría registra el cobro tras la verificación on-chain
  # captura: ESC-105_rabby_desktop_YYYY-MM-DD_HHMMSS.png

# ---------------------------------------------------------------- N/A

@na @REQ-WALLET-32 @plataforma:extension-edge @navegador:edge @wallet:trust @modo:simulada @prioridad:baja
Escenario: N/A — cobro del empleado no ejecutable con Trust en Edge (combinación inexistente)
  Given la combinación Trust Wallet + extension-edge no existe en el catálogo oficial
  When se intenta planificar el cobro downgrade y el tope 80% en esa combinación
  Then el caso se registra como N/A (no ejecutable, nunca FAIL) para todos los REQ del módulo downgrade/tope 80%
  And la alternativa documentada es Trust Wallet en extension-chrome
  # captura: ESC-106_trust_extension-edge_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-32 @plataforma:extension-firefox @navegador:firefox @wallet:brave @modo:simulada @prioridad:baja
Escenario: N/A — cobro del empleado no ejecutable con Brave Wallet en Firefox (combinación inexistente)
  Given la combinación Brave Wallet + navegador Firefox no existe en el catálogo (Brave Wallet es nativa solo del navegador Brave)
  When se intenta planificar el cobro downgrade y el tope 80% en esa combinación
  Then el caso se registra como N/A (no ejecutable, nunca FAIL) para todos los REQ del módulo downgrade/tope 80%
  And la alternativa documentada es Brave Wallet en navegador Brave
  # captura: ESC-107_brave_extension-firefox_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)
