# Documento técnico — Superfluid BRLT Streaming v2

> Estado: borrador de arquitectura para Fase 2. Fuente canónica de comportamiento:
> requerimientos.md y casos_uso.md. Este documento no sustituye una auditoría de
> contratos ni autoriza un despliegue productivo.

## 1. Propósito y alcance

Superfluid BRLT Streaming v2 es una aplicación didáctica de nómina continua para una sola
organización. Opera en Besu Codecrypto (chain ID 81234) con BRLT (ERC-20, 18 decimales)
y un wrapper propio BrltX; no despliega ni consume el framework oficial de Superfluid.

El alcance incluye:

- panel de administración protegido con SIWE y lista blanca;
- empleados, proyectos, programación de pagos y datos personales en MongoDB;
- operaciones de token y flujos firmadas por la wallet administradora desde el navegador;
- Suite del Empleado de lectura de flujos, gestión de perfil y **cobro del saldo BrltX**
  (`downgrade` a la wallet del empleado);
- contratos, scripts Foundry, frontend Next.js y backend de API.

No incluye multiempresa, custodia de claves de usuario, liquidaciones/deuda de CFA real,
depósitos de seguridad, indexador propio ni automatización custodial desde el servidor.

## 2. Decisiones de arquitectura

| Tema | Decisión |
|---|---|
| Red | Besu Codecrypto, RPC https://besu.alumnos.codecrypto.academy, chain ID 81234, CC con 18 decimales. |
| Token | Brlt.sol, ERC-20 con 18 decimales, supply inicial de 10.000.000 BRLT y tope de mint de 50.000.000 BRLT (AC-16). |
| Streaming | BrltX.sol, wrapper/escrow de alcance limitado (Opción B), no el SDK ni contratos oficiales de Superfluid. |
| Firmas | La wallet ADMIN firma las transacciones on-chain; el backend nunca posee su clave. |
| Datos administrativos | MongoDB: empleados, proyectos, configuración, flujos programados, lotes, nonces SIWE y sesiones. |
| Identidad | SIWE EIP-4361, nonce de un solo uso (5 min), dominio y chain ID 81234; sesión admin 2 h / empleado 8 h en cookie Secure/HttpOnly/SameSite=Strict, rate-limit 5/15 min y CSRF double-submit (AC-08). |
| Cliente | Next.js 15.5.4, React 19.1, TypeScript, Tailwind CSS, ethers 5.7.2. |
| Contratos | Solidity 0.8.28, OpenZeppelin 5.1.0 y Foundry global. |

## 3. Arquitectura lógica

    Wallet ADMIN / EMPLEADO
              │ SIWE y firmas EIP-1193
              ▼
    Next.js (panel Admin + Suite) ─── API backend ─── MongoDB
              │                            │
              │ ethers 5.7.2               └── sesiones, PII y datos administrativos
              ▼
    Besu RPC ─── Brlt.sol ─── BrltX.sol
                        │        │
                        └────────┴── eventos y lecturas de flujos

El cliente obtiene la verdad financiera desde el RPC. MongoDB solo conserva metadatos,
programación, asociaciones de empleado/proyecto y una proyección/reconciliación de estado;
nunca debe ser fuente de verdad para saldos o para confirmar una transacción.

## 4. Componentes y responsabilidades

### 4.1 sc/ — contratos y despliegue

    sc/
    ├── src/Brlt.sol
    ├── src/BrltX.sol
    ├── script/DeployBrlt.s.sol
    ├── script/DeployAll.s.sol
    └── test/{Brlt,BrltX,Deploy}.t.sol

Brlt usa ERC20, Ownable2Step y control explícito de minter. Se recomienda fijar el rol de
minter al admin después del despliegue y separar la clave desechable de deploy de la wallet
owner/minter. Mint y burn exigen autorización; el frontend valida montos pero el contrato es
la barrera de seguridad.

BrltX custodia BRLT aprobado por el admin, representa el saldo envuelto y administra un
registro de flujo por par (sender, receiver). Aplica CEI, ReentrancyGuard y una pausa de
emergencia administrativa. La pausa de emergencia es distinta de pausar un flujo
(flowRate = 0).

