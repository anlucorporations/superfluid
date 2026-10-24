# sfh-sim — emulador MikroTik + NAS simulado (imagen única para servicio o Job)
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.mjs nas-sim.mjs ./
COPY src ./src
COPY scenario-runner ./scenario-runner
# Por defecto arranca el emulador RouterOS; el NAS se arranca con
# `--command node --args nas-sim.mjs` y los escenarios con `scenario-runner/run.mjs`.
ENV SFH_SIM_HOST=0.0.0.0 SFH_SIM_PORT=8728 NODE_ENV=production
EXPOSE 8728 8081
CMD ["node", "server.mjs"]
