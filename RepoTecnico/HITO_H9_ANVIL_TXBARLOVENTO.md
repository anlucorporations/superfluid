# Hito H9 — brltv2 sobre el Anvil de vm-blockchain (plataforma-txbarlovento)

> Estado: ✅ Desplegado y verificado on-chain y en el health. Fecha: 2026-11-12.
> Continúa `HITO_H8_DESPLIEGUE_PLATAFORMA_TXBARLOVENTO.md`. Pendiente: recorrido de
> navegador con wallet (ver §7).

## 1. Objetivo

Redesplegar `brltv2` en GCP apuntando a un Anvil (chain 31337) en lugar de la red Besu
(chain 81234), usando la infraestructura de la cuenta `txbarlovento@gmail.com`
(proyecto `plataforma-txbarlovento`, cuenta de servicio `sa-dsh-dev`).

## 2. Infraestructura usada

| Componente | Recurso | Detalle |
|---|---|---|
| Anvil | VM `vm-blockchain` (europe-west1-b, 10.140.0.4) | proceso `anvil --chain-id 31337 --port 8545 --block-time 2`, sin persistencia |
| Proxy RPC público | Cloud Run `hotel-anvil-proxy` | `https://hotel-anvil-proxy-szrmcf2hja-ew.a.run.app` (chainId 31337) |
| MongoDB | VM `mongo-brltv2` (10.140.0.10) | base nueva `superfluid_anvil`; `superfluid` (Besu) intacta |
| App | Cloud Run `brltv2` | revisión `brltv2-00008-xck`, 100 % tráfico |

El acceso a `vm-blockchain` fue solo de lectura (`pgrep`, `ss`, `eth_getCode`) salvo el
broadcast de despliegue, que se hizo contra el RPC del proxy.

## 3. Cuenta deployer

- Dirección: `0xb4eCE9a93c2d400e4322EfFF9Ae9dA284aD200DF` (cuenta 0 del mnemónico de Anvil).
- Origen de la clave: secreto `blockchain-anvil-mnemonic` (Secret Manager). La clave
  **no se registra** en el repo ni en este documento.
- Saldo: ~9.899 ETH de prueba (suficiente para el despliegue).

## 4. Contratos desplegados (chain 31337)

| Contrato | Dirección | Verificación |
|---|---|---|
| Brlt | `0x8Df5a4207D139ccDb286E1A3Bb51bC1E07569492` | código presente · owner = minter = deployer · supply 10.000.000 BRLT (18 dec.) |
| BrltX | `0x777C3C94271bC8FC3060E7962074D3e0cc88c974` | código presente · `brlt()` apunta a Brlt |

- Script: `sc/script/DeployAll.s.sol` (traspaso de ownership atómico, AC-06).
- Bloque de despliegue: **87174**.
- Registro: `sc/deployments/31337.json`. **Ignorado por git** (`sc/.gitignore`); el de Besu
  (`81234.json`) no se modificó.

Comandos ejecutados (clave pasada por variable de entorno, nunca impresa):

```bash
forge script script/DeployAll.s.sol --rpc-url <RPC_ANVIL> --broadcast
```

## 5. Cambios de código y configuración

| Archivo | Cambio | Motivo |
|---|---|---|
| `web/src/lib/rpc.ts` | `EXPECTED_CHAIN_ID` ahora = `publicEnv.chainId` (antes constante 81234) | la app no podía usar otra cadena sin tocar código |
| `web/gcp/env.yaml` | `NEXT_PUBLIC_*` → Anvil; `MONGODB_DB=superfluid_anvil`; bootstrap = owner | local, gitignored |
| `web/gcp/cloudbuild.yaml` | build args `NEXT_PUBLIC_*` → Anvil | se hornean en la imagen |
| `sc/lib/` | forge-std + OpenZeppelin **v5.1.0** instalados | dependencias no versionadas; versión fijada en H1 |

Tests tras el cambio: typecheck limpio, **43/43** Vitest.

### Configuración persistida (`system_config` en `superfluid_anvil`)

Este registro **tiene prioridad sobre las variables de entorno** para el health y las
validaciones. Por eso se actualizó explícitamente:

```
chainId: 31337 · rpcUrl: <RPC_ANVIL> · brltAddress/brltXAddress: arriba · deployBlock: 87174
```

Se escribió solo después de que `assertExpectedChain` (chain 31337) y `hasContractCode`
(ambos contratos) pasaran contra el Anvil real.

## 6. Verificación

| Comprobación | Resultado |
|---|---|
| `GET /api/health` | `{"status":"ok","db":true,"rpc":true,"chainId":31337}` (200) |
| `cast chain-id` vía proxy | 31337 |
| `cast call totalSupply()` | 10000000000000000000000000 |
| `cast call owner()` | `0xb4eC…00DF` |
| Seed de `superfluid_anvil` | allowlist = owner · `admins_activos=1` |

### Incidencias encontradas y resueltas

1. **Health en 81234 con env en 31337** → causa: `system_config` guardado en Mongo tenía los
   valores de Besu (prioridad sobre el env). Corregido actualizando ese registro.
2. **`EXPECTED_CHAIN_ID` fijado en código** → corregido en `rpc.ts` (ver §5).
3. **Validación fallida al persistir** → causa: el script no tenía `NEXT_PUBLIC_CHAIN_ID`.
   Se ejecutó con la variable definida; la validación pasó.
4. **`forge build` sin dependencias** → `lib/` no está versionado; se instalaron las
   versiones de H1.

## 7. Pendiente: recorrido con navegador y wallet

