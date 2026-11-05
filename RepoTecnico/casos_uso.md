# Casos de uso — Superfluid Brlt Streaming v2 (Besu Codecrypto 81234)

> Sistema: nómina en streaming BRLT sobre red Besu Codecrypto (chainId 81234) con envoltorio
> propio BrltX (Opción B, CFA simplificado), panel admin 100 % on-chain (SIWE + wallet),
> backend MongoDB para lo administrativo y Suite del Empleado.
> Fuente: `requerimientos.md` (RF-01..RF-21, RNF-01..RNF-09, RT-01..RT-08),
> `diccionario_datos.md` (entidades, máquina de estados, regla floor H-06) e
> `INFORME_OPTIMIZACION_V1.md` (hallazgos H-* que condicionan el comportamiento).
> Convención: RF = requisito funcional · RNF = no funcional · RT = técnico · H-* = hallazgo de auditoría.

## 1. Actores

| Actor | Descripción | Firma on-chain |
|-------|-------------|----------------|
| ADMIN | Empresa/owner. Opera el panel desde el navegador con su wallet (owner/minter de BRLT y admin de BrltX). | Sí (MetaMask u otra, red 81234) |
| EMPLEADO | Destinatario de los streams. Accede a la Suite (portal aparte) solo con su wallet vía SIWE. Cobra su BrltX con `downgrade` a su wallet (CU-16) y puede liquidar un flujo vencido. | Sí (`downgrade` en CU-16; opcional `settleFlow`) |
| DESPLEGADOR | Ejecuta el deploy técnico (clave desechable separada de la wallet admin, RNF-09). Vive fusionado en CU-12. | Sí (forge/cast) |
| Sistema | Backend (MongoDB, SIWE, sesiones) y contratos (Brlt.sol, BrltX.sol) en la red 81234. | — |

## 2. Resumen de casos de uso

| ID | Nombre | Actor(es) |
|----|--------|-----------|
| CU-01 | Autenticarse y conectar wallet del panel admin | ADMIN |
| CU-02 | Mint/burn de BRLT | ADMIN |
| CU-03 | Gestionar empleados (alta, edición, cambio de wallet, baja) | ADMIN |
| CU-04 | Gestionar proyectos | ADMIN |
| CU-05 | Programar flujo (próximo en MongoDB) | ADMIN |
| CU-06 | Iniciar flujo on-chain (wrapAndCreateFlow) | ADMIN |
| CU-07 | Pausar y reanudar flujo | ADMIN |
| CU-08 | Terminar o liquidar flujo (deleteFlow / settleFlow) | ADMIN, EMPLEADO (liquidación) |
| CU-09 | Envío múltiple (lote ≤ 10) | ADMIN |
| CU-10 | Monitorear finanzas | ADMIN |
| CU-11 | Configurar sistema | ADMIN |
| CU-12 | Desplegar contratos y registrar addresses | DESPLEGADOR, ADMIN |
| CU-13 | Acceder a la Suite del Empleado (SIWE) | EMPLEADO |
| CU-14 | Consultar movimientos y flujos en la Suite | EMPLEADO |
| CU-15 | Gestionar perfil y datos personales | EMPLEADO |
| CU-16 | Retirar saldo BrltX (cobro del empleado) | EMPLEADO |

---

## 3. Máquina de estados del ciclo de vida del flujo

Documentada aquí y referenciada por CU-05, CU-06, CU-07, CU-08, CU-14 y CU-16.

```
                    ┌──────────────── deleteFlow (admin, CU-08) ─────────────────┐
                    │                                                             ▼
[próximo] ──wrapAndCreateFlow──► [activo] ──updateFlow(rate=0)──► [pausado] ──updateFlow(rate>0)──► [activo]
 (solo Mongo)   (admin, CU-06)      │                             (CU-07)
      │                             │ block.timestamp ≥ fecha_fin
      │                             ▼
      │                   [vencido pendiente de liquidación]
      │                             │ settleFlow(sender, receiver)  (cualquiera: CU-08 / CU-16)
      │                             ▼
      │                        [terminado]  (liquidado: BRLT al empleado + remanente al admin)
      └── cancelado por admin (borrado de flujos_programados) — el registro «próximo» desaparece sin tx
```

- **próximo**: existe solo en la colección MongoDB `flujos_programados`; no hay BRLT ni
  BrltX on-chain todavía. Guarda fecha de inicio; el panel muestra aviso cuando la fecha
  llega y ADMIN firma manualmente (coherente con RF-18). Si la fecha vence sin firma, el
  registro permanece «próximo» y se marca como vencido en la vista.
- **activo**: nace on-chain con `wrapAndCreateFlow` (1 firma, transacción atómica). Acumula
  mientras flowRate > 0.
- **pausado**: `updateFlow(flowRate=0)`; el flujo sigue existiendo en el wrapper con rate 0
  (no acumula). Reanudar = updateFlow con el rate original.
- **vencido pendiente de liquidación**: `block.timestamp` alcanzó `endsAt` y el flujo dejó de
  acumular, pero **ningún contrato EVM se auto-ejecuta**: el estado cambia cuando alguien
  envía la transacción `settleFlow(sender, receiver)`. La UI lo muestra como «vencido» con
  el botón «Liquidar» y el acumulado calculado como `flowRate × (endsAt − startedAt)`.
- **terminado**: por `deleteFlow` del admin (unwrap automático; el BRLT liberado vuelve a la
  wallet del admin) o por `settleFlow` sobre un flujo vencido, que acredita el BrltX
  devengado al empleado y devuelve el BRLT/envuelto remanente al admin. `settleFlow` es
  **público y sin permiso** (AC-02): puede invocarlo el admin, el empleado (CU-16) o un
  tercero, y paga el gas quien la envía. Cerrada la vía de reactivación.
- **Reconciliación**: tras cada firma o settle detectado, el estado en MongoDB/panel se
  verifica contra lectura JSON-RPC (`getFlow` / `getRealtimeBalance`, RF-12).

### 3.1 Estados de `flujos_programados` (decisión AC-05)

La colección MongoDB `flujos_programados` tiene su propio ciclo, **independiente** del flujo
on-chain:

| Estado | Significado | Transición |
|--------|-------------|------------|
| `próximo` | Programado, sin tx. Es el único estado que aparece en «Próximos». | Alta en CU-05. Pasa a `cancelado` (CU-05-A6) o a `ejecutado`/`fallido` (CU-06). |
| `ejecutado` | `wrapAndCreateFlow` confirmado; guarda `tx_hash` y timestamp de ejecución. | Terminal. No se reutiliza. |
| `cancelado` | El admin canceló antes de la fecha de inicio. La fila **se conserva** para auditoría. | Terminal. |
| `fallido` | La firma/tx revirtió de forma definitiva o el admin abandonó la programación. | Terminal. Se crea un registro nuevo para reintentar. |

- Un registro `ejecutado` **nunca** se convierte en «terminado»: el fin del flujo es un hecho
  on-chain que se consulta en la cadena.
- Los «terminados» de la Suite (CU-14) se obtienen de los **eventos on-chain** (H-12) y de un
  espejo local `flows_history` reconstruible; jamás de `flujos_programados`.
- La transición `próximo → activo` describe el flujo on-chain, no la fila programada: la
  fila programada pasa a `ejecutado` y el flujo nace `activo` en BrltX.

---

## 4. Casos de uso del ADMIN

### CU-01 — Autenticarse y conectar wallet del panel admin

**Actor(es):** ADMIN.

**Precondiciones:**
1. Nodo Besu Codecrypto accesible en `https://besu.alumnos.codecrypto.academy` (chainId 81234).
2. Wallet del ADMIN incluida en la lista blanca de admins (backend/MongoDB) y con CC para gas.
3. Backend SIWE operativo (nonce de un solo uso, dominio y chainId 81234).

**Flujo principal:**
1. ADMIN abre el panel; la UI detecta la wallet instalada y solicita la conexión (sin tx).
2. La UI valida `chainId === 81234`; si la red falta en la extensión, invoca
   `wallet_addEthereumChain` con los parámetros de la red Codecrypto. [H-25]
3. La UI pide al backend un nonce SIWE (EIP-4361) válido **5 minutos**.
4. ADMIN firma el mensaje SIWE en la wallet.
5. El backend verifica la firma (ecrecover), comprueba la lista blanca de admins y crea una
   sesión **admin de 2 h** con cookie `Secure`, `HttpOnly` y `SameSite=Strict`; emite token
   CSRF double-submit para mutaciones. [RNF-07, H-02, AC-08]
6. La UI carga los módulos del panel: empleados, proyectos, flujos, finanzas, sistema.

**Flujos alternativos:**
- A1 Wallet no instalada → la UI muestra instrucciones de instalación y aborta sin sesión.
- A2 Red incorrecta y el usuario rechaza `wallet_addEthereumChain` → banner persistente
  «Red incorrecta (se requiere 81234)» y panel bloqueado.
- A3 Wallet fuera de la lista blanca → el backend responde 401 genérico sin revelar si la
  cuenta existe; la UI muestra «No autorizado para este panel». [H-02, H-21]
- A4 Firma rechazada o nonce vencido → se permite reintentar con un nonce nuevo; el backend
  aplica rate-limit de **5 intentos / 15 min** por wallet+IP. [H-02, AC-08]
- A5 Sin saldo CC no se bloquea el SIWE (la firma no consume gas), pero los módulos que
  firman tx muestran el aviso «Saldo CC insuficiente» (se resuelve vía faucet, RT-04).

**Criterios de aceptación:**

```gherkin
Escenario: Admin conecta en red correcta y entra al panel
  Dado una wallet admin cargada en la lista blanca, en la red con chainId 81234
  Cuando el admin conecta su wallet, firma el mensaje SIWE y el backend verifica la firma
  Entonces la sesión se crea con cookie Secure/HttpOnly/SameSite=Strict de 2 h y el panel muestra los módulos
  Pero el backend rechaza cualquier petición cuya firma provenga de una red distinta de 81234.

Escenario: Wallet no registrada en la lista blanca
  Dado una wallet genérica que no figura como admin
  Cuando completa SIWE en la red 81234
  Entonces la UI muestra «No autorizado para este panel» sin indicar el motivo concreto
  Pero el backend queda logueado con el intento rechazado y no entrega datos de MongoDB.

Escenario: Red 81234 ausente en la extensión
  Dado una wallet sin la red Codecrypto configurada
  Cuando la UI no detecta chainId 81234
  Entonces la UI invoca wallet_addEthereumChain con RPC https://besu.alumnos.codecrypto.academy
  Pero si el usuario rechaza, ninguna operación firmable del panel queda habilitada.

Escenario: Firma rechazada por el usuario
  Dado un panel con nonce SIWE emitido
  Cuando el admin cancela la firma en la wallet
  Entonces la UI permite solicitar un nonce nuevo y reintentar en la misma pantalla
  Pero tras 5 intentos fallidos en 15 minutos el backend bloquea temporalmente esa wallet+IP.
```

**Restricciones [EARS]:**
- El sistema deberá exigir SIWE (EIP-4361, nonce de un solo uso, dominio y chainId 81234)
  verificado en backend antes de servir datos de MongoDB al panel. [RNF-07, H-02]
- Cuando el chainId de la wallet difiera de 81234, la UI deberá invocar
  `wallet_addEthereumChain` antes de habilitar operaciones firmables. [H-25]
- Cuando la wallet se desconecte, la UI deberá invalidar la sesión activa. [H-02]
- El sistema deberá aplicar TTL de sesión admin de 2 h, nonce de 5 min y rate-limit de
  5 intentos/15 min, con CSRF double-submit en mutaciones. [AC-08, RNF-07]

**Prueba:** E2E UI (SIWE real con wallet), API (ecrecover + lista blanca + rate-limiting,
casos A3/A4), MANUAL (A2 con extensión limpia).

**Trazabilidad:** RF-11, RF-16 · RNF-07 · RT-03, RT-05 · H-02, H-21, H-25.

---

### CU-02 — Mint/burn de BRLT

**Actor(es):** ADMIN.

**Precondiciones:**
1. Sesión admin válida (CU-01) y wallet conectada a la red 81234.
2. Brlt.sol desplegado con la wallet del ADMIN como owner/minter. [RNF-05]
3. Saldo CC suficiente para gas.
4. Supply total por debajo del **tope de mint de 50.000.000 BRLT** (cap en contrato). [AC-16]

**Flujo principal:**
1. ADMIN abre «Finanzas › BRLT» y elige **Mint**; introduce el monto (unidades con 18
   decimales) y revisa el resumen: supply resultante = supply anterior + monto, con aviso si
   se acerca al tope de 50.000.000 BRLT. [AC-16]
2. La UI construye la tx con ethers 5.7.2 contra el ABI de Brlt.sol [RT-06] y la envía a firma.
3. ADMIN confirma; la tx se mina en un bloque QBFT de la red 81234. [RT-03]
4. La UI espera el receipt y refresca `balanceOf` y `totalSupply` (18 decimales → formato
   humano).
5. Para **Burn**, ADMIN introduce un monto ≤ su balance BRLT; al confirmarse, `totalSupply`
   disminuye exactamente ese monto.

**Flujos alternativos:**
- A1 Firma rechazada → la tx no se envía; balances sin cambios.
- A2 CC insuficiente → aviso y sugerencia de faucet (máx. 100 CC por solicitud). [RT-04, H-09]
- A3 Monto inválido (0, negativo, con más de 18 decimales) → validación de la UI antes de firma.
- A4 Burn mayor que el balance → error de negocio presentado sin enviar tx inválida.
- A5 Mint desde una wallet que no es owner → revert por control de acceso; la UI muestra el
  mensaje decodificado del ABI. [RNF-05]
- A6 Mint que supera el tope de 50.000.000 BRLT → el contrato revierte y la UI muestra el
  motivo antes de firmar si el monto ya excede el cap. [AC-16]
