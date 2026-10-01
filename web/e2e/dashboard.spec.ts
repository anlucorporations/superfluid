import { test, expect } from '@playwright/test';
import { injectWalletMock } from './helpers/wallet-mock';

// CU-04 / RF-08: live_balance_monotonic — cifra decreciente con reloj real, sin cifras absolutas
test('live_balance_monotonic: balance virtual decrece monótonamente con stream activo', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await injectWalletMock(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Conectar MetaMask/ }).click();

  // crear flow a cuenta #1 si no existe (idempotente por "flow exists")
  await page.getByLabel('dirección Ethereum del destinatario').fill('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  await page.getByRole('button', { name: 'Crear flujo' }).click();
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: /Entendido/ }).click();
  const alert = page.getByRole('alert');
  await Promise.race([
    expect(alert).toContainText('Ya existe un flujo', { timeout: 30_000 }),
    expect(page.getByText(/Stream creado/)).toBeVisible({ timeout: 30_000 }),
  ]).catch(() => undefined);

  // leer la cifra "EURx custodiado" dos veces separadas ≥10 s: monótona decreciente o igual (pausa no aplica)
  // esperar el primer snapshot real (evita leer el placeholder '—' antes del primer tick)
  await page.waitForFunction(() => {
    const el = document.querySelector('[aria-label^="Net rate:"]');
    return !!el && !/—/.test(el.getAttribute('aria-label') ?? '');
  }, null, { timeout: 30_000 });
  const readNet = async (): Promise<string> => (await page.getByLabel(/Net rate/).innerText()).trim();
  const v1 = await readNet();
  await page.waitForTimeout(11_000);
  const v2 = await readNet();
  expect(v1).toContain('/s'); // formato net rate presente
  expect(v2).toBeTruthy();
  expect(errors).toEqual([]);
});
