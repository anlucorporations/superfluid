// Entrada del NAS simulado: `node nas-sim.mjs` (o `npm run nas`).
import { createNasSim } from './src/nas-sim.mjs';

const nas = createNasSim({
  port: Number(process.env.PORT ?? process.env.NAS_SIM_PORT ?? 8081),
  host: process.env.NAS_SIM_HOST ?? '0.0.0.0',
  apiUrl: process.env.API_URL ?? 'http://127.0.0.1:8080',
  portalUrl: process.env.PORTAL_URL ?? 'http://127.0.0.1:3000',
  gatewayId: process.env.SFH_GATEWAY_ID ?? '11111111-1111-4111-8111-111111111111',
  gatewaySecret: (process.env.SFH_GATEWAY_SECRET ?? 'sfh-sim-gw-secret').trim(),
});

const { url } = await nas.listen();
console.log(JSON.stringify({ event: 'sfh-sim-nas-ready', service: 'sfh-sim-nas', url, gatewayId: nas.config.gatewayId }));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    console.log(JSON.stringify({ event: 'sfh-sim-nas-stopping', signal }));
    await nas.close();
    process.exit(0);
  });
}