- A7 Faucet: máximo 1 solicitud por wallet cada 24 h; si ya se usó, la UI muestra el tiempo
  restante y no repite la solicitud. [AC-25, RT-04]

**Criterios de aceptación:**

```gherkin
Escenario: Mint de BRLT por el owner
  Dado un Brlt.sol desplegado con la wallet del admin como owner
  Cuando el admin firma una tx de mint de 5000 BRLT (5000e18, 18 decimales)
  Entonces el balance BRLT del admin aumenta exactamente 5000 BRLT y totalSupply lo refleja
  Pero si la firma es rechazada, ningún balance cambia.

Escenario: Burn mayor que el balance se rechaza
  Dado un admin con 10000 BRLT de balance
  Cuando intenta burn de 12000 BRLT
  Entonces la UI rechaza el dato antes de la firma
  Pero totalSupply permanece sin cambio.

Escenario: Burn exacto al balance se ejecuta
  Dado un admin con 10000 BRLT de balance
  Cuando firma el burn de 10000 BRLT y la tx se confirma
  Entonces su balance queda en 0 y totalSupply decrementa exactamente 10000e18.

Escenario: Mint por una wallet que no es owner
  Dado una wallet distinta a la del owner conectada al panel
  Cuando intenta mint
  Entonces la tx revierte con el mensaje del control de acceso de Brlt.sol y la UI lo muestra decodificado
  Pero totalSupply permanece sin cambio.

Escenario: Mint por encima del tope (AC-16)
  Dado un supply total de 49.900.000 BRLT y un tope de 50.000.000 BRLT
  Cuando el admin intenta mintear 200.000 BRLT
  Entonces la UI bloquea la firma y el contrato revertiría si se enviara
  Pero totalSupply permanece en 49.900.000 BRLT.

Escenario: Cuota de faucet por wallet (AC-25)
  Dado una wallet que ya solicitó CC al faucet hace 2 horas
  Cuando intenta solicitar de nuevo
  Entonces la UI muestra el tiempo restante de la cuota de 24 h y no envía la solicitud
  Pero pasadas 24 h la solicitud vuelve a estar disponible.

Escenario: Falta de CC para gas
  Dado una wallet admin con 0 CC
  Cuando intenta enviar la tx de mint
  Entonces la UI muestra «Saldo CC insuficiente» y sugiere el faucet (máx. 100 CC por solicitud)
  Pero no se solicita ninguna firma mientras la falta de CC persista.
```

**Restricciones [EARS]:**
- El sistema deberá aplicar control de acceso del owner en `mint` y `burn`. [RNF-05]
- Cuando el monto sea 0, negativo o no representable en 18 decimales, la UI deberá bloquear
  la operación antes de la firma.
- Mientras la wallet carezca de CC, la UI deberá mostrar el aviso y sugerir el faucet
  (máximo 100 CC por solicitud). [RT-04, H-09]
- El contrato deberá revertir cualquier mint que deje `totalSupply` por encima de
  50.000.000 BRLT. [AC-16, RNF-05]
- El sistema deberá limitar las solicitudes al faucet a 1 por wallet cada 24 h. [AC-25]

**Prueba:** CONTRACT (forge: roles, mint/burn, 18 decimales), E2E UI (mint/burn desde navegador),
API (validación de montos).

**Trazabilidad:** RF-01, RF-18 · RNF-05 · RT-04, RT-06 · H-09, H-16.

---

### CU-03 — Gestionar empleados (alta, edición, cambio de wallet, baja)

**Actor(es):** ADMIN.

**Precondiciones:**
1. Sesión admin válida (CU-01).
2. Empleados persistidos en MongoDB. [RF-17]
3. Para cambio de wallet: wallet nueva disponible para firmar el mensaje de autorización y
   wallet admin disponible para el step-up EIP-712. [AC-03]

**Flujo principal:**
1. ADMIN abre «Empleados»: lista con id, nombre, wallet, proyecto, concepto
   (mantenimiento · nomina · proyecto_mvp · actividad_espacial · otros), monto_periodo
   (wei BRLT), periodo (6/15/30/90 días) y estado (activo · inactivo · en_flujo). [RF-08, RF-17]
2. **Alta:** formulario (nombre, wallet, proyecto, concepto, monto, periodo); MongoDB guarda
   el empleado con estado activo. La wallet debe ser única. [RF-08]
3. **Edición:** cambia proyecto, concepto, monto o periodo; guarda. Los cambios son
   administrativos (off-chain): no tocan flujos on-chain en curso.
4. **Cambio de wallet [RF-19, H-15, AC-03]:** ADMIN carga la dirección nueva. (i) La wallet
   nueva firma un mensaje EIP-712 de autorización (nonce de un solo uso, dominio, chainId
   81234) **ligado a `empleado_id + wallet_anterior + wallet_nueva`** y el backend lo
   verifica con ecrecover. (ii) El ADMIN firma un **step-up EIP-712** que autoriza el cambio
   (evita que una sesión admin robada redirija salarios). (iii) El cambio se registra en
   `audit_events` con actor, empleado, wallet anterior/nueva y timestamp. (iv) Si hay flujo
   activo, se firma **una única tx atómica `changeReceiver(receptorAntiguo, walletNueva,
   monto, duración)`** que liquida/cierra el flujo antiguo y crea el nuevo hacia la wallet
   entrante con el mismo rate por el resto del periodo pendiente; no existe un estado
   intermedio con el flujo cerrado y el nuevo sin crear. (v) La Suite queda asociada a la
   wallet nueva. [RF-18]
5. **Baja [RF-20, H-23]:** ADMIN marca el empleado inactivo; el panel (i) bloquea/elimina los
   flujos «próximos» del empleado en `flujos_programados`, (ii) cuenta con una alerta
   sugiriendo la terminación del flujo activo (lleva a CU-08) y (iii) muestra el **saldo
   residual** acumulado para retiro del empleado.
6. La lista se recarga desde MongoDB; el estado on-chain de los flujos asociados se verifica
   con RPC.

**Flujos alternativos:**
- A1 Wallet ya registrada en otro empleado → rechazo del alta/edición con mensaje de wallet
  única. [RF-08]
- A2 Cambio de wallet: firma de la wallet nueva o step-up del admin rechazados / nonce
  vencido → operación cancelada; la wallet anterior y el flujo activo quedan intactos.
- A3 Cambio de wallet con fallo on-chain → `changeReceiver` es atómico: si revierte, no hay
  flujo cerrado sin flujo nuevo; la wallet en MongoDB no se cambia y el flujo original sigue
  activo hacia la wallet anterior. La UI muestra el revert y permite reintentar.
- A4 Baja con flujos «próximos» → confirmación explícita antes de eliminar los registros.
- A5 Baja con sesión Suite activa → al marcar inactivo, las sesiones se **revocan de
  inmediato** (registro de revocación consultado en cada request) y la Suite queda
  deshabilitada, salvo el acceso de solo retiro de CU-16 durante su ventana. [RF-20, RF-16, AC-08]
- A6 Cambio de wallet sin flujo activo → solo se actualiza MongoDB (sin tx); la Suite queda
  asociada a la wallet nueva; la antigua pasa a «no registrada». [H-15]

**Criterios de aceptación:**

```gherkin
Escenario: Alta de empleado con periodo de 30 días
  Dado un panel admin con sesión activa
  Cuando el admin registra un empleado con wallet no usada, concepto nomina,
  monto_periodo 2000 BRLT y periodo 30 días
  Entonces el empleado queda persistido en MongoDB con estado activo
  Pero nada se crea on-chain: los flujos solo nacen en CU-06.

Escenario: Cambio de wallet con flujo activo (AC-03)
  Dado un empleado con un flujo activo de 771604938271604 wei/s hacia la wallet A
  Y la wallet nueva B firmó el mensaje EIP-712 ligado a empleado + A + B
  Cuando el admin firma el step-up y la tx changeReceiver(A, B, monto, duración) se confirma
  Entonces el flujo hacia A queda cerrado y nace uno nuevo hacia B con el mismo flowRate por el resto del periodo
  Pero el cambio queda registrado en audit_events con actor, wallet A, wallet B y tx hash.

Escenario: Step-up del admin rechazado (A2)
  Dado un cambio de wallet autorizado por la wallet nueva B
  Cuando el admin rechaza la firma del step-up EIP-712
  Entonces la operación se cancela y MongoDB sigue asociando al empleado a la wallet A
  Pero no se envía ninguna transacción y el flujo original permanece intacto.

Escenario: Baja de empleado con flujo activo
  Dado un empleado con flujo activo y 250 BRLT acumulados como saldo residual
  Cuando el admin confirma la baja
  Entonces el estado pasa a inactivo, el panel muestra una alerta de cierre del flujo activo
  y el saldo residual de 250 BRLT para retiro
  Pero el acceso de esa wallet a la Suite queda deshabilitado. [RF-20]

Escenario: Baja con flujos «próximos» programados
  Dado un empleado con un flujo «próximo» de 2000 BRLT / 30 días en flujos_programados
  Cuando el admin da de baja al empleado
  Entonces el sistema elimina el registro «próximo» y no admite programar nuevos para ese empleado
  Pero la eliminación exige confirmación explícita previa.

Escenario: Cambio de wallet con revert atómico (A3)
  Dado un empleado con flujo activo hacia la wallet A y la autorización firmada por la wallet B
  Cuando changeReceiver revierte (p. ej. saldo insuficiente para el nuevo flujo)
  Entonces el flujo hacia A sigue activo sin cambios y MongoDB mantiene la wallet A
  Pero la UI muestra el revert decodificado y permite reintentar la operación completa.

Escenario: Cambio de wallet sin flujo activo (A6)
  Dado un empleado activo sin flujo on-chain
  Cuando la wallet nueva B firma el mensaje de autorización y el backend valida con ecrecover
  Entonces MongoDB asocia la Suite del empleado a B y la wallet A pasa a «no registrada»
  Pero no se firma ninguna transacción on-chain.
```

**Restricciones [EARS]:**
- El sistema deberá exigir **wallet única** por empleado. [RF-08]
- Cuando una wallet ya esté asociada a otro empleado, la UI deberá rechazar el alta o la
  edición antes de persistir.
- Si la wallet nueva no firma correctamente o el admin rechaza el step-up, el sistema deberá
  mantener la wallet anterior y el flujo activo original sin cambios. [RF-19, AC-03]
- El sistema deberá ligar el mensaje de autorización a `empleado_id`, wallet anterior y
  wallet nueva, y exigir un step-up EIP-712 del admin para ejecutar el cambio. [AC-03]
- Cuando exista un flujo activo, el cambio deberá ejecutarse con `changeReceiver` en una
  sola transacción atómica. [AC-03]
- El sistema deberá registrar cada cambio de wallet en `audit_events` (actor, wallets
  anterior/nueva, timestamp y tx hash). [AC-03, H-15]
- Cuando el estado pase a inactivo, el sistema deberá revocar **inmediatamente** las sesiones
  de Suite asociadas y bloquear el acceso de esa wallet, salvo el retiro de CU-16. [RF-20, AC-08]
- Mientras exista un flujo «próximo» para un empleado inactivo, el sistema deberá impedir
  su firma y eliminarlo tras la confirmación de baja. [RF-20, H-23]

**Prueba:** API (CRUD + unicidad de wallet + ecrecover + step-up + audit_events),
E2E UI (formularios, alertas), CONTRACT (`changeReceiver` atómico y revert sin estado parcial).

**Trazabilidad:** RF-02, RF-03, RF-05, RF-08, RF-17, RF-18, RF-19, RF-20 · RT-05 · H-15, H-23.

---

### CU-04 — Gestionar proyectos

**Actor(es):** ADMIN.

**Precondiciones:**
1. Sesión admin válida (CU-01).
2. Proyectos persistidos en MongoDB. [RF-17]

**Flujo principal:**
1. ADMIN abre «Proyectos»: lista con id, nombre, descripción, presupuesto (wei BRLT) y
   estado (activo · cerrado).
2. **Alta:** crea proyecto con nombre, descripción opcional y presupuesto informativo.
3. **Edición:** actualiza datos, presupuesto o estado; guarda.
4. Los empleados se asignan a proyectos desde el perfil del empleado (CU-03).
5. La UI rotula el campo: «El presupuesto es informativo; no bloquea flujos». [RF-09, H-31]

**Flujos alternativos:**
- A1 Presupuesto no numérico o negativo → rechazo del dato antes de guardar.
- A2 Cierre de proyecto con empleados asignados → la UI lista los afectados y pide
  confirmación; el cierre no modifica a los empleados ni sus flujos.
- A3 Edición con flujos activos asociados → se permite; los flujos siguen sin cambios.

**Criterios de aceptación:**

```gherkin
Escenario: Alta de proyecto con presupuesto informativo
  Dado un panel con sesión admin activa
  Cuando el admin crea el proyecto "MVP" con presupuesto 50000 BRLT (50000e18, 18 decimales)
  Entonces el proyecto queda persistido en MongoDB con estado activo y presupuesto visible
  Pero la UI rotula el presupuesto como dato informativo y no bloquea nada.

Escenario: Superar el presupuesto no bloquea flujos
  Dado el proyecto "MVP" con presupuesto 50000 BRLT y flujos activos con gasto previsto de 60000 BRLT
  Cuando el admin programa un flujo adicional de 2000 BRLT / 30 días (CU-05)
  Entonces el flujo se programa sin ningún bloqueo de presupuesto
  Pero la UI solo ofrece la revisión del presupuesto como ayuda informativa.

Escenario: Cierre de proyecto con empleados asignados
  Dado el proyecto "MVP" con 3 empleados asignados
  Cuando el admin lo cierra
  Entonces el estado pasa a cerrado tras la confirmación y los empleados conservan su asignación
  Pero ningún empleado es eliminado ni alterado.

Escenario: Presupuesto negativo o no numérico se rechaza
  Dado el formulario de alta/edición de proyecto
  Cuando el admin introduce "-100" o "abc" en el presupuesto
  Entonces la UI rechaza el dato antes de guardar
  Pero el proyecto no se persiste con un presupuesto inválido.
```

