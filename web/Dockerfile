# --- Imagen de producción (Cloud Run / offline) --------------------------------
# Multi-stage: deps → build → runtime standalone, sin código fuente ni devDeps.
# Uso:
#   docker build -t superfluidv2 .
#   docker run --rm -p 8080:8080 --env-file .env.runtime superfluidv2
# (`.next/standalone/server.js` se copia en la raíz como `server.js`.)

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Las variables públicas se hornean en el bundle (build-time):
ARG NEXT_PUBLIC_RPC_URL=https://besu.alumnos.codecrypto.academy
ARG NEXT_PUBLIC_CHAIN_ID=81234
ARG NEXT_PUBLIC_BRLT_ADDRESS
ARG NEXT_PUBLIC_BRLTX_ADDRESS
ARG NEXT_PUBLIC_FAUCET_URL=https://faucet.codecrypto.academy/
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 nextjs
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER nextjs
EXPOSE 8080
# Sonda de Cloud Run: /api/health (MongoDB + chainId 81234).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? 8080) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
