# Estado de la inyección de datos operativos — brltv2 (Anvil compartido)

> Iniciado 2026-11-15. Proyecto: superfluid · base Mongo `superfluid_anvil`
> (10.140.0.2, compartida) · Anvil de `vm-blockchain` vía proxy, chainId 31337.

## Restricciones del responsable (2026-11-15)

1. Cuenta #0 del Anvil = owner del despliegue **y** Super Admin (todas las funciones).
2. Cuenta #1 = Administrador de sistema.
3. Cuentas #2..#4 = empleados de la empresa.
4. Ingresar todos los datos de usuario necesarios para que las cuentas funcionen
   (allowlist, fichas de empleado/proyecto, config de sistema).
5. Saldo del admin: **10.000 BRLT** (mint desde el owner/minter).
6. Saldo de cada empleado: **100 BRLT**.
7. ETH: conservar el saldo inicial del despliegue del Anvil (sin faucet).
8. **No reiniciar el Anvil global/compartido** ni redeplegar contratos.

## Plan aprobado (pendiente de confirmación)

| Paso | Operación | Cuentas | Efecto |
|---|---|---|---|
| 1 | Verificar owner/minter on-chain y cuentas derivadas | — | solo lectura |
| 2 | Allowlist: upsert #0 (super_admin) y #1 (sistema) | Mongo `admin_allowlist` | 2 admins |
| 3 | Fichas de empleado para #2/#3/#4 + proyecto de nómina | Mongo `employees`, `projects` | 3 empleados |
| 4 | Reasignar ficha demo: wallet #1 deja de ser empleado | Mongo `employees` | coherencia |
| 5 | Mint 10.000 BRLT a #0 (admin) y 100 BRLT a cada empleado | Brlt `mint` (owner) | saldos |
| 6 | Verificación: balances por `cast`, salud `/api/health` | — | evidencia |

## Avance

- [x] Paso 3: cuentas consultadas (`cuentas_anvil.md`).
- [x] Paso 5: plan aprobado (saldos: 10.000 BRLT a #0 y 100 BRLT a #1..#4; demo borrado, 3 empleados nuevos).
- [x] Paso 6: script `scripts/inyectar_datos_operativos.py` generado y validado con `--dry-run` (2026-11-16).
- [ ] Ejecución del script (manual, con confirmación interactiva) — **pendiente del responsable**.
- [ ] Verificación y cierre.

## Cómo ejecutar el script (manual)

```bash
cd /home/lucci/workspace/superfluid

# 1. URI de Mongo (secreto v2, base superfluid_anvil) — nunca se escribe en el repo
export MONGODB_URI=$(gcloud secrets versions access latest \
  --secret=brltv2-mongo-uri --project plataforma-txbarlovento)

# 2. RPC opcional (por defecto usa el proxy hotel-anvil-proxy)

# 3. Simulación (no escribe nada, no pide confirmación)
python3 -W ignore scripts/inyectar_datos_operativos.py --dry-run --leer-secreto

# 4. Ejecución real (pide confirmación s/n; mint firmado por la cuenta #0)
python3 -W ignore scripts/inyectar_datos_operativos.py --leer-secreto

# Alternativa sin gcloud: export ANVIL_MNEMONIC='...' y omitir --leer-secreto
```

Log de cada ejecución: `RepoTecnico/BaseOperaciones/inyeccion_datos.log`
(nunca registra mnemónico, claves ni URI). Requisitos: `cast` (Foundry) y `pymongo`.

## Estado sobre el que operará

| Dato | Valor |
|---|---|
| Owner/minter on-chain | `0xb4eCE9a9…00DF` (cuenta #0, ya es owner — no se transfiere nada) |
| Saldo BRLT actual del owner | 9.999.990 BRLT (tras mint quedará 10.009.990) |
| Saldos BRLT de #1..#4 | 0 → 100 cada una |
| Empleado demo | `Empleado Prueba Anvil` (wallet #1) — se borra; el flujo #1 on-chain queda huérfano de ficha |
| ETH | sin cambios (todas ≈10.000 ETH del despliegue; #0 gastó ~100 en gas) |
| Anvil compartido | **no se reinicia**; solo transacciones `mint` nuevas |
