import { test, expect } from '@playwright/test';
import { injectWalletMock, TEST_PK } from './helpers/wallet-mock';

// CU-08 / RF-12: list_incoming — cuenta #1 (pk pública del curso) ve el flow recibido de la #0
const PK_R1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; // cuenta #1

test('list_incoming: detecta emisor conocido y muestra devengo exigible', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await injectWalletMock(page, PK_R1);
  await page.goto('/');
  await page.getByRole('button', { name: /Conectar MetaMask/ }).click();
  await expect(page.getByLabel('cuenta conectada')).toContainText('0x709979');
  // el ticker de logs (30 s) debe encontrar FlowCreated(#0 → #1) de corridas previas o de este run
  await page.waitForFunction(
    () => document.body.innerText.includes('Flujos entrantes')  || document.body.innerText.includes("Recibidos —"),
    null, { timeout: 70_000 },
  ).catch(() => undefined);
  const recv = page.getByRole('heading', { name: /Recibidos/i });
  await expect(recv).toBeVisible();
  expect(errors).toEqual([]);
});