**Restricciones [EARS]:**
- El sistema deberá persistir los proyectos en MongoDB. [RF-17]
- Cuando se cree o edite un proyecto, el presupuesto deberá aceptar solo enteros no
  negativos expresados en wei BRLT (18 decimales).
- Mientras el presupuesto registrado esté agotado, el sistema deberá permitir programar
  flujos sin bloqueo (el presupuesto es informativo). [RF-09, H-31]
- Cuando el admin solicite el cierre de un proyecto con empleados asignados, el sistema
  deberá pedir confirmación antes de cambiar el estado.

**Prueba:** API (CRUD + presupuesto no bloquea), E2E UI (CRUD + rótulo informativo).

**Trazabilidad:** RF-09, RF-17 · RT-05 · H-31.

---

### CU-05 — Programar flujo (próximo en MongoDB)

**Actor(es):** ADMIN.

**Precondiciones:**
1. Sesión admin válida (CU-01).
2. Empleado activo con wallet registrada (CU-03). [RF-20]
3. Colección `flujos_programados` disponible.

**Flujo principal:**
1. ADMIN abre «Flujos › Programar»; elige empleado, **concepto** [RF-05], **periodo** entre
   6/15/30/90 días [RF-04] y **monto** total configurable por empleado/periodo.
2. La UI calcula y muestra el flowRate con la **regla floor [RF-04, H-06]**:
   `flowRate = floor(monto × 10^18 / segundosDelPeriodo)`.
   Ejemplo: 2000 BRLT / 30 días (2.592.000 s) = 771604938271604 wei/s (residuo al wei queda
   a favor del admin, sin pérdida de tokens). Si hay residuo > 0, la UI lo anota.
3. ADMIN fija la **fecha de inicio**; la UI calcula `fecha_fin = fecha_inicio + segundos
   del periodo` (6 d: 518.400 s · 15 d: 1.296.000 s · 30 d: 2.592.000 s · 90 d: 7.776.000 s).
4. Al guardar, el registro se persiste en MongoDB `flujos_programados` con estado
   **próximo**: existe solo off-chain; sin BRLT on-chain aún.
5. La vista «Próximos» lista los registros por fecha de inicio ascendente, con el aviso
   visible cuando la fecha llega (esa firma ocurre en CU-06).

**Flujos alternativos:**
- A1 Empleado inactivo → la UI no permite programar. [RF-20]
- A2 Fecha de inicio en el pasado → rechazo del dato.
- A3 Periodo o concepto fuera de la lista → validación antes de guardar.
- A4 Superposición con un flujo activo del mismo empleado → **se permite con confirmación
  explícita** (AC-23): la UI muestra la suma de rates y el total mensual agregado antes de
  guardar; el empleado puede tener nómina + proyecto en paralelo.
- A5 Fecha de inicio vencida sin firma → el registro permanece «próximo» y se resalta como
  vencido hasta que ADMIN lo firme. [H-11]
- A6 Cancelar programación: ADMIN cambia el registro a estado **«cancelado»** antes de su
  fecha de inicio (la fila se conserva, no se borra); sin tx on-chain. [H-11, AC-05]
- A7 Registro «ejecutado» o «fallido» → no se reutiliza ni se reprograma; para un nuevo pago
  se crea un registro nuevo. [AC-05]
- A8 Flujo «próximo» vencido más de 4 h → alerta al titular y al **responsable alterno**
  (CU-11); a las 24 h sin acción se marca «fallido» y se notifica al empleado. [AC-14]

**Criterios de aceptación:**

```gherkin
Escenario: Programar flujo de 90 días
  Dado un empleado activo con proyecto asignado
  Cuando el admin programa un flujo con monto 9000 BRLT y periodo 90 días (7776000 s)
  Entonces la UI muestra exactamente 1157407407407407 wei/s (floor de 9000×10^18/7776000)
  y el registro queda en flujos_programados con estado «próximo», fecha de inicio y fecha_fin
  Pero nada se crea on-chain todavía.

Escenario: Cálculo de flowRate con regla floor
  Dado el admin programa un flujo de 2000 BRLT (2000e18) con periodo 30 días (2592000 s)
  Cuando el sistema calcula el flowRate
  Entonces el resultado es exactamente 771604938271604 wei/s (truncado al wei)
  Pero el residuo de la división queda a favor del admin sin pérdida de tokens.

Escenario: Periodos permitidos
  Dado el admin en el formulario de programación
  Cuando se presenta el selector de periodo
  Entonces la lista contiene exactamente 6, 15, 30 y 90 días
  Pero ningún otro valor puede guardarse.

Escenario: Programar para un empleado inactivo
  Dado un empleado con estado «inactivo»
  Cuando el admin intenta programarle un flujo
  Entonces la UI bloquea la operación explicando el estado del empleado
  Pero flujos_programados no admite registros para empleados inactivos.

Escenario: Fecha de inicio en el pasado se rechaza
  Dado el formulario de programación abierto
  Cuando el admin introduce una fecha de inicio anterior al día en curso
  Entonces la UI rechaza el dato y no se persiste ningún registro
  Pero flujos_programados no admite fechas de inicio en el pasado.

Escenario: Orden de la vista de próximos
  Dado 3 registros en flujos_programados con fechas de inicio distintas
  Cuando la vista carga
  Entonces la lista se ordena ascendentemente por fecha de inicio
  Pero ninguno de los registros existe on-chain.

Escenario: Cancelar una programación conserva la fila (AC-05)
  Dado un registro «próximo» cuya fecha de inicio aún no llegó
  Cuando el admin cancela la programación
  Entonces el registro pasa a estado «cancelado» y desaparece de «Próximos»
  Pero la fila se conserva en MongoDB para auditoría y no se envía ninguna tx.

Escenario: Superposición de flujos con confirmación (AC-23)
  Dado un empleado con un flujo activo de nómina de 771604938271604 wei/s
  Cuando el admin programa un segundo flujo de proyecto para el mismo empleado
  Entonces la UI muestra la suma de rates y el total mensual agregado
  Pero exige una confirmación explícita antes de guardar el registro.
```

**Restricciones [EARS]:**
- El sistema deberá calcular el flowRate con **floor al wei** antes de persistir el
  registro. [RF-04, H-06]
- Cuando la fecha de inicio esté en el pasado, la UI deberá rechazar el dato.
- Mientras un flujo esté en `flujos_programados`, el sistema deberá mantenerlo fuera de la
  cadena (sin wrap ni flow on-chain).
- Cuando la fecha de inicio venza sin firma, el registro deberá permanecer «próximo» y
  marcarse como vencido en la vista. [H-11]
- Cuando exista otro flujo activo para el mismo empleado, el sistema deberá mostrar la suma
  agregada y exigir confirmación explícita antes de programar el nuevo. [AC-23]
- Cuando el admin cancele una programación, el sistema deberá pasar el registro a
  «cancelado» sin borrar la fila ni enviar transacciones. [AC-05]
- Cuando un flujo «próximo» lleve más de 4 h vencido, el sistema deberá alertar al titular
  y al responsable alterno; a las 24 h sin acción lo marcará «fallido». [AC-14]

**Prueba:** API (persistencia + regla floor con datos concretos), E2E UI (programación y
vista de próximos), MANUAL (residuos al wei con montos de borde, p. ej. 2001 BRLT/30 días).

**Trazabilidad:** RF-04, RF-05, RF-17, RF-18 · H-06, H-11.

---

### CU-06 — Iniciar flujo on-chain (wrapAndCreateFlow)

**Actor(es):** ADMIN.

**Precondiciones:**
1. Sesión admin válida (CU-01); registro «próximo» existente y empleado activo (CU-05).
2. BRLT suficiente en la wallet del admin y CC para gas.
3. Approval de BRLT hacia BrltX vigente o por otorgar en esta misma sesión. [RF-03, H-05]

**Flujo principal:**
1. Al llegar la fecha de inicio, la vista «Próximos» resalta el aviso con el botón
   **Iniciar flujo on-chain**.
2. ADMIN pulsa el botón; la UI verifica saldo BRLT del admin ≥ monto y CC ≥ estimación de
   gas; si falta, sugiere mint (CU-02) o faucet (≤ 100 CC). [H-32, H-09]
3. Si no existe approval vigente, la UI pide primero una firma de `approve` al gasto
   máximo/por flujo (una única por sesión de ciclo) y luego continúa. [RF-03, H-05]
4. La UI pide la firma de **`wrapAndCreateFlow(monto, walletEmpleado, ...)`**: en una única
   transacción atómica BrltX cobija el BRLT aprobado y crea el flow hacia la wallet del
   empleado con el flowRate de floor; sin fondos atascados a mitad de ciclo (H-05, H-08).
5. La tx se confirma; la UI lee `getFlow` y valida que `flowRate === floor(monto × 10^18 /
   segundosDelPeriodo)`. [RF-12]
6. El estado pasa a **activo**; el registro «próximo» se marca como **«ejecutado»** con
   `tx_hash` y timestamp, y se retira de la vista pendiente; el flujo aparece en la lista de
   activos del panel. El evento `FlowCreated` alimenta el espejo local `flows_history`. [AC-05]

**Flujos alternativos:**
- A1 Firma rechazada → sin cambios; el registro «próximo» queda tal cual (puede reintentarse).
- A2 Saldo BRLT insuficiente → aviso con sugerencia de mint (CU-02) y cancelación si ADMIN no mintea.
- A3 CC insuficiente para gas → aviso y sugerencia de faucet. [H-09, RT-04]
- A4 Wallet destino inválida → validación previa a la firma.
- A5 Empleado marcado inactivo entre la vista y la firma → la UI bloquea la firma y avisa
  la inconsistencia. [RF-20]
- A6 Allowance vigente menor que el monto → la UI compara y pide una firma de approve
  antes de firmar wrapAndCreateFlow (la «approval única previa» de RF-03 se refiere a la
  solicitud hecha antes del primer uso; se repite solo si la allowance vigente no cubre el nuevo flujo).
- A7 Revert on-chain a mitad de la transacción → sin estado intermedio ni parcial (no hay
  wrap a medias): o la tx revirtió (no llegó nada on-chain) o se ejecutó completa. En caso
  de revert, el registro «próximo» queda disponible para reintento. [H-08]
- A8 Los registros vencidos sin firma quedan resaltados; el Sistema no firma nada
  automáticamente desde el servidor. [RF-18]
- A9 El admin abandona definitivamente una programación vencida → puede marcarla
  **«fallido»** (terminal, con motivo) para sacarla de la cola sin borrar el historial; el
  reintento exige crear un registro nuevo. [AC-05]

**Criterios de aceptación:**

```gherkin
Escenario: Iniciar flujo on-chain con approval previa
  Dado un registro «próximo» (empleado activo, 2000 BRLT, 30 días) y un admin con 3000 BRLT y 50 CC
  Y una approval vigente de BRLT hacia BrltX por al menos 2000 BRLT
  Cuando el admin firma wrapAndCreateFlow y la tx se confirma
  Entonces getFlow muestra flowRate exactamente 771604938271604 wei/s y el flujo figura como activo
  Pero el registro «próximo» queda marcado como ejecutado y desaparece de la vista pendiente.

Escenario: Sin approval previa
  Dado una wallet admin sin allowance de BRLT hacia BrltX
  Cuando el admin intenta iniciar el flujo
  Entonces la UI solicita primero la firma de approve y después la de wrapAndCreateFlow en la misma sesión
  Pero la operación no consume BRLT sin approval previa.

Escenario: Saldo BRLT insuficiente
  Dado un admin con 1000 BRLT y un registro «próximo» por 2000 BRLT
  Cuando intenta iniciar el flujo
  Entonces la UI avisa del saldo insuficiente, sugiere mint (CU-02) y cancela la operación
  Pero no envía ninguna tx que revierta por saldo.

Escenario: Empleado desactivado antes de la firma
  Dado un admin preparando wrapAndCreateFlow para un registro «próximo»
  Cuando el empleado pasa a estado «inactivo» antes de la confirmación
  Entonces la UI bloquea la firma y avisa la inconsistencia
  Pero el registro «próximo» queda intacto sin flujo on-chain.

Escenario: Revert durante wrapAndCreateFlow
  Dado una tx de wrapAndCreateFlow que revierte (p. ej. por allowance)
  Cuando la UI muestra el mensaje del revert
  Entonces no queda rastro nuevo on-chain ni en MongoDB (sin estado parcial)
  Pero el registro «próximo» preexistente persiste y queda disponible para reintento.
```

**Restricciones [EARS]:**
- El sistema deberá validar, antes de la firma, saldo BRLT del admin ≥ monto y CC para
  gas. [H-32, H-09]
- Cuando el empleado esté inactivo, la UI deberá bloquear la firma incluso dentro de una
  sesión iniciada. [RF-20]
- El sistema deberá firmar toda operación sobre la cadena únicamente con la wallet del
  ADMIN desde el navegador (el backend nunca custodia transacciones). [RF-18]
- Cuando una transacción revierta (A7), el sistema deberá reintentar la operación completa
  sin dejar wrap parcial ni flow parcial. [H-08]
- Cuando se ejecute la tx, el contrato deberá usar `ReentrancyGuard` + patrón CEI y revertir
  sin estado parcial si lo devengado excede lo depositado (shortfall). [AC-07, RNF-05]
- Cuando la tx se confirme, el sistema deberá marcar el registro programado como «ejecutado»
  con `tx_hash` y alimentar `flows_history` con el evento. [AC-05]

**Prueba:** CONTRACT (forge: wrapAndCreateFlow, floor del rate, atomicidad, revert por
saldo/allowance), E2E UI (firmas en navegador, aviso de vencidos y de saldo insuficiente),
API (validación previa de motivos).

