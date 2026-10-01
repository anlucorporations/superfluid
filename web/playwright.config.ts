import { defineConfig } from '@playwright/test';

// H5: E2E headless contra dev server local y red Besu real (RNF-05/09, CU-xx).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  workers: 1, // RPC académico frágil bajo concurrencia (medido 47.9% fallos) → serial
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3111',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? '/home/dsh/bin/chromium-headless-shell', args: ['--no-sandbox'] } } },
  ],
});