### 4.2 web/ — UI, API y acceso Web3

    web/
    └── src/
        ├── app/                 # rutas Admin, Suite y endpoints API
        ├── components/          # formularios, dashboard, tablas y estados de tx
        ├── config/web3.ts       # chain, RPC y direcciones desplegadas
        ├── lib/                 # ABIs, ethers, SIWE, cálculo de tasas
        └── server/              # repositorios MongoDB y autorización de API

El backend solo atiende datos off-chain y autenticación. Cada endpoint administrativo
requiere sesión SIWE de una wallet incluida en la lista blanca; cada endpoint de empleado
requiere que la wallet autenticada coincida con un empleado activo (o con un empleado
inactivo dentro de la ventana de retiro de CU-16). Las llamadas de escritura on-chain se
construyen en el navegador y se envían al proveedor de wallet. Esto incluye el cobro del
empleado: el navegador firma `downgrade` hacia su propia wallet y el backend nunca firma ni
custodia esa transacción.

## 5. Modelo de contratos propuesto

### 5.1 Reglas numéricas

Todas las cantidades se almacenan como uint256 en unidades mínimas (wei BRLT). Las
duraciones permitidas son 518.400, 1.296.000, 2.592.000 y 7.776.000 segundos. La tasa se
calcula tanto en cliente como en contrato:

    flowRate = totalAmount / durationSeconds; // división entera: floor
    residue  = totalAmount - (flowRate * durationSeconds);

Para 2.000 BRLT durante 30 días, la tasa es 771604938271604 wei/s. El contrato debe
rechazar una duración no permitida, receptor nulo, monto cero, tasa cero y una fecha de fin
que no sea estrictamente posterior al inicio efectivo. El mint está acotado por un tope de
50.000.000 BRLT (AC-16); el approval BRLT→BrltX se limita al monto de cada flujo o al total
del lote, nunca a `uint256.max`.

### 5.2 Estado mínimo de un flujo

Un empleado puede tener **varios flujos simultáneos** (AC-23), incluso del mismo admin, por
lo que el flujo se identifica con un `flowId` global y no con el par `(sender, receiver)`:

    struct Flow {
        uint128 flowRate;        // wei de BRLT por segundo (0 mientras está pausado)
        uint64  startedAt;       // inicio del tramo de devengo vigente
        uint64  endsAt;          // fin del flujo; al alcanzarlo queda vencido
        uint64  lastSettledAt;   // último instante liquidado
        uint64  pausedAt;        // 0 si no está pausado
        uint256 rateBeforePause; // tasa vigente al pausar
        uint256 deposited;       // BRLT envuelto para el flujo
        uint256 settled;         // importe ya acreditado al receptor
        address sender;          // admin que financia
        address receiver;        // empleado que devenga
        bool    paused;
        bool    terminated;
    }

    mapping(uint256 flowId => Flow) private _flows;
    mapping(address receiver => uint256[]) private _flowsByReceiver;
    mapping(address sender   => uint256[]) private _flowsBySender;
    mapping(address sender => mapping(address receiver => uint256[])) private _flowsByPair;

El importe devengado en un instante `t` es

    devengado(t) = min(deposited, settled + flowRate × (min(t, endsAt) − startedAt))

donde `settled` es el histórico ya acreditado y `startedAt` se reancla (`startedAt = now`)
en cada pausa, reanudación o cambio de tasa, tras liquidar el tramo anterior. El residuo de
la división se mantiene en el escrow y vuelve al admin al terminar el flujo. Al reanudar se
recalcula `endsAt = now + (deposited − settled) / flowRate`; con la misma tasa el resultado
coincide con el `endsAt` original **más el tiempo pausado** (decisión 2026-11-01), de modo
que el empleado no pierde devengo por una pausa administrativa.

Estados observables (decisión AC-02): `activo`, `pausado`, `vencido pendiente de
liquidación` (`block.timestamp ≥ endsAt`, sin tx todavía), `terminado`. No existe transición
automática: el paso a `terminado` lo provoca `settleFlow` o `deleteFlow`. Pasado `endsAt` el
devengo se congela y nunca supera `deposited`; un `shortfall` revierte sin estado parcial.

### 5.3 Interfaz de BrltX

