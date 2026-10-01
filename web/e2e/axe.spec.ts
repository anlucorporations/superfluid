import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { injectWalletMock } from './helpers/wallet-mock';

// RNF-09: dashboard_contrast — WCAG 2.1 AA básico sin violaciones críticas
test('dashboard_contrast: axe sin violaciones critical/serious en dashboard cargado', async ({ page }) => {
  await injectWalletMock(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Conectar MetaMask/ }).click();
  await page.getByRole('button', { name: /Conectar MetaMask/ }).waitFor({ state: 'hidden', timeout: 30_000 });
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await page.waitForTimeout(300); // transición de colores
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    const detail = serious.map((v) => `${v.id}:${v.impact} @ ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`).join(' | ');
    expect(serious, `[tema ${theme}] ${detail}`).toHaveLength(0);
  }
});
