import { defineConfig } from '@playwright/test';

const PORT = 3100;
// Binario instalado localmente (el env CHROMIUM_PATH global apunta a otra build ausente).
const CHROMIUM =
  process.env.SFH_CHROMIUM ??
  '/home/dsh/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    trace: 'off',
    launchOptions: {
      executablePath: CHROMIUM,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
    env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:8080' },
  },
});