**Trazabilidad:** RF-02, RF-03, RF-04, RF-11, RF-12, RF-18 · RT-04, RT-06 ·
H-05, H-08, H-09, H-11, H-14, H-32.

---

### CU-07 — Pausar y reanudar flujo

**Actor(es):** ADMIN.

**Precondiciones:**
1. Sesión admin válida (CU-01); flujo en estado **activo** on-chain.
2. CC suficiente para gas de `updateFlow`.

**Flujo principal:**
1. En «Flujos (activos)», ADMIN pulsa **Pausar**.
2. La UI construye `updateFlow(flowRate = 0)` sobre BrltX; se firma una única tx.
3. Al confirmar, `getFlow` refleja rate = 0; estado pasa a **pausado**; la Suite del
   empleado (CU-14) mostrará la etiqueta «pausado» al próximo refresco.
4. Para **Reanudar**, ADMIN pulsa «Reanudar»: la UI construye updateFlow con el `flowRate`
   original guardado en el registro del flujo (el mismo floor), y una nueva firma devuelve
   el flujo a estado **activo**. El contrato **prolonga `endsAt` por el tiempo pausado** para
   que el empleado reciba el monto pactado. No se duplican acumulados ni se pierde historial.

**Flujos alternativos:**
- A1 Firma rechazada → sin cambios (el flujo se queda en su estado anterior).
- A2 CC insuficiente → bloqueo de firma y sugerencia de faucet. [H-09]
- A3 Flujo pausado hasta la fecha_fin → al vencer queda en **«vencido pendiente de
  liquidación»** (no acumula más); cualquiera puede invocar `settleFlow` para cerrarlo
  (AC-02), igual que en cualquier flujo activo.
- A4 Confusión pausa/terminación → la UI diferencia claramente las dos procesos: pausa =
  updateFlow rate 0 [H-07]; terminación = deleteFlow (CU-08).

**Criterios de aceptación:**

```gherkin
Escenario: Pausar un flujo activo con updateFlow rate 0
  Dado un flujo activo con 771604938271604 wei/s hacia la wallet del empleado
  Cuando el admin firma updateFlow con flowRate 0
  Entonces getFlow refleja rate 0, el panel pasa el flujo a estado «pausado» y no hay acumulación
  Pero el registro del flujo y su historial de acumulado permanecen.

Escenario: Reanudar un flujo pausado devuelve el rate original
  Dado un flujo pausado 2 días cuyo flowRate guardado en el registro es 771604938271604 wei/s
  Cuando el admin firma updateFlow con el rate original
  Entonces getFlow refleja 771604938271604 wei/s, el flujo vuelve a «activo» y endsAt se prolonga 2 días
  Pero no se duplican acumulados ni se pierde el historial.

Escenario: Flujo pausado con fecha_fin vencida espera liquidación
  Dado un flujo pausado cuya fecha_fin ya venció
  Cuando el panel o la Suite lee el flujo
  Entonces el flujo se muestra como «vencido pendiente de liquidación» sin acumular más
  Pero no se ha movido ningún saldo hasta que alguien firme settleFlow.

Escenario: Saldo CC insuficiente para pausar
  Dado una wallet admin con 0 CC y un flujo activo
  Cuando intenta pausarlo
  Entonces la UI bloquea la firma y sugiere el faucet (máx. 100 CC por solicitud)
  Pero el flujo sigue activo sin aplicar rate 0 (el último rate conocido permanece).
```

**Restricciones [EARS]:**
- El sistema deberá implementar la pausa como `updateFlow(flowRate = 0)` y NO como
  deleteFlow. [H-07, RF-02, RF-07]
- Cuando se reanude, la UI deberá usar `updateFlow` con el flowRate original guardado en el
  registro del flujo, y el contrato prolongará `endsAt` por el tiempo que estuvo pausado.
- Mientras el flujo esté pausado con fecha_fin vencida, el sistema deberá mostrarlo como
  «vencido pendiente de liquidación» y habilitar `settleFlow` a cualquier cuenta. [AC-02]

**Prueba:** CONTRACT (forge: pausa con rate 0, reanudación, liquidación de vencido),
E2E UI (pausar/reanudar desde el navegador, reflejo en Suite), API (detección de CC
insuficiente constante).

**Trazabilidad:** RF-02, RF-07, RF-12, RF-18 · H-07, H-09, H-11.

---

### CU-08 — Terminar o liquidar flujo (deleteFlow / settleFlow)

**Actor(es):** ADMIN (deleteFlow); cualquiera con wallet sobre un flujo vencido (settleFlow).

**Precondiciones:**
1. Sesión admin válida (CU-01); flujo **activo**, **pausado** o **vencido pendiente de
   liquidación** on-chain.
2. CC suficiente para gas de `deleteFlow`.

**Flujo principal:**
1. En «Flujos», ADMIN pulsa **Terminar** sobre el flujo.
2. La UI pide la firma de **`deleteFlow(cuenta)`** en BrltX.
3. En una transacción atómica, BrltX corta el flujo y ejecuta un **unwrap automático** del
   BrltX no consumido: el BRLT liberado regresa a la **wallet del ADMIN** (RF-03, H-05,
   H-08), sin fondos atascados a mitad de ciclo.
4. La UI lee `getFlow` y confirma rate 0 / flujo inexistente; estado pasa a **terminado**.
5. El **acumulado** quedará congelado con el valor al corte y su visible en la Suite
   (CU-14) y en el panel [RF-12].
6. Si el flujo ya alcanzó `endsAt` (**vencido pendiente de liquidación**), «Terminar» no
   aplica: la UI ofrece **Liquidar**, que firma `settleFlow(sender, receiver)` y acredita el
   BrltX devengado al empleado (CU-16) devolviendo el remanente al admin, en una sola tx.

**Flujos alternativos:**
- A1 Firma rechazada → sin cambios; el flujo queda en su estado previo.
- A2 CC insuficiente → bloqueo de firma y sugerencia de faucet. [H-09]
- A3 Flujo ya vencido y liquidado (`settleFlow`) → la opción Terminar no está disponible;
  ya figura como terminado. Si está «vencido pendiente de liquidación», la UI ofrece
  **Liquidar** en su lugar. [AC-02]
- A4 Revert on-chain (p. ej. estado distinto al esperado) → el mensaje de revert se muestra;
  el flujo queda sin cambios y continúa con el estado real del contrato.

**Criterios de aceptación:**

```gherkin
Escenario: Terminar un flujo activo con unwrap
  Dado un flujo activo de 2000 BRLT / 30 días corriendo hace 10 días
  Cuando el admin firma deleteFlow
  Entonces el flujo pasa a estado «terminado» y el BRLT no consumido regresa a la wallet del admin
  en la misma transacción
  Pero el flujo no puede activarse de nuevo tras quedar terminado.

Escenario: Terminar un flujo pausado
  Dado un flujo en estado «pausado» (updateFlow rate 0)
  Cuando el admin firma deleteFlow
  Entonces el flujo pasa a estado «terminado» y su saldo de BrltX se desenvuelve al admin
  Pero la reanudación posterior no está disponible.

Escenario: Liquidar un flujo vencido con settleFlow público
  Dado un flujo activo cuya fecha_fin (endsAt) ya pasó y está «vencido pendiente de liquidación»
  Cuando el admin, el empleado o un tercero firma settleFlow(sender, receiver)
  Entonces el BrltX devengado se acredita al empleado y el remanente vuelve al admin en la misma tx
  Pero el flujo pasa a «terminado» y no puede reactivarse.

Escenario: Terminar sobre un flujo ya liquidado
  Dado un flujo cuya fecha_fin venció y ya fue liquidado con settleFlow
  Cuando el admin abre la lista de flujos
  Entonces la opción "Terminar" no está disponible y el flujo figura como "terminado"
  Pero no se solicita firma de deleteFlow ni de settleFlow.

Escenario: Verificación de saldo devuelto
  Dado un admin con 3000 BRLT antes de terminar y un flujo activo con 2000 BRLT en el wrapper
  Cuando el admin firma deleteFlow y la tx se confirma
  Entonces el balance BRLT del admin crece exactamente 1333333333333334144000 wei
  (2000e18 − 771604938271604 × 864000 s: 10 días corridos del periodo de 30 días)
  Pero el acumulado histórico y los movimientos de la Suite permanecen intactos.

Escenario: Revert de deleteFlow conserva el estado real (A4)
  Dado un flujo activo cuyo estado on-chain difiere del esperado por la UI
  Cuando el admin firma deleteFlow y la tx revierte
  Entonces se muestra el mensaje de revert decodificado y el flujo conserva su estado real
  Pero nada cambia en MongoDB ni en la vista hasta la reconciliación por RPC.
```

**Restricciones [EARS]:**
- El sistema deberá ejecutar la terminación vía `deleteFlow` con **unwrap automático**
  hacia la wallet del admin, en la MISMA transacción. [RF-03, H-05, H-08]
- Cuando el flujo ya esté liquidado (`settleFlow`) o terminado, el sistema deberá
  deshabilitar la opción Terminar en la UI.
- Mientras el flujo esté vencido sin liquidar, el sistema deberá habilitar `settleFlow` a
  cualquier cuenta (admin, empleado o tercero) y no exigir permisos de owner. [AC-02]
- Mientras exista CC insuficiente para gas, la UI deberá bloquear la firma y sugerir el
  faucet (máx. 100 CC por solicitud). [H-09, RT-04]
- Mientras el contrato esté en pausa de emergencia, `deleteFlow`/`settleFlow`/`downgrade`
  deberán seguir operativos para que ningún saldo quede atrapado. [AC-07]

**Prueba:** CONTRACT (forge: deleteFlow, unwrap, destino del balance, acumulado parcial,
settleFlow público sobre vencido), E2E UI (terminar desde el navegador y ver el BRLT
devuelto; liquidar un vencido), API (des-habilitación de Terminar tras liquidación).

**Trazabilidad:** RF-03, RF-07, RF-12, RF-18 · H-05, H-08, H-09, H-11, H-14.

---

### CU-09 — Envío múltiple (lote ≤ 10 flujos)

**Actor(es):** ADMIN.

**Precondiciones:**
1. Sesión admin válida (CU-01); empleados destinatarios activos con wallets registradas.
2. BRLT total del lote y CC para el gas de cada tx disponibles en la wallet admin.

**Flujo principal:**
1. ADMIN abre «Envío múltiple» y carga hasta **10 destinatarios** [RF-06, H-24]; cada fila
   lleva empleado, monto, periodo (6/15/30/90) y concepto.
2. La UI muestra por fila el flowRate con floor al wei [H-06] y el total BRLT del lote;
   valida el **total** contra el saldo admin antes de la primera firma. [H-32]
3. Si falta approval, se solicita al inicio de la lote (única por sesión). [RF-03]
4. Se envía **una tx por flujo**: cada fila se firma y ejecuta `wrapAndCreateFlow`
   (1 firma por flujo). La UI muestra el **progreso** (N/10 confirmadas).
5. Al completar (o si se interrumpe por fallo o cierre), la UI guarda el estado del progreso
   para la **reanudación**: solo las filas pendientes se reenvían en el próximo intento,
   sin repetir las ya confirmadas (progreso persistido). [H-08]
6. Al finalizar, todos los flujos creados figuran como activos; los registros de
   `flujos_programados` asociados (si existían) se marcan como ejecutados (retirados de la
   vista pendiente).

**Flujos alternativos:**
- A1 Intento de añadir el 11.º destinatario → bloqueo con «Lote máximo: 10 destinatarios».
- A2 Fallo en la fila k (firma rechazada, saldo, gas, revert) → la fila se marca «fallida»,
  el lote continúa con el resto y al final se ofrece reenviar solo las fallidas.
- A3 Saldo BRLT total insuficiente → validación del **total** antes de la 1.ª firma; el
  envío se cancela completo (para evitar quedar a mitad de lote). [H-32]
- A4 CC agotada a mitad de lote → pausa del envío, guarda el progreso y lo reanuda tras
  recargar faucet (≤ 100 CC por solicitud). [H-09, RT-04]
- A5 Cierre del navegador a mitad del lote → al reabrir, «Continuar lote pendiente» reenvía
  solo las filas no confirmadas.
- A7 Fila «enviada sin receipt» (el RPC cae tras el broadcast) → la UI verifica por `getFlow`
  si el flujo existe antes de autorizar el reenvío de esa fila; sin verificación no se
  reenvía (anti doble pago). [H-08]
- A6 Wallet duplicada en el mismo lote → rechazo del dato (una fila por wallet).

**Criterios de aceptación:**

```gherkin
Escenario: Lote de 10 destinatarios completado
  Dado un admin con 25000 BRLT y 200 CC y un lote de 10 filas que suma 20000 BRLT
  Cuando se cargan 10 filas (todas activas con su monto y periodo) y el admin firma una por una
  Entonces se envían exactamente 10 tx, una por flujo, con progreso visible 1/10 … 10/10
  Pero cada wallet recibe el flowRate con floor al wei correspondiente a su fila.

Escenario: Límite de lote en 10
  Dado un lote con 10 filas cargadas
  Cuando se intenta añadir una 11.ª fila
  Entonces la UI muestra «Lote máximo: 10 destinatarios» y no añade la fila
  Pero no se envía ninguna tx para la fila extra.

Escenario: Wallet duplicada en el lote
  Dado un lote con la wallet W en la fila 1
  Cuando se añade la misma W en la fila 5
  Entonces la UI rechaza la fila con «una fila por wallet»
  Pero ninguna tx se envía para la fila duplicada.

Escenario: Reenvío sólo de filas fallidas
  Dado un lote de 10 filas donde las filas 3 y 7 fallaron por firma no confirmada
  Cuando el admin reanuda el lote
  Entonces solo las filas 3 y 7 se reenvían (progreso 8/10 → 10/10)
  Pero ninguna fila ya confirmada se vuelve a firmar.

Escenario: Saldo total insuficiente para el lote
  Dado un admin con 5000 BRLT y un lote que suma 5100 BRLT
  Cuando se pulsa Enviar
  Entonces la UI valida el total antes de la primera firma y aborta con sugerencia de mint
  Pero no se firma ninguna fila (evitando partir el lote por falta de total).

Escenario: Interrupción a mitad de lote
  Dado un lote de 10 filas con 4 filas ya confirmadas
  Cuando el navegador se cierra y se reabre el panel
  Entonces la UI muestra el progreso previo (4/10) y permite reenviar solo las 6 filas restantes
  Pero las filas confirmadas no se reenvían.
```

