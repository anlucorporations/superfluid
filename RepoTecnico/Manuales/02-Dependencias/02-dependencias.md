# 02 · Dependencias

## Dependencias de producción

### Contratos
#### Toolchain

- **Foundry 1.7.2-dev** (`forge`, `cast`, `anvil`) — build, tests, fuzz, invariantes,
  despliegue por scripts en `sc/script/*.sol`.

### App web
#### Runtime

| Paquete | Versión fijada | Rol |
|---|---|---|
| `next` | **15.5.29** exact | Framework App Router, `output: standalone`. |
| `react` / `react-dom` | ^19.0.0 | UI del panel y la Suite. |
| `ethers` | **5.7.2** exact | Web3 en cliente (MetaMask) y `Interface` en servidor. |
| `mongodb` | ^6.12.0 | Driver de MongoDB. |
| `siwe` | 2.3.2 | Parseo/verificación de mensajes EIP-4361. |
| `zod` | 3.25.76 exact | Validación de DTOs y entradas. |

#### Notas de CVE (aceptadas, H6/H7)

- `elliptic` (vía ethers 5.x) y `postcss` (empaquetada por Next) sin fix en rama
  compatible; migración a **ethers 6 / Zod 4 / Next 16** planificada tras el cutover.

## Dependencias de desarrollo

### Build y prueba
#### Lista

| Paquete | Uso |
|---|---|
| `vitest` 2.1.8 | Tests unitarios de `web/tests/*`. |
| `tsx` | Ejecución de scripts TS (`seed.ts`, `register-deployment.ts`). |
| `mongodb-memory-server` (binario **7.0.14**) | Mongo efímero en Windows para tests/`dev:mem`. |
| `playwright` 1.55 | Chromium headless para `e2e:ui` y `capturas` (Fase 4/5). |
| `typescript` 5.7.2 / Tailwind 3.4.17 | Tipado estricto y estilos. |

#### Impacto de los cambios recientes (commit aab670e)

- El tope de downgrade del 80% (`web/src/lib/downgrade-limit.ts`) y la validación
  continua de wallet usan **BigInt nativo** y la API EIP-1193 ya presente: **no se
  añadió ninguna dependencia nueva** de producción ni de desarrollo.
- Los tokens de la identidad visual del Portal del Empleado (`empleado.*`) son
  configuración del `tailwind.config.ts` existente, no un paquete nuevo.

#### Comandos disponibles

- Contratos: `forge build`, `forge test`, `forge coverage`, `cast run <tx>`.
- Web: `npm test`, `npm run smoke[:h4|h5|h6]`, `npm run e2e:ui`, `npm run capturas`,
  `npm run verify:standalone`, `npm run seed`, `npm run register:deploy`.

---

*Actualizado 2026-11-17 · commit aab670e*
