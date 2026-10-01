# RT-08: build standalone para Cloud Run (Next.js 15 output:"standalone")
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_RPC_URL=https://besu.alumnos.codecrypto.academy
ARG NEXT_PUBLIC_CHAIN_ID=81234
ARG NEXT_PUBLIC_EUR_ADDRESS
ARG NEXT_PUBLIC_EURX_ADDRESS
ARG NEXT_PUBLIC_FACTORY_ADDRESS
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL \
    NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID \
    NEXT_PUBLIC_EUR_ADDRESS=$NEXT_PUBLIC_EUR_ADDRESS \
    NEXT_PUBLIC_EURX_ADDRESS=$NEXT_PUBLIC_EURX_ADDRESS \
    NEXT_PUBLIC_FACTORY_ADDRESS=$NEXT_PUBLIC_FACTORY_ADDRESS
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