**Restricciones [EARS]:**
- El sistema deberá limitar cada sesión de envío múltiple a **máximo de 10 destinatarios**.
  [RF-06, H-24]
- Cuando una fila falle, el sistema deberá permitir reenviar solo las filas pendientes sin
  duplicar las confirmadas. [H-08]
- Mientras exista interrupción con progreso parcial, la UI deberá persistir el estado
  del lote para su reanudación posterior.
- El sistema deberá evaluar el **total BRLT del lote** antes de la primera firma. [H-32]

**Prueba:** CONTRACT (forge: secuencia de wrapAndCreateFlow y balances agregados),
E2E UI (lote de 10, progreso, interrupción/reanudación, límite de 11.ª fila), API
(validación de total previa).

**Trazabilidad:** RF-03, RF-04, RF-06, RF-18 · RT-04, RT-06 · H-06, H-08, H-09, H-24, H-32.

---

### CU-10 — Monitorear finanzas

**Actor(es):** ADMIN.

**Precondiciones:**
1. Sesión admin válida (CU-01); contratos registrados en la configuración (CU-11).

**Flujo principal:**
1. El dashboard lee balances por RPC: **BRLT**, **BrltX** y **CC** de la cuenta admin
   (18 decimales; la UI los muestra en formato humano). [RF-10, RNF-06]
2. La UI muestra **total flujos activos** (streams on-chain con rate > 0, considerando solo
   contratos registrados) y **gasto_por_segundo = Σ flowRates de los flujos activos**
   (excluye pausados y terminados). [RF-10, H-22]
3. Las fórmulas de **gasto_previsto** quedan especificadas [H-22, AC-19], con `ahora` =
   timestamp del bloque RPC y `segundosRestantes = max(0, fecha_fin − ahora)`:
   - `gasto_por_segundo = Σ flowRate` de flujos activos.
   - `gasto_previsto_dia = Σ min(flowRate × 86.400, flowRate × segundosRestantes)`.
   - `gasto_previsto_mes = Σ min(flowRate × 2.592.000, flowRate × segundosRestantes)`.
   - `gasto_previsto_total = Σ flowRate × segundosRestantes`.
   Un flujo pausado o terminado contribuye 0 en las cuatro.
4. Cada `tasa_refresco_ms` (default 5000 ms, ajustable en CU-11 al block time real medido
   con `cast`) la UI reconsulta los balances y la lista de flujos. [RNF-02, H-19, H-10]
5. **Alerta de vencidos [EARS]**: mientras exista un flujo on-chain marcado activo con
   `fecha_fin` ya vencida, la UI presenta una alerta destacada con el detalle del flujo y
   la vía para terminar/reconcilar el dato (CUs 07/08). [H-11]
6. La lista de flujos activos detalla, por flujo: empleado, concepto, flowRate, acumulado
   on-chain (getRealtimeBalance, RF-12) y fecha_fin; paginada si crece bastante. [H-10]

**Flujos alternativos:**
- A1 Nodo RPC inaccesible → banner «Sin conexión al nodo», conservar el último dato con su
  timestamp, reintento con backoff. [H-10]
- A2 Desincronía del reloj local → el settle y la proyección usan el timestamp del bloque leído
  por el RPC. [RNF-06]
- A3 Block time (QBFT) mayor que el refresco: se ajusta tasa_refresco_ms (CU-11) al ya medido
  con `cast` (en este deploy didáctico BesuQBFT rinde entre 1 y 2 s, default 5000 ms sigue
  seguro). [H-19, RT-03]
- A4 Muchos flujos activos → la lista se pagina; gasto_por_segundo y gasto_previsto
  agrupan todos (el cálculo paginado solo afecta el listado visual). [H-10]

**Criterios de aceptación:**

```gherkin
Escenario: Refresco de balances cada 5 segundos (default 5000 ms)
  Dado un admin conectado con RPC accesible
  Cuando la vista financiera está abierta 15 segundos
  Entonces los balances BRLT, BrltX y CC se actualizan al menos 3 veces (cada 5000 ms por defecto)
  Pero si el RPC falla, se conserva el último dato conocido con su timestamp, sin mostrar 0.

Escenario: Gasto por segundo = suma de rates activos
  Dado dos flujos activos con rates 771604938271604 y 964506172839506 wei/s (500 BRLT / 6 días = floor)
  Cuando el dashboard carga
  Entonces gasto_por_segundo es exactamente la suma de ambos rates en wei/s
  Pero los flujos pausados (rate 0) y terminados no se contemplan en la suma.

Escenario: Gasto previsto acorde fecha_fin
  Dado un flujo activo con rate 771604938271604 wei/s y fecha_fin dentro de 19 días (1.641.600 s)
  Cuando el dashboard calcula gasto_previsto
  Entonces la contribución total del flujo es exactamente 771604938271604 × 1641600 wei
  Pero la contribución de un flujo pausado (rate 0) es 0.

Escenario: Variantes día y mes del gasto previsto (AC-19)
  Dado un flujo activo con rate 771604938271604 wei/s y 40 días restantes
  Cuando el dashboard calcula las variantes día y mes
  Entonces gasto_previsto_dia = 771604938271604 × 86400 y gasto_previsto_mes = 771604938271604 × 2592000
  Pero si quedan menos de 24 h, la variante día se recorta a flowRate × segundosRestantes.

Escenario: Alerta de flujo activo con fecha_fin vencida
  Dado un flujo on-chain con fecha_fin vencida hace 30 minutos
  Cuando la vista se refresca
  Entonces la UI muestra una alerta destacada con el flujo y su estado real según RPC
  Pero el sistema no firma ninguna tx ni lo hace desde el backend (solo con la wallet del admin). [RF-18]

Escenario: Paginación de flujos activos
  Dado un sistema con 14 flujos activos (provenientes de dos lotes de CU-09)
  Cuando la lista de flujos carga
  Entonces la UI pagina el listado y los agregados (gasto_por_segundo, gasto_previsto) incluyen los 14
  Pero la paginación solo afecta la presentación, no el cálculo.
```

**Restricciones [EARS]:**
- El sistema deberá actualizar los balances cada `tasa_refresco_ms` (default 5000 ms),
  alineada al block time real de Besu QBFT medido con `cast`. [RF-10, RNF-02, H-19]
- Cuando el nodo RPC no responda, la UI deberá conservar el último dato y reintentar con
  backoff. [H-10]
- Mientras existan flujos activos con fecha_fin vencida, la UI deberá presentar una alerta
  destacada con el detalle. [H-11]
- El sistema deberá calcular `gasto_por_segundo = Σ flowRates activos` y
  `gasto_previsto = Σ flowRate × segundos restantes hasta fecha_fin`. [RF-10, H-22]
- El sistema deberá calcular las variantes día y mes con los factores 86.400 y 2.592.000,
  recortadas a los segundos restantes cuando sean menores. [AC-19]

**Prueba:** E2E UI (refresco 5 s, alerta de vencidos, caída del RPC), API (fórmula de
gasto_previsto con rates concretos), CONTRACT (getFlow / getRealtimeBalance del acumulado),
MANUAL (medir block time con `cast` para calibrar el refresco).

**Trazabilidad:** RF-10, RF-12 · RNF-02, RNF-06 · RT-06 · H-10, H-11, H-19, H-22.

---

### CU-11 — Configurar sistema

**Actor(es):** ADMIN.

**Precondiciones:**
1. Sesión admin válida (CU-01); idealmente contratos ya desplegados (CU-12).

**Flujo principal:**
1. ADMIN abre «Sistema»: configuración persistida muestra `dirección_brlt`,
   `dirección_brltx`, `rpc_url`, `chain_id = 81234`, `tasa_refresco_ms` (default 5000 ms)
   y `faucet_url`. [RF-13, diccionario_datos]
2. Tras el deploy (CU-12), ADMIN pega las addresses reales y guarda; los valores quedan en
   MongoDB y se propagan al frontend (capa web3). La aplicación NO requiere re-despliegue:
   se aplica en la próxima carga de config (la app lee la config del backend). [RF-13]
3. La UI valida el `chain_id` del RPC consultado contra 81234 antes de guardar.
4. ADMIN ajusta `tasa_refresco_ms` al block time real medido con `cast` (rango 1000–60000
   ms); default 5000 ms se recupera si se borra el campo. [RNF-02, H-19]
5. Los módulos afectados (CU-10, CU-06..CU-09, CU-14) toman la nueva config en su próxima
   carga (sin reinicio obligatorio de Cloud Run). [RT-07]
6. **Lista blanca de admins [AC-15]:** ADMIN consulta las wallets autorizadas, añade una
   nueva (la wallet nueva confirma con firma y el admin actual aprueba) y revoca una
   existente. El bootstrap post-deploy incluye la wallet desplegante **antes** del primer
   SIWE; nunca se permite quedarse sin ningún admin.
7. **Responsable alterno de firmas [AC-14]:** ADMIN designa una segunda wallet autorizada
   que recibe las alertas de flujos «próximos» vencidos y puede firmarlos, liquidarlos o
   cobrarlos, evitando que un empleado deje de cobrar por ausencia del titular.

**Flujos alternativos:**
- A1 chainId del RPC ≠ 81234 → guardado bloqueado con explicación de la red esperada.
- A2 Address malformada → validación de formato de dirección antes de guardar.
- A3 Cambio de address a un contrato inexistente → la app reporta un punto claro
  («Contrato no accesible con la address configurada») y se sugiere re-adoptar la address
  anterior; mientras tanto el módulo de flujo queda deshabilitado con mensaje. [RF-13]
- A4 `tasa_refresco_ms` fuera de 1000–60000 ms → rechazo del dato.
- A5 Intento de revocar la última wallet de la lista blanca → bloqueado con explicación;
  el sistema exige añadir otra antes de revocar. [AC-15]
- A6 Wallet nueva de la lista blanca no firma la confirmación → no se añade. [AC-15]

**Criterios de aceptación:**

```gherkin
Escenario: Registrar addresses tras el deploy
  Dado un deploy Brlt.sol y BrltX.sol (CU-12) con addresses resultantes
  Cuando el admin las pega y guarda en «Sistema»
  Entonces la config persiste en MongoDB con chain_id 81234 y se propaga al frontend en la próxima lectura
  Pero el guardado exige que el chainId del RPC informe 81234.

Escenario: Validar red antes de guardar
  Dado un rpc_url que apunta a una red con chainId diferente (p. ej. 15559)
  Cuando el admin intenta guardar la config
  Entonces la UI rechaza el guardado explicando que se espera chainId 81234
  Pero ningún dato queda persistido con una red inválida.

Escenario: Ajustar tasa de refresco
  Dado un block time real medido con cast contra la red 81234
  Cuando el admin ajusta la tasa de refresco a 4000 ms
  Entonces la vista financiera (CU-10) y la Suite (CU-14) aplican el nuevo ciclo en la próxima carga
  Pero ningún valor fuera del rango 1000-60000 ms es aceptado.

Escenario: Address malformada
  Dado un input en el campo de dirección BRLT con «0x123»
  Cuando el admin guarda
  Entonces la UI rechaza el dato indicando el formato de dirección válido (hex 40 dígitos)
  Pero la configuración previa permanece intacta.

Escenario: Address guardada que no responde (A3)
  Dado una address sintácticamente válida de un contrato sin código BrltX
  Cuando el admin intenta guardarla en «Sistema»
  Entonces la verificación por RPC (eth_getCode + decimals + getFlow) falla y se conserva la address anterior
  Pero el módulo de flujos queda deshabilitado con mensaje hasta resolver el fallo.

Escenario: Gestionar la lista blanca de admins (AC-15)
  Dado un admin autenticado con la lista blanca en 2 wallets
  Cuando añade una tercera wallet que confirma con firma
  Entonces la nueva wallet queda autorizada y el cambio se registra en audit_events
  Pero el intento de revocar hasta quedarse con 0 admins se bloquea.

Escenario: Responsable alterno recibe alertas (AC-14)
  Dado un flujo «próximo» vencido hace 4 horas
  Cuando el job de alertas se ejecuta
  Entonces el titular y el responsable alterno reciben la alerta y pueden firmar el flujo
  Pero la alerta no se cierra hasta que el flujo nace on-chain o se cancela.
```

**Restricciones [EARS]:**
- El sistema deberá validar `chainId 81234` para cualquier lectura on-chain (RPC o wallet).
  [RT-03, RF-13]
- Cuando las addresses de contratos cambien, el sistema deberá propagar la nueva config al
  frontend en la próxima lectura, sin re-despliegue de la aplicación. [RF-13]
- Si la nueva address no responde según lo esperado, la UI deberá permitir revertir a la
  address previa y deshabilitar el módulo de flujos mientras persista el fallo. [RF-13]
- Cuando `tasa_refresco_ms` caiga fuera del rango 1000–60000 ms, la UI deberá rechazar el valor.
- Al guardar una address, el sistema deberá verificar por RPC la existencia de código
  (`eth_getCode`) y la respuesta válida de `decimals()` (18) y `getFlow()` antes de
  aceptar el cambio. [RNF-06, RF-13]
- El sistema deberá permitir gestionar la lista blanca de admins sin poder dejarla vacía,
  con confirmación de la wallet nueva y registro en `audit_events`. [AC-15]
- El sistema deberá permitir designar un responsable alterno de firmas y notificarle los
  flujos «próximos» vencidos. [AC-14]

