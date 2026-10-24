// sfh-sim — servicio del emulador MikroTik (RouterOS v7 REST).
// Cloud Run inyecta PORT; en local se puede fijar SFH_SIM_PORT.
import { createRouterOsEmulator } from './src/routeros-emulator.mjs';

const emu = createRouterOsEmulator({
  port: Number(process.env.PORT ?? process.env.SFH_SIM_PORT ?? 8728),
  host: process.env.SFH_SIM_HOST ?? '0.0.0.0',
  user: (process.env.SFH_SIM_USER ?? 'sfh').trim(),
  password: (process.env.SFH_SIM_PASSWORD ?? 'sfh-sim-password').trim(),
  adminToken: (process.env.SFH_SIM_ADMIN_TOKEN ?? 'sfh-sim-admin').trim(),
});

const { url } = await emu.listen();
console.log(
  JSON.stringify({
    event: 'sfh-sim-ready',
    service: 'sfh-sim-routeros',
    url,
    mode: emu.state.mode,
    user: emu.config.user,
  }),
);

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    console.log(JSON.stringify({ event: 'sfh-sim-stopping', signal }));
    await emu.close();
    process.exit(0);
  });
}
