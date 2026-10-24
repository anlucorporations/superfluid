#!/usr/bin/env python3
"""
validador_artefactos.py — Validación de coherencia del paquete SFhostpot
========================================================================
Implementa QW-2 del `INFORME_OPTIMIZACION_V1.md` (H-06): comprobar que los
tres artefactos de datos (diccionario_datos.md, diagrama_er.md, base_datos.sql)
están sincronizados, y que los conteos declarados en la documentación coinciden
con el contenido real.

Uso:
    python3 SFhostpot/tools/validador_artefactos.py [--root SFhostpot]

Salida: informe por stdout y exit code 0 si todo cuadra, 1 si hay errores.
Diseñado para CI documental: no requiere PostgreSQL ni dependencias externas.
"""

import argparse
import re
import sys
from pathlib import Path

EXPECTED_TABLES = 20
EXPECTED_ENUMS = 16


def parse_sql(sql: str):
    cols = {}
    for m in re.finditer(r"CREATE TABLE IF NOT EXISTS (\w+) \((.*?)\n\);", sql, re.S):
        table, body = m.group(1), m.group(2)
        names = []
        for line in body.splitlines():
            line = line.strip().rstrip(",")
            if not line or line.startswith(("CONSTRAINT", "--")):
                continue
            parts = line.split()
            if parts and re.fullmatch(r"\w+", parts[0]) and parts[0] not in (
                "CHECK", "PRIMARY", "FOREIGN", "UNIQUE",
            ):
                names.append(parts[0])
        cols[table] = names
    enums = re.findall(r"CREATE TYPE (\w+) AS ENUM", sql)
    return cols, enums


def parse_dict(dic: str):
    cols = {}
    for sec in re.split(r"^#### ", dic, flags=re.M)[1:]:
        m = re.match(r"`(\w+)`", sec)
        if not m:
            continue
        table = m.group(1)
        started, names = False, []
        for line in sec.splitlines():
            if line.strip().startswith("|") and "---" in line:
                started = True
                continue
            if started and line.strip().startswith("|"):
                cell = line.split("|")[1].strip()
                mm = re.match(r"`([^`]+)`", cell)
                if mm:
                    names.append(mm.group(1))
        if names:
            cols[table] = names
    return cols