**Prueba:** E2E UI (registro de addresses, rechazo de chainId incorrecto), API
(persistencia/validación/propagación), MANUAL (medir block time con cast).

**Trazabilidad:** RF-13 · RNF-02 · RT-02, RT-03 · H-19, H-21.

---

### CU-12 — Desplegar contratos y registrar addresses (incluye DESPLEGADOR)

**Actor(es):** DESPLEGADOR (técnico, clave desechable), ADMIN (cierra el registro de config).

**Precondiciones:**
1. Foundry global instalado (forge/cast/chisel); sin Anvil ni Alchemy. [RT-02]
2. Clave de deploy en `sc/.env` **distinta** de la wallet admin/owner; `.env` en
   `.gitignore`; clave solo de prueba. [RNF-01, RNF-09, H-03 — **bloqueante**]
3. Política de custodia formalizada (backup de seed verificado, Ownable2Step, sucesión
   documentada). [RNF-09, H-03 — **bloqueante antes del deploy**]
4. Cuenta de deploy financiada con 100 CC (faucet, máx. 100 CC/solicitud); el BRLT de
   operación se provee post-deploy con mint del owner (paso 6). [RT-04, RT-08, H-36]
5. Revisión interna de contratos (checklist OZ/solhint + suite de invariantes) documentada.
   [H-13]

**Flujo principal:**
1. DESPLEGADOR ejecuta `forge build` en `sc/` (Solidity 0.8.28 + OpenZeppelin 5.1.0,
   estructura `sc/src`, `sc/script`, `sc/test`). [RT-01, RT-07]
2. Ejecuta `forge test` (incluye invariantes sobre BrltX). [H-13, H-26]
3. Ejecuta `forge script script/DeployBrlt.s.sol --rpc-url https://besu.alumnos.codecrypto.academy --broadcast`
   (BRLT), o el script integrado `forge script script/DeployAll.s.sol --rpc-url …` [RF-14]:
   despliega Brlt.sol y BrltX.sol en la red 81234 y entrega las addresses en el output.
4. Verifica on-chain con `cast`: `totalSupply = 10000000e18` y `decimals = 18`; balances de
   la cuenta deploy mostrados. [RT-03, RNF-06]
5. Se transfiere propiedad (Ownable2Step, H-16): la wallet deploy propone el nuevo owner
   (wallet ADMIN) y la wallet ADMIN acepta (2 firmas; la clave deploy queda sin privilegios
   de owner/minter posterior a la aceptación). [RNF-09, H-16]
6. ADMIN mintea 10.000 BRLT (CU-02) y financia la cuenta de operación con BRLT y CC.
   [RT-08, H-36]
7. ADMIN persiste las addresses en «Sistema» (CU-11). El panel queda operativo.
8. Financiación escalonada: faucet CC (≤ 100 CC / solicitud) para gas de la cuenta de
   deploy y, si hace falta, de la cuenta ADMIN. [RT-04, H-09]

**Flujos alternativos:**
- A1 Custodia sin formalizar → deploy bloqueado (H-03). El script de CI/operación no debe
  avanzar sin la verificación de custodia documentada.
- A2 `forge test` falla → se suspende el deploy y se ratifica el defecto en el checklist H-13.
- A3 Faucet caído (H-09) o cuenta sin gas → abort con reintentos (≤ 100 CC por solicitud)
  y opción de financiar de otra cuenta admin.
- A4 Red RPC caída o chainId inválido → abort con mensaje de conexión; sin deploy parcial.
- A5 Revert en deploy → se revisa el output de forge, se corrige y se repite; nunca quedan
  contratos parcialmente vinculados en la config (solo se registra lo que se confirma).

**Criterios de aceptación:**

```gherkin
Escenario: Deploy completo de Brlt y BrltX contra la red remota
  Dado la cuenta de deploy financiada con 100 CC (faucet) y la red chainId 81234 activa
  Cuando se ejecuta forge script script/DeployAll.s.sol --rpc-url https://besu.alumnos.codecrypto.academy --broadcast
  Entonces Brlt.sol y BrltX.sol quedan desplegados y sus addresses quedan registradas para CU-11
  Pero el owner de ambos contratos queda transferido (Ownable2Step) a la wallet ADMIN con 2 firmas.

Escenario: Supply inicial y decimales de BRLT verificados
  Dado el deploy de Brlt.sol finalizado
  Cuando se consulta con cast totalSupply y decimals
  Entonces totalSupply es exactamente 10000000000000000000000000 (10.000.000 con 18 decimales) y
  decimals es 18
  Pero la cuenta deploy conserva el balance original según el criterio del desplegador.

Escenario: Mint inicial de 10.000 BRLT operación [RT-08, H-36]
  Dado el ownership ya transferido a la wallet ADMIN (Ownable2Step, paso 5)
  Cuando el ADMIN firma el mint de 10.000 BRLT (CU-02) y financia la cuenta de operación
  Entonces la cuenta de operación queda con 10.000 BRLT disponibles para flujos
  Pero totalSupply crece exactamente en 10000e18 respecto al valor anterior.

Escenario: Faucet financia con máximo 100 CC por solicitud
  Dado una cuenta operativa con 0 CC
  Cuando se solicita CC al faucet https://faucet.codecrypto.academy/
  Entonces la cuenta recibe hasta 100 CC en la misma solicitud
  Pero el faucet no entrega más de 100 CC por solicitud.

Escenario: Bloqueo por custodia no formalizada
  Dado la política de custodia (RNF-09, H-03) sin cerrar
  Cuando se intenta ejecutar el deploy
  Entonces el procedimiento rechaza el deploy hasta formalizar custodia (backup, Ownable2Step, sucesión)
  Pero ni Brlt.sol ni BrltX.sol se despliegan.

Escenario: Clave deploy separada de la wallet admin (RNF-09)
  Dado un deploy finalizado con la wallet deploy como owner
  Cuando la propiedad se transfiere a la wallet ADMIN mediante Ownable2Step (2 firmas)
  Entonces la wallet deploy queda sin privilegios de owner/minter tras la aceptación
  Pero la clave deploy queda desechada y removida de la configuración.

Escenario: Pausa de emergencia no atrapa saldos (AC-07)
  Dado un BrltX pausado por el owner por una incidencia
  Cuando el empleado intenta downgrade o cualquier cuenta intenta settleFlow/deleteFlow
  Entonces esas operaciones siguen disponibles y los saldos no quedan atrapados
  Pero crear o actualizar flujos queda bloqueado hasta reanudar.
```

**Restricciones [EARS]:**
- El sistema deberá compilar con Solidity 0.8.28 + OpenZeppelin 5.1.0 y desplegar con
  Foundry global contra la red remota (Besu v24.12.0, chainId 81234). [RT-01..RT-03]
- Cuando la política de custodia (H-03) no esté formalizada, el sistema deberá impedir el
  deploy. [RNF-09]
- Cuando la clave de deploy difiera de la clave admin/owner, el sistema deberá aplicar
  **Ownable2Step** (2 firmas: propose + accept) en la transferencia de propiedad.
  [RNF-09, H-16]
- El sistema deberá registrar las addresses resultantes para su persistencia en la
  configuración (CU-11). [RF-14]
- Cuando se inicialice el repositorio, el sistema deberá excluir la clave de deploy del
  versionado (`.env` + `.gitignore`) y usará claves de prueba. [RNF-01]
- Cuando se compile el build, el sistema deberá excluir `@superfluid-finance/sdk-core`
  de las dependencias. [RT-06, H-01]
- El contrato BrltX deberá incluir `ReentrancyGuard` + CEI, `Pausable` de emergencia solo
  owner y shortfall explícito; la pausa no bloqueará `deleteFlow`, `settleFlow` ni
  `downgrade`. [AC-07, RNF-05]

**Prueba:** CONTRACT/MANUAL (forge build/test/script + verificación con cast contra 81234),
CI (lint que garantice `.env` fuera del repositorio). [RNF-01, RT-02]

**Trazabilidad:** RF-01, RF-02, RF-14 · RNF-01, RNF-03, RNF-05, RNF-09 · RT-01, RT-02,
RT-03, RT-04, RT-06, RT-07, RT-08 · H-01, H-03, H-09, H-13, H-14, H-16.

---

## 5. Casos de uso del EMPLEADO

### CU-13 — Acceder a la Suite del Empleado (SIWE)

**Actor(es):** EMPLEADO.

**Precondiciones:**
1. Suite desplegada (RT-05) y backend SIWE + sesiones cortas operando.
2. Empleado **activo** registrado en MongoDB, con la wallet que la Suite usará como
   credencial (la wallet es credencial + destino de pago). [H-15]
3. Config de la red 81234 disponible (CU-11).

**Flujo principal:**
1. EMPLEADO abre la Suite; la UI detecta wallet y solicita el nonce SIWE (EIP-4361, nonce
   de un solo uso, dominio y chainId 81234).
2. EMPLEADO firma el mensaje SIWE en la wallet.
3. El backend verifica la firma (ecrecover), compara la wallet con los empleados
   **activos** en MongoDB y crea sesión **de 8 h** en cookie `Secure`, `HttpOnly` y
   `SameSite=Strict`, con CSRF double-submit para mutaciones. [RF-16, RNF-07, H-02, AC-08]
4. La Suite muestra el portal: movimientos, flujos activos/próximos/terminados, info del
   proyecto, datos personales y perfil. [RF-15]
5. Si hay un flujo «próximo» hacia esta wallet, la Suite lo lista en estado programado con
   su fecha de inicio (proviene de `flujos_programados` en MongoDB). [RF-17]

**Flujos alternativos:**
- A1 Wallet no registrada → respuesta genérica «No hay datos para esta wallet» **sin
  datos**: no se revela si la wallet existe, está inactiva o nunca se registró (misma
  respuesta para todos los casos, según la matriz de superficie de rechazo). [H-21, RF-16]
- A2 Wallet registrada pero inactiva (baja RF-20) → misma respuesta genérica; no se crea
  sesión y las sesiones previas ya fueron revocadas en CU-03-A5.
- A3 Firma rechazada o nonce vencido (5 min) → se permite reintentar con un nonce nuevo y
  rate-limit de **5 intentos / 15 min** por wallet+IP. [H-02, AC-08]
- A4 Sesión vencida (TTL) → se vuelve a pedir SIWE antes de cualquier lectura de datos.
- A5 Red incorrecta en la extensión → idem CU-01-A2: `wallet_addEthereumChain` y bloqueo
  hasta corregir. [H-25]
- A6 Después de un cambio de wallet (RF-19): la Suite queda asociada a la wallet nueva; la
  wallet antigua pasa a responder como «no registrada». [H-15]
- A7 Flujos próximos (CU-05) hacia wallets distintas a la conectada jamás se revelan (la
  Suite solo muestra datos del propio empleado; mitiga H-27 — reconstrucción de nómina
  desde RPC público es técnica no evitable on-chain, pero la Suite no amplifica la
  visibilidad). [H-27]
- A8 La Suite muestra en su pie el aviso de carácter educativo del token (disclaimer:
  referencia didáctica, sin valor de mercado real). [H-37]

**Criterios de aceptación:**

```gherkin
Escenario: Empleado activo conecta por SIWE
  Dado un empleado registrado en MongoDB con wallet «W» y estado activo
  Cuando W firma el mensaje SIWE (nonce nuevo, chainId 81234) y el backend verifica la firma
  Entonces la sesión de 8 h se crea y la Suite muestra movimientos, flujos y datos personales
  Pero la sesión vence a las 8 h y, a continuación, la lectura vuelve a exigir SIWE.

Escenario: Wallet no registrada
  Dado una wallet externa que no figura en la BD de empleados
  Cuando intenta SIWE en la red 81234
  Entonces la Suite muestra «No hay datos para esta wallet» sin datos de ningún empleado
  Pero la respuesta genérica no diferencia entre «no registrada» y «inactiva» (matriz de superficie).

Escenario: Wallet de empleado inactivo
  Dado un empleado con baja (RF-20) cuyo acceso a la Suite fue deshabilitado
  Cuando esa wallet intenta SIWE
  Entonces la Suite devuelve la misma respuesta genérica del caso «no registrada»
  Pero ninguna sesión previa queda autosuficiente (las sesiones fueron revocadas en la baja).

Escenario: Sesión vencida (TTL)
  Dado una sesión de Suite con TTL vencido
  Cuando la Suite intenta cargar la lista de movimientos
  Entonces se redirige a la autenticación SIWE (nueva firma) antes de cualquier lectura
  Pero ningún endpoint entrega datos de empleado sin sesión válida.

Escenario: Red incorrecta en la Suite
  Dado la wallet del empleado conectada a una red distinta de 81234
  Cuando el empleado abre la Suite
  Entonces la UI invoca wallet_addEthereumChain con los parámetros de la red Codecrypto
  Pero si el usuario rechaza, la Suite muestra la pantalla de bloqueo de red incorrecta.
```

**Restricciones [EARS]:**
- El sistema deberá autenticar empleados solo vía SIWE (EIP-4361, nonce de un solo uso),
  verificando ecrecover en backend y creando sesión de 8 h con cookie SameSite=Strict. [RF-16, RNF-07, H-02, AC-08]
- Cuando la wallet conectada no corresponda a un empleado activo, el sistema deberá
  responder genéricamente «sin datos» sin revelar el motivo (no registrada / inactiva).
  [H-21, RF-16]
- Mientras exista sesión válida, ninguna lectura de MongoDB sobre un empleado podrá
  ejecutarse sin previa validación de sesión.
- Cuando el chainId de la wallet no sea 81234, la UI deberá bloquear la operación e
  invocar `wallet_addEthereumChain`. [H-25]
- El sistema deberá restringir los datos servidos a los del empleado autenticado (no
  amplificar visibilidad sobre el resto de la nómina). [H-27]

**Prueba:** E2E UI (SIWE real, rechazo genérico, TTL, red incorrecta), API (ecrecover,
matriz de superficie, rate-limiting).

