# FASE 2 — Feature 05: Flujos del panel Admin (allowlist con firma + transacciones on-chain + pausa del contrato)
# Módulo: /admin — allowlist (AC-15), approve + wrapAndCreateFlow, updateFlow, deleteFlow/settleFlow,
#   mint/burn con tope 50M, manejo de reverts, pausa owner BrltX (AC-07).
# Requisitos cubiertos: REQ-WALLET-24, 25, 26, 27, 28, 29, 30, 31, 41.
# Objetivo primario: la dApp Superfluid Brlt (panel /admin) en el navegador con la wallet inyectada.
#   @wallet:<proyecto> NO APLICA: el proyecto es una dApp web sin wallet propia.
# Regla 9: @modo:real (MetaMask, Rabby, Brave nativo) / @modo:simulada (Phantom, Coinbase, Trust, OKX).
# Red: Anvil vm-blockchain, chainId 31337 (0x7a69), RPC http://100.85.239.67:8545.
# Datos concretos: admin #0 0xb4eCE9…200DF (super_admin, owner/minter), admin #1 0x9423…15cEF,
#   candidatos empleado #2 0x89Dd…4eBe, #3 0xc4d4…FB41, #4 0xf100…2C28.
#   BrltX 0x6080788bc70756dD3c73b4AF2936D0eeA135bE71; BRLT ERC20 18 decimales, MAX_SUPPLY 50.000.000.
# Captura por escenario (regla 5): <ID>_<wallet>_<plataforma>_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-24 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Alta de admin en la allowlist con SIWE firmado por la wallet candidata
  Given el super_admin #0 0xb4eCE9…200DF está en "/admin/sistema" con MetaMask conectada (chainId 31337)
  And la wallet candidata #2 0x89Dd…4eBe está disponible en la cuenta activa de MetaMask
  When el super_admin inicia el alta de 0x89Dd…4eBe con rol "admin" y el sistema pide el mensaje SIWE de confirmación
  Then la wallet candidata 0x89Dd…4eBe firma el mensaje "Confirmar esta wallet como administradora de Superfluid Brlt. Esta firma no mueve fondos ni autoriza gastos." con personal_sign
  And el backend verifica la firma, consume el nonce de propósito "admin" y guarda la entrada de allowlist con su rol
  # captura: ESC-075_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-25 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Alta de allowlist rechazada si la candidata no firma o ya figura en la allowlist
  Given el super_admin #0 0xb4eCE9…200DF está en "/admin/sistema" con MetaMask conectada (chainId 31337)
  When la wallet candidata 0xc4d4…FB41 rechaza el mensaje SIWE de confirmación
  Then el backend rechaza el alta sin crear ninguna entrada en admin_allowlist
  When el super_admin intenta dar de alta a la wallet ya existente 0xb4eCE9…200DF
  Then el backend rechaza el alta con el error 409 "wallet_ya_existe"
  # captura: ESC-076_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-26 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Gestión de allowlist rechazada si el actor no es super_admin
  Given la wallet #1 0x9423…15cEF tiene sesión admin con rol "admin" (no super_admin) en "/admin/sistema" con MetaMask conectada
  When el admin intenta dar de alta o editar una entrada de la allowlist
  Then el backend rechaza la operación con 403 y el error "super_admin_requerido" (o "seccion_no_autorizada" para la sección)
  And no se crea ni modifica ninguna entrada de allowlist
  # captura: ESC-077_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-27 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Iniciar flujo sin allowance vigente pide primero approve y luego wrapAndCreateFlow
  Given el admin #0 0xb4eCE9…200DF está en "/admin/flujos" con MetaMask conectada (chainId 31337)
  And el empleado #2 0x89Dd…4eBe tiene un flujo "próximo" programado en Mongo (periodo 30 días, monto 1.500,000000 BRLT) y no existe allowance vigente suficiente
  When el admin pulsa "Iniciar flujo on-chain"
  Then la dApp pide primero la firma de approve de BRLT hacia BrltX 0x6080788bc70756dD3c73b4AF2936D0eeA135bE71 (gas fijo 80.000)
  And tras confirmar el approve, pide la firma de wrapAndCreateFlow (gas fijo 500.000) en la misma sesión
  And al confirmarse la tx, la dApp extrae el flowId del evento FlowCreated y muestra el flujo como activo
  # captura: ESC-078_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-28 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Pausar y reanudar un flujo firma updateFlow con rate 0 y el rate guardado
  Given el admin #0 0xb4eCE9…200DF está en "/admin/flujos" con MetaMask conectada (chainId 31337) y el flujo FLW-EMPLEADO-2 activo
  When el admin pulsa "Pausar flujo"
  Then la dApp firma updateFlow(FLW-EMPLEADO-2, 0) (gas fijo 350.000) y tras la confirmación el flujo se muestra como pausado
  When el admin pulsa "Reanudar flujo"
  Then la dApp firma updateFlow(FLW-EMPLEADO-2, rateGuardado) (gas fijo 500.000) y el contrato prolonga endsAt por el tiempo pausado
  And la UI refleja el estado reanudado con el nuevo endsAt
  # captura: ESC-079_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-29 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Terminar un flujo firma deleteFlow y un flujo vencido ofrece settleFlow público
  Given el admin #0 0xb4eCE9…200DF está en "/admin/flujos" con MetaMask conectada (chainId 31337)
  When el admin termina el flujo activo FLW-EMPLEADO-3
  Then la dApp firma deleteFlow(FLW-EMPLEADO-3) (gas fijo 500.000), corta el flujo, acredita el devengado y devuelve el remanente (unwrap)
  When el flujo FLW-EMPLEADO-4 está vencido (endsAt en el pasado) y el admin lo abre
  Then la dApp ofrece "settleFlow(FLW-EMPLEADO-4)" (público, AC-02, gas fijo 500.000) en lugar de "Terminar"
  # captura: ESC-080_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-30 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Mint y burn de BRLT con la wallet minter y revert del mint por encima de 50M
  Given el admin #0 0xb4eCE9…200DF (minter/owner) está en "/admin/finanzas" con MetaMask conectada (chainId 31337)
  And el totalSupply actual de BRLT es 10.000.000,000000 BRLT
  When el admin mintea 500.000,000000 BRLT
  Then la dApp firma mint (gas fijo 150.000) y el balance del receptor aumenta a 500.000,000000 BRLT
  When el admin intenta mintear hasta dejar totalSupply por encima de 50.000.000,000000 BRLT
  Then la transacción revierte on-chain por el tope MAX_SUPPLY = 50_000_000e18 y la UI muestra el error sin registrar nada en la auditoría
  When el admin quema 100.000,000000 BRLT de una wallet con saldo suficiente
  Then la dApp firma burn (gas fijo 150.000) y el balance disminuye en 100.000,000000 BRLT
  # captura: ESC-081_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-31 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:alta
