#!/usr/bin/env python3
"""
validar_sql_gcp.py — Ejecuta base_datos.sql contra el PostgreSQL global de GCP
==============================================================================
Valida H-35: creación real + idempotencia (doble ejecución) + comprobaciones
básicas, en un **esquema aislado** que se elimina al final (no toca el esquema
`public` de la BD compartida).

Requisitos:
  - `source /home/dsh/workspace/gcp-env.sh` (define DATABASE_URL)
  - PYTHONPATH apuntando a las libs del conector (p. ej. /tmp/sfpylibs)
  - gcloud nativo en PATH (/home/dsh/google-cloud-sdk/bin)

Uso:
  PYTHONPATH=/tmp/sfpylibs python3 SFhostpot/tools/validar_sql_gcp.py \
      --instance truekeate-main:southamerica-east1:truekeate-db-dev \
      --schema sfhostpot --sql SFhostpot/base_datos.sql \
      --log SFhostpot/pruebas/validacion_base_datos_gcp.log
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from google.oauth2.credentials import Credentials
from google.cloud.sql.connector import Connector, IPTypes


def gcloud_token() -> str:
    return subprocess.check_output(
        ["gcloud", "auth", "print-access-token"], text=True
    ).strip()


def split_sql(sql: str):
    """Divide el script en sentencias respetando comillas, --, /* */ y $$."""
    stmts, buf, i, n = [], [], 0, len(sql)
    state, dollar_tag = None, ""
    while i < n:
        ch = sql[i]
        nxt = sql[i : i + 2]
        if state is None:
            if nxt == "--":
                state, buf = "line", buf + [nxt]
                i += 2
                continue
            if nxt == "/*":
                state, buf = "block", buf + [nxt]
                i += 2
                continue
            if ch == "'":
                state, buf = "sq", buf + [ch]
                i += 1
                continue
            if ch == '"':
                state, buf = "dq", buf + [ch]
                i += 1
                continue
            if ch == "$":
                m = re.match(r"\$[A-Za-z_]*\$", sql[i:])
                if m:
                    state, dollar_tag = "dollar", m.group(0)
                    buf += [dollar_tag]
                    i += len(dollar_tag)
                    continue
            if ch == ";":
                stmts.append("".join(buf).strip())
                buf = []
                i += 1
                continue
            buf.append(ch)
            i += 1
        elif state == "line":
            buf.append(ch)
            i += 1
            if ch == "\n":
                state = None
        elif state == "block":
            if nxt == "*/":
                buf += ["*/"]
                i += 2
                state = None
            else:
                buf.append(ch)
                i += 1
        elif state == "sq":
            buf.append(ch)
            i += 1
            if ch == "'":
                if i < n and sql[i] == "'":
                    buf.append("'")
                    i += 1
                else:
                    state = None
        elif state == "dq":
            buf.append(ch)
            i += 1
            if ch == '"':
                state = None
        elif state == "dollar":
            if sql.startswith(dollar_tag, i):
                buf.append(dollar_tag)
                i += len(dollar_tag)
                state = None
            else:
                buf.append(ch)
                i += 1
    if "".join(buf).strip():
        stmts.append("".join(buf).strip())
    # descartar bloques que solo contienen comentarios
    out = []
    for s in stmts:
        body = "\n".join(
            l for l in s.splitlines()
            if l.strip() and not l.strip().startswith("--")
        )
        if body:
            out.append(s)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--instance", default="truekeate-main:southamerica-east1:truekeate-db-dev")
    ap.add_argument("--schema", default="sfhostpot")
    ap.add_argument("--sql", default="SFhostpot/base_datos.sql")
    ap.add_argument("--database", default="", help="BD destino (por defecto la de DATABASE_URL)")
    ap.add_argument("--keep", action="store_true", help="no eliminar el esquema al terminar")
    ap.add_argument("--log", default="SFhostpot/pruebas/validacion_base_datos_gcp.log")
    args = ap.parse_args()

    log_lines = []

    def log(msg=""):
        print(msg)
        log_lines.append(msg)

    log("=" * 72)
    log(f"VALIDACIÓN SQL CONTRA POSTGRESQL GLOBAL GCP — {datetime.now(timezone.utc).isoformat()}")
    log(f"instancia={args.instance} | bd={args.database or '(DATABASE_URL)'} | esquema={args.schema} | sql={args.sql}")
    log("=" * 72)

    # credenciales (token de usuario de gcloud)
    tok = gcloud_token()
    creds = Credentials(token=tok, expiry=datetime.utcnow() + timedelta(minutes=50))

    dsn = os.environ.get("DATABASE_URL", "")
    m = re.search(r"://([^:]+):([^@]+)@/([^?]+)", dsn)
    if not m:
        log("[ERROR] DATABASE_URL no disponible; ejecuta: source gcp-env.sh")
        Path(args.log).parent.mkdir(parents=True, exist_ok=True)
        Path(args.log).write_text("\n".join(log_lines), encoding="utf-8")
        return 1
    user, pwd, db = m.group(1), m.group(2), m.group(3)
    log(f"usuario={user} | base={db} | password_len={len(pwd)}")

    connector = Connector(credentials=creds)
    rc = 0
    try:
        conn = connector.connect(
            args.instance, "pg8000", user=user, password=pwd,
            db=(args.database or db), ip_type=IPTypes.PUBLIC,
        )
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("select version()")
        log("conectado: " + cur.fetchone()[0].split(",")[0])

        cur.execute("select extname from pg_extension order by 1")
        existing_ext = {r[0] for r in cur.fetchall()}
        log(f"extensiones existentes: {sorted(existing_ext)}")

        # esquema destino (public = BD dedicada; otro = esquema aislado de validación)
        if args.schema != "public":
            cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{args.schema}"')
            cur.execute(f'SET search_path TO "{args.schema}", public')
            log(f'esquema "{args.schema}" creado/asegurado')
        else:
            cur.execute('SET search_path TO public')
            log('esquema public (BD dedicada) seleccionado')

        script = Path(args.sql).read_text(encoding="utf-8")
        stmts = split_sql(script)
        log(f"sentencias detectadas: {len(stmts)}")

        def run_pass(pass_no: int):
            ok = skip = 0
            errors = []
            for idx, stmt in enumerate(stmts, 1):
                head = stmt.lstrip()[:60].replace("\n", " ")
                try:
                    cur.execute(stmt)
                    ok += 1
                except Exception as e:  # noqa: BLE001
                    msg = str(e).replace("\n", " ")[:200]
                    # extensiones: tolerar si ya existen o no hay permiso
                    if stmt.lstrip().upper().startswith("CREATE EXTENSION"):
                        skip += 1
                        log(f"  [SKIP ext] {head} -> {msg}")
                    else:
                        errors.append(f"#{idx} {head} -> {msg}")
                        log(f"  [ERROR] {head} -> {msg}")
            log(f"pasada {pass_no}: ok={ok} skip={skip} errores={len(errors)}")
            return errors

        log("\n--- PASADA 1 (creación) ---")
        err1 = run_pass(1)

        # comprobaciones tras pasada 1
        cur.execute(
            "select count(*) from information_schema.tables "
            "where table_schema = %s and table_type='BASE TABLE'",
            (args.schema,),
        )
        n_tables = cur.fetchone()[0]
        cur.execute(
            "select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace "
            "where n.nspname=%s and t.typtype='e'",
            (args.schema,),
        )
        n_enums = cur.fetchone()[0]
        cur.execute(
            "select count(*) from information_schema.views where table_schema=%s",
            (args.schema,),
        )
        n_views = cur.fetchone()[0]
        log(f"\ncomprobación: tablas={n_tables} enums={n_enums} vistas={n_views}")

        log("\n--- PASADA 2 (idempotencia) ---")
        err2 = run_pass(2)

        # comprobación de trigger updated_at sobre el gateway seed
        try:
            cur.execute(f'SET search_path TO "{args.schema}", public')
            cur.execute("select id, updated_at from gateways order by created_at limit 1")
            row = cur.fetchone()
            if row:
                gid, before = row
                time.sleep(1.1)
                cur.execute("update gateways set status='maintenance' where id=%s", (gid,))
                cur.execute("select updated_at from gateways where id=%s", (gid,))
                after = cur.fetchone()[0]
                log(f"trigger updated_at: {'OK' if after > before else 'NO ACTUALIZÓ'}")
            else:
                log("trigger updated_at: sin filas seed para probar")
        except Exception as e:  # noqa: BLE001
            log(f"trigger updated_at: ERROR {str(e)[:160]}")

        # ------------------------------------------------------------------
        # Pruebas funcionales B3 (D55/D56): coexistencia padre+hijos,
        # unicidad flow<->sesión padre y reconexión del hijo.
        # ------------------------------------------------------------------
        try:
            cur.execute(f'SET search_path TO "{args.schema}", public')
            cur.execute("select id from gateways where name='mock-gateway-01'")
            gw = cur.fetchone()[0]
            cur.execute("select id from gateway_tariffs where gateway_id=%s limit 1", (gw,))
            tf = cur.fetchone()[0]
            token = "0x" + "11" * 20
            sender = "0x" + "22" * 20
            payout = "0x" + "33" * 20
            macs = ["02:00:00:00:00:01", "02:00:00:00:00:02", "02:00:00:00:00:03"]

            def new_portal(mac, n):
                cur.execute(
                    "insert into portal_sessions (gateway_id, mac_address, ip_address, "
                    "notice_version, notice_accepted_at, session_token_hash, expires_at) "
                    "values (%s,%s,%s,'v1',now(),%s, now()+interval '15 min') returning id",
                    (gw, mac, f"10.0.0.{n}", f"tok-{n}"),
                )
                ps = cur.fetchone()[0]
                cur.execute(
                    "insert into device_bindings (portal_session_id, binding_type, wallet_address, "
                    "mac_address, ip_address, binding_hash) values (%s,'wallet',%s,%s,%s,%s) returning id",
                    (ps, sender, mac, f"10.0.0.{n}", f"bh-{n}"),
                )
                db_ = cur.fetchone()[0]
                return ps, db_

            # padre wallet_stream
            ps0, db0 = new_portal(macs[0], 10)
            cur.execute(
                "insert into hotspot_sessions (portal_session_id, device_binding_id, gateway_id, tariff_id, "
                "access_mode, bandwidth_percent, mac_address, ip_address, wallet_address, super_token_address, "
                "sender_wallet, receiver_wallet, flow_rate_wei_s, min_rate_required_wei, status) "
                "values (%s,%s,%s,%s,'wallet_stream',100,%s,%s,%s,%s,%s,%s,500000000000000,500000000000000,'active') "
                "returning id",
                (ps0, db0, gw, tf, macs[0], "10.0.0.10", sender, token, sender, payout),
            )
            parent = cur.fetchone()[0]

            # voucher del padre
            cur.execute(
                "insert into vouchers (code_hash, gateway_id, tariff_id, parent_hotspot_session_id, "
                "max_children, bandwidth_percent, valid_to) "
                "values ('hash-v1',%s,%s,%s,2,50, now()+interval '90 days') returning id",
                (gw, tf, parent),
            )
            voucher = cur.fetchone()[0]

            # dos hijos con la misma terna on-chain que el padre (deben coexistir)
            children = []
            for i, mac in enumerate(macs[1:], start=20):
                ps, db_ = new_portal(mac, i)
                cur.execute(
                    "insert into hotspot_sessions (portal_session_id, device_binding_id, gateway_id, tariff_id, "
                    "access_mode, parent_hotspot_session_id, voucher_id, bandwidth_percent, mac_address, ip_address, "
                    "wallet_address, super_token_address, sender_wallet, receiver_wallet, flow_rate_wei_s, "
                    "min_rate_required_wei, status) "
                    "values (%s,%s,%s,%s,'voucher_child',%s,%s,50,%s,%s,%s,%s,%s,%s,0,500000000000000,'active') "
                    "returning id",
                    (ps, db_, gw, tf, parent, voucher, mac, f"10.0.0.{i}", sender, token, sender, payout),
                )
                children.append(cur.fetchone()[0])
                cur.execute(
                    "insert into voucher_redemptions (voucher_id, portal_session_id, hotspot_session_id, "
                    "mac_address, ip_address) values (%s,%s,%s,%s,%s)",
                    (voucher, ps, children[-1], mac, f"10.0.0.{i}"),
                )
            cur.execute("select children_used from vouchers where id=%s", (voucher,))
            used = cur.fetchone()[0]
            log(f"B3 coexistencia padre+2 hijos: OK | children_used={used} (esperado 2)")

            # reconexión: liberar un hijo, revocar el binding anterior y volver a canjear la misma MAC
            cur.execute("update voucher_redemptions set released_at=now() where mac_address=%s", (macs[1],))
            cur.execute("select children_used from vouchers where id=%s", (voucher,))
            after_release = cur.fetchone()[0]
            cur.execute(
                "update device_bindings set status='revoked', revoked_at=now() "
                "where mac_address=%s and status='active'",
                (macs[1],),
            )
            ps, db_ = new_portal(macs[1], 30)
            cur.execute(
                "insert into voucher_redemptions (voucher_id, portal_session_id, mac_address, ip_address) "
                "values (%s,%s,%s,%s)",
                (voucher, ps, macs[1], "10.0.0.30"),
            )
            log(f"B3 reconexión mismo MAC tras liberación: OK | children_used {used}->{after_release}")

            # unicidad flow<->sesión: segundo wallet_stream con la misma terna debe fallar
            failed = False
            try:
                ps, db_ = new_portal("02:00:00:00:00:04", 40)
                cur.execute(
                    "insert into hotspot_sessions (portal_session_id, device_binding_id, gateway_id, tariff_id, "
                    "access_mode, mac_address, ip_address, wallet_address, super_token_address, sender_wallet, "
                    "receiver_wallet, flow_rate_wei_s, min_rate_required_wei, status) "
                    "values (%s,%s,%s,%s,'wallet_stream','02:00:00:00:00:04','10.0.0.40',%s,%s,%s,%s,500000000000000,500000000000000,'active')",
                    (ps, db_, gw, tf, sender, token, sender, payout),
                )
            except Exception:  # noqa: BLE001
                failed = True
            log(f"B3 unicidad flow<->sesión padre: {'OK (rechazado)' if failed else 'FALLO (no rechazó)'}")
        except Exception as e:  # noqa: BLE001
            log(f"B3 pruebas funcionales: ERROR {str(e)[:220]}")

        # limpieza (solo si no se pide conservar; nunca se borra `public`)
        if args.keep or args.schema == "public":
            log('esquema conservado (--keep / public): migración aplicada')
        else:
            cur.execute(f'DROP SCHEMA IF EXISTS "{args.schema}" CASCADE')
            cur.execute("SET search_path TO public")
            log(f'esquema "{args.schema}" eliminado (sin residuo)')

        ok_total = not err1 and not err2 and n_tables == 20 and n_enums == 16
        log("\n" + "=" * 72)
        log("RESULTADO: " + ("OK — creación + idempotencia verificadas" if ok_total else "REVISAR (ver errores)"))
        log("=" * 72)
        rc = 0 if ok_total else 1
        conn.close()
    except Exception as e:  # noqa: BLE001
        log(f"[FATAL] {type(e).__name__}: {str(e)[:400]}")
        rc = 2
    finally:
        connector.close()
        Path(args.log).parent.mkdir(parents=True, exist_ok=True)
        Path(args.log).write_text("\n".join(log_lines), encoding="utf-8")
        print(f"\nlog guardado en {args.log}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
