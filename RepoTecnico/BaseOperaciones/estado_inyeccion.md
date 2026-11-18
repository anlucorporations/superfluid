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
- [x] **Ejecución real completada (2026-11-16 01:29 UTC)** — ver resultado abajo.
- [x] Verificación y cierre.

## Resultado de la ejecución (2026-11-16 01:28–01:29 UTC)

| Operación | Resultado | Tx |
|---|---|---|
| Allowlist: #0 y #1 como `admin` activos | ✅ 2 admins | — (Mongo) |
| Empleado demo (wallet #1) borrado | ✅ | — (Mongo) |
| Proyecto `Nomina ANLU` creado | ✅ | — (Mongo) |
| 3 empleados creados (#2..#4, 100 BRLT/30d) | ✅ empleados activos=3 | — (Mongo) |
| Mint 10.000 BRLT → #0 | ✅ saldo 10.009.990 | `0x3a714911…41fc78` |
| Mint 100 BRLT → #1 | ✅ saldo 100 | `0xa2fbeb04…b8648ed` |
| Mint 100 BRLT → #2 | ✅ saldo 100 | `0x49cd87c8…bcf3a6` |
| Mint 100 BRLT → #3 | ✅ saldo 100 | `0xf95a4890…3f3a6477` |
| Mint 100 BRLT → #4 | ✅ saldo 100 | `0x8c014351…ffd19c8` |

Verificación post-inyección: supply on-chain **10.001.040 BRLT** (10M + 10.000 + 4×100) ·
`/api/health` ok (db/rpc/31337) · admins activos=2 · empleados activos=3 · ETH sin
cambios · Anvil compartido sin reinicio (solo 5 tx `mint`).

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

## Reinicio completo + simulación de actividades operativas (2026-11-18)

> Script: `scripts/simular_actividades.py` (respetando la lógica de
> `inyectar_datos_operativos.py`). Autorización del usuario registrada en la
> conversación. Ejecución real 17:34–17:45 UTC.

### Fase A — Reinicio de la BD (Anvil/contratos intactos, regla 8)

1. Respaldo previo de las 11 colecciones → `BaseOperaciones/respaldo_20261118T173426Z/*.json`.
2. Drop de las 11 colecciones de `superfluid_anvil`.
3. `system_config` recreada (chainId 31337, RPC proxy, addresses del despliegue, deployBlock 56395).
4. Reinyección base: allowlist #0/#1 · proyecto "Nomina ANLU" · empleados #2..#4 (100 BRLT/30 d).
5. Mint top-up idempotente (solo si falta para el monto documentado).

⚠️ Incidencia de depuración registrada: una pasada de `--dry-run` con bug
ejecutó el drop (ya corregido: el drop nunca corre en dry-run). El respaldo
previo permitió reconstruir; el estado previo está íntegro en el JSON.

### Fase B — Actividades simuladas (uso real de la plataforma)

| Actividad | Resultado |
|---|---|
| 2 empleados nuevos de reserva #5/#6 (Cuatro: mantenimiento 50/15d · Cinco: proyecto_mvp 80/6d) + mint 100 BRLT c/u | ✅ 5 empleados activos |
| Proyecto "Mantenimiento Infraestructura" (25.000 BRLT) | ✅ |
| Financiación admin (approve BrltX) | ✅ |
| 4 flujos on-chain: #12 emp1 300/30d · #13 emp2 600/6d · #14 emp3 240/15d · #15 emp4 360/6d | ✅ espejados |
| Pausa #13 (acredita devengo on-chain al empleado) → cobro downgrade de emp2 (0,125 BRLT) → reanudación | ✅ CU-16/17 |
| Pausa #12 → cobro de emp1 (0,009259 BRLT) → reanudación | ✅ |
| Terminación #14 (deleteFlow: paga 0,0156 y devuelve remanente) | ✅ |
| 2 flujos programados "proximo" (CU-05, sin ejecutar) | ✅ |

Verificación final: `/api/health` ok · admins=2 · empleados=5 · flujos espejo
coherentes · supply ≈10.010.600 BRLT · cobros acumulados en auditoría dentro
del tope 80%.

### Limpieza de flujos fantasma (corrección registrada)

Los flujos on-chain del era pre-reinicio (#3..#11, incluidos dos de 2.000 BRLT
que seguían activos y devengando — la cadena no se reinició) y los duplicados
de las corridas de depuración fueron TERMINADOS con `deleteFlow` por el admin
(#0), dejando el set canónico: #12/#13/#15 activos y #14 terminado. Las 9
terminaciones quedaron en auditoría con `via: correccion-simulacion`. El BRLT
devengado que esos flujos acreditaron a los empleados (p. ej. 224 BRLT a emp1/emp2)
es realidad de la cadena y conserva su valor en BrltX de sus wallets.

### Bug destapado y corregido

El acumulado del tope 80% (`getDowngradeLimit`) buscaba `actorWallet` exacto en
minúsculas, pero la auditoría lo registra a veces con checksum → se perdían
cobros. Corregido con comparación case-insensitive (desplegado tras esta
simulación).

### Cómo repetir

```bash
export MONGODB_URI=$(gcloud secrets versions access latest --secret=brltv2-mongo-uri --project plataforma-txbarlovento)
python3 scripts/simular_actividades.py --dry-run --leer-secreto   # simulación
python3 scripts/simular_actividades.py --si --leer-secreto --fase reset
python3 scripts/simular_actividades.py --si --leer-secreto --fase actividades --espera 100
```
