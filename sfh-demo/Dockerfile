# sfh-demo — demo scripted CU-01 con Playwright + wallet real (Besu)
FROM mcr.microsoft.com/playwright:v1.49.1-noble
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY demo.mjs ./
CMD ["node", "demo.mjs"]
