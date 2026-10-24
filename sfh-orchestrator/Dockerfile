# sfh-orchestrator — imagen de producción (Cloud Run)
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
EXPOSE 8080
# Modos: `node dist/main.js` (API) · `indexer` · `health` · `purge` (Cloud Run Jobs)
CMD ["node", "dist/main.js"]
