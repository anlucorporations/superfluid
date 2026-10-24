# sfh-k6 — carga k6 (NAS→portal + comandos de gateway) en Cloud Run Job
FROM node:22-bookworm-slim

ARG K6_VERSION=0.54.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && curl -fsSL "https://github.com/grafana/k6/releases/download/v${K6_VERSION}/k6-v${K6_VERSION}-linux-amd64.tar.gz" \
    | tar -xz -C /usr/local/bin --strip-components=1 "k6-v${K6_VERSION}-linux-amd64/k6" \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY seed ./seed
COPY k6 ./k6
COPY upload.mjs entrypoint.sh ./
RUN chmod +x entrypoint.sh

CMD ["sh", "entrypoint.sh"]
