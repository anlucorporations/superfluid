# Hito H2 — Despliegue gobernado en Besu 81234

> **Estado: ✅ Cerrado (2026-11-04).** `Brlt` y `BrltX` desplegados en la red Besu
> Codecrypto (chainId 81234), con ownership y `minter` en la wallet admin, supply inicial
> de 10.000.000 BRLT, verificación independiente y smoke test real crear → terminar flujo.

## Resultado del despliegue

| Dato | Valor |
|---|---|
| Red | Besu Codecrypto (chainId **81234**) |
| RPC | `https://besu.alumnos.codecrypto.academy` |
| **Brlt** | `0x750508AD02404a30dF030466FBb3a29D9EE0482F` |
| **BrltX** | `0xCE5E017599073f60b3518Cf2f86fFdd49bc6e52F` |
| Owner de `Brlt` y `BrltX` | `0x347789cf559a68262e4A444bc251AF8d0bE07EA9` |
| `minter` de `Brlt` | `0x347789cf559a68262e4A444bc251AF8d0bE07EA9` |
| Supply inicial | `10000000000000000000000000` (10.000.000 BRLT, 18 decimales) |
| Bloque del deploy | **6412104** |
| Archivo de registro | `sc/deployments/81234.json` |

La wallet admin custodió el despliegue completo: `DeployAll` despliega, propone el
ownership (`Ownable2Step`) y lo acepta en la misma sesión, reasigna el `minter` y aborta si
`owner`/`minter` no acaban en la dirección esperada (AC-06).

## Transacciones

### Despliegue (`DeployAll.s.sol`, bloque 6412104)

| # | Tipo | Contrato | Tx hash | Gas |
|---|---|---|---|---|
| 1 | CREATE | Brlt | `0x5e89d729150e633f7344d6e5eb272d3481fcee058f3195b1b9fa6d64ecca7e4e` | 861.191 |
| 2 | CREATE | BrltX | `0x119467cbf6910be38cc8d407b58180e8bc3e7149471943ae662ba189046ea6d8` | 2.853.805 |
| 3 | CALL | BrltX — propuesta de ownership | `0xc652c9887134024c240e616852992297af1a1f44761cfe99b9424df4dfa520c8` | 47.855 |
| 4 | CALL | Brlt — propuesta de ownership | `0x4da4232c117a2af97198858c28af8d46c10940e5ac1286d12df744cfaa468a7b` | 47.827 |
| 5 | CALL | BrltX — `acceptOwnership` | `0x23373679a7e4885ef1bdcdb771cafb7a2ff4da6f3439b27a10d76e2670987f17` | 25.513 |
| 6 | CALL | Brlt — `acceptOwnership` | `0x9fa9ac242845b78c42d4cd78277f8299ff1da27ccba24c059fa1694f6557e997` | 25.513 |
| 7 | CALL | Brlt — `setMinter(admin)` | `0x4d6aead8082ac67390f3a9b6f645fe484560a17d2adbb6f9cc4b9203e25d3f11` | 27.833 |

**Total:** 7 transacciones, 3.889.537 gas; a 1.000 wei/gas = 3.889.537.000 wei
(≈ 0,0000000039 CC).

### Smoke test (`Smoke.s.sol`, bloque 6412117)

| # | Acción | Tx hash | Gas |
|---|---|---|---|
| 1 | Aprobar BrltX | `0x4770c2e7efa00d448a8764f2ce62dc572f4054ede947cbc061dd4d5e24483c16` | 46.411 |
| 2 | `wrapAndCreateFlow` (10 BRLT / 6 días) | `0xf28fc447132dfb6fd282e2dcf76371167027596ca062d4bfc7a0a974279a3fda` | 355.396 |
| 3 | `deleteFlow` + devolución | `0xb2004c4987ad530546d746d52462aa71be541213fa7c33459f61030005c31120` | 60.995 |

**Total:** 3 transacciones, 462.802 gas (≈ 0,00000000046 CC).

### Financiación

La wallet admin se financió con el faucet de Codecrypto mediante proof-of-work SHA-256
(dificultad 4):

