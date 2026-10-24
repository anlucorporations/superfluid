# Imagen mínima del smoke E2E (se ejecuta como Cloud Run Job, donde el
# endpoint de identidad del metadata server sí está disponible).
FROM node:22-alpine
WORKDIR /app
COPY preview_smoke.mjs ./
CMD ["node", "preview_smoke.mjs"]
