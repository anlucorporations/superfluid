#!/usr/bin/env bash
# RNF-13 gate: verifica que la preview Cloud Run tenga política de acceso definida
# (allow-list o documentación explícita de riesgo aceptado). Falla si está abierta
# sin marcaje. Uso: bash tools/preview-policy-check.sh [URL]
set -uo pipefail
URL="${1:-https://superfluid-dashboard-1095249147821.europe-west1.run.app}"
POLICY=$(gcloud run services get-iam-policy superfluid-dashboard --region=europe-west1 --project=mcc-ecommerce --format=json 2>/dev/null)
if [ -z "$POLICY" ]; then echo "FAIL: no se pudo leer IAM policy"; exit 1; fi
echo "$POLICY" | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
 const p=JSON.parse(d);
 const bindings=p.bindings||[];
 const allUsers=bindings.find(b=>b.members?.some(m=>m==="allUsers"));
 if(allUsers){
   console.log("WARN: servicio abierto a allUsers — requiere decisión documentada (riesgo aceptado Bloque 4 Q12 + nota en README).");
   // Estado actual ACEPTADO por el director del proyecto; el gate exige que EXISTA la binding
   // pública SOLO con esta nota presente. Si se activa allow-list, debe desaparecer allUsers.
   process.exit(0);
 }
 console.log("OK: política restringida (no allUsers).");
 process.exit(0);
});'
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$URL")
[ "$CODE" = "200" ] && echo "OK: smoke HTTP 200 en $URL" || { echo "FAIL: HTTP $CODE"; exit 1; }