**Trazabilidad:** RF-15, RF-16, RF-20 · RNF-07, RNF-08 · RT-03, RT-05 ·
H-02, H-15, H-21, H-25, H-27, H-37.

---

### CU-14 — Consultar movimientos y flujos en la Suite

**Actor(es):** EMPLEADO.

**Precondiciones:**
1. Sesión Suite válida (CU-13); empleado activo con wallet conectada.
2. Contratos registrados en la config (CU-11).

**Flujo principal:**
1. Tras el login, la Suite carga para el empleado autenticado:
   a. **Flujos activos**: flowRate (getFlow en wei/s), acumulado on-chain
      (getRealtimeBalance) y concepto. [RF-12]
   b. **Flujos próximos**: registros de `flujos_programados` con esa wallet como
      destinatario y estado «próximo», con fecha de inicio y monto/periodo. [RF-17]
   c. **Flujos terminados** (RF-15): cortados por deleteFlow o por `settleFlow` sobre un
      flujo vencido (AC-02), con **acumulado final** congelado; los vencidos sin liquidar
      aparecen como «vencido pendiente de liquidación». La fuente es el evento on-chain y el
      espejo `flows_history`, **no** `flujos_programados` (AC-05). [RF-17]
2. Si hay flujo activo, la Suite calcula el **acumulado en tiempo real** como línea de
   tiempo continua (flowRate × segundos desde la fecha_inicio hasta el bloque leído).
3. La vista de info del proyecto muestra nombre y descripción de la asignación (CU-03).
4. Cada `tasa_refresco_ms` (default 5000 ms) se revalidan las vistas con el RPC; los
   cambios de estado (próximo → activo [CU-06], activo ⇄ pausado, activo → terminado,
   próximo → cancelado) reflejan su etiqueta correspondiente. [RNF-02, H-12]
5. La Suite consume los **eventos on-chain** del ciclo de flujos (creación/actualización/
   eliminación + Transfer [H-12]) como evidencia histórica en «movimientos».
6. La Suite muestra el **saldo BrltX disponible** del empleado con el botón **Cobrar**
   (CU-16) y, si hay un flujo vencido, el botón **Liquidar** (`settleFlow`, público).

**Flujos alternativos:**
- A1 RPC inaccesible temporalmente → conservar el último dato con timestamp; reintentar con
  backoff. [H-10]
- A2 Empleado sin ningún flujo → página informativa «Sin movimientos aún», sin error. [RT-05]
- A3 Flujo terminado con acumulado congelado → no se recalcula; queda fijo al valor de
  cierre (el flujo ya no acumula). [RF-12]
- A4 Flujo vencido sin liquidar → la Suite muestra «vencido pendiente de liquidación» y
  ofrece **Liquidar** (`settleFlow`); al confirmarse refleja «terminado» con el acumulado
  final, sin exigir que el admin intervenga. [AC-02]
- A5 Nómina reconstrucción externa (H-27): la Suite no expone flowRates de otros empleados;
  lo público de la cadena (direcciones + rates) queda fuera del alcance de la Suite y se
  registra como decisión documental posterior (indexador/privacidad, H-27).

**Criterios de aceptación:**

```gherkin
Escenario: Consultar activos y próximos
  Dado un empleado con un flujo activo de 771604938271604 wei/s y un flujo «próximo» de 2000 BRLT / 30 días
  Cuando la Suite carga tras el SIWE
  Entonces los activos muestran flowRate y concepto on-chain, y los próximos muestran la fila
  con la fecha de inicio y los 2000 BRLT / 30 días
  Pero ningún dato de los flujos de otros empleados es visible en esta Suite.

Escenario: Acumulado on-chain en los flujos activos
  Dado un flujo activo con 771604938271604 wei/s corriendo desde hace 10 días (864000 s)
  Cuando la Suite consulta getRealtimeBalance
  Entonces el acumulado mostrado es exactamente 666666666666665856000 wei
  (771604938271604 × 864000 s), sin redondeo superior
  Pero el acumulado no supera flowRate × tiempo hasta fecha_fin leído del contrato.

Escenario: Flujos terminados con acumulado fijo
  Dado un flujo terminado por deleteFlow con 800 BRLT acumulados
  Cuando la Suite lee la vista de terminados
  Entonces el acumulado final visible es exactamente 800 BRLT y no se recalcula
  Pero ningún pago futuro se suma a ese flujo (el estado ya no es activo).

Escenario: Refresco de la vista cada 5 segundos
  Dado la Suite del empleado abierta con un flujo activo
  Cuando la vista permanece abierta 20 segundos
  Entonces la Suite reconsulta al RPC al menos 4 veces (default 5000 ms, ajustable en CU-11)
  Pero si el RPC falla, la Suite conserva el último dato y muestra el tiempo desde la última actualización.

Escenario: Flujo vencido pendiente de liquidación en la Suite
  Dado un flujo activo cuya fecha_fin venció antes del último refresco
  Cuando la Suite recarga
  Entonces el flujo se muestra como «vencido pendiente de liquidación» con su acumulado calculado
  Pero el estado solo pasa a «terminado» cuando alguien ejecuta settleFlow.

Escenario: El empleado liquida su propio flujo vencido
  Dado un flujo vencido pendiente de liquidación hacia la wallet del empleado autenticado
  Cuando el empleado firma settleFlow(sender, receiver) desde la Suite
  Entonces su saldo BrltX crece con lo devengado y el flujo figura como «terminado»
  Pero el remanente no devengado vuelve al admin y el empleado no puede reactivar el flujo.

Escenario: Empleado sin ningún flujo (A2)
  Dado un empleado activo sin flujos activos, próximos ni terminados
  Cuando la Suite carga tras el SIWE
  Entonces muestra la página informativa «Sin movimientos aún» sin error
  Pero los módulos de proyecto y perfil siguen accesibles.
```

**Restricciones [EARS]:**
- El sistema deberá refrescar la Suite cada `tasa_refresco_ms` (default 5000 ms) alineada
  al block time real. [RNF-02, H-19]
- Cuando el empleado no tenga ningún flujo, la Suite deberá admitir la página informativa
  sin error. [RT-05]
- Mientras existan eventos on-chain (Transfer y ciclo de flujos, H-12), el sistema deberá
  presentarlos como evidencia en «movimientos».
- Cuando un flujo se pause (rate 0) o su fecha_fin venza, la Suite deberá reflejar el nuevo
  estado al próximo refresco y, si está vencido, ofrecer `settleFlow`. [AC-02]

**Prueba:** E2E UI (Suite abierta con refresco, cambio de estados, acumulado), API
(getFlow / getRealtimeBalance, próximos desde `flujos_programados` y terminados desde
`flows_history`/eventos), CONTRACT (eventos
H-12 y acumulado), MANUAL (conciliación contra el RPC).

**Trazabilidad:** RF-12, RF-15, RF-17 · RNF-02, RNF-06 · RT-05, RT-06 ·
H-10, H-11, H-12, H-27.

---

### CU-15 — Gestionar perfil y datos personales

**Actor(es):** EMPLEADO.

**Precondiciones:**
1. Sesión Suite válida (CU-13).
2. Datos personales persistidos en MongoDB (campo `datos_personales` del empleado). [RF-17]
3. Aviso de privacidad publicado (deploy en UE, GDPR/LOPDGDD). [RNF-08, H-02]

**Flujo principal:**
1. En la Suite, EMPLEADO abre «Perfil»; la vista muestra los campos de datos personales
   (email, teléfono, etc.) guardados [RF-15] junto con el **aviso de privacidad** y la
   explicación de qué se guarda, quién y para qué (transparency, H-02).
2. El guardado exige **consentimiento explícito** (checkbox no pre-marcado, con fecha y
   versión del aviso). [RNF-08]
3. EMPLEADO edita los campos y guarda; MongoDB persiste con **minimización de campos**
   (solo los campos necesarios se almacenan/codifican). [H-02, RNF-08]
4. Para **borrado/eliminación** [RNF-08, H-02, AC-10]: EMPLEADO solicita «Borrar mis datos»
   desde la Suite; el sistema **elimina de inmediato** los campos de datos personales sin
   tocar el registro del empleado ni sus flujos. Si no lo solicita, tras la baja la PII se
   **anonimiza a los 30 días** y solo se conservan datos agregados/anónimos por obligación
   contable (**5 años**).
5. **Cierre de sesión**: EMPLEADO cierra sesión; la cookie se invalida y la Suite exige
   SIWE de nuevo para la próxima visita. [RF-16, H-02]

**Flujos alternativos:**
- A1 Sin consentimiento → bloqueo del guardado con aviso (el aviso de privacidad sí se ve).
- A2 Solicitud de borrado con flujo activo → el borrado es independiente de los flujos; el
  flujo continúa hacia la wallet y no se toca nada on-chain (los datos personales off-chain
  se eliminan; el registro del empleado persiste para la operativa administrativa del ADMIN).
- A3 Cierre (baja RF-20) con datos activos → la Suite queda deshabilitada (CU-03-A5); a los
  **30 días** de la baja la PII se anonimiza automáticamente y solo quedan agregados
  contables anónimos durante 5 años. La wallet se conserva **pseudonimizada** hasta el fin
  de la ventana de retiro (90 días, CU-16-A5) y luego se anonimiza también. [RNF-08, AC-10]
- A4 Campos inválidos (formatos de email/teléfono) → validación de la UI antes de
  persistir.
- A5 Solicitud de borrado repetida → idempotencia: segunda llamada devuelve confirmación
  existente sin generar un nuevo evento.

**Criterios de aceptación:**

```gherkin
Escenario: Guardar datos personales con consentimiento
  Dado una sesión Suite activa y un consentimiento concedido en la vista de Perfil
  Cuando el empleado edita su email a «nuevo@correo.es» y su teléfono
  Entonces MongoDB persiste los campos modificados únicamente
  Pero si el consentimiento no está marcado, el guardado es bloqueado con aviso y no se persiste nada.

Escenario: Borrar datos personales sin borrar al empleado
  Dado una sesión Suite activa; el empleado tiene datos guardados y un flujo activo
  Cuando el empleado solicita la eliminación de sus datos personales
  Entonces los datos personales se eliminan inmediatamente
  Pero el registro del empleado y su flujo activo permanecen intactos.

Escenario: Anonimización 30 días después de la baja (AC-10)
  Dado un empleado inactivo con PII y 30 días transcurridos desde la baja
  Cuando el job de retención se ejecuta
  Entonces la PII se anonimiza y solo permanecen datos agregados anónimos
  Pero los registros contables anónimos se conservan 5 años sin datos identificativos.

Escenario: Cierre de sesión revoca la sesión
  Dado una sesión de Suite activa
  Cuando el empleado pulsa «Cerrar sesión»
  Entonces la cookie se invalida y la Suite vuelve a la pantalla de SIWE
  Pero ninguna URL interna de la Suite queda accesible sin firmar de nuevo.

Escenario: Validación de campos sin guardado corrupto
  Dado una sesión con consentimiento marcado y el campo email con formato inválido
  Cuando el empleado guarda
  Entonces la validación de la UI marca «formato de email inválido»
  Pero no se persiste nada hasta corregir el campo.

Escenario: Consentimiento no pre-marcado
  Dado un empleado cuyo consentimiento aún no existe
  Cuando el empleado abre la pantalla de Perfil
  Entonces se muestra el aviso de privacidad y el checkbox de consentimiento desmarcado
  Pero ningún dato se guarda sin que el empleado marque el consentimiento explícitamente.
```

**Restricciones [EARS]:**
- El sistema deberá presentar el aviso de privacidad y recoger un consentimiento explícito
  (checkbox no pre-marcado con fecha) antes de guardar datos personales. [RNF-08, H-02]
- Cuando el empleado solicite borrado, el sistema deberá eliminar **de inmediato** los datos
  personales sin modificar el registro del empleado ni los flujos on-chain. [RNF-08, H-02]
- Cuando el empleado lleve **30 días** inactivo sin solicitud previa, el sistema deberá
  anonimizar su PII y conservar solo agregados anónimos durante 5 años. [AC-10, RNF-08]
- Si el empleado solicita «Cerrar sesión», el sistema deberá revocar la sesión y exigir
  SIWE nuevamente. [RF-16]
- El sistema deberá minimizar los campos que persiste según se definan en el aviso de
  privacidad. [H-02, RNF-08]
- Cuando el empleado pase a inactivo (RF-20), la Suite deberá deshabilitar el acceso y
  aplicar la política de retención tras la baja. [H-23, RNF-08]

**Prueba:** E2E UI (editar, borrar, con/sin consentimiento, cierre de sesión), API
(validación de campos, borrado idempotente, minimización, retención tras baja), MANUAL
(revisión del aviso de privacidad y política de retención GDPR).

**Trazabilidad:** RF-15 · RNF-08 · RT-05 · H-02, H-15, H-23.

---

### CU-16 — Retirar saldo BrltX (cobro del empleado)

**Actor(es):** EMPLEADO (firma `downgrade`; opcionalmente `settleFlow`).

**Precondiciones:**
1. Sesión Suite válida (CU-13) y wallet del empleado conectada en la red 81234.
2. Saldo BrltX > 0 en la wallet del empleado (devengado por flujos anteriores o ya liquidados).
3. CC suficiente en la wallet del empleado para el gas del `downgrade` (si no, faucet, RT-04).

**Flujo principal:**
1. En «Mi saldo», la Suite lee `balanceOf` de BrltX y BRLT de la wallet del empleado y
   muestra el **acumulado cobrable** junto a los flujos que lo originaron. [RF-21]
2. Si existe un flujo **vencido pendiente de liquidación**, la Suite ofrece primero
   **Liquidar** (`settleFlow`, público): acredita el BrltX devengado al empleado y devuelve
   el remanente al admin (CU-08). [AC-02]
