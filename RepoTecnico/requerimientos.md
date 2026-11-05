# Requerimientos — Proyecto Superfluid Brlt Streaming v2 (Red Codecrypto Besu)

> Fuente: `BRIEF_SUPERFLUID.md`. Estado: borrador Fase 1 (pendiente de validar en entrevista).
> Convención: RF = requerimiento funcional · RNF = no funcional · RT = técnico.

## 1. Visión general

Aplicación completa de **streaming de dinero en tiempo real** sobre el protocolo Superfluid
(adaptado) para pagos continuos a empleados por periodos definidos (6, 15, 30 y 90 días) y
conceptos diversos (mantenimiento, nómina, proyecto MVP, actividad espacial, etc.).
Incluye una **interfaz administrativa** para gestionar Empleados (con billeteras), Proyectos,
Flujos, Finanzas y Sistema. Red: **Besu Codecrypto privada (Chain ID 81234)** con **Foundry global**.

## 2. Requerimientos funcionales (RF)

| ID | Requerimiento | Detalle / Fuente en brief |
|----|---------------|---------------------------|
| RF-01 | Token ERC20 BRLT | Contrato `Brlt.sol`: `transfer`, `approve`, `balanceOf`; funciones de owner `mint`, `burn`; supply inicial 10.000.000 y **tope de mint 50.000.000 BRLT** (AC-16). **Decimales: 18** (decidido 2026-10-30). §1, §4.1 |
| RF-02 | Super Token BrltX (Opción B) | Envoltorio mínimo propio `BrltX.sol` con semántica CFA simplificada: `upgrade/downgrade` y flujo continuo. **Operaciones cerradas (H-07, 2026-10-30; AC-03, 2026-11-01)**: upgrade, downgrade, wrapAndCreateFlow, updateFlow, changeReceiver, deleteFlow (termina + unwrap), settleFlow, getFlow; **pausa = updateFlow(flowRate=0)**; excluidas: liquidaciones/deuda, depósito de seguridad (SPA). **Fin de flujo (AC-02, 2026-11-01)**: un contrato EVM no se auto-ejecuta; al alcanzar `endsAt` el flujo queda **«vencido pendiente de liquidación»** y cualquier cuenta (admin, empleado o tercero) puede invocar **`settleFlow(sender, receiver)`**, que acredita lo devengado al empleado y devuelve el remanente al admin. Aprobado 2026-09-29; modificado en auditoría Fase 2 | Mod. Fase 2 |
| RF-03 | Ciclo atómico de flujos (H-05/H-08) | BrltX expone **`wrapAndCreateFlow(monto, wallet, días)`** y **`deleteFlow(cuenta)` con unwrap automático** (1 firma por operación, transacciones atómicas del wrapper, sin fondos atascados a mitad de ciclo). approval de BRLT única previa. El BRLT liberado en el unwrap regresa a la wallet del admin | Mod. Fase 2 (auditoría) |
| RF-04 | Crear flujos por periodos | Flujos pagados por periodos de **6, 15, 30 o 90 días**; el sistema calcula el flow rate (wei/segundo) a partir de monto total + periodo. **Regla de precisión (H-06): floor / truncado al wei** (`floor(monto × 10^18 / segundos)`) | §1, §5.2 + mod. Fase 2 |
| RF-05 | Conceptos de pago | Asociar cada flujo/pago a un concepto: mantenimiento, nómina, proyecto MVP, actividad espacial, otros. §1 |
| RF-06 | Envío múltiple | Enviar flujos de BRLT a **múltiples destinatarios** simultáneamente. **Lote máximo: 10 destinatarios por sesión de envío** (una tx por flujo, con progreso y reanudación) (H-24) | §1, §4.2 + mod. Fase 2 |
| RF-07 | Control de flujos | Pausar, reanudar y eliminar (delete flow) streams existentes. §4.2 |
| RF-08 | Gestión de Empleados | Alta/baja/edición de empleados con su **billetera** (dirección), concepto, periodo y asignación salarial. §1 |
| RF-09 | Gestión de Proyectos | CRUD de proyectos (p. ej. MVP) a los que se asignan empleados/flujos. **Campo presupuesto: solo informativo** (no bloquea flujos) (H-31) | §1 + mod. Fase 2 |
| RF-10 | Dashboard financiero | Balances BRLT, BrltX y CC en tiempo real (actualización cada **5 s**, ajustable al block time), total flujos activos y proyección de gasto. **Nota trazabilidad**: balances y refresco derivan de §4.2/§9.1; «total flujos activos» y «proyección» son derivados de la plataforma v1/entrevista. §4.2, §9.1 |
| RF-11 | Conexión de wallet | Conectar wallet (MetaMask u otra) a la red Codecrypto (Chain ID 81234) y firmar transacciones. §4.2 |
| RF-12 | Consulta de flujos | `getFlow` y `getRealtimeBalance` por destinatario. §4.2 |
| RF-13 | Gestión del Sistema | Configuración: direcciones de contratos tras deploy, RPC, parámetros de red, tasa de refresco. §1, §4.2 (web3.ts) |
| RF-14 | Deployment scriptable | `DeployBrlt.s.sol` y `DeployAll.s.sol` con Foundry global contra la red remota; registro de addresses resultantes. §4.1, §7 |
| RF-15 | Suite del Empleado | Portal aparte para el empleado: movimientos de su billetera, flujos **activos, próximos y terminados**, información del proyecto, datos personales y gestión de perfil. Entrevista 2026-10-30 |
| RF-16 | Autenticación por wallet | Empleados se conectan solo por wallet mediante **SIWE (EIP-4361)**, firma verificada en backend (RNF-07); sesión de corta vida. Si la wallet no pertenece a un empleado activo, la Suite responde genérica sin datos (matriz de superficie definida en doc. técnico) | Entrevista + auditoría |
| RF-17 | Persistencia administrativa | Los datos administrativos (empleados, proyectos, conceptos, periodos, perfiles) se guardan en **MongoDB**. Entrevista 2026-10-30 |
| RF-18 | Operación 100% on-chain | Las operaciones sobre la cadena (crear/pausar/terminar flujos, wrap/unwrap) se firman con la wallet desde el navegador; el backend no custodia transacciones. Entrevista 2026-10-30 |
| RF-19 | Cambio de wallet del empleado (H-15, AC-03) | Ante pérdida de clave o cambio de wallet: la **wallet nueva firma un EIP-712 ligado a empleado + wallet anterior + wallet nueva** (backend ecrecover) y el **admin firma un step-up EIP-712**; el cambio se registra en `audit_events`. Si hay flujo activo, se ejecuta la **función atómica `changeReceiver(receptorAntiguo, walletNueva, monto, duración)`** (cierra el flujo antiguo y crea el nuevo en una sola tx, sin estado intermedio); si no hay flujo, solo se actualiza MongoDB. La Suite queda asociada a la wallet nueva | Fase 2 (auditoría AC) |
| RF-20 | Baja de empleado (H-23) | Al dar de baja: el panel impide flujos «próximos» del empleado, sugiere (alerta) la terminación del flujo activo y muestra el saldo residual para retiro; el acceso a la Suite queda deshabilitado al marcar «inactivo», **salvo el acceso de solo retiro** durante la ventana definida (CU-16-A5) | Fase 2 (auditoría) |
| RF-21 | Retiro del saldo BrltX del empleado (AC-01) | El empleado, autenticado por SIWE, puede convertir su BrltX en BRLT firmando `downgrade(importe)` desde su propia wallet (total o parcial); el BRLT se acredita en su wallet en la misma tx. Sin custodia ni firma del backend. Incluye liquidación previa de un flujo vencido (`settleFlow`) y acceso de retiro tras la baja durante la ventana definida | Fase 2 (auditoría AC) |

