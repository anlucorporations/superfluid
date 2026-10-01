# Tarea
 Con este fichero y despues de ver los videos, realiza el proyecto completo usando modelos de IA.

# Proyecto Superfluid EUR Streaming

## Definicion del Proyecto

Este proyecto es una aplicacion completa de streaming de dinero en tiempo real utilizando el protocolo Superfluid. Permite enviar flujos continuos de una stablecoin EUR (Euro) a multiples destinatarios a una tasa constante de 2000 EUR/mes.

## Objetivos de Aprendizaje

Al completar este proyecto, los estudiantes aprenderan:

1. **Smart Contracts con Solidity**
   - Crear tokens ERC20 personalizados
   - Implementar funciones de mint, burn y transferencias
   - Usar OpenZeppelin para contratos seguros
   - Trabajar con Foundry para testing y deployment

2. **Protocolo Superfluid**
   - Entender el concepto de "Super Tokens" (tokens envueltos)
   - Crear y gestionar flows (flujos de dinero continuo)
   - Implementar Constant Flow Agreement (CFA)
   - Calcular flow rates en wei/segundo

3. **Desarrollo Web3**
   - Integrar ethers.js para interactuar con blockchain
   - Usar Superfluid SDK para crear streams
   - Conectar frontend con smart contracts
   - Gestionar transacciones y firmas de wallet

4. **Next.js 15 y React 19**
   - Construir interfaces modernas con App Router
   - Gestionar estado con hooks (useState, useEffect)
   - Actualizar datos en tiempo real
   - Implementar formularios y validaciones

5. **Testing Local con Anvil**
   - Usar Anvil para fork de mainnet
   - Desplegar contratos en entorno local
   - Testear con cuentas de desarrollo
   - Debuggear transacciones

## Arquitectura del Proyecto

### Smart Contracts (sc/)

```
sc/
├── src/
│   └── Euro.sol              # Token ERC20 personalizado
├── script/
│   ├── DeployEuro.s.sol      # Script para desplegar EUR
│   └── DeployAll.s.sol       # Script completo de deployment
└── test/
    └── Euro.t.sol            # Tests del token
```

**Euro.sol**: Contrato ERC20 que implementa:
- Funciones estandar: `transfer`, `approve`, `balanceOf`
- Funciones de owner: `mint`, `burn`
- Supply inicial de 10,000,000 EUR

### Web Application (web/)

```
web/
├── src/
│   ├── app/                  # Next.js App Router
│   ├── components/
│   │   └── Dashboard.tsx     # Componente principal
│   ├── lib/
│   │   └── superfluid.ts     # Integracion Superfluid
│   └── config/
│       └── web3.ts           # Configuracion de contratos
└── package.json
```

**Dashboard.tsx**: Interfaz que permite:
- Conectar wallet automaticamente (Anvil)
- Ver balances de EUR y EURx
- Hacer upgrade EUR a EURx (wrap)
- Hacer downgrade EURx a EUR (unwrap)
- Agregar destinatarios para streaming
- Pausar y reanudar flows
- Ver balances en tiempo real (actualizacion cada 5s)

**superfluid.ts**: Funciones principales:
- `upgradeToEuroX`: Convierte EUR a Super Token
- `downgradeFromEuroX`: Convierte Super Token a EUR
- `createFlow`: Crea un stream de 2000 EUR/mes
- `deleteFlow`: Pausa un stream
- `getFlow`: Obtiene informacion de un flow
- `getRealtimeBalance`: Obtiene balance actualizado

## Conceptos Clave

### Super Tokens

Los Super Tokens son versiones "envueltas" de tokens ERC20 normales que tienen capacidades adicionales de streaming. Para hacer streaming, primero debes:
1. Tener tokens EUR (ERC20 normal)
2. Hacer "upgrade" a EURx (Super Token)
3. Ahora puedes crear flows con EURx

### Flow Rate

