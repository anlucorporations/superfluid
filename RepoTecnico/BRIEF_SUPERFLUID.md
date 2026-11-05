# BRIEF — Proyecto Superfluid Brlt Streaming (Red Codecrypto Besu)

> Documento de definición y trabajo a realizar. Versión adaptada del brief original
> (`00 DEFINICION Y TRABAJO A REALIZAR.md`) para usar los \*\*servicios globales de Foundry\*\*
> contra la \*\*red Besu de CodeCrypto Academy\*\* en lugar de un fork local de mainnet con Anvil + Alchemy.

\---

## 1\. Definición del Proyecto

Aplicación completa de **streaming de dinero en tiempo real** utilizando el protocolo **Superfluid** de una empresa de tecnologia donse se generan pagos continuos a los empleados por periodos definidos (6 dias, 15 dias, 30 dias y 90 dias) por conceptos diversos (mantenimiento, Nomina, Proyecto MVP, Actividad Espacial, etc) Permitiendo enviar flujos continuos de una stablecoin Brlt (Brlt) a múltiples destinatarios. El proyecto se desarrolla y despliega sobre la **red privada Codecrypto (Hyperledger Besu)**,
gestionada con las herramientas globales de **Foundry** (`forge`, `cast`, `chisel`) instaladas en
el servidor, sin necesidad de levantar un nodo local (Anvil) ni de claves RPC externas (Alchemy/Infura). el proyecto debe contar con una interface administrativa donde se puedan gestionar los Empleados con sus Billeteras, Los Proyectos, Los Flujos, Las Finanzas, El Sistema, ETC

## 2\. Objetivos de Aprendizaje

Al completar este proyecto, los estudiantes aprenderán:

1. **Smart Contracts con Solidity**

   * Crear tokens ERC20 personalizados
   * Implementar funciones de mint, burn y transferencias
   * Usar OpenZeppelin para contratos seguros
   * Trabajar con Foundry para testing y deployment
2. **Protocolo Superfluid**

   * Entender el concepto de "Super Tokens" (tokens envueltos)
   * Crear y gestionar flows (flujos de dinero continuo)
   * Implementar Constant Flow Agreement (CFA)
   * Calcular flow rates en wei/segundo
3. **Desarrollo Web3**

   * Integrar ethers.js para interactuar con blockchain
   * Usar Superfluid SDK para crear streams
   * Conectar frontend con smart contracts
   * Gestionar transacciones y firmas de wallet
4. **Next.js 15 y React 19**

   * Construir interfaces modernas con App Router
   * Gestionar estado con hooks (useState, useEffect)
   * Actualizar datos en tiempo real
   * Implementar formularios y validaciones
5. **Despliegue en red empresarial Besu con Foundry global**

   * Conectarse a un nodo JSON-RPC remoto (HTTPS) con `forge`/`cast` globales
   * Desplegar contratos en entorno multi-node (QBFT)
   * Financiar cuentas de desarrollo desde el faucet público
   * Debuggear transacciones contra red remota
   * Agregar el token BarloToken (BRLT con 8 digitos)
   * Recargar BRLT de la cuenta principal con 100 cc y 10000 BRLT

## 3\. Red y Servicios Globales (Sustituye a Anvil + Alchemy)

### 3.1 Datos oficiales de la red Codecrypto

|Parámetro|Valor|
|-|-|
|Portal / Faucet|https://faucet.codecrypto.academy/|
|Nombre de red|Codecrypto|
|Chain ID|**81234** (`0x13d52`)|
|RPC URL|**https://besu.alumnos.codecrypto.academy**|
|Cliente|Hyperledger Besu v24.12.0|
|Moneda nativa|**CC** (18 decimales)|
|Consenso|QBFT (multi-node; no es PoW/PoS público)|

Obtenido directamente del portal del faucet y verificado por JSON-RPC
(`eth\_chainId → 0x13d52`, `web3\_clientVersion → besu/v24.12.0`).

### 3.2 Herramientas Foundry globales del servidor

Se usan los binarios instalados globalmente en el host (no dependencias del repo):

```bash
forge --version     # compilar, testear, desplegar
cast --version      # consultas, transacciones, conversión de unidades
chisel              # REPL de Solidity (opcional)
```

Ventajas del enfoque global:

* No hace falta `foundryup` por proyecto ni instalar Anvil localmente.
* El mismo `forge` sirve para toda la clase/red compartida.
* No se requiere clave de Alchemy: **la red Besu ya expone el estado on-chain**.

### 3.3 Financiación de cuentas (Faucet)

Las cuentas de desarrollo se financian con moneda nativa **CC** desde el faucet web:

1. Abrir https://faucet.codecrypto.academy/
2. Seleccionar "Moneda Nativa" y pegar la dirección de la cuenta de despliegue.
3. Solicitar fondos (máximo 100 CC por solicitud).

También permite consultar balances y crear tokens ERC20 registrados en MongoDB (utilidad didáctica).