La ABI implementada en H1 (`sc/src/BrltX.sol`) expone la operación por `flowId` y conserva
sobrecargas por par `(sender, receiver)` para los consumidores documentados:

    function upgrade(uint256 amount) external;
    function downgrade(uint256 amount) external;

    function wrapAndCreateFlow(uint256 amount, address receiver, uint64 durationSeconds)
        external returns (uint256 flowId);

    function updateFlow(uint256 flowId, uint128 newFlowRate) external;
    function updateFlow(address receiver, uint128 newFlowRate) external;   // último flujo del par

    function changeReceiver(uint256 flowId, address newReceiver)
        external returns (uint256 newFlowId);
    function changeReceiver(address oldReceiver, address newReceiver, uint256 amount, uint64 durationSeconds)
        external returns (uint256 newFlowId);

    function deleteFlow(uint256 flowId) external returns (uint256 paid, uint256 returnedAmount);
    function deleteFlow(address receiver) external returns (uint256 paid, uint256 returnedAmount);

    function settleFlow(uint256 flowId) external returns (uint256 paid, uint256 returnedAmount); // público (AC-02)
    function settleFlow(address sender, address receiver) external;                              // público (AC-02)

    function getFlow(uint256 flowId) external view returns (Flow memory);
    function getFlow(address sender, address receiver) external view returns (Flow memory);      // más reciente
    function getFlowIdsByReceiver(address receiver) external view returns (uint256[] memory);
    function getFlowIdsBySender(address sender) external view returns (uint256[] memory);
    function getFlowIdsByPair(address sender, address receiver) external view returns (uint256[] memory);
    function getPending(uint256 flowId) external view returns (uint256);
    function getRealtimeBalance(address account) external view returns (uint256);
    function brltBacking() external view returns (uint256);
    function totalEscrow() external view returns (uint256);

Administración: `pause()` / `unpause()` (solo owner, AC-07) y
`setDurationAllowed(uint64,bool)` (solo owner; por defecto 6, 15, 30 y 90 días).

wrapAndCreateFlow ejecuta transferFrom de BRLT y registra el flujo en una única transacción.
deleteFlow primero liquida el importe devengado, marca el flujo terminado y devuelve el BRLT
no devengado a la wallet del sender en esa misma transacción. updateFlow(0) representa la
pausa; un valor positivo solo es válido para el sender de un flujo existente y no terminado.
downgrade es la vía de cobro del empleado (RF-21/CU-16): quema BrltX y entrega BRLT al
firmante. settleFlow acredita el devengado de un flujo vencido al receiver y devuelve el
remanente al sender; no exige rol, solo que el flujo esté vencido y no terminado.
changeReceiver (AC-03) liquida al receptor antiguo, cierra el flujo y reabre uno nuevo hacia
la wallet nueva con el remanente y el tiempo restante, en una única transacción atómica; si
cualquier paso revierte, no hay cambio parcial. La variante con `amount`/`durationSeconds`
cierra el flujo anterior devolviendo su remanente y crea un flujo nuevo con el monto
indicado. El backend valida previamente la autorización EIP-712 ligada a empleado + wallet
anterior + wallet nueva y el step-up del admin, y registra el cambio en `audit_events`.

Eventos emitidos (incluyen `flowId` para trazabilidad de flujos concurrentes):

    event FlowCreated(uint256 indexed flowId, address indexed sender, address indexed receiver,
                      uint256 amount, uint256 flowRate, uint64 endsAt);
    event FlowUpdated(uint256 indexed flowId, address indexed sender, address indexed receiver,
                      uint256 oldFlowRate, uint256 newFlowRate);
    event FlowSettled(uint256 indexed flowId, address indexed sender, address indexed receiver,
                      uint256 amount, uint256 cumulative);
    event FlowDeleted(uint256 indexed flowId, address indexed sender, address indexed receiver,
                      uint256 paid, uint256 returnedAmount);
    event FlowExpired(uint256 indexed flowId, address indexed sender, address indexed receiver,
                      uint256 paid, uint256 returnedAmount);
    event Upgraded(address indexed account, uint256 amount);
    event Downgraded(address indexed account, uint256 amount);

Los eventos complementan, pero no reemplazan, las lecturas de estado RPC. Permiten formar el
historial de movimientos de la Suite sin depender de un subgraph.

Invariante de respaldo verificada con fuzzing e invariantes (`sc/test/Invariants.t.sol`):

    brlt.balanceOf(BrltX) == BrltX.totalSupply() + BrltX.totalEscrow()

## 6. Restricción EVM: liquidación perezosa (decisión AC-02 adoptada)