El flow rate es la cantidad de tokens por segundo que se envian. Para 2000 EUR/mes:

```javascript
2000 EUR/mes = 2000 EUR / (30 dias x 24 horas x 60 min x 60 seg)
            = 2000 / 2,592,000 segundos
            = 0.000771604938271604 EUR/segundo
            = 771604938271604 wei/segundo
```

### Constant Flow Agreement (CFA)

El CFA es el modulo de Superfluid que gestiona los streams. Cuando creas un flow:
- Se bloquea un deposito de seguridad
- Los tokens fluyen automaticamente cada segundo
- El balance del receptor aumenta en tiempo real
- No necesitas hacer transacciones continuas

## Tecnologias Utilizadas

### Blockchain

- **Solidity 0.8.28**: Lenguaje para smart contracts
- **Foundry**: Framework de desarrollo (forge, anvil, cast)
- **OpenZeppelin 5.1.0**: Libreria de contratos seguros
- **Anvil**: Node local de Ethereum (fork de mainnet)

### Frontend

- **Next.js 15.5.4**: Framework React con App Router
- **React 19.1.0**: Libreria UI
- **TypeScript**: Tipado estatico
- **Tailwind CSS 3.4**: Framework CSS utility-first
- **ethers.js 5.7.2**: Libreria Web3
- **Superfluid SDK 0.9.0**: SDK del protocolo

## Flujo de Trabajo

1. **Levantar Anvil con fork de mainnet**
   ```bash
   anvil --chain-id 31337 --fork-url https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
   ```

2. **Desplegar contratos**
   ```bash
   cd sc && forge script script/DeployAll.s.sol:DeployAllScript \
     --rpc-url http://127.0.0.1:8545 \
     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
     --broadcast
   ```

3. **Configurar addresses en web/src/config/web3.ts**
   - Copiar address del contrato EUR desplegado
   - Copiar address del Super Token EURx creado

4. **Iniciar aplicacion web**
   ```bash
   cd web && npm run dev
   ```

5. **Usar la aplicacion**
   - Conectar wallet (automatico)
   - Hacer upgrade de EUR a EURx
   - Agregar destinatario (address Ethereum)
   - El flow se crea automaticamente a 2000 EUR/mes
   - Ver balance aumentar en tiempo real
   - Pausar/Reanudar cuando quieras

## Casos de Uso

Este proyecto simula casos de uso reales como:
- **Nominas**: Pagar salarios en tiempo real
- **Suscripciones**: Pagos continuos por servicios
- **Vesting**: Liberacion gradual de tokens
- **Rentas**: Pagos de alquiler automaticos
- **Donaciones**: Contribuciones continuas

## Ejercicios Propuestos

1. **Basico**: Modificar el flow rate para enviar 1000 EUR/mes en lugar de 2000
2. **Intermedio**: Agregar un boton para editar el flow rate de un stream existente
3. **Avanzado**: Implementar un sistema de multiples monedas (EUR, USD, GBP)
4. **Experto**: Crear un smart contract que gestione los flows automaticamente

## Recursos Adicionales

- [Documentacion Superfluid](https://docs.superfluid.finance/)
- [Foundry Book](https://book.getfoundry.sh/)
- [Next.js Docs](https://nextjs.org/docs)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Ethers.js Documentation](https://docs.ethers.org/v5/)

## Notas Importantes

- Este proyecto usa un fork de mainnet en Anvil, por lo que tiene acceso a todos los contratos de Superfluid desplegados en mainnet
- La cuenta de desarrollo tiene una private key publica (solo para testing local)
- El streaming consume tokens en tiempo real, asegurate de tener suficiente balance en EURx

## Contribuciones

Este proyecto es educativo. Los estudiantes pueden:
- Hacer fork del repositorio
- Experimentar con diferentes configuraciones
- Proponer mejoras via Pull Request
- Compartir sus implementaciones

---

**Desarrollado con fines educativos para CodeCrypto Academy**