Escenario: Una transacción on-chain que revierte muestra el error sin registrar nada en la auditoría
  Given el admin #0 0xb4eCE9…200DF está en "/admin/flujos" con MetaMask conectada (chainId 31337)
  And el admin intenta iniciar un flujo con saldo BRLT insuficiente en su cartera
  When la transacción wrapAndCreateFlow revierte on-chain
  Then la dApp muestra el error del revert en la pantalla de flujos
  And no se registra nada en la auditoría de operaciones y la interfaz mantiene el estado previo (el flujo sigue "próximo" en Mongo)
  # captura: ESC-082_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-41 @plataforma:extension-chrome @navegador:chrome @wallet:metamask @modo:real @prioridad:media
Escenario: Con el contrato BrltX pausado por el owner se permite cobrar/liquidar/terminar y se rechazan crear/pausar/cambiar receptor
  Given el owner #0 0xb4eCE9…200DF puso el contrato BrltX en pausa (pause) y la Suite del empleado #2 0x89Dd…4eBe está abierta en chainId 31337
  When el empleado intenta cobrar (downgrade) 10,000000 BRLX
  Then la transacción downgrade se firma y se confirma (el contrato la permite incluso pausado, AC-07)
  When el admin intenta iniciar un flujo (wrapAndCreateFlow), pausar otro (updateFlow) o cambiar receptor (changeReceiver)
  Then cada intento revierte on-chain por whenNotPaused y la UI muestra el error genérico del revert
  And settleFlow de un flujo vencido y deleteFlow de terminación también se confirman con el contrato pausado
  # captura: ESC-083_metamask_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-27 @plataforma:extension-firefox @navegador:firefox @wallet:metamask @modo:real @prioridad:media
Escenario: approve + wrapAndCreateFlow en Firefox con MetaMask
  Given el admin #0 0xb4eCE9…200DF opera "/admin/flujos" en Firefox con la extensión MetaMask (build descargable) y chainId 31337
  And el empleado #3 0xc4d4…FB41 tiene un flujo "próximo" (periodo 15 días, monto 750,000000 BRLT) sin allowance vigente
  When el admin pulsa "Iniciar flujo on-chain"
  Then MetaMask en Firefox pide primero approve y después wrapAndCreateFlow, y el flowId se extrae del evento FlowCreated
  # captura: ESC-084_metamask_extension-firefox_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-27 @plataforma:extension-edge @navegador:edge @wallet:rabby @modo:real @prioridad:media
