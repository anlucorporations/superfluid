#!/usr/bin/env bash
# H7 — Despliegue en Cloud Run del proyecto Superfluid Brlt v2.
# Requisitos previos:
#   - gcloud autenticado con el proyecto 1095249147821 y permisos run/secretmanager.
#   - `web/gcp/env.yaml` creado a partir de `env.example.yaml` (credenciales Mongo reales).
#   - `npm run build` + `npm run verify:standalone` verdes en el repo local.
# Uso:
#   ./gcp/deploy.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-1095249147821}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-brltv2-preview}"
REPO="${REPO:-superfluidv2}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/web:latest"

echo "── 1/4 Build con Cloud Build (usa el Dockerfile multi-stage de web/) ──"
gcloud builds submit "web" \
  --project "${PROJECT_ID}" \
  --tag "${IMAGE}" \
  --config web/gcp/cloudbuild.yaml

echo "── 2/4 Servicios y roles habilitados (idempotente) ──"
gcloud services enable cloudbuild.googleapis.com run.googleapis.com \
  --project "${PROJECT_ID}"

echo "── 3/4 Despliegue en Cloud Run (vars desde gcp/env.yaml) ──"
gcloud run deploy "${SERVICE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --image "${IMAGE}" \
  --port 8080 \
  --min-instances 1 \
  --max-instances 2 \
  --cpu 1 --memory 512Mi \
  --allow-unauthenticated \
  --timeout 120s \
  --env-vars-file "web/gcp/env.yaml"
# Si los pares Mongo/sesión van por Secret Manager en lugar de env.yaml:
#   --set-secrets "MONGODB_URI=brltv2-mongo-uri:latest"

echo "── 4/4 URL de service ──"
gcloud run services describe "${SERVICE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format="value(status.url)"