Un contrato EVM no puede ejecutar código por sí solo al alcanzar una fecha. Por tanto, el
antiguo requisito de «fin automático on-chain sin firma» no es implementable literalmente
bajo RF-18: toda actualización de estado o transferencia requiere una transacción que pague
gas.

**Decisión adoptada (2026-11-01, AC-02): opción 1 — `settleFlow` público.**
Cualquier cuenta puede invocar `settleFlow(sender, receiver)` cuando
`block.timestamp >= endsAt` y el flujo no está terminado. El contrato calcula lo devengado,
acredita el BrltX al empleado y devuelve el remanente al admin en la misma transacción.
Paga el gas quien envía la transacción (admin, empleado desde la Suite o un tercero), sin
introducir custodia ni relayer obligatorio.

Consecuencias de diseño:

- Se elimina el estado «terminado automático». Entre el vencimiento y la liquidación el
  flujo se muestra «**vencido pendiente de liquidación**» y no acumula más.
- `deleteFlow` sigue disponible para el admin y liquida en el acto; `settleFlow` cubre el
  caso en que el admin no actúa (el empleado puede cobrar por sí mismo, CU-16).
- El backend solo detecta y avisa del vencimiento; no firma la liquidación (RF-18).
- La idempotencia es responsabilidad del contrato: un segundo `settleFlow` sobre un flujo
  terminado revierte sin mover saldo.
- La opción 3 (relayer/automatizador) queda descartada para v2 por el cambio de modelo de
  custodia y presupuesto de gas que introduciría.

Sin esta decisión, la promesa de pago «por segundo» solo podría ser una proyección de
lectura, no una transferencia ERC-20 materializada.

## 7. Persistencia MongoDB

| Colección | Datos principales | Autoridad |
|---|---|---|
| employees | wallet única, estado, proyecto, concepto, monto/periodo, PII minimizada | Administrativa |
| admin_allowlist | wallets autorizadas del panel, rol, alta/baja y auditoría | Seguridad |
| projects | nombre, descripción, presupuesto informativo, estado | Administrativa |
| scheduled_flows | empleado, monto, duración, tasa floor, inicio, fin, estado (`próximo · ejecutado · cancelado · fallido`), tx hash, motivo de fallo | Programación |
| flows_history | espejo reconstruible de eventos on-chain: flujo, estados, importes liquidados, tx hash | On-chain (espejo) |
| batches | filas, hashes, progreso y reintentos | Operativa/UI |
| system_config | direcciones, RPC, refresco, allowlist de admins | Configuración |
| siwe_nonces | nonce hash, wallet, expiración, uso | Seguridad |
| sessions | subject, rol, expiración y revocación | Seguridad |
| audit_events | cambios administrativos y metadatos, sin secretos | Auditoría |

Índices mínimos: employees.wallet único, scheduled_flows(employeeId, status, startsAt),
siwe_nonces(nonceHash) único y TTL sobre nonces/sesiones. Los registros de flujo guardan
transactionHash, blockNumber y las direcciones de contrato para reconciliarlos contra RPC.

Las operaciones que abarcan varias colecciones usan transacciones MongoDB o claves de
idempotencia. Un lote nunca infiere éxito desde la UI: cada fila confirmada requiere receipt
on-chain correcto antes de marcarse como completada.

`scheduled_flows` es un registro de **intención**, no del flujo on-chain. Su ciclo termina en
`ejecutado`, `cancelado` o `fallido` y nunca pasa a «terminado» (AC-05). Los terminados de la
Suite se leen de `flows_history`, reconstruible desde los eventos del contrato; si el espejo
se pierde, un job de reconciliación lo regenera desde el bloque de despliegue. Se permite más
de un flujo activo por empleado (AC-23): la validación muestra la suma de tasas y exige
confirmación explícita, sin bloquear la operación.

## 8. Autenticación, autorización y datos personales

1. La UI solicita un nonce al backend, construye un mensaje SIWE con dominio, URI, chain ID
   81234, wallet y expiración, y el usuario lo firma. El nonce vive **5 minutos** y es de un
   solo uso.
2. El backend recupera el firmante con ecrecover, consume el nonce atómicamente y crea una
   sesión en cookie `Secure`, `HttpOnly`, `SameSite=Strict`: **2 h para admin** y **8 h para
   empleado**. Las mutaciones exigen **CSRF double-submit**.