## 3. Requerimientos no funcionales (RNF)

| ID | Requerimiento | Fuente |
|----|---------------|--------|
| RNF-01 | Seguridad de claves | Nunca versionar `PRIVATE_KEY`; uso de `.env` + `.gitignore`; claves solo de prueba. §9.3 |
| RNF-02 | Rendimiento/consenso | Frecuencia de refresco de UI alineada al block time real de Besu (QBFT); medir con `cast`. §9.1 |
| RNF-03 | Compatibilidad de versiones | Validar peer deps: ethers 5.7.2 + React 19 (sin overrides). El SDK Superfluid ya no forma parte del build (H-01) | Mod. Fase 2 |
| RNF-04 | Usabilidad | Administrador no técnico: dar de alta a un empleado, crear un flujo y hacer mint se completan en **≤ 4 acciones de UI cada uno**, sin comandos de consola, y una tarea guiada se completa en **≤ 5 min**. Medible por prueba de usabilidad con 1 usuario no técnico (registro de pasos/tiempo) | Mod. Fase 2 (AC-17) |
| RNF-05 | Seguridad de contratos | Uso de OpenZeppelin 5.1.0; control de acceso en `mint/burn` y administración. **AC-07**: `ReentrancyGuard` + patrón CEI en todas las funciones de estado, `Pausable` de emergencia solo owner (bloquea crear/actualizar flujos, pero **permite `settleFlow` y `downgrade`** para no atrapar saldos) y shortfall explícito: si lo devengado supera lo depositado, se paga lo disponible y se revierte sin estado parcial | Mod. Fase 2 (AC-07) |
| RNF-06 | Trazabilidad on-chain | Flujos y balances observables verificados contra el nodo JSON-RPC remoto. §3, §7 |
| RNF-07 | Seguridad de acceso (H-02, AC-08) | Autenticación de la Suite con **SIWE (EIP-4361)**: mensaje firmado con nonce de un solo uso, dominio y chainId 81234; verificación de firma (ecrecover) en backend. **Parámetros fijos**: nonce válido **5 min**; sesión admin **2 h** y sesión empleado **8 h**; rate-limit **5 intentos / 15 min** por wallet+IP; **revocación inmediata** al marcar inactivo (consulta de estado en cada request). Cookies `Secure`, `HttpOnly`, `SameSite=Strict`; mutaciones con **CSRF double-submit**. El panel admin exige SIWE de una wallet en lista blanca de admins antes de servir datos de MongoDB | Mod. Fase 2 (AC-08) |
| RNF-08 | Protección de datos (H-02, AC-10) | Datos personales: aviso de privacidad y consentimiento versionado, minimización de campos, cifrado en reposo del proveedor MongoDB, retirada/borrado desde la Suite y **política determinista**: borrado inmediato a petición; tras la baja, PII **anonimizada a los 30 días**; se conservan solo datos agregados/anónimos por obligación contable (**5 años**). Deploy en UE | Mod. Fase 2 (AC-10) |
| RNF-09 | Custodia de claves (H-03) | Clave de deploy (desechable, `.env`) **separada** de la wallet admin/owner; backup de seed verificado; procedimiento de sucesión/rotación documentado; formalización **bloqueante antes del deploy** | Fase 2 |

