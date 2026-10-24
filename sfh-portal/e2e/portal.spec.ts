import { expect, test, type Page } from '@playwright/test';

const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const SESSION = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BINDING = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

async function mockWallet(page: Page): Promise<void> {
  await page.addInitScript(
    ({ address }) => {
      const provider = {
        request: async ({ method }: { method: string; params?: unknown[] }) => {
          switch (method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              return [address];
            case 'eth_chainId':
              return '0x13d52'; // 81234
            case 'personal_sign':
            case 'eth_sign':
              return `0x${'ab'.repeat(65)}`;
            case 'eth_sendTransaction':
              return `0x${'cd'.repeat(32)}`;
            default:
              return null;
          }
        },
        on: () => undefined,
        removeListener: () => undefined,
      };
      (window as unknown as { ethereum?: unknown }).ethereum = provider;
    },
    { address: ADDRESS },
  );
}

async function mockApi(page: Page): Promise<void> {
  await page.route('**/v1/portal/sessions', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ session_id: SESSION, expires_at: '2026-10-19T10:15:00Z' }),
    }),
  );
  await page.route('**/v1/portal/bindings', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ binding_id: BINDING, wallet_address: ADDRESS }),
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await mockWallet(page);
  await mockApi(page);
});

test('CU-01: aviso previo → wallet → firma SIWE (determinista)', async ({ page }) => {
  await page.goto('/?bind_token=test-token');

  // Token del hotspot reconocido
  await expect(page.getByText('Token recibido del hotspot.')).toBeVisible();

  // El alta exige aceptar el aviso (D52)
  const accept = page.getByRole('button', { name: 'Aceptar y crear sesión' });
  await expect(accept).toBeDisabled();
  await page.getByRole('checkbox').check();
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(page.getByText(`session_id: ${SESSION}`)).toBeVisible();

  // La wallet inyectada se auto-detecta vía eth_accounts (sin pulsar conectar)
  await expect(page.getByText(ADDRESS)).toBeVisible();

  // Firma SIWE → binding
  await page.getByRole('button', { name: 'Firmar vinculación (SIWE)' }).click();
  await expect(page.getByText(`binding: ${BINDING}`)).toBeVisible();

  // Sin BRLTx no se puede abrir stream (resultado único y determinista)
  await expect(page.getByRole('button', { name: 'Abrir flujo y solicitar acceso' })).toBeDisabled();
});

test('sin bind_token no se puede crear la sesión de portal', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Token recibido del hotspot.')).toHaveCount(0);
  const accept = page.getByRole('button', { name: 'Aceptar y crear sesión' });
  await expect(accept).toBeDisabled();
});
