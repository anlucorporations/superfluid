import { test, expect } from '@playwright/test';
import { injectWalletMock, TEST_ACCOUNT } from './helpers/wallet-mock';

// CU-09 / RF-09: guard de red y modo solo lectura (E2E chain_guard)
test('solo_lectura: sin wallet → modo solo lectura visible', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); // RNF-05
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Conectar MetaMask/ })).toBeVisible();
  await expect(page.getByText(/Modo solo lectura/)).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('wallet mock (cuenta #0 del curso)', () => {
  test('chain_guard: red distinta de 81234 bloquea mutaciones (RE-09a)', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'ethereum', {
        value: {
          request: async ({ method }: { method: string }) => {
            if (method === 'eth_requestAccounts' || method === 'eth_accounts') return ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'];
            if (method === 'eth_chainId') return '0x1';
            throw new Error('unsupported in mock');
          },
          on: () => undefined,
        }, configurable: true,
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /Conectar MetaMask/ }).click();
    await expect(page.getByText(/otra red/i).first()).toBeVisible({ timeout: 15_000 });
    // RE-09a: con red equivocada las mutaciones se bloquean (sección de crear flujo oculta)
    await expect(page.getByRole('button', { name: 'Crear flujo' })).toHaveCount(0);
    // wrap sigue visible pero bloqueado por guard en action(): al pulsar, aviso sin firma
    await page.getByRole('button', { name: /Upgrade → EURx/ }).click();
    await expect(page.getByText(/Cambia a la red|otra red/i).first()).toBeVisible();
  });
  test('chain_guard: conecta y muestra cuenta + balances live', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await injectWalletMock(page);
    await page.goto('/');
    await page.getByRole('button', { name: /Conectar MetaMask/ }).click();
    await expect(page.getByLabel('cuenta conectada')).toContainText('0xf39Fd6');
    // polling real contra Besu: el saldo custodiado debe cargarse (no literal frágil: aria-label)
    await expect(page.getByText(/EURx custodiado/i)).toBeVisible();
    await page.waitForFunction(() => {
      const el = document.querySelector('[aria-label^="EURx custodiado:"]');
      return !!el && !/EURx custodiado: —$/.test(el.getAttribute('aria-label') ?? '');
    }, null, { timeout: 45_000 });
    expect(errors).toEqual([]);
  });

  test('self_destino: destino propio bloqueado antes de firmar (D15/D7)', async ({ page }) => {
    await injectWalletMock(page);
    await page.goto('/');
    await page.getByRole('button', { name: /Conectar MetaMask/ }).click();
    await page.getByLabel('dirección Ethereum del destinatario').fill(TEST_ACCOUNT);
    await page.getByRole('button', { name: 'Crear flujo' }).click();
    await expect(page.locator('[role="alert"]:not([id="__next-route-announcer__"])')).toContainText('propia cuenta');
  });

  test('irrevocable_modal: aparece antes de crear', async ({ page }) => {
    await injectWalletMock(page);
    await page.goto('/');
    await page.getByRole('button', { name: /Conectar MetaMask/ }).click();
    await page.getByLabel('dirección Ethereum del destinatario').fill('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    await page.getByRole('button', { name: 'Crear flujo' }).click();
    await expect(page.getByRole('dialog')).toContainText('irrecuperable');
    await page.getByRole('button', { name: 'Cancelar' }).click();
  });
});