## 4. Requerimientos técnicos (RT)

| ID | Requerimiento | Fuente |
|----|---------------|--------|
| RT-01 | Solidity 0.8.28 + OpenZeppelin 5.1.0 | §6 |
| RT-02 | Foundry global (forge/cast/chisel) del servidor; sin Anvil ni Alchemy | §3.2 |
| RT-03 | Red Besu Codecrypto: Chain ID 81234, cliente Hyperledger Besu v24.12.0, RPC `https://besu.alumnos.codecrypto.academy`, CC nativa (18 dec), QBFT multi-node | §3.1 |
| RT-04 | Faucet: `https://faucet.codecrypto.academy/` — máx. 100 CC por solicitud; también registra tokens en MongoDB | §3.3 |
| RT-05 | Frontend: Next.js 15.5.4 (App Router) + React 19.1.0 + TypeScript + Tailwind 3.4 | §6 |
| RT-06 | Web3: ethers.js 5.7.2 + capa propia contra el ABI de BrltX. **Decisión 2026-10-30 (H-01): `@superfluid-finance/sdk-core` descartado** (inviable en Besu: sin Resolver ni subgraph de The Graph); queda como referencia didáctica en la nota «CFA real vs envoltorio propio» | Mod. Fase 2 auditoría |
| RT-07 | Estructura: `sc/` (src, script, test) y `web/src/` (app, components, lib, config) — alineado a las rutas canónicas de entornos_globales | §4 |
| RT-08 | Cuenta principal del despliegue financiada con 100 CC y 10.000 BRLT | §2.5 |