## 4\. Arquitectura del Proyecto

### 4.1 Smart Contracts (`sc/`)

```
sc/
├── src/
│   └── Brlt.sol              # Token ERC20 personalizado
├── script/
│   ├── DeployBrlt.s.sol      # Script para desplegar Brlt
│   └── DeployAll.s.sol       # Script completo de deployment
└── test/
    └── Brlt.t.sol            # Tests del token
```

**Brlt.sol**: contrato ERC20 que implementa:

* Funciones estándar: `transfer`, `approve`, `balanceOf`
* Funciones de owner: `mint`, `burn`
* Supply inicial de 10,000,000 Brlt

### 4.2 Web Application (`web/`)

```
web/
├── src/
│   ├── app/                  # Next.js App Router
│   ├── components/
│   │   └── Dashboard.tsx     # Componente principal
│   ├── lib/
│   │   └── superfluid.ts     # Integración Superfluid
│   └── config/
│       └── web3.ts           # Configuración de red y contratos
└── package.json
```

**Dashboard.tsx**: interfaz de administracion de pago de nomina que permite:

* Conectar wallet con la red Codecrypto (MetaMask o cualquiera)
* Ver balances de Brlt y Brltx
* Hacer upgrade Brlt → Brltx (wrap) de forma automatica al crear un flujo
* Hacer downgrade Brltx → Brlt (unwrap) de forma automatica al terminar o cancelar un flujo
* Agregar múltiples destinatarios para streaming
* Pausar y reanudar flows
* Ver balances en tiempo real (actualización cada 5 s)

**superfluid.ts**: funciones principales:

* `upgradeToBrltX`: convierte Brlt a Super Token
* `downgradeFromBrltX`: convierte Super Token a Brlt
* `createFlow`: crea un stream de 2000 Brlt/mes
* `deleteFlow`: pausa un stream
* `getFlow`: obtiene información de un flow
* `getRealtimeBalance`: obtiene balance actualizado

**web3.ts** (adaptado a la nueva red):

```ts
export const CHAIN = {
  name: 'Codecrypto',
  chainId: 81234,
  rpcUrl: 'https://besu.alumnos.codecrypto.academy',
  currency: 'CC',
} as const;

// Direcciones resultantes del deployment (se actualizan tras DeployAll)
export const CONTRACTS = {
  Brlt:  '0x...',   // output de forge deploy
  Brltx: '0x...',   // Super Token creado por el host
} as const;
```

## 5\. Conceptos Clave

### 5.1 Super Tokens

Los Super Tokens son versiones "envueltas" de tokens ERC20 normales con capacidades adicionales
de streaming. Para hacer streaming, primero debes:

1. Tener tokens Brlt (ERC20 normal)
2. Hacer "upgrade" a Brltx (Super Token)
3. Ahora puedes crear flows con Brltx

### 5.2 Flow Rate

El flow rate es la cantidad de tokens por segundo que se envían. Para 2000 Brlt/mes:

```javascript
2000 Brlt/mes = 2000 Brlt / (30 días x 24 h x 60 min x 60 s)
             = 2000 / 2,592,000 segundos
             = 0.000771604938271604 Brlt/segundo
             = 771604938271604 wei/segundo
```

### 5.3 Constant Flow Agreement (CFA)

El CFA es el módulo de Superfluid que gestiona los streams. Cuando creas un flow:

* Se bloquea un depósito de seguridad
* Los tokens fluyen automáticamente cada segundo
* El balance del receptor aumenta en tiempo real
* No necesitas hacer transacciones continuas

## 6\. Tecnologías Utilizadas

### Blockchain

* **Solidity 0.8.28**: lenguaje para smart contracts
* **Foundry (global)**: framework de desarrollo (`forge`, `cast`, `chisel`) — binarios del servidor
* **OpenZeppelin 5.1.0**: librería de contratos seguros
* **Hyperledger Besu v24.12.0**: red Codecrypto (reemplaza a Anvil/fork-mainnet)

### Frontend

* **Next.js 15.5.4**: framework React con App Router
* **React 19.1.0**: librería UI
* **TypeScript**: tipado estático
* **Tailwind CSS 3.4**: framework CSS utility-first
* **ethers.js 5.7.2**: librería Web3
* **Superfluid SDK (`@superfluid-finance/sdk-core`) 0.9.0**: SDK del protocolo

## 7\. Flujo de Trabajo (adaptado a Besu + Foundry global)

1. **Verificar conectividad con la red**

```bash
   curl -s -X POST https://besu.alumnos.codecrypto.academy \\
     -H 'Content-Type: application/json' \\
     -d '{"jsonrpc":"2.0","method":"eth\_chainId","params":\[],"id":1}'
   # → {"result":"0x13d52"}  (81234)
   ```

2. **Financiar la cuenta de despliegue**

   * Ir a https://faucet.codecrypto.academy/ y solicitar fondos CC y BRLT para la dirección pública.
3. **Configurar variables de entorno del proyecto `sc/`**