3. Para ADMIN valida además la allowlist; para EMPLEADO valida wallet única y estado activo.
   Una wallet no reconocida recibe respuesta genérica sin datos. El rate-limit es de
   **5 intentos / 15 min** por wallet+IP.
4. Las rutas API aplican autorización del servidor; ocultar controles en React no constituye
   control de acceso. La baja de un empleado revoca sus sesiones **de inmediato** (estado
   consultado en cada request), salvo el acceso de solo retiro de CU-16.
5. La PII se limita a los campos necesarios, se cifra en reposo según la capacidad del
   proveedor y requiere consentimiento explícito versionado. **Borrado inmediato** a
   petición; tras la baja, **anonimización a los 30 días** y conservación de agregados
   anónimos durante **5 años**; la wallet se pseudonimiza hasta el fin de la ventana de
   retiro (90 días).
6. El cambio de wallet del empleado (AC-03) exige autorización EIP-712 de la wallet nueva
   ligada a empleado + wallet anterior + wallet nueva, step-up EIP-712 del admin y registro
   en `audit_events`; la parte on-chain se ejecuta con `changeReceiver` atómico.

Los secretos (URI MongoDB, credenciales GCP, claves de sesión) van a Secret Manager o a
variables de entorno del runtime, nunca a Git, código cliente ni archivos versionados. La
clave de despliegue es efímera y no es owner/minter definitivo.

## 9. Lecturas, reconciliación y tolerancia a fallos

La UI hace polling cada 5 s por defecto y usa el timestamp del último bloque para tasas y
proyecciones. Ante fallo RPC conserva el último dato con fecha, usa backoff exponencial y
no reemplaza el saldo por cero. La medición de block time define la frecuencia final.

**Robustez de BrltX (AC-07).** Todas las funciones de estado usan `ReentrancyGuard` y
patrón checks-effects-interactions. `Pausable` solo lo activa el owner ante una incidencia y
bloquea crear/actualizar flujos, pero mantiene `deleteFlow`, `settleFlow` y `downgrade` para
que ningún saldo quede atrapado. Un shortfall (devengado > depositado) revierte sin estado
parcial; los invariantes se cubren con pruebas de invariantes de forge. Un job de
reconciliación regenera `flows_history` desde los eventos si el espejo se pierde.

**Reconciliación y respaldo (AC-11).** Un job programado (cada 5 min) compara `scheduled_flows`
y `flows_history` contra `getFlow`/eventos y corrige derivas; si MongoDB cae, la UI sigue
leyendo la cadena y encola las escrituras administrativas, que se reintentan al recuperar.
Backup diario de MongoDB con retención de 7 días y restauración probada una vez por trimestre.
**Plan B de gas (AC-13):** si la wallet titular no tiene CC, el responsable alterno firma con
su propia wallet (ambas en la allowlist); no hay patrocinio desde el backend. La sucesión del
owner se ejecuta con `Ownable2Step` desde la wallet de respaldo.

Después de cada receipt, el cliente relee getFlow y balances. Un proceso de lectura sin firma
reconcilia scheduled_flows y los hashes de transacción contra el RPC. Si MongoDB y cadena
difieren, el estado on-chain prevalece y la UI muestra una inconsistencia recuperable.

gasto_por_segundo = Σ flowRate solo de flujos activos. Para una fecha de fin definida,
gasto_previsto = Σ(flowRate × max(0, endsAt − blockTimestamp)); no incluye flujos pausados
ni terminados. El presupuesto de proyecto es solo informativo.

## 10. Pruebas y criterios de salida

| Capa | Pruebas mínimas |
|---|---|
| Contratos | forge unitarios, fuzz e invariantes: roles, decimales, floor, atomicidad, escrow, pausa, liquidación, expiración y reentrancy. |
| API | SIWE, nonces de un uso, allowlist, autorización por empleado, CRUD, unicidad de wallet, consentimiento, borrado e idempotencia. |
| UI E2E | red incorrecta, firmas, programación, flujo, pausa, cierre, lote de 10, reanudación y Suite. |
| Manual | deploy, rotación/custodia, faucet, block time, recuperación RPC y validación contra Besu. |

No se debe desplegar a la red compartida hasta completar revisión de seguridad interna,
tests de contrato, definición de custodia, direcciones/roles finales y la decisión de
liquidación de la sección 6.

## 11. Despliegue previsto