## 5. Decisiones ya registradas en el brief

- **Opción B** aprobada (2026-09-29): envoltorio mínimo propio `BrltX.sol` con semántica CFA
  simplificada. La Opción A (framework Superfluid soberano) queda fuera de alcance de v1.
- El documento técnico incluirá nota comparativa «CFA real vs envoltorio propio».

## 6. Dudas de la Fase 1 — RESUELTAS (entrevista completa)

1. **Persistencia del panel admin** → ✅ MongoDB (Bl. 1).
2. **Roles de acceso** → ✅ Suite del Empleado aparte, acceso solo por wallet (Bl. 1-2).
3. **Decimales de BRLT** → ✅ 18 decimales (Bl. 3; los ejemplos de flowRate quedan consistentes).
4. **Repositorios remotos** → ✅ 3 repos existentes, rama `superfluidv2` (Bl. 2, §7-3).
5. **GCP** → ✅ Cloud Run existente `superfluid-dashboard-1095249147821…` (Bl. 2, §7-4).
6. **Montos por defecto** → ✅ Montos configurables por empleado/periodo (2000/mes didáctico) (Bl. 3).
7. **Ownership** → ✅ Owner/minter: wallet del admin desplegante (Bl. 3, a formalizar en doc. técnico).
8. **Flujos programados** → ✅ Aviso en el panel cuando llega la fecha + firma manual del admin (Bl. 3).
9. **Multi-empresa** → ✅ Una sola organización (Bl. 3). Suite como portal multiusuario.

## 7. Decisiones registradas en entrevista (2026-10-30)

1. **Arquitectura**: panel administrativo 100% on-chain con wallet (el admin firma todo desde
   el navegador; sin servidor custodial de transacciones) + MongoDB para lo administrativo.
2. **Suite del Empleado**: portal independiente (RF-15) con acceso solo por wallet (RF-16).
   Introduce el concepto de **flujos programados** (estado «próximo») y de datos personales
   guardados off-chain.
3. **Repositorios remotos** (existentes, rama de trabajo `superfluidv2`):
   - GitHub: https://github.com/anlucorporations/superfluid.git
   - GitLab.com: https://gitlab.com/anlucorporations/superfluid.git
   - GitLab CodeCrypto: https://gitlab.codecrypto.academy/anlucorporations/superfluid.git
4. **GCP**: se reutiliza la plataforma ya desplegada — Cloud Run
   `https://superfluid-dashboard-1095249147821.europe-west1.run.app/` (proyecto 1095249147821,
   región europe-west1) — con el faucet para lo on-chain y MongoDB para lo off-chain.
   La v1 desplegada opera hoy tokens EURBETA; la v2 evoluciona a BRLT/BrltX + panel admin + Suite.
5. **Decimales BRLT: 18** (Bl. 3). Los ejemplos de flowRate del brief quedan consistentes con 10^18.
6. **Flujos programados**: se crean «próximos» (planificados) y el aviso aparece en el panel
   cuando llega su fecha; el **admin firma manualmente** el flow on-chain (coherente con el
   modelo 100% on-chain; ninguna pk en el servidor).