- Login SIWE admin con la cuenta owner (`0xb4eC…00DF`) en MetaMask conectada a chain 31337.
- Requiere importar la cuenta del mnemónico de Anvil en la wallet del navegador. **No se
  hará con una clave expuesta en el chat**: se debe hacer localmente por el responsable.
- Pasos a recorrer: login → resumen → alta de empleado → alta de flujo → pausa/reanudación →
  terminación, con capturas.

## 8. Riesgos y notas

- **Anvil sin persistencia**: si `vm-blockchain` reinicia, pierde los contratos y las
  direcciones del §4 quedarán sin código. Hay que redesplegar y actualizar `system_config`.
- **Anvil compartido**: `hotel-mcp` usa la misma instancia. Desplegar en ella afecta a ese
  proyecto también.
- **Commit pendiente**: estos cambios (`web/`, `sc/` sin registro ignorado, `RepoTecnico/`)
  aún no están commiteados.

## 9. Recorrido con navegador y wallet (2026-11-12)

Simulación con Playwright y un proveedor EIP-1193 que firma con la cuenta owner. La clave
se obtiene del mnemónico en memoria del proceso; no se escribe en disco ni en el chat.

### Resultado

| Paso | Resultado |
|---|---|
| Login SIWE admin (owner `0xb4eC…00DF`) | ✅ entra a `/admin` (firma, sin transacción) |
| Resumen | ✅ red 31337 conectada, BRLT/BrltX correctos, bloque 87174, MongoDB OK |
| Empleados · Flujos · Proyectos · Sistema · Jobs · Auditoría | ✅ las 6 cargan con su título, sin redirección |
| Alta de empleado de prueba (`nomina`, 10 BRLT / 30 d) | ✅ HTTP 201, estado `activo` |
| Crear flujo on-chain (approve + createFlow + registro) | ⬜ **no completado** (ver §9.3) |
| Pausar / reanudar / terminar | ⬜ no ejecutado |

Capturas: `RepoTecnico/pruebas/H9_anvil/01_login_admin.png` … `08_flujos_antes.png`.

### Incidencias

1. **Rate limit de login** (5 intentos / 15 min por wallet): las ejecuciones fallidas de
   depuración consumieron el cupo. Se limpió el contador `auth_ratelimits` de la wallet
   owner en `superfluid_anvil` **solo tras autorización explícita**. El problema de fondo es
   que cada ejecución de prueba hace varios intentos de login.
2. **Errores de consola benignos**: `401 /api/auth/me` (comprobación inicial de sesión) y
   `404 /ayuda?_rsc=…` (prefetch RSC de un enlace a `/ayuda/`, HTML estático).
3. **Red `networkidle` no alcanzable**: las páginas admin hacen polling (refresco 5 s); se
   usó `waitUntil: load`.

### Estado de datos en `superfluid_anvil`

- Empleado de prueba: `Empleado Prueba Anvil` · `0x9423e32e170E36dD5B33819629fB33bdaAA15cEF`
  (derivado del mnemónico, índice 1; sin fondos, no firmó nada).
- Flujos: 0. Auditoría: login de la owner y alta del empleado registrados.

### 9.3 Pendiente

Crear el flujo on-chain requiere que la wallet owner firme `approve` y `createFlow` en el
Anvil compartido. Se detuvo por el cupo de login, no por un fallo de la app. Para reanudar:

1. Esperar al reinicio del contador de login (15 min) o limpiarlo de nuevo con autorización.
2. Ejecutar **una sola** sesión de navegador: login → `/admin/flujos` → crear flujo (empleado
   de prueba, 10 BRLT, 30 días) → verificar `Flujo #N` y el registro en la lista.
3. Después: pausar, reanudar y terminar, con captura de cada paso.

## 10. Reanudación del flujo on-chain (2026-11-12, 12:11 hora local)

### Resultado

| Paso | Resultado |
|---|---|
| Crear flujo (approve + createFlow + registro en la API) | ✅ **Flujo #1** · 10 BRLT / 30 días · activo |
| Verificación on-chain | ✅ tupla con importe 1e19 wei; saldo del owner 10.000.000 → 9.999.990 BRLT; allowance consumido |
| Verificación en la app | ✅ `/admin/flujos` lista "1 activo" |
| Transacciones | `0xf8a2…ec401` (approve, bloque 114562) · `0x9cd5…a293` (createFlow, bloque 114564) — ambas status 1 |
| Pausar · reanudar · terminar | ⬜ **no ejecutado** (ver §10.2) |

### 10.1 Incidencia: rate limit de login

El intento de login para accionar el flujo falló con `429 rate_limit`. El contador de la
wallet owner se volvió a llenar por los intentos de depuración del script. La sesión
admin existente sigue vigente hasta las 17:52 UTC, pero su token no se guarda en claro, así
que no se puede reutilizar. Se decidió **no volver a limpiar el contador** (ya se hizo una
vez con autorización). Reinicio: ~12 min tras el último intento.

Causa de fondo, sin resolver: cada script de prueba hace varios intentos de login. Antes de
seguir conviene reducirlo a un único login por sesión, o aumentar el cupo para la wallet de
pruebas, decisión que queda para el responsable del proyecto.

### 10.2 Pendiente

1. Esperar al reinicio del contador de login.
2. Una sola sesión: login → `/admin/flujos` → pausar flujo #1 → reanudar → terminar, con
   verificación on-chain y en la app tras cada acción.
3. Nota: el flujo #1 sigue **activo** en el Anvil; no se pausó ni terminó.

### 10.3 Estado de datos

- Flujo #1 activo (10 BRLT, 30 días) hacia `Empleado Prueba Anvil`.
- El Anvil no tiene persistencia: si reinicia, el flujo y los contratos se pierden.
