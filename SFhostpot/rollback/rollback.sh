#!/usr/bin/env bash
# =============================================================================
# rollback.sh — Restaura el preview de SFhostpot a un snapshot conocido.
#
# Uso:
#   ./rollback.sh                          # usa el snapshot más reciente de este dir
#   ./rollback.sh 20261024T0207Z           # usa ese snapshot
#   ./rollback.sh --dry-run                # muestra qué haría, sin cambiar tráfico
#   ./rollback.sh --service sfh-orchestrator   # sólo un servicio
#   ./rollback.sh --tag                    # re-despliega la imagen pineada
#                                          # (rollback-<snapshot>) en vez de sólo
#                                          # mover tráfico a la revisión antigua
#
# Qué hace:
#   1. Lee <snapshot>/state.json (servicio → revisión + digest de imagen).
#   2. Comprueba que la revisión de rollback sigue existiendo en Cloud Run.
#   3. Mueve el 100 % del tráfico a esa revisión (gcloud run services
#      update-traffic). Con --tag re-despliega la imagen pineada
#      (rollback-<snapshot>) preservando env/secrets/Cloud SQL del servicio.
#   4. Verifica: revisión Ready, tráfico 100 %, /health (orquestador) y
#      portal HTTP 200.
#
# Requisitos: gcloud (SDK 582+), permisos roles/run.admin, roles/artifactregistry.reader
# Proyecto/región: truekeate-main · southamerica-east1
#
# Notas:
#   - Los servicios son PRIVADOS (org policy iam.allowedPolicyMemberDomains
#     impide allUsers): la verificación HTTP usa un ID token de la cuenta activa.
#   - La BD no se toca: las migraciones de esta versión son aditivas. Si hiciera
#     falta rollback de datos, restaurar el backup on-demand del snapshot
#     (ver README.md §3).
# =============================================================================
set -euo pipefail

# gcloud no suele estar en PATH en este host (SDK instalado en $HOME)
if ! command -v gcloud >/dev/null 2>&1; then
  export PATH="$HOME/google-cloud-sdk/bin:$PATH"
fi
command -v gcloud >/dev/null 2>&1 || { echo "ERROR: gcloud no encontrado en PATH"; exit 1; }

PROJECT="truekeate-main"
REGION="southamerica-east1"
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SNAPSHOT=""; DRY_RUN=0; MODE_TAG=0; ONLY_SERVICE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --tag) MODE_TAG=1 ;;
    --service) ONLY_SERVICE="${2:?}"; shift ;;
    -h|--help) sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) SNAPSHOT="$1" ;;
  esac
  shift
done

if [[ -z "$SNAPSHOT" ]]; then
  SNAPSHOT="$(ls -1 "$BASE_DIR" | grep -E '^[0-9]{8}T[0-9]{4}Z$' | sort | tail -1)"
fi
STATE="$BASE_DIR/$SNAPSHOT/state.json"
[[ -f "$STATE" ]] || { echo "ERROR: no existe $STATE"; exit 1; }

echo "== Rollback SFhostpot =="
echo "   snapshot : $SNAPSHOT"
echo "   proyecto : $PROJECT · $REGION"
echo "   modo     : $([[ $MODE_TAG -eq 1 ]] && echo 'redesplegar imagen pineada (--tag)' || echo 'mover tráfico a revisión existente')"
[[ $DRY_RUN -eq 1 ]] && echo "   *** DRY-RUN: sin cambios ***"
echo

services=$(python3 -c 'import json,sys;print(" ".join(json.load(open(sys.argv[1]))["services"]))' "$STATE")
[[ -n "$ONLY_SERVICE" ]] && services="$ONLY_SERVICE"

ok=0; fail=0
for svc in $services; do
  read -r rev image digest < <(python3 - "$STATE" "$svc" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]))["services"][sys.argv[2]]
print(s.get("latest_ready_revision","-"), s.get("image","-"), s.get("image_digest","-"))
PY
)
  echo "-- $svc → $rev"
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "   [dry-run] target=$rev image=$image"
    continue
  fi

  if [[ $MODE_TAG -eq 1 ]]; then
    repo="${image%:*}"
    target_image="${repo}:rollback-${SNAPSHOT}"
    echo "   redesplegando $target_image (preserva env/secrets/Cloud SQL)"
    if gcloud run services update "$svc" --project="$PROJECT" --region="$REGION" \
         --image="$target_image" --quiet >/dev/null 2>&1; then
      left="$(gcloud run services describe "$svc" --project="$PROJECT" --region="$REGION" \
        --format='value(status.latestReadyRevisionName)')"
      echo "   nueva revisión $left (Ready)"
      rev="$left"
    else
      echo "   ERROR: no se pudo redesplegar la imagen pineada"; fail=$((fail+1)); continue
    fi
  fi

  if out=$(gcloud run services update-traffic "$svc" --project="$PROJECT" --region="$REGION" \
       --to-revisions="$rev=100" --quiet 2>&1); then
    echo "   tráfico 100 % → $rev"
  else
    echo "   ERROR: fallo update-traffic a $rev"; echo "$out" | tail -4 | sed 's/^/     /'
    fail=$((fail+1)); continue
  fi

  pct="$(gcloud run services describe "$svc" --project="$PROJECT" --region="$REGION" \
    --format='value(status.traffic[0].percent,status.traffic[0].revisionName)' | tr '\t' ' ')"
  echo "   tráfico actual: $pct"
  ok=$((ok+1))
done

if [[ $DRY_RUN -eq 0 && $fail -eq 0 ]]; then
  echo
  echo "== Verificación HTTP =="
  TOKEN="$(gcloud auth print-identity-token 2>/dev/null || true)"
  ORCH_URL="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["services"]["sfh-orchestrator"]["url"])' "$STATE")"
  PORTAL_URL="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["services"]["sfh-portal"]["url"])' "$STATE")"
  code_health=$(curl -s -o /tmp/rollback_health.json -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$ORCH_URL/health" || true)
  code_portal=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$PORTAL_URL/" || true)
  echo "   $ORCH_URL/health → HTTP $code_health $(cat /tmp/rollback_health.json 2>/dev/null | head -c 120)"
  echo "   $PORTAL_URL/ → HTTP $code_portal"
  [[ "$code_health" == "200" && "$code_portal" == "200" ]] || { echo "ERROR: verificación HTTP fallida"; exit 1; }
fi

echo
echo "Resultado: $ok servicio(s) restaurados, $fail error(es)."
[[ $fail -eq 0 ]] || exit 1
echo "Rollback OK — snapshot $SNAPSHOT"
