#!/usr/bin/env bash
# H7 — Despliegue en Cloud Run del proyecto Superfluid Brlt v2 (plataforma-txbarlovento).
# Requisitos previos:
#   - gcloud autenticado con el proyecto plataforma-txbarlovento (cuenta sa-dsh-dev).
#   - Recursos brltv2-* creados (repo Artifact, VPC connector, secreto brltv2-mongo-uri).
#   - `npm run build` + `npm run verify:standalone` verdes en el repo local.
# Uso:
#   ./gcp/deploy.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-plataforma-txbarlovento}"
REGION="${REGION:-europe-west1}"
SERVICE="${SERVICE:-brltv2}"
REPO="${REPO:-superfluidv2}"
CONNECTOR="${CONNECTOR:-brltv2-connector}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/web:latest"

echo "── 1/4 Build con Cloud Build (usa el Dockerfile multi-stage de web/) ──"
gcloud builds submit "web" \
  --project "${PROJECT_ID}" \
  --config web/gcp/cloudbuild.yaml \
  --substitutions "_IMAGE=${IMAGE},_SERVICE=${SERVICE},_REGION=${REGION},_CONNECTOR=${CONNECTOR}"

echo "── 2/4 Servicios habilitados (idempotente) ──"
gcloud services enable cloudbuild.googleapis.com run.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com vpcaccess.googleapis.com \
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
  --vpc-connector "${CONNECTOR}" --vpc-egress all-traffic \
  --set-secrets "MONGODB_URI=brltv2-mongo-uri:latest" \
  --env-vars-file "web/gcp/env.yaml"

echo "── 4/4 URL del servicio ──"
gcloud run services describe "${SERVICE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format="value(status.url)"
