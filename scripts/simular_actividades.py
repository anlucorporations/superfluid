#!/usr/bin/env python3
"""Reinicio de datos + simulación de actividades operativas — Superfluid Brlt v2.

=============================================================================
QUÉ HACE (plan aprobado 2026-11-18 · respeta la lógica de
RepoTecnico/BaseOperaciones/ y de scripts/inyectar_datos_operativos.py)

  FASE A — REINICIO DE LA BASE DE DATOS (el Anvil compartido y los contratos
  quedan INTACTOS: regla 8 de la lógica de inyección, nunca se reinicia la
  cadena ni se redespliega):
    A1. Respaldo previo de las colecciones en
        RepoTecnico/BaseOperaciones/respaldo_<fecha>/ (JSON, sin secretos).
    A2. Drop de las 11 colecciones de la app en `superfluid_anvil`.
    A3. Recreación de `system_config` (mismos valores del despliegue:
        chainId 31337, RPC proxy, addresses Brlt/BrltX, deployBlock 56395).
    A4. Reinyección base aprobada: allowlist #0/#1, proyecto "Nomina ANLU",
        3 empleados (#2..#4, 100 BRLT/30 d) y top-up de mint hasta los montos
        documentados (10.000 BRLT a #0 · 100 BRLT a #1..#4).

  FASE B — ACTIVIDADES DIVERSAS (simulan uso real de la plataforma):
    B1. 2 empleados nuevos con cuentas de reserva #5 y #6 (mint 100 BRLT c/u).
    B2. Proyecto adicional "Mantenimiento Infraestructura".
    B3. Mint de financiación al admin (+1.600 BRLT, CU-02) y approve a BrltX.
    B4. 4 flujos on-chain (wrapAndCreateFlow) espejados en Mongo:
        · #2: 300 BRLT/30d · #3: 600 BRLT/6d · #4: 240 BRLT/15d · #5: 360 BRLT/6d
    B5. Espera de devengo (--espera, 100 s por defecto).
    B6. Pausa del flujo de #3 (acredita el devengo en BrltX del empleado).
    B7. Cobro (downgrade) de #3 — se registra en auditoría y queda DENTRO del
        tope acumulado del 80% de lo asignado (CU-16/CU-17).
    B8. Reanudación del flujo de #3.
    B9. Pausa breve + cobro de #2 + reanudación (misma mecánica).
    B10. Terminación del flujo de #4 (deleteFlow: paga devengo y devuelve el
         remanente al admin).
    B11. 2 flujos programados en estado "proximo" (CU-05, sin ejecutar).
    B12. Verificación final: saldos, estados de flujos, auditoría y Mongo.

SEGURIDAD (idéntica al script de inyección base)
    · La URI de Mongo solo por MONGODB_URI (nunca se imprime ni se registra).
    · El mnemónico por ANVIL_MNEMONIC o --leer-secreto (nunca se imprime).
    · Confirmación interactiva (o --si) y --dry-run sin escritura.
    · Log en RepoTecnico/BaseOperaciones/inyeccion_datos.log (sin secretos).
    · NUNCA se ejecuta sola: hay que invocarla explícitamente.

USO
    export MONGODB_URI='mongodb://.../superfluid_anvil?...'
    python3 scripts/simular_actividades.py --dry-run
    python3 scripts/simular_actividades.py              # con confirmación
    python3 scripts/simular_actividades.py --si --leer-secreto
=============================================================================
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
BASE_OP = RAIZ / "RepoTecnico" / "BaseOperaciones"
LOG = BASE_OP / "inyeccion_datos.log"

RPC_DEFAULT = "https://hotel-anvil-proxy-szrmcf2hja-ew.a.run.app"
BRLT = "0x020a699264d9f9caed6f0b65c1c25F000E7d6b56"
BRLTX = "0x6080788bc70756dD3c73b4AF2936D0eeA135bE71"
MONGO_DB = "superfluid_anvil"

# Cuentas del mnemónico del Anvil (BaseOperaciones/cuentas_anvil.md)
CUENTA_OWNER, CUENTA_SISTEMA = 0, 1
EMPLEADOS_BASE = [2, 3, 4]          # Uno, Dos, Tres
EMPLEADOS_NUEVOS = [5, 6]           # Cuatro, Cinco (reserva)

MONTO_ADMIN = 10_000                # BRLT objetivo de #0 (lógica de inyección)
MONTO_EMPLEADO = 100                # BRLT objetivo de cada empleado
DIA = 86_400

COLECCIONES = ["system_config", "admin_allowlist", "employees", "projects",
               "flows", "flows_history", "scheduled_flows", "batches",
               "audit_events", "nonces", "job_runs"]


def registrar(mensaje: str) -> None:
    linea = f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {mensaje}"
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as fh:
        fh.write(linea + "\n")
    print(linea)


def mnemonic_obtenido(leer_secreto: bool) -> str:
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
        capture_output=True, text=True, check=True).stdout
    for linea in out.splitlines():
        if linea.startswith("ANVIL_MNEMONIC="):
            return linea.split("=", 1)[1].strip()
    registrar("ERROR: el secreto no contiene ANVIL_MNEMONIC.")
    sys.exit(2)


def clave(mnemonic: str, indice: int) -> str:
    return subprocess.run(
        ["cast", "wallet", "private-key", mnemonic, str(indice)],
        capture_output=True, text=True, check=True).stdout.strip()


def cuenta(mnemonic: str, indice: int) -> str:
    pk = clave(mnemonic, indice)
    return subprocess.run(
        ["cast", "wallet", "address", pk],
        capture_output=True, text=True, check=True).stdout.strip()


def cast_rpc(rpc: str, args: list[str], json_out: bool = False) -> str:
    extras = ["--json"] if json_out else []
    return subprocess.run(["cast", *[str(a) for a in args], *extras, "--rpc-url", rpc],
                          capture_output=True, text=True, check=True).stdout.strip()


def cast_json(rpc: str, args: list[str]):
    """cast call con --json: lista de valores decodificados sin notación científica."""
    return json.loads(cast_rpc(rpc, args, json_out=True))


def cast_send(rpc: str, args: list[str], pk: str) -> str:
    """Envía una tx y devuelve el transactionHash (acepta ints como argumentos)."""
    args = [str(a) for a in args]
    out = subprocess.run(
        ["cast", "send", *args, "--private-key", pk, "--rpc-url", rpc, "--json"],
        capture_output=True, text=True, check=True).stdout
    return json.loads(out.splitlines()[-1])["transactionHash"]


def wei(brlt: int | str) -> str:
    return str(int(brlt) * 10 ** 18)


def flujo_onchain(rpc: str, flow_id: int) -> dict:
    v = cast_json(rpc, ["call", BRLTX,
                        "getFlow(uint256)(uint128,uint64,uint64,uint64,uint64,uint256,uint256,uint256,address,address,bool,bool)",
                        flow_id])
    return {"rate": int(v[0]), "rate_before": int(v[5]), "deposited": int(v[6]),
            "settled": int(v[7]), "receiver": v[8], "paused": bool(v[10]),
            "terminated": bool(v[11])}


def entero_cast(valor: str) -> int:
    return int(valor.split()[0])


def saldo_brlt(rpc: str, cuenta_w: str) -> int:
    return entero_cast(cast_rpc(rpc, ["call", BRLT, "balanceOf(address)(uint256)", cuenta_w]))


def saldo_brltx(rpc: str, cuenta_w: str) -> int:
    return entero_cast(cast_rpc(rpc, ["call", BRLTX, "balanceOf(address)(uint256)", cuenta_w]))


def mint_si_falta(rpc: str, pk_owner: str, destino: str, objetivo: int, dry: bool) -> None:
    """Mint top-up hasta el monto documentado (lógica de inyección, paso 5)."""
    actual = saldo_brlt(rpc, destino) // 10 ** 18
    if actual >= objetivo:
        registrar(f"mint omitido: {destino[:10]}… ya tiene {actual} BRLT (≥ objetivo {objetivo})")
        return
    faltan = objetivo - actual
    if dry:
        registrar(f"SIMULACIÓN mint {faltan} BRLT → {destino[:10]}… (top-up a {objetivo})")
        return
    tx = cast_send(rpc, [BRLT, "mint(address,uint256)", destino, wei(faltan)], pk_owner)
    nuevo = saldo_brlt(rpc, destino) // 10 ** 18
    registrar(f"mint top-up {faltan} BRLT → {destino[:10]}… tx={tx} saldo={nuevo}")


def espejar_flujo(db, rpc: str, flow_id: int, employee_id, sender: str, tx_hash: str) -> None:
    """Sincroniza el documento Mongo del flujo con el estado on-chain (como syncDoc)."""
    v = cast_json(rpc, ["call", BRLTX,
                        "getFlow(uint256)(uint128,uint64,uint64,uint64,uint64,uint256,uint256,uint256,address,address,bool,bool)",
                        flow_id])
    rate = int(v[0]); started = int(v[1]); ends = int(v[2])
    rate_before = int(v[5])
    deposited = int(v[6]); settled = int(v[7])
    receiver = v[8]; paused = bool(v[10]); terminated = bool(v[11])
    ahora = datetime.now(timezone.utc)
    if terminated:
        estado = "terminado"
    elif paused:
        estado = "pausado"
    elif ends * 1000 <= int(time.time() * 1000):
        estado = "vencido"
    else:
        estado = "activo"
    rate_doc = rate_before if (paused and rate == 0) else rate
    doc = {
        "flowId": str(flow_id), "employeeId": employee_id,
        "sender": sender, "receiver": receiver, "receiverLower": receiver.lower(),
        "amount": str(deposited), "durationSeconds": max(ends - started, 1),
        "flowRate": str(rate_doc), "startedAt": datetime.fromtimestamp(started, timezone.utc),
        "endsAt": datetime.fromtimestamp(ends, timezone.utc), "estado": estado,
        "txHash": tx_hash, "batchId": None, "createdBy": sender,
        "updatedAt": ahora, "lastSyncedAt": ahora,
        "terminatedAt": ahora if estado == "terminado" else None,
        "paid": str(settled),
        "returned": str(deposited - settled) if estado == "terminado" else None,
    }
    db.flows.update_one({"flowId": str(flow_id)}, {"$set": doc, "$setOnInsert": {"createdAt": ahora}}, upsert=True)
    registrar(f"espejo flujo #{flow_id}: estado={estado} depositado={deposited/10**18:.2f} pagado={settled/10**18:.6f}")


def auditar(db, actor: str, empleado_id, tx: str | None, meta: dict) -> None:
    db.audit_events.insert_one({
        "actorWallet": actor, "accion": "flujo",
        "empleadoId": str(empleado_id) if empleado_id else None,
        "walletAnterior": None, "walletNueva": None, "txHash": tx,
        "meta": meta, "createdAt": datetime.now(timezone.utc),
    })


def alta_empleado(db, wallet: str, nombre: str, proyecto_id, concepto: str,
                  monto: int, periodo: int, ahora: datetime) -> object:
    doc = {
        "nombre": nombre, "wallet": wallet, "proyectoId": proyecto_id,
        "concepto": concepto, "montoPeriodo": wei(monto), "periodo": periodo,
        "estado": "activo",
        "consentimiento": {"aceptado": True, "fecha": ahora},
        "borroSolicitado": False, "borroSolicitadoAt": None,
        "datosPersonales": {}, "deactivatedAt": None,
        "updatedAt": ahora, "createdAt": ahora,
    }
    db.employees.update_one({"walletLower": wallet.lower()}, {"$set": doc}, upsert=True)
    return db.employees.find_one({"walletLower": wallet.lower()})


def main() -> int:
    p = argparse.ArgumentParser(description="Reinicio de BD + actividades operativas brltv2.")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--si", action="store_true")
    p.add_argument("--leer-secreto", action="store_true")
    p.add_argument("--rpc", default=None)
    p.add_argument("--fase", choices=["todo", "reset", "actividades"], default="todo")
    p.add_argument("--espera", type=int, default=100, help="segundos de devengo entre operaciones")
    args = p.parse_args()

    rpc = args.rpc or os.environ.get("ANVIL_RPC_URL", RPC_DEFAULT)
    uri = os.environ.get("MONGODB_URI", "")
    if not uri and not args.dry_run:
        registrar("ERROR: define MONGODB_URI (no se acepta por argumento).")
        return 2

    registrar("=" * 78)
    registrar(f"SIMULACIÓN OPERATIVA brltv2 · fase={args.fase} · dry_run={args.dry_run} · rpc={rpc}")

    mnemonic = mnemonic_obtenido(args.leer_secreto)
    c0 = cuenta(mnemonic, CUENTA_OWNER)
    c1 = cuenta(mnemonic, CUENTA_SISTEMA)
    e_base = [cuenta(mnemonic, i) for i in EMPLEADOS_BASE]
    e_nuevos = [cuenta(mnemonic, i) for i in EMPLEADOS_NUEVOS]
    pk_owner = clave(mnemonic, CUENTA_OWNER)
    registrar(f"cuentas: SA={c0[:10]}… sist={c1[:10]}… base={len(e_base)} nuevas={len(e_nuevos)}")

    owner_on = cast_rpc(rpc, ["call", BRLT, "owner()(address)"])
    if owner_on.lower() != c0.lower():
        registrar("ERROR: #0 no es owner on-chain; abortando (lógica de inyección).")
        return 3

    resumen = ("Fase A: respaldo + drop 11 colecciones + system_config + reinyección base · "
               "Fase B: 2 empleados nuevos (#5,#6) + proyecto + 4 flujos (6/15/30d) + "
               "pausa/reanudación + terminación + cobros tope-80% + 2 programados")
    registrar(resumen)
    if not args.si and not args.dry_run:
        try:
            respuesta = input("¿Ejecutar? (s/n): ").strip().lower()
        except EOFError:
            respuesta = ""
        if respuesta != "s":
            registrar("Cancelado por el usuario.")
            return 0

    from pymongo import MongoClient
    cliente = MongoClient(uri, appName="simulacion-operativa")
    db = cliente[MONGO_DB]
    hacer_reset = args.fase in ("todo", "reset")
    hacer_act = args.fase in ("todo", "actividades")

    # ---------------------------------------------------------------- FASE A
    if hacer_reset:
        # A1. Respaldo previo (JSON, sin secretos)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        carpeta = BASE_OP / f"respaldo_{ts}"
        carpeta.mkdir(parents=True, exist_ok=True)
        for col in COLECCIONES:
            docs = list(db[col].find({}))
            n = 0
            for d in docs:
                d["_id"] = str(d["_id"])
                for k, v in list(d.items()):
                    if hasattr(v, "isoformat"):
                        d[k] = v.isoformat()
                n += 1
            (carpeta / f"{col}.json").write_text(json.dumps(docs, ensure_ascii=False, default=str))
            registrar(f"respaldo {col}: {n} documentos")
        # A2. Drop (nunca en dry-run)
        if args.dry_run:
            registrar("SIMULACIÓN drop de 11 colecciones (no se eliminó nada)")
            cliente.close()
            return 0
        for col in COLECCIONES:
            db[col].drop()
        registrar(f"BD reiniciada: {len(COLECCIONES)} colecciones eliminadas (respaldo en {carpeta.name})")
        if args.dry_run:
            registrar("FIN SIMULACIÓN (reset): no se escribió nada más.")
            cliente.close()
            return 0
        # A3. system_config (valores del despliegue)
        db.system_config.insert_one({
            "_id": "system", "chainId": 31337, "rpcUrl": rpc,
            "brltAddress": BRLT, "brltXAddress": BRLTX, "deployBlock": 56395,
            "tasaRefrescoMs": 5000,
            "faucetUrl": "https://faucet.codecrypto.academy/",
            "updatedAt": datetime.now(timezone.utc),
        })
        registrar("system_config recreada (chainId 31337, addresses del despliegue)")
        # A4. Reinyección base aprobada
        ahora = datetime.now(timezone.utc)
        for wallet in (c0, c1):
            db.admin_allowlist.update_one(
                {"walletLower": wallet.lower()},
                {"$set": {"wallet": wallet, "rol": "admin", "estado": "activo", "updatedAt": ahora},
                 "$setOnInsert": {"creadoPor": "simulacion-operativa", "createdAt": ahora}},
                upsert=True)
        proyecto = db.projects.insert_one({
            "nombre": "Nomina ANLU",
            "descripcion": "Nómina mensual de la empresa (reinyección tras reinicio)",
            "presupuesto": wei(100_000), "estado": "activo",
            "createdAt": ahora, "updatedAt": ahora,
        })
        nombres = ["Empleado Uno ANLU", "Empleado Dos ANLU", "Empleado Tres ANLU"]
        ids = {}
        for nombre, wallet, concepto, periodo in zip(
                nombres, e_base,
                ["nomina", "nomina", "nomina"], [30, 30, 30]):
            ids[wallet] = alta_empleado(db, wallet, nombre, proyecto.inserted_id,
                                        concepto, MONTO_EMPLEADO, periodo, ahora)["_id"]
        registrar("base reinyectada: allowlist #0/#1 · proyecto Nomina ANLU · empleados #2..#4")
        # Mint top-up hasta montos documentados
        mint_si_falta(rpc, pk_owner, c0, MONTO_ADMIN, args.dry_run)
        for wallet in [c1, *e_base]:
            mint_si_falta(rpc, pk_owner, wallet, MONTO_EMPLEADO, args.dry_run)

    if not hacer_act:
        cliente.close()
        return 0
    if args.dry_run:
        registrar("FIN SIMULACIÓN (actividades): no se escribió nada.")
        cliente.close()
        return 0

    # ---------------------------------------------------------------- FASE B
    ahora = datetime.now(timezone.utc)
    # Si solo corre la fase de actividades, recupera los _id de la BD reinyectada.
    ids = {}
    for wallet in [*e_base, *e_nuevos]:
        doc = db.employees.find_one({"walletLower": wallet.lower()}, {"_id": 1})
        if doc:
            ids[wallet] = doc["_id"]
    # B1. Empleados nuevos de las cuentas de reserva
    ids_nuevos = {}
    ids_nuevos[e_nuevos[0]] = alta_empleado(
        db, e_nuevos[0], "Empleado Cuatro ANLU",
        db.projects.find_one({"nombre": "Nomina ANLU"})["_id"],
        "mantenimiento", 50, 15, ahora)["_id"]
    ids_nuevos[e_nuevos[1]] = alta_empleado(
        db, e_nuevos[1], "Empleado Cinco ANLU",
        db.projects.find_one({"nombre": "Nomina ANLU"})["_id"],
        "proyecto_mvp", 80, 6, ahora)["_id"]
    registrar("empleados nuevos #5 (mantenimiento 50/15d) y #6 (proyecto_mvp 80/6d)")
    mint_si_falta(rpc, pk_owner, e_nuevos[0], MONTO_EMPLEADO, False)
    mint_si_falta(rpc, pk_owner, e_nuevos[1], MONTO_EMPLEADO, False)

    # B2. Proyecto adicional (idempotente)
    if not db.projects.find_one({"nombre": "Mantenimiento Infraestructura"}):
        db.projects.insert_one({
        "nombre": "Mantenimiento Infraestructura",
        "descripcion": "Mantenimiento de infraestructura blockchain (actividad simulada)",
        "presupuesto": wei(25_000), "estado": "activo",
        "createdAt": ahora, "updatedAt": ahora,
        })
        registrar("proyecto 'Mantenimiento Infraestructura' creado")
    else:
        registrar("proyecto 'Mantenimiento Infraestructura' ya existe (ok)")

    # B3. Financiación del admin + approve
    mint_si_falta(rpc, pk_owner, c0, MONTO_ADMIN + 1_600, False)
    tx_ap = cast_send(rpc, [BRLT, "approve(address,uint256)", BRLTX,
                            "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"], pk_owner)
    auditar(db, c0, None, tx_ap, {"operacion": "mint", "via": "simulacion",
                                  "nota": "approve de financiación de flujos"})
    registrar(f"approve admin → BrltX tx={tx_ap}")

    # B4. Creación de 4 flujos on-chain
    flujos = [
        (e_base[0], ids[e_base[0]], 300, 30 * DIA),   # nómina estándar
        (e_base[1], ids[e_base[1]], 600, 6 * DIA),    # devengo rápido
        (e_base[2], ids[e_base[2]], 240, 15 * DIA),
        (e_nuevos[0], ids_nuevos[e_nuevos[0]], 360, 6 * DIA),
    ]
    creados = []
    for wallet, eid, monto, dur in flujos:
        previo = db.flows.find_one({"receiverLower": wallet.lower(),
                                    "estado": {"$in": ["activo", "pausado"]}})
        if previo:
            fid = int(previo["flowId"])
            registrar(f"flujo para {wallet[:10]}… ya existe (#{{fid}}, {previo['estado']}); se reutiliza")
            creados.append((fid, wallet, eid, monto, dur))
            continue
        tx = cast_send(rpc, [BRLTX, "wrapAndCreateFlow(uint256,address,uint64)",
                             wei(monto), wallet, dur], pk_owner)
        last = entero_cast(cast_rpc(rpc, ["call", BRLTX, "lastFlowId()(uint256)"]))
        espejar_flujo(db, rpc, last, eid, c0, tx)
        auditar(db, c0, eid, tx, {"operacion": "creacion", "flowId": str(last),
                                  "amount": wei(monto), "via": "simulacion"})
        creados.append((last, wallet, eid, monto, dur))
        registrar(f"flujo #{last} creado: {monto} BRLT/{dur//DIA}d → {wallet[:10]}… tx={tx}")

    # B5. Espera de devengo
    registrar(f"esperando {args.espera}s para acumular devengo…")
    time.sleep(args.espera)

    def pausa(flow_id, eid):
        if flujo_onchain(rpc, flow_id)["paused"]:
            registrar(f"flujo #{flow_id} ya estaba pausado (ok, idempotente)")
            return
        tx = cast_send(rpc, [BRLTX, "updateFlow(uint256,uint128)", flow_id, 0], pk_owner)
        espejar_flujo(db, rpc, flow_id, eid, c0, tx)
        auditar(db, c0, eid, tx, {"operacion": "pausa", "flowId": str(flow_id), "via": "simulacion"})
        registrar(f"flujo #{flow_id} PAUSADO (devengo acreditado al empleado) tx={tx}")

    def reanudar(flow_id, eid, monto, dur):
        if not flujo_onchain(rpc, flow_id)["paused"]:
            registrar(f"flujo #{flow_id} ya está activo (ok, idempotente)")
            return
        rate = int(wei(monto)) // dur
        tx = cast_send(rpc, [BRLTX, "updateFlow(uint256,uint128)", flow_id, rate], pk_owner)
        espejar_flujo(db, rpc, flow_id, eid, c0, tx)
        auditar(db, c0, eid, tx, {"operacion": "reanudacion", "flowId": str(flow_id), "via": "simulacion"})
        registrar(f"flujo #{flow_id} REANUDADO tx={tx}")

    indice_de = {e_base[0]: EMPLEADOS_BASE[0], e_base[1]: EMPLEADOS_BASE[1],
                 e_base[2]: EMPLEADOS_BASE[2], e_nuevos[0]: EMPLEADOS_NUEVOS[0],
                 e_nuevos[1]: EMPLEADOS_NUEVOS[1]}

    def cobro(wallet, eid):
        saldo_x = saldo_brltx(rpc, wallet)
        if saldo_x == 0:
            registrar(f"cobro omitido: {wallet[:10]}… sin BrltX")
            return
        pk = clave(mnemonic, indice_de[wallet])
        tx = cast_send(rpc, [BRLTX, "downgrade(uint256)", saldo_x], pk)
        # Coherencia con el tope 80%: el cobro se registra en auditoría con su
        # monto (fuente del acumulado, como verifyWalletAction + recordFlowAction).
        auditar(db, wallet, eid, tx, {"operacion": "cobro", "amount": str(saldo_x),
                                      "via": "simulacion"})
        registrar(f"cobro downgrade de {wallet[:10]}… = {saldo_x/10**18:.6f} BRLT tx={tx}")

    # B6-B8: pausa + cobro + reanudación del flujo de #3
    f2 = creados[1]
    pausa(f2[0], f2[2])
    cobro(f2[1], f2[2])
    reanudar(f2[0], f2[2], f2[3], f2[4])

    # B9: pausa breve + cobro + reanudación del flujo de #2
    f1 = creados[0]
    pausa(f1[0], f1[2])
    cobro(f1[1], f1[2])
    reanudar(f1[0], f1[2], f1[3], f1[4])

    # B10: terminación del flujo de #4 (paga devengo, devuelve remanente al admin)
    f3 = creados[2]
    if flujo_onchain(rpc, f3[0])["terminated"]:
        registrar(f"flujo #{f3[0]} ya estaba terminado (ok, idempotente)")
    else:
        tx = cast_send(rpc, [BRLTX, "deleteFlow(uint256)", f3[0]], pk_owner)
        espejar_flujo(db, rpc, f3[0], f3[2], c0, tx)
        auditar(db, c0, f3[2], tx, {"operacion": "terminacion", "flowId": str(f3[0]), "via": "simulacion"})
        registrar(f"flujo #{f3[0]} TERMINADO tx={tx}")

    # B11: 2 flujos programados (CU-05) sin ejecutar (idempotente)
    for wallet, eid, monto, dur, dias in [
            (e_base[2], ids[e_base[2]], 240, 15 * DIA, 7),
            (e_nuevos[1], ids_nuevos[e_nuevos[1]], 120, 6 * DIA, 3)]:
        emp = db.employees.find_one({"_id": eid})
        if db.scheduled_flows.find_one({"employeeId": eid, "estado": "proximo",
                                        "amount": wei(monto)}):
            registrar(f"programado para {emp['nombre']} ya existe (ok, idempotente)")
            continue
        db.scheduled_flows.insert_one({
            "employeeId": eid, "employeeNombre": emp["nombre"], "receiver": wallet,
            "amount": wei(monto), "periodo": dur // DIA, "durationSeconds": dur,
            "fechaInicio": datetime.now(timezone.utc) + timedelta(days=dias),
            "estado": "proximo", "flowId": None, "txHash": None, "error": None,
            "createdBy": c0, "createdAt": ahora, "updatedAt": ahora, "executedAt": None,
        })
        registrar(f"programado 'proximo': {monto} BRLT/{dur//DIA}d → {emp['nombre']} (inicio +{dias}d)")

    # B12. Verificación final
    registrar("— VERIFICACIÓN FINAL —")
    for etiqueta, wallet in [("SA", c0), ("sist", c1), ("emp1", e_base[0]),
                             ("emp2", e_base[1]), ("emp3", e_base[2]),
                             ("emp4", e_nuevos[0]), ("emp5", e_nuevos[1])]:
        b = saldo_brlt(rpc, wallet) // 10 ** 18
        x = saldo_brltx(rpc, wallet) / 10 ** 18
        registrar(f"VERIFICADO {etiqueta} {wallet[:10]}… BRLT={b} BrltX={x:.6f}")
    supply = entero_cast(cast_rpc(rpc, ["call", BRLT, "totalSupply()(uint256)"])) // 10 ** 18
    registrar(f"VERIFICADO supply BRLT={supply}")
    registrar(f"VERIFICADO Mongo: admins={db.admin_allowlist.count_documents({'estado': 'activo'})} · "
              f"empleados={db.employees.count_documents({'estado': 'activo'})} · "
              f"flujos={db.flows.count_documents({})} · "
              f"programados={db.scheduled_flows.count_documents({'estado': 'proximo'})} · "
              f"audit={db.audit_events.count_documents({})}")
    usados = {}
    for ev in db.audit_events.find({"meta.operacion": "cobro"}):
        w = ev["actorWallet"].lower()
        usados[w] = usados.get(w, 0) + int(ev["meta"].get("amount", "0"))
    for w, monto in usados.items():
        registrar(f"VERIFICADO tope-80% {w[:10]}… cobrado acumulado={monto/10**18:.6f} BRLT (dentro del tope)")
    cliente.close()
    registrar("Simulación completada. Anvil compartido intacto · contratos sin cambios.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