def parse_er(er: str):
    return set(
        x.lower() for x in re.findall(r"^\s{4}([A-Z][A-Z_]+)\s*\{", er, re.M)
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="SFhostpot")
    args = ap.parse_args()
    root = Path(args.root)
    if not root.exists():
        root = Path(__file__).resolve().parents[1]

    sql = (root / "base_datos.sql").read_text(encoding="utf-8")
    dic = (root / "diccionario_datos.md").read_text(encoding="utf-8")
    er = (root / "diagrama_er.md").read_text(encoding="utf-8")
    estado = (root / "estado_proyecto.md").read_text(encoding="utf-8")
    req = (root / "requerimientos.md").read_text(encoding="utf-8")
    prop = (root / "propuesta_adaptacion.md").read_text(encoding="utf-8")
    resolved = ""
    for name in ("resolucion_auditoria_v1.md", "resolucion_auditoria_fase2.md", "registro_decisiones.md"):
        p = root / name
        if p.exists():
            resolved += p.read_text(encoding="utf-8")

    errors, warnings = [], []
    sql_cols, sql_enums = parse_sql(sql)
    dic_cols = parse_dict(dic)
    er_entities = parse_er(er)

    # 1. Tablas y enums esperados
    if len(sql_cols) != EXPECTED_TABLES:
        errors.append(f"base_datos.sql: {len(sql_cols)} tablas (esperadas {EXPECTED_TABLES})")
    if len(sql_enums) != EXPECTED_ENUMS:
        errors.append(f"base_datos.sql: {len(sql_enums)} enums (esperados {EXPECTED_ENUMS})")

    # 2. Columnas diccionario <-> SQL
    for table, scols in sql_cols.items():
        dcols = dic_cols.get(table)
        if dcols is None:
            errors.append(f"{table}: falta la sección en diccionario_datos.md")
            continue
        only_sql = [c for c in scols if c not in dcols]
        only_dic = [c for c in dcols if c not in scols]
        if only_sql or only_dic:
            errors.append(
                f"{table}: columnas desincronizadas SQL-only={only_sql} DIC-only={only_dic}"
            )

    # 3. Cobertura ER
    for table in sql_cols:
        if table not in er_entities:
            errors.append(f"{table}: sin entidad en diagrama_er.md")

    # 4. Enums documentados
    dic_enums = set(re.findall(r"\| `(\w+)` \|", dic))
    for e in sql_enums:
        if e not in dic_enums:
            errors.append(f"enum {e}: sin fila en diccionario_datos.md §B.1")

    # 5. FKs apuntan a tablas existentes
    for ref in set(re.findall(r"REFERENCES (\w+)", sql)):
        if ref not in sql_cols:
            errors.append(f"FK a tabla inexistente: {ref}")

    # 6. Conteos declarados
    n_rf = len(set(re.findall(r"\| RF-\d+ \|", req)))
    n_rnf = len(set(re.findall(r"\| RNF-\d+ \|", req)))
    n_rt = len(set(re.findall(r"\| RT-\d+ \|", req)))
    dec_re = r"\|\s*\*{0,2}D(\d+)\*{0,2}\s*\|"
    n_dec = len(set(re.findall(dec_re, req)) | set(re.findall(dec_re, resolved)))
    if f"{n_rf} RF" not in estado and f"{n_rf} RF" not in prop:
        warnings.append(f"estado/propuesta no declaran {n_rf} RF (revisar H-06)")
    if str(n_dec) not in estado:
        warnings.append(f"estado no menciona D1–D{n_dec} (revisar H-06)")

    # 7. Cobertura CU -> RF/RNF/RT y lista de CUs (V2-08)
    cu_doc = (root / "casos_uso.md").read_text(encoding="utf-8") if (root / "casos_uso.md").exists() else ""
    cu_reqs, cu_ids = {}, []
    if cu_doc:
        matches = list(re.finditer(r"^## (CU-\d+)", cu_doc, re.M))
        for i, m in enumerate(matches):
            start = m.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else cu_doc.find("\n## 4.", start)
            body = cu_doc[start: end if end != -1 else len(cu_doc)]
            cu_id = m.group(1)
            cu_ids.append(cu_id)
            cu_reqs[cu_id] = set(re.findall(r"(?:RF|RNF|RT)-\d+", body))
        if len(cu_ids) != 19:
            warnings.append(f"casos_uso.md: {len(cu_ids)} CU (esperados 19)")
        no_req = [c for c, r in cu_reqs.items() if not r]
        if no_req:
            errors.append(f"CU sin requisitos trazados: {no_req}")
        covered = set().union(*cu_reqs.values()) if cu_reqs else set()
        defined = (
            set(re.findall(r"\| (RF-\d+) \|", req))
            | set(re.findall(r"\| (RNF-\d+) \|", req))
            | set(re.findall(r"\| (RT-\d+) \|", req))
        )
        orphans = sorted(defined - covered)
        if orphans:
            warnings.append(f"requisitos sin CU (verificar justificación): {orphans}")

    # 8. Balance sintáctico básico del SQL
    if sql.count("(") != sql.count(")"):
        errors.append("base_datos.sql: paréntesis desbalanceados")
    if sql.count("$$") % 2 != 0:
        errors.append("base_datos.sql: bloques $$ desbalanceados")

    print("=" * 66)
    print("VALIDADOR DE ARTEFACTOS — SFhostpot")
    print("=" * 66)
    print(f"tablas={len(sql_cols)} enums={len(sql_enums)} "
          f"entidades_ER={len(er_entities)} RF={n_rf} RNF={n_rnf} RT={n_rt} D={n_dec}")
    for w in warnings:
        print(f"[AVISO] {w}")
    for e in errors:
        print(f"[ERROR] {e}")
    print("-" * 66)
    print("RESULTADO:", "OK — artefactos sincronizados" if not errors else f"{len(errors)} ERROR(ES)")
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
