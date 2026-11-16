# Cuentas de Anvil compartido (vm-blockchain · chainId 31337)

> Consulta en vivo 2026-11-15 vía proxy `hotel-anvil-proxy` (bloque 120.246).
> Mnemónico: secreto `blockchain-anvil-mnemonic` (Secret Manager,
> `plataforma-txbarlovento`). **Nunca registrar la frase en este repo.**

| # | Cuenta | ETH | Nonce | Rol actual / propuesto |
|---|---|---|---|---|
| 0 | `0xb4eCE9a93c2d400e4322EfFF9Ae9dA284aD200DF` | 9.899,9994 | 38 | **Owner + minter** de Brlt/BrltX (deploy real). Propuesto: Super Admin (acceso total). |
| 1 | `0x9423e32e170E36dD5B33819629fB33bdaAA15cEF` | 9.999,9999 | 2 | Hoy es la wallet del empleado demo. Propuesto: **Administrador de sistema**. |
| 2 | `0x89Dd06d6f8b0CC425Eff702fE7b026e829AB4eBe` | 10.000 | 0 | Propuesto: empleado de la empresa. |
| 3 | `0xc4d47529Cf91Fab4dF069D2014C9B11065FdFB41` | 10.000 | 0 | Propuesto: empleado de la empresa. |
| 4 | `0xf100d77F47B9ffF6a42C8b69Fe28295100B2C828` | 10.000 | 0 | Propuesto: empleado de la empresa. |

Notas:
- El owner/minter on-chain ya es la cuenta #0, así que **no hace falta transferir
  ownership** ( Ownable2Step ) ni redeplegar contratos.
- La cuenta #1 (hoy empleado demo `Empleado Prueba Anvil`) pasa a Administrador de
  sistema: hay que repuntar su ficha en Mongo (`employees`) a rol admin de sistema y
  mover el demo de empleado a una de las cuentas #2..#4.
- ETH: todas conservan el saldo inicial del Anvil (≈10.000 ETH); **no se requiere
  faucet**. La cuenta #0 gastó ~100 ETH en gas de despliegue y pruebas.