7. **Alcance multiempresa**: una sola organización; montos de flujo configurable por
   empleado/periodo; owner/minter = wallet admin desplegante.
8. **Capa Web3 (H-01)**: solo ethers 5.7.2 contra ABI de BrltX; SDK Superfluid descartado del build.
9. **Custodia (H-03)**: política formal didáctica — clave de deploy separada de la wallet
   admin/owner, Ownable2Step, backup verificado, sucesión documentada (RNF-09).
10. **Auth/PII (H-02)**: SIWE completo (EIP-4361, nonce, ecrecover backend, sesión corta) +
    protección GDPR de datos personales (RNF-07/RNF-08).
11. **Ciclo de flujos (H-05/H-07/H-11)**: operaciones atómicas del wrapper (wrapAndCreateFlow /
    deleteFlow con unwrap), lista cerrada de funciones. **Corrección AC-02**: no existe fin
    automático sin transacción; liquidez perezosa con `settleFlow` público sobre «vencido
    pendiente de liquidación».
12. **Precision (H-06)**: flowRate truncado al wei (floor).
13. **Lote RF-06 (H-24)**: máx. 10 destinatarios por sesión de envío múltiple.
14. **Cambio de wallet (H-15)**: autorizado solo por el admin con firma desde la wallet nueva
    (ecrecover); flujo activo se termina y se crea uno nuevo en la misma sesión (RF-19).
15. **Presupuesto de Proyecto (H-31)**: se mantiene solo como dato informativo (RF-20/H-23 registrados:
    baja con aviso de cierre de flujo y saldo residual).
16. **Cobro del empleado (AC-01, 2026-11-01)**: nuevo **CU-16 / RF-21** — el empleado retira su
    BrltX firmando `downgrade` hacia su wallet; incluye acceso de solo retiro tras la baja.
17. **Fin de flujo (AC-02, 2026-11-01)**: liquidación perezosa con **`settleFlow` público/sin
    permiso**; estado «vencido pendiente de liquidación» antes de «terminado». Paga el gas quien
    envía la tx.
18. **Ownership (AC-06, 2026-11-01)**: se elimina el diferido del antiguo CU-12-A6; la
    transferencia Ownable2Step (propose desde la clave de deploy + accept desde la wallet admin)
    se exige **dentro de la sesión de deploy**, antes de cualquier operación.
19. **Estados programados (AC-05, 2026-11-01)**: `flujos_programados` usa
    `próximo · ejecutado · cancelado · fallido` (nunca «terminado»); los terminados de la
    Suite se obtienen de eventos on-chain y del espejo `flows_history`.
20. **Cambio de wallet (AC-03, 2026-11-01)**: mensaje ligado a empleado + wallet anterior +
    wallet nueva, step-up del admin, auditoría y `changeReceiver` atómico en BrltX.
21. **Flujos solapados (AC-23, 2026-11-01)**: se permiten varios flujos activos por empleado
    con confirmación explícita y visualización del total agregado.
22. **Robustez de BrltX (AC-07, 2026-11-01)**: ReentrancyGuard + CEI, Pausable de emergencia
    (permite liquidar/cobrar) y shortfall explícito en v1.
23. **Sesiones (AC-08, 2026-11-01)**: TTL admin 2 h / empleado 8 h, nonce 5 min, rate-limit
    5/15 min, revocación inmediata, cookies Strict y CSRF double-submit.
24. **GDPR (AC-10, 2026-11-01)**: borrado inmediato a petición; anonimización a los 30 días de
    la baja; retención contable anónima 5 años.
25. **MEDIAS (2026-11-01)**: decisiones operativas adoptadas y documentadas en
    `documento_tecnico.md` §12 (AC-11, AC-13..AC-16, AC-19..AC-21, AC-25); queda pendiente
    la pasada ortotipográfica final (AC-24).
26. **Pausa y devengo (2026-11-01)**: al reanudar, `endsAt` se prolonga por el tiempo pausado
    para que el empleado reciba el monto pactado del periodo.