Escenario: approve + wrapAndCreateFlow en Edge con Rabby
  Given el admin #0 0xb4eCE9…200DF opera "/admin/flujos" en Edge con la extensión Rabby y chainId 31337
  And el empleado #4 0xf100…2C28 tiene un flujo "próximo" (periodo 6 días, monto 300,000000 BRLT) sin allowance vigente
  When el admin pulsa "Iniciar flujo on-chain"
  Then Rabby pide primero approve y después wrapAndCreateFlow y la UI muestra el flujo activo con su flowId
  # captura: ESC-085_rabby_extension-edge_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-24 @plataforma:extension-chrome @navegador:brave @wallet:brave @modo:real @prioridad:media
Escenario: Alta de allowlist con SIWE firmado por la candidata en el navegador Brave
  Given el super_admin #0 0xb4eCE9…200DF opera "/admin/sistema" en el navegador Brave con Brave Wallet nativa y chainId 31337
  And la wallet candidata #3 0xc4d4…FB41 está disponible en Brave Wallet
  When el super_admin inicia el alta de 0xc4d4…FB41 y la candidata firma el SIWE de confirmación
  Then el backend verifica la firma, consume el nonce y guarda la entrada con rol "admin"
  # captura: ESC-086_brave_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-30 @plataforma:extension-chrome @navegador:chrome @wallet:okx @modo:simulada @prioridad:media
Escenario: Mint y burn de BRLT con OKX Wallet en Chrome (instalación manual → simulada)
  Given el admin #0 0xb4eCE9…200DF (minter) opera "/admin/finanzas" en Chrome con la extensión OKX Wallet y chainId 31337
  When el admin mintea 250.000,000000 BRLT y confirma en OKX Wallet
  Then la tx mint se confirma y el balance del receptor aumenta en 250.000,000000 BRLT
  And un mint que dejaría totalSupply por encima de 50.000.000,000000 BRLT revierte on-chain
  # captura: ESC-087_okx_extension-chrome_YYYY-MM-DD_HHMMSS.png

@REQ-WALLET-31 @plataforma:desktop @navegador:desktop @wallet:rabby @modo:real @prioridad:media
Escenario: Revert de transacción admin se muestra sin registrar auditoría con Rabby Desktop
  Given el admin #0 0xb4eCE9…200DF opera "/admin/flujos" en el navegador embebido de Rabby Desktop con chainId 31337
  When la transacción updateFlow de un flujo inexistente revierte on-chain
  Then la dApp muestra el error del revert y mantiene el estado previo de la interfaz sin registrar nada en la auditoría
  # captura: ESC-088_rabby_desktop_YYYY-MM-DD_HHMMSS.png

# ---------------------------------------------------------------- N/A

@na @REQ-WALLET-27 @plataforma:extension-edge @navegador:edge @wallet:coinbase @modo:simulada @prioridad:baja
Escenario: N/A — transacciones admin no ejecutables con Coinbase en Edge (combinación inexistente)
  Given la combinación Coinbase Wallet + extension-edge no existe en el catálogo oficial
  When se intenta planificar cualquier transacción del panel admin en esa combinación
  Then el caso se registra como N/A (no ejecutable, nunca FAIL) para todos los REQ del módulo flujos admin
  And la alternativa documentada es Coinbase en extension-chrome
  # captura: ESC-089_coinbase_extension-edge_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)

@na @REQ-WALLET-27 @plataforma:extension-chrome @navegador:chrome @wallet:brave @modo:simulada @prioridad:baja
Escenario: N/A — transacciones admin no ejecutables con Brave Wallet dentro de Chrome estándar
  Given la combinación Brave Wallet + navegador Chrome estándar no existe en el catálogo (Brave Wallet es nativa solo del navegador Brave)
  When se intenta planificar cualquier transacción del panel admin en esa combinación
  Then el caso se registra como N/A (no ejecutable, nunca FAIL) para todos los REQ del módulo flujos admin
  And la alternativa documentada es Brave Wallet en navegador Brave (ESC-086)
  # captura: ESC-090_brave_extension-chrome_YYYY-MM-DD_HHMMSS.png (N/A: no se ejecuta)