| Dato | Valor |
|---|---|
| Tx del faucet | `0xd2f55ecd9e1ac83cc1149993df29a56cec755f86ddd020e4b0262da7175fc11b` |
| Bloque | 6412090 |
| Importe | 100 CC |
| Saldo tras deploy + smoke | 99,999999995647661 CC |

## Verificación (`CheckDeployment.s.sol`)

```text
=== Verificacion de despliegue ===
Chain id:        81234
BRLT:            0x750508AD02404a30dF030466FBb3a29D9EE0482F
BrltX:           0xCE5E017599073f60b3518Cf2f86fFdd49bc6e52F
Owner/minter:    0x347789cf559a68262e4A444bc251AF8d0bE07EA9
Supply BRLT:     10000000000000000000000000
Flujos creados:  0
Escrow BrltX:    0
Respaldo BRLT:   0
```

Comprobaciones realizadas:

- `owner()` de ambos contratos = wallet admin; `minter()` de BRLT = wallet admin.
- `totalSupply()` = 10.000.000 BRLT y todo el supply en la wallet admin.
- `BrltX` sin flujos y sin escrow; `balanceOf(BrltX)` = 0 (respaldo 1:1 intacto).
- `eth_getCode` devuelve bytecode en ambas direcciones.

## Smoke test real

```text
=== Smoke test OK ===
Flow id:       1
Receptor:      0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
Depositado:    10000000000000000000
Devengado:     0
Devuelto:      10000000000000000000
Escrow final:  0
```

Flujo de 10 BRLT durante 6 días creado con `wrapAndCreateFlow`, consultado y terminado con
`deleteFlow`; la devolución coincide exactamente con el depósito y el escrow queda a cero
(invariante de respaldo 1:1 respetada en la red real).

## Scripts y configuración

| Archivo | Uso |
|---|---|
| `sc/script/DeployAll.s.sol` | Despliegue gobernado + aceptación de ownership + minter + JSON. |
| `sc/script/DeployBrlt.s.sol` | Despliegue aislado de BRLT (pruebas). |
| `sc/script/CheckDeployment.s.sol` | Verificación de owner, minter, supply, escrow y flujos. |
| `sc/script/Smoke.s.sol` | Crear y terminar un flujo real; comprueba devolución y escrow. |
| `sc/deployments/81234.json` | Addresses, chainId y owner del despliegue real (versionado). |
| `sc/.env` | Clave admin, RPC, addresses y bloque de deploy (ignorado por git). |

Comando de despliegue:

```bash
cd sc
forge script script/DeployAll.s.sol \
  --rpc-url https://besu.alumnos.codecrypto.academy \
  --legacy --with-gas-price 1000 --broadcast
```

## Registro en la aplicación

Las addresses quedan además en `system_config` de MongoDB para que el panel las use sin
re-desplegar (RT-07 / CU-11):

| Campo | Valor |
|---|---|
| `brltAddress` | `0x750508AD02404a30dF030466FBb3a29D9EE0482F` |
| `brltXAddress` | `0xCE5E017599073f60b3518Cf2f86fFdd49bc6e52F` |
| `deployBlock` | `6412104` |
| `chainId` | `81234` |

Se rellenan con `web/scripts/register-deployment.ts` (o desde «Sistema» en el panel, que
valida `eth_chainId` y `eth_getCode` antes de guardar).

## Riesgos residuales y traspaso

- **Custodia:** la clave de la wallet admin vive en `sc/.env` (ignorado por git). Debe
  moverse a un gestor de contraseñas con copia física antes de producción (AC-13).
- **Gas:** 100 CC cubren de sobra el despliegue y los hitos siguientes; para el responsable
  alterno hay que financiar una segunda wallet.
- **H4:** los flujos de nómina se crean contra estas direcciones; el panel ya puede leerlas
  desde `system_config`.
- **Verificación de código:** Besu de alumnos no expone un explorador tipo Etherscan; la
  verificación se hace con `cast code`/`eth_getCode` y `CheckDeployment`.
