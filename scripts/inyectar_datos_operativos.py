#!/usr/bin/env python3
"""Inyección controlada de datos operativos — Superfluid Brlt v2 (brltv2).

=============================================================================
QUÉ HACE (plan aprobado 2026-11-15 · ver RepoTecnico/BaseOperaciones/)
    1. Allowlist Mongo: cuenta #0 = admin (Super Admin, owner on-chain) y
       cuenta #1 = admin (Administrador de sistema).
    2. Borra la ficha del empleado demo (wallet #1) y crea 3 empleados nuevos
       para las cuentas #2..#4 con el proyecto de nómina.
    3. Mint de BRLT con la wallet owner (cuenta #0, minter):
         · #0: 10.000 BRLT · #1..#4: 100 BRLT cada una.
    4. ETH: NO se toca (todas conservan el saldo inicial del Anvil).
    5. NO reinicia el Anvil compartido ni redeplega contratos.

SEGURIDAD
    · La URI de Mongo se lee de MONGODB_URI (nunca se escribe ni se imprime).
    · El mnemónico se lee de ANVIL_MNEMONIC (o del secreto de Secret Manager
      con --leer-secreto); nunca se imprime ni se registra.
    · Pide confirmación interactiva antes de escribir (salvo --si).
    · --dry-run simula todo sin escribir.
    · Registra cada acción en RepoTecnico/BaseOperaciones/inyeccion_datos.log
      (sin secretos: wallets, montos y estados, nunca claves ni URIs).
    · NUNCA se ejecuta sola: hay que invocarla explícitamente.

USO
    export MONGODB_URI='mongodb://.../superfluid_anvil?authSource=admin&directConnection=true'
    export ANVIL_RPC_URL='https://hotel-anvil-proxy-....a.run.app'   # opcional
    export ANVIL_MNEMONIC='...'                                      # o --leer-secreto

    python3 scripts/inyectar_datos_operativos.py --dry-run   # simulación
    python3 scripts/inyectar_datos_operativos.py             # con confirmación
    python3 scripts/inyectar_datos_operativos.py --si        # sin confirmación
=============================================================================
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
LOG = RAIZ / "RepoTecnico" / "BaseOperaciones" / "inyeccion_datos.log"

RPC_DEFAULT = "https://hotel-anvil-proxy-szrmcf2hja-ew.a.run.app"
BRLT = "0x020a699264d9f9caed6f0b65c1c25F000E7d6b56"
MONGO_DB = "superfluid_anvil"

# Cuentas derivadas del mnemónico del Anvil (RepoTecnico/BaseOperaciones/cuentas_anvil.md)
CUENTA_OWNER = 0          # Super Admin · owner/minter on-chain
CUENTA_SISTEMA = 1        # Administrador de sistema
CUENTAS_EMPLEADOS = [2, 3, 4]

MONTO_ADMIN_BRLT = "10000"
MONTO_EMPLEADO_BRLT = "100"
PROYECTO_NOMBRE = "Nomina ANLU"


def registrar(mensaje: str) -> None:
    linea = f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {mensaje}"
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as fh:
        fh.write(linea + "\n")
    print(linea)


def mnemonic_obtenido(leer_secreto: bool) -> str:
    """Obtiene el mnemónico del entorno o del secreto (nunca lo imprime)."""
    import os

    m = os.environ.get("ANVIL_MNEMONIC", "").strip()
    if m:
        return m
    if not leer_secreto:
        registrar("ERROR: define ANVIL_MNEMONIC o usa --leer-secreto (gcloud).")
        sys.exit(2)
    proyecto = os.environ.get("GCP_PROJECT", "plataforma-txbarlovento")
    out = subprocess.run(
        ["gcloud", "secrets", "versions", "access", "latest",
         "--secret=blockchain-anvil-mnemonic", f"--project={proyecto}"],
        capture_output=True, text=True, check=True,
    ).stdout
    for linea in out.splitlines():
        if linea.startswith("ANVIL_MNEMONIC="):
            return linea.split("=", 1)[1].strip()
    registrar("ERROR: el secreto no contiene ANVIL_MNEMONIC.")
    sys.exit(2)


def cuenta(mnemonic: str, indice: int) -> str:
    pk = subprocess.run(
        ["cast", "wallet", "private-key", mnemonic, str(indice)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return subprocess.run(
        ["cast", "wallet", "address", pk],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def cast_rpc(rpc: str, args: list[str]) -> str:
    return subprocess.run(
        ["cast", *args, "--rpc-url", rpc], capture_output=True, text=True, check=True,
    ).stdout.strip()


def wei(brlt: str) -> str:
    return str(int(brlt) * 10 ** 18)


def entero_cast(valor: str) -> int:
    """cast call devuelve '9999990000... [9.999e24]'; nos quedamos con el número."""
    return int(valor.split()[0])


def main() -> int:
    p = argparse.ArgumentParser(description="Inyecta datos operativos de brltv2.")
    p.add_argument("--dry-run", action="store_true", help="Simula sin escribir")
    p.add_argument("--si", action="store_true", help="Omite la confirmación interactiva")
    p.add_argument("--leer-secreto", action="store_true",
                   help="Lee ANVIL_MNEMONIC desde Secret Manager con gcloud")
    p.add_argument("--rpc", default=None, help="RPC del Anvil (por defecto el proxy)")
    args = p.parse_args()

    import os

    rpc = args.rpc or os.environ.get("ANVIL_RPC_URL", RPC_DEFAULT)
    uri_mongo = os.environ.get("MONGODB_URI", "")
    if not uri_mongo and not args.dry_run:
        registrar("ERROR: define MONGODB_URI (no se acepta por argumento).")
        return 2

    registrar("=" * 78)
    registrar(f"INYECCIÓN DE DATOS OPERATIVOS brltv2 · dry_run={args.dry_run} · rpc={rpc}")

    # --- 0. Estado on-chain (solo lectura) ---
    mnemonic = mnemonic_obtenido(args.leer_secreto)
    c0 = cuenta(mnemonic, CUENTA_OWNER)
    c1 = cuenta(mnemonic, CUENTA_SISTEMA)
    empleados = [cuenta(mnemonic, i) for i in CUENTAS_EMPLEADOS]
    registrar(f"owner/SA={c0} · sistAdm={c1} · empleados={','.join(e[:10] for e in empleados)}…")

    owner_onchain = cast_rpc(rpc, ["call", BRLT, "owner()(address)"])
    minter_onchain = cast_rpc(rpc, ["call", BRLT, "minter()(address)"])
    registrar(f"on-chain owner={owner_onchain} minter={minter_onchain}")
    if owner_onchain.lower() != c0.lower() or minter_onchain.lower() != c0.lower():
        registrar("ERROR: la cuenta #0 no es owner/minter; abortando para no romper el estado.")
        return 3

    # --- Confirmación ---
    resumen = (
        f"Plan: allowlist(#0 admin, #1 admin) · borrar empleado demo (#1) · "
        f"3 empleados (#2..#4) + proyecto '{PROYECTO_NOMBRE}' · "
        f"mint {MONTO_ADMIN_BRLT} BRLT→#0 y {MONTO_EMPLEADO_BRLT} BRLT→#1..#4 · ETH intacto"
    )
    registrar(resumen)
    if not args.si and not args.dry_run:
        try:
            respuesta = input("¿Ejecutar la inyección? (s/n): ").strip().lower()
        except EOFError:
            respuesta = ""
        if respuesta != "s":
            registrar("Cancelado por el usuario.")
            return 0

    # --- 1-2. Mongo ---
    from pymongo import MongoClient

    cliente = MongoClient(uri_mongo, appName="inyeccion-operativa")
    db = cliente[MONGO_DB]

    if args.dry_run:
        reg_la = db.admin_allowlist.find_one({"walletLower": c0.lower()}, {"_id": 1})
        reg_sis = db.admin_allowlist.find_one({"walletLower": c1.lower()}, {"_id": 1})
        demo = db.employees.find_one({"walletLower": c1.lower()}, {"nombre": 1})
        registrar(f"SIMULACIÓN Mongo · allowlist #0={'existe' if reg_la else 'nuevo'} · "
                  f"#1={'existe' if reg_sis else 'nuevo'} · "
                  f"empleado demo={'presente' if demo else 'ausente'}")
    else:
        ahora = datetime.now(timezone.utc)
        for wallet in (c0, c1):
            db.admin_allowlist.update_one(
                {"walletLower": wallet.lower()},
                {"$set": {"wallet": wallet, "rol": "admin", "estado": "activo",
                          "updatedAt": ahora},
                 "$setOnInsert": {"creadoPor": "inyeccion-operativa",
                                  "createdAt": ahora}},
                upsert=True,
            )
        registrar(f"Allowlist actualizada: {c0[:10]}… y {c1[:10]}… como admin")

        demo = db.employees.find_one({"walletLower": c1.lower()}, {"_id": 1, "nombre": 1})
        if demo:
            db.employees.delete_one({"_id": demo["_id"]})
            registrar(f"Empleado demo eliminado ({demo.get('nombre')}, wallet #1)")
        else:
            registrar("Empleado demo ya no existe (ok)")

        proyecto = db.projects.find_one({"nombre": PROYECTO_NOMBRE})
        if not proyecto:
            r = db.projects.insert_one({
                "nombre": PROYECTO_NOMBRE,
                "descripcion": "Nómina mensual de la empresa (inyección operativa)",
                "presupuesto": wei("100000"), "estado": "activo",
                "createdAt": ahora, "updatedAt": ahora,
            })
            proyecto = db.projects.find_one({"_id": r.inserted_id})
            registrar(f"Proyecto creado: {PROYECTO_NOMBRE}")
        nombres = ["Empleado Uno ANLU", "Empleado Dos ANLU", "Empleado Tres ANLU"]
        for nombre, wallet in zip(nombres, empleados):
            db.employees.update_one(
                {"walletLower": wallet.lower()},
                {"$set": {"nombre": nombre, "wallet": wallet,
                          "proyectoId": proyecto["_id"], "concepto": "nomina",
                          "montoPeriodo": wei(MONTO_EMPLEADO_BRLT), "periodo": 30,
                          "estado": "activo",
                          "consentimiento": {"aceptado": True, "fecha": ahora},
                          "borroSolicitado": False, "borroSolicitadoAt": None,
                          "datosPersonales": {}, "deactivatedAt": None,
                          "updatedAt": ahora},
                 "$setOnInsert": {"createdAt": ahora}},
                upsert=True,
            )
        registrar("3 empleados creados/actualizados (#2..#4) con nómina de 100 BRLT/30d")

    # --- 3. Mint de BRLT (owner = cuenta #0) ---
    destinos = [(c0, MONTO_ADMIN_BRLT)] + [(w, MONTO_EMPLEADO_BRLT) for w in [c1, *empleados]]
    pk_owner = subprocess.run(
        ["cast", "wallet", "private-key", mnemonic, str(CUENTA_OWNER)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    for destino, monto in destinos:
        saldo_antes = cast_rpc(rpc, ["call", BRLT, "balanceOf(address)(uint256)", destino])
        if args.dry_run:
            registrar(f"SIMULACIÓN mint {monto} BRLT → {destino[:10]}… (saldo antes: "
                      f"{entero_cast(saldo_antes) // 10**18} BRLT)")
            continue
        tx = subprocess.run(
            ["cast", "send", BRLT, "mint(address,uint256)", destino, wei(monto),
             "--private-key", pk_owner, "--rpc-url", rpc, "--json"],
            capture_output=True, text=True, check=True,
        ).stdout
        import json

        hash_tx = json.loads(tx.splitlines()[-1])["transactionHash"]
        saldo_nuevo = cast_rpc(rpc, ["call", BRLT, "balanceOf(address)(uint256)", destino])
        registrar(f"mint {monto} BRLT → {destino[:10]}… tx={hash_tx} "
                  f"saldo={entero_cast(saldo_nuevo) // 10**18} BRLT")

    # --- 4. Verificación ---
    for destino, _ in destinos:
        saldo = entero_cast(cast_rpc(rpc, ["call", BRLT, "balanceOf(address)(uint256)", destino]))
        registrar(f"VERIFICADO saldo {destino[:10]}… = {saldo // 10**18} BRLT")
    if not args.dry_run:
        n_adm = db.admin_allowlist.count_documents({"estado": "activo"})
        n_emp = db.employees.count_documents({"estado": "activo"})
        registrar(f"VERIFICADO Mongo: admins activos={n_adm} · empleados activos={n_emp}")
    cliente.close()
    registrar("Inyección completada. ETH sin cambios · Anvil compartido intacto.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