```bash
   # sc/.env (NO versionar la clave privada)
   RPC\_URL=https://besu.alumnos.codecrypto.academy
   CHAIN\_ID=81234
   PRIVATE\_KEY=0x...        # clave de una cuenta de prueba financiada por el faucet
   ```

4. **Compilar y testear**

```bash
   cd sc
   forge build
   forge test              # tests unitarios locales (EVM interno de forge)
   ```

5. **Desplegar contratos contra la red remota**

```bash
   source .env
   forge script script/DeployAll.s.sol:DeployAllScript \\
     --rpc-url "$RPC\_URL" \\
     --private-key "$PRIVATE\_KEY" \\
     --broadcast --verify=false
   ```

6. **Registrar addresses en `web/src/config/web3.ts`**

   * Copiar address del contrato Brlt desplegado
   * Copiar address del Super Token Brltx creado por el host
7. **Iniciar aplicación web**

```bash
   cd web \&\& npm run dev
   ```

8. **Usar la aplicación**

   * Conectar wallet a la red Codecrypto (Chain ID 81234)
   * Hacer upgrade de Brlt a Brltx
   * Agregar destinatario(s) (dirección Ethereum)
   * El flow se crea automáticamente a 2000 Brlt/mes
   * Ver balance aumentar en tiempo real
   * Pausar/reanudar cuando quieras

## 8\. Adaptación del Protocolo Superfluid a Besu (DECIDIDO — Fase 1, 2026-09-29)

> ✅ \*\*Decisión registrada:\*\* se adopta la \*\*Opción B\*\* (envoltorio mínimo propio `BrltX.sol`
> con semántica CFA simplificada). Confirmada por el director del proyecto en la entrevista de
> Fase 1 (P1). La Opción A queda fuera del alcance de v1. Como compensación del objetivo de
> aprendizaje transformado, el documento técnico incluirá una nota comparativa
> «CFA real vs envoltorio propio» (§21 aprobado).

La red Codecrypto **no es una de las cadenas oficialmente soportadas** por el resolver de
Superfluid (`Resolver`), por lo que el SDK no puede descubrir automáticamente el Host/CFA/Brltx.
Hay dos estrategias viables; deben elegirse antes de la fase de desarrollo:

* **Opción A — Desplegar el framework Superfluid en Besu (sovereign setup).**
Usar el repositorio oficial `superfluid-org/protocol-monorepo` para desplegar Host + CFA +
Resolver + un marco de Super Token propio en la red Codecrypto. Da control total pero añade
complejidad de infraestructura.
* **Opción B — Envoltorio mínimo propio.**
Si el objetivo es puramente didáctico, implementar un `SuperToken.sol` simplificado que replique
la semántica de `upgrade/downgrade` y `createFlow/deleteFlow/getFlow` sobre la red Besu, sin
depender del monorepo oficial. Menos fiel al protocolo real, pero más rápido de poner en marcha.

> \~\~\*\*Acción requerida:\*\* confirmar con el director del proyecto qué opción adoptar\~\~ →
> \*\*Resuelto en Fase 1: Opción B aprobada (2026-09-29).\*\*

## 9\. Riesgos y Consideraciones

1. **Consenso QBFT y block time.** La frecuencia de actualización de UI (cada 5 s) debe ajustarse
al block time real de Besu; conviene medirlo con `cast block-number` en bucle.
2. **Depósito de seguridad del CFA.** En Besu soberano puede configurarse a cero o valor bajo;
documentar su efecto en la lógica de pausa/cierre de flows.
3. **Gestión de claves.** Nunca versionar `PRIVATE\_KEY`; usar `.env` + `.gitignore`. Las claves de
prueba son exclusivas de este entorno educativo.
4. **Disponibilidad del faucet.** El faucet limita a 100 CC por solicitud; para deployments pesados
pueden requerirse varias solicitudes o coordinación con la administración de la red.
5. **Compatibilidad de versiones.** Superfluid SDK 0.9.0 + ethers 5.7.2 + React 19 tienen peer deps
delicadas; validar en la fase de scaffolding del frontend.

## 10\. Ejercicios Propuestos

1. **Básico**: modificar el flow rate para enviar 1000 Brlt/mes en lugar de 2000
2. **Intermedio**: agregar un botón para editar el flow rate de un stream existente
3. **Avanzado**: implementar un sistema de múltiples monedas (Brlt, USD, GBP)
4. **Experto**: crear un smart contract que gestione los flows automáticamente

## 11\. Notas Importantes

* Este proyecto usa la **red Codecrypto (Besu)** gestionada con **Foundry global**; ya no depende de
forks de mainnet ni de claves de Alchemy.
* Las cuentas de desarrollo se financian desde el **faucet público** y usan claves privadas de prueba.
* El streaming consume tokens en tiempo real; asegúrate de tener suficiente balance en Brltx.
* El proyecto es educativo (CodeCrypto Academy); se puede hacer fork, experimentar y proponer mejoras.

\---



