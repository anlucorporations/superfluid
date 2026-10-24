#!/bin/sh
set -eu

echo "== seed =="
node seed/seed.mjs

export API_TOKEN="$(cat /tmp/sfh-k6-token)"

# Los secretos inyectados por Secret Manager pueden traer \n final.
GATEWAY_SECRET="$(printf '%s' "$SFH_GATEWAY_SECRET" | tr -d '\n\r')"

echo "== k6 A: NAS -> portal (100 VUs) =="
k6 run --summary-export=/tmp/k6-nas-summary.json \
  -e API_URL="$API_URL" -e API_TOKEN="$API_TOKEN" \
  -e SFH_GATEWAY_ID="$SFH_GATEWAY_ID" -e SFH_GATEWAY_SECRET="$GATEWAY_SECRET" \
  -e VUS="${K6_VUS:-100}" -e DURATION="${K6_DURATION:-20s}" \
  k6/nas_portal.js

echo "== k6 B: comandos de gateway (pause) =="
k6 run --summary-export=/tmp/k6-gateway-summary.json \
  -e API_URL="$API_URL" -e API_TOKEN="$API_TOKEN" \
  -e VUS="${K6_VUS:-100}" \
  k6/gateway_pause.js

echo "== summaries =="
cat /tmp/k6-nas-summary.json
echo
cat /tmp/k6-gateway-summary.json
echo

node upload.mjs || true