3. EMPLEADO pulsa **Cobrar** e indica el importe (total o parcial, en wei BRLT).
4. La UI construye `downgrade(importe)` sobre BrltX y pide la firma en la wallet del
   empleado; el backend no firma ni custodia la transacción. [RF-18]
5. Al confirmar, BrltX se destruye y el BRLT equivalente se acredita en la **wallet del
   empleado** en la misma transacción.
6. La Suite refresca y muestra el nuevo saldo BrltX/BRLT; el movimiento queda en
   «movimientos» con su tx hash. [RF-12, RNF-06]

**Flujos alternativos:**
- A1 Firma rechazada o nonce vencido → sin cambios; se permite reintentar.
- A2 Saldo BrltX = 0 → el botón «Cobrar» aparece deshabilitado con el motivo.
- A3 CC insuficiente para gas → se bloquea la firma y se sugiere el faucet
  (`https://faucet.codecrypto.academy/`, máx. 100 CC por solicitud). [H-09, RT-04]
- A4 Importe mayor que el saldo o cero → la UI valida antes de firmar; si el contrato
  revierte, se muestra el mensaje decodificado y el saldo permanece intacto.
- A5 Empleado dado de baja (RF-20) → conserva el acceso **solo a retiro** durante la
  ventana de retiro definida en la política (por defecto 90 días desde la baja); no ve
  movimientos ni datos de proyecto, pero puede `downgrade` su saldo BrltX. [RF-20, RNF-08]
- A6 Flujo aún activo → el empleado puede cobrar lo ya acreditado; el flujo continúa
  acumulando en paralelo sin verse afectado.

**Criterios de aceptación:**

```gherkin
Escenario: Cobrar el saldo BrltX completo
  Dado un empleado autenticado por SIWE con 1500 BRLT en BrltX y 0 BRLT en su wallet
  Cuando firma downgrade(1500e18)
  Entonces su balance BrltX queda en 0 y su balance BRLT en 1500000000000000000000 wei
  Pero el admin no firma ninguna transacción en este cobro.

Escenario: Cobro parcial conserva el resto en BrltX
  Dado un empleado con 1000 BRLT en BrltX
  Cuando firma downgrade(400e18)
  Entonces recibe 400 BRLT en su wallet y conserva 600 BRLT en BrltX
  Pero el acumulado de sus flujos activos no se modifica.

Escenario: Liquidar y cobrar un flujo vencido
  Dado un flujo vencido pendiente de liquidación con 800 BRLT devengados
  Cuando el empleado firma settleFlow y después downgrade(800e18)
  Entonces el flujo figura como terminado y el empleado recibe 800 BRLT en su wallet
  Pero el remanente no devengado vuelve al admin.

Escenario: Cobro sin saldo (A2)
  Dado un empleado autenticado con 0 BrltX
  Cuando abre «Mi saldo»
  Entonces el botón «Cobrar» aparece deshabilitado con el motivo «sin saldo disponible»
  Pero la Suite no envía ninguna transacción.

Escenario: Retiro tras la baja dentro de la ventana (A5)
  Dado un empleado marcado inactivo con 300 BRLT en BrltX y 20 días desde la baja
  Cuando accede a la Suite con su wallet y firma downgrade
  Entonces puede retirar sus 300 BRLT aunque el resto de la Suite esté deshabilitado
  Pero pasada la ventana de retiro, el acceso de solo retiro también se revoca.
```

**Restricciones [EARS]:**
- El sistema deberá permitir al empleado convertir su BrltX en BRLT mediante
  `downgrade(importe)` firmado desde su propia wallet, sin intervención del admin. [RF-21]
- Cuando el saldo BrltX sea 0, el sistema deberá deshabilitar la acción de cobro. [RF-21]
- Mientras el empleado esté inactivo, el sistema deberá conservar únicamente el acceso de
  retiro durante la ventana definida y revocarlo al terminarla. [RF-20, RNF-08]
- El backend no deberá firmar, custodiar ni patrocinar la transacción de cobro; solo
  construye la llamada y verifica la confirmación. [RF-18, RNF-07]
- Cuando falte CC para gas, el sistema deberá bloquear la firma e indicar el faucet. [RT-04]

**Prueba:** CONTRACT (forge: downgrade total/parcial, balance resultante, revert por
importe inválido), E2E UI (cobro, saldo 0, retiro tras baja), API (ventana de retiro,
verificación de sesión SIWE y tx hash).

**Trazabilidad:** RF-20, RF-21 · RNF-07, RNF-08 · RT-04 · H-02, H-09, H-23.

---

## 6. Matriz de trazabilidad RF ↔ CU

Cobertura por caso de uso; en la última columna, los tipos de prueba canon: **CONTRACT**
(forge), **API** (backend), **E2E UI** (navegador), **MANUAL** (procedimiento documentado).

| Requisito | Cobertura por CUs | Tipos de prueba |
|-----------|-------------------|-----------------|
| RF-01 BRLT (ERC20, mint/burn owner, 18 decimales) | CU-02, CU-12 | CONTRACT, E2E UI, MANUAL |
| RF-02 BrltX (super token Opción B, lista cerrada, pausa=rate 0, settleFlow público AC-02) | CU-03, CU-06, CU-07, CU-08, CU-12, CU-16 | CONTRACT, E2E UI |
| RF-03 ciclo atómico (wrapAndCreateFlow / deleteFlow+unwrap, approval única) | CU-03, CU-06, CU-08, CU-09 | CONTRACT, E2E UI |
| RF-04 periodos 6/15/30/90 + regla floor (H-06) | CU-05, CU-06, CU-09 | CONTRACT, API, E2E UI, MANUAL |
| RF-05 conceptos de pago | CU-03, CU-05, CU-10, CU-14 | API, E2E UI |
| RF-06 envío múltiple (lote ≤ 10, H-24) | CU-09 | CONTRACT, E2E UI |
| RF-07 pausar / reanudar / eliminar | CU-07, CU-08 | CONTRACT, E2E UI |
| RF-08 gestión de empleados (wallet única) | CU-03 | API, E2E UI |
| RF-09 proyectos (presupuesto informativo, H-31) | CU-04 | API, E2E UI |
| RF-10 dashboard financiero (balances 5 s, activos, proyección H-22) | CU-10, CU-11 | E2E UI, API, MANUAL |
| RF-11 conexión wallet red 81234 | CU-01, CU-13 | E2E UI, MANUAL |
| RF-12 getFlow / getRealtimeBalance / balanceOf por destinatario | CU-06, CU-07, CU-08, CU-10, CU-14, CU-16 | CONTRACT, E2E UI, API |
| RF-13 gestión del sistema (addresses, RPC, refresco) | CU-11, CU-12 | E2E UI, API, MANUAL |
| RF-14 deployment scriptable (DeployBrlt / DeployAll) | CU-12 | MANUAL |
| RF-15 Suite del empleado | CU-13, CU-14, CU-15, CU-16 | E2E UI, API |
| RF-16 autenticación por wallet (SIWE, respuesta genérica) | CU-01, CU-13 | E2E UI, API |
| RF-17 persistencia administrativa (MongoDB) | CU-03, CU-04, CU-05, CU-14, CU-15 | API, E2E UI |
| RF-18 operación 100 % on-chain (firma desde el navegador) | CU-02, CU-03, CU-06, CU-07, CU-08, CU-09, CU-12, CU-16 | E2E UI, CONTRACT |
| RF-19 cambio de wallet del empleado (H-15) | CU-03 | API, E2E UI, CONTRACT |
| RF-20 baja de empleado (aviso de cierre + saldo residual) | CU-03, CU-13, CU-15, CU-16 | API, E2E UI, CONTRACT |
| RF-21 retiro del saldo BrltX del empleado (AC-01) | CU-16, CU-14, CU-08 | CONTRACT, E2E UI, API |
| RNF-01 seguridad de claves (.env + gitignore, prueba) | CU-12 | MANUAL, CI |
| RNF-02 refresco alineado al block time (H-19) | CU-10, CU-11, CU-14 | E2E UI, MANUAL |
| RNF-03 compatibilidad (ethers 5.7.2 + React 19, sin SDK H-01) | CU-12, CU-06, CU-10 | MANUAL, CI |
| RNF-04 usabilidad admin sin conocimiento blockchain | CU-01, CU-06, CU-09 | E2E UI, MANUAL |
| RNF-05 OZ 5.1 + control de acceso + ReentrancyGuard/CEI/Pausable/shortfall (AC-07) | CU-02, CU-06, CU-08, CU-12 | CONTRACT |
| RNF-06 trazabilidad on-chain verificable (RPC) | CU-10, CU-12, CU-14 | CONTRACT, API, MANUAL |
| RNF-07 SIWE (nonce 5 min, ecrecover, sesión admin 2 h/empleado 8 h, rate-limit, CSRF) | CU-01, CU-13, CU-15, CU-16 | E2E UI, API |
| RNF-08 protección de datos (consentimiento, minimización, borrado inmediato, anonimización 30 d, retención 5 a) | CU-15, CU-13, CU-16 | E2E UI, API, MANUAL |
| RNF-09 custodia de claves (separación, Ownable2Step, backup, sucesión) | CU-12 | MANUAL |
| RT-01 Solidity 0.8.28 + OZ 5.1.0 | CU-12 | MANUAL |
| RT-02 Foundry global (forge/cast/chisel, sin Anvil/Alchemy) | CU-12, CU-10 | MANUAL |
| RT-03 red Besu 81234, Besu v24.12.0, RPC Codecrypto, CC 18 dec | CU-01, CU-11, CU-12, CU-13 | E2E UI, MANUAL |
| RT-04 faucet máx. 100 CC/solicitud | CU-02, CU-06, CU-07, CU-08, CU-09, CU-12 | MANUAL |
| RT-05 Next.js + React 19 + TS + Tailwind | CU-01, CU-13, CU-14, CU-15 | E2E UI |
| RT-06 ethers 5.7.2 + ABI propio de BrltX (sin SDK H-01) | CU-02, CU-06, CU-10, CU-14 | E2E UI, CONTRACT |
| RT-07 estructura sc/ y web/src/ | CU-12 | MANUAL |
| RT-08 cuenta deploy con 100 CC y 10.000 BRLT | CU-12, CU-02 | MANUAL |

### 6.1 Requisitos huérfanos (comprobación)

- RF-01..RF-21, RNF-01..RNF-09 y RT-01..RT-08: **ninguno queda sin cobertura** (verificado
  fila a fila en la matriz).
- Referencia de hallazgos condicionantes: **H-01** (RT-06 sin SDK) → CU-12/CU-02;
  **H-02** (SIWE/PII) → CU-01, CU-13, CU-15; **H-03** (custodia, bloqueante) → CU-12;
  **H-05/H-07/H-08** (wrapper atómico, pausa=rate 0, idempotencia) → CU-06, CU-07, CU-08,
  CU-09; **H-06** (floor al wei) → CU-05, CU-06, CU-09; **H-09** (faucet 100 CC) → CU-02,
  CU-06, CU-07, CU-08, CU-12; **H-10** (RPC único/backoff) → CU-10, CU-13, CU-14;
  **H-11** (máquina de estados + liquidación perezosa + alertas) → CU-05, CU-06, CU-07,
  CU-08, CU-10, CU-14, CU-16; **H-12** (eventos on-chain) → CU-14; **H-13** (revisión previa al deploy) → CU-12;
  **H-14** (robustez de BrltX: guardas/pausa/saldo insuficiente) → CU-12 (revisión e
  invariantes); **H-15** (cambio de wallet) → CU-03, CU-13; **H-16** (Ownable2Step) → CU-12;
  **H-19** (block time medido) → CU-10, CU-11; **H-21** (superficie de rechazo genérica) →
  CU-01, CU-13; **H-22** (fórmulas medibles) → CU-10; **H-23** (baja con cierre) → CU-03,
  CU-15; **H-24** (lote ≤ 10) → CU-09; **H-25** (wallet_addEthereumChain) → CU-01, CU-13;
  **H-27** (nómina reconstruible) → CU-13, CU-14 (mitigación en la Suite; Mitigación
  completa pospuesta a decisión documental); **H-31** (presupuesto informativo) → CU-04;
  **H-32** (validación de saldo antes de firma) → CU-06, CU-09.
- Hallazgos que NO generan CU v1 y quedan como decisiones documentales del documento
  técnico: H-17 (proveedor/backup Mongo), H-18 (Secret Manager), H-20 (cutover/rollback),
  H-26 (CI/coverage), H-28 (desviaciones del brief), H-29/H-30 (estructura/edición),
  H-33 (operador de red), H-34 (soporte), H-35 (Besu v24.12.0 — ya incorporado a RT-03),
  H-36 (origen de los 10.000 BRLT → mint del owner en CU-02, ejecutado como paso 6 de
  CU-12), H-37 (disclaimer educativo → pie de la Suite, CU-13).

### 6.2 Resumen de tipos de prueba por CU

| CU | Pruebas principales |
|----|----------------------|
| CU-01 | E2E UI + API + MANUAL |
| CU-02 | CONTRACT + E2E UI + API |
| CU-03 | API + E2E UI + CONTRACT |
| CU-04 | API + E2E UI |
| CU-05 | API + E2E UI + MANUAL |
| CU-06 | CONTRACT + E2E UI + API |
| CU-07 | CONTRACT + E2E UI + API |
| CU-08 | CONTRACT + E2E UI + API |
| CU-09 | CONTRACT + E2E UI + API |
| CU-10 | E2E UI + API + CONTRACT + MANUAL |
| CU-11 | E2E UI + API + MANUAL |
| CU-12 | MANUAL (forge) + CI |
| CU-13 | E2E UI + API |
| CU-14 | E2E UI + API + CONTRACT + MANUAL |
| CU-15 | E2E UI + API + MANUAL |
| CU-16 | CONTRACT + E2E UI + API |

---

*Fin del documento. Los CUs CU-01..CU-16 y la matriz RF↔CU son la referencia canónica para
la Fase 3 (documentación técnica y desarrollo).*