1. Definir wallets de despliegue y admin, custodia, sucesión y backup verificable.
2. Financiar la wallet técnica con CC y disponer de BRLT bootstrap según la política aprobada.
3. Ejecutar forge build y forge test; desplegar Brlt y BrltX con DeployAll contra el RPC de Besu.
4. Transferir/aceptar el ownership en dos pasos y registrar direcciones en configuración
   versionada sin secretos.
5. Desplegar web/API en Cloud Run europe-west1 con secretos administrados, migraciones e
   índices MongoDB.
6. Ejecutar smoke tests, probar SIWE y una transacción de bajo monto antes de habilitar datos
   reales.

## 12. Riesgos abiertos y decisiones pendientes

**Decisiones cerradas en la auditoría de casos de uso (2026-11-01):**

- Liquidación/fin al vencer: `settleFlow` público (AC-02, sección 6).
- Cobro del empleado: nuevo CU-16 / RF-21 (`downgrade` a su wallet; retiro tras baja).
- Ownership: transferencia Ownable2Step dentro de la sesión de deploy (AC-06).
- Estados programados: `próximo · ejecutado · cancelado · fallido` + `flows_history` (AC-05).
- Cambio de wallet: `changeReceiver` atómico + EIP-712 ligado + step-up + auditoría (AC-03).
- Flujos solapados: permitidos con confirmación y total agregado (AC-23).
- Robustez de BrltX: guardas, pausa que no atrapa saldos y shortfall explícito (AC-07).
- Sesiones: 2 h admin / 8 h empleado, nonce 5 min, rate-limit 5/15, CSRF (AC-08).
- GDPR: borrado inmediato, anonimización a 30 días, retención anónima 5 años (AC-10).

**Decisiones operativas de las MEDIAS (2026-11-01):**

| ID | Decisión adoptada |
|---|---|
| AC-11 | Job de reconciliación cada 5 min; backup diario de MongoDB (retención 7 días) con restauración trimestral probada; la cadena prevalece ante discrepancia. |
| AC-13 | Plan B de gas: el responsable alterno firma con su wallet de la allowlist; sucesión del owner por Ownable2Step; sin patrocinio del backend. |
| AC-14 | SLA de firmas: alerta a las 4 h de un «próximo» vencido; a las 24 h sin acción pasa a «fallido» con aviso al empleado; responsable alterno designado en CU-11. |
| AC-15 | Gestión de allowlist en CU-11: alta con confirmación de la wallet nueva, revocación con auditoría y prohibición de dejar la lista vacía; bootstrap post-deploy. |
| AC-16 | Tope de mint de **50.000.000 BRLT** verificado en contrato; approval BRLT→BrltX acotada al monto de cada flujo o lote. |
| AC-19 | `gasto_previsto_dia = Σ min(rate×86.400, rate×restantes)`; `mes = Σ min(rate×2.592.000, rate×restantes)`; `total = Σ rate×restantes`. |
| AC-20 | Oráculo de address: `eth_getCode` + `decimals()==18` + `getFlow()`; reversión a la address previa con un clic. |
| AC-21 | `en_flujo` no se persiste: es un estado derivado de la lectura on-chain. |
| AC-24 | Revisión ortotipográfica final antes de cerrar Fase 2 (pendiente de pasada). |
| AC-25 | Faucet limitado a 1 solicitud por wallet cada 24 h, con registro de uso. |

| Prioridad | Pendiente | Efecto |
|---|---|---|
| Alta | Proveedor, región y plan de MongoDB (backup ya definido en §9) | Protege los datos administrativos y PII. |
| Alta | Estimación real de RPC/block time y límites de polling | Ajusta disponibilidad y refresco. |
| Media | Cutover/rollback de Cloud Run v1 a v2 | Reduce riesgo de migración. |
| Media | Cobertura/CI en los tres remotos | Asegura calidad repetible. |
| Baja | Pasada ortotipográfica final (AC-24) | Calidad de edición antes de cerrar Fase 2. |

## 13. Trazabilidad

Esta arquitectura cubre RF-01 a RF-21, RNF-01 a RNF-09 y RT-01 a RT-08 mediante los CUs
CU-01 a CU-16. casos_uso.md conserva los flujos de interacción y criterios Gherkin; este
documento especifica los límites de componentes, los contratos, datos, seguridad y las
restricciones técnicas que deben respetar la implementación.

