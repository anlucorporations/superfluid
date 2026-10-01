import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { injectWalletMock } from './helpers/wallet-mock';

// RE-03b / D13: paginación de "Mis streams" — 10 filas por página + control accesible.
// Siembra ON-CHAIN de 12 flujos desde la cuenta #0 (cast en beforeAll, no addInitScript)
// y cierre de los 12 en afterAll para no dejar basura en la red del curso.

const EURX = '0x7046717d32AfcA450DC5D6e75724D4282DFAd16E';
const RPC = 'https://besu.alumnos.codecrypto.academy';
const PK0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const A0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const RECV1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const RATE = '771604938271604';
const LONG = 90_000;

// 12 receptores sintéticos: 40 hex válidos, únicos por índice, sin código (EOA vacía),
// distintos de #0, #1 y de los contratos del sistema.
// 0x1111…11 01..0c: patrón probado contra el nodo (otros patrones con len != 40 hex
// producen revert sin razón decodificable en eth_estimateGas).
const SEED = Array.from({ length: 12 }, (_, i) =>
  '0x' + '1'.repeat(38) + i.toString(16).padStart(2, '0'));
const FIRST_ROW_LABEL = SEED[0].slice(0, 10); // la tabla muestra destino recortado (slice 0..10)

const CAST = `${process.env.HOME}/.foundry/bin/cast`; // foundry en PATH del runner no garantizado
function cast(cmd: 'call' | 'send', sig: string, ...rest: string[]): string | null {
  const args = [cmd, EURX, sig, ...rest, '--rpc-url', RPC];
  if (cmd === 'send') args.push('--private-key', PK0, '--gas-limit', '600000');
  try {
    return execFileSync(CAST, args, { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null; // idempotencia: un revert (p. ej. flow exists / only sender) no debe tumbar el hook
  }
}
const openOutflows = (): string[] =>
  [...((cast('call', 'getOpenOutflows(address)(address[])', A0) ?? '').matchAll(/0x[0-9a-fA-F]{40}/g)).map((m) => m[0])];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Siembra tolerante al RPC QBFT del curso: `cast send` puede fallar de forma
 * transitoria (nonce, underpriced, timeout) → reintentar solo los SEED que no
 * quedaron abiertos, hasta 4 pasadas con 3 s de reposo entre ellas.
 */
async function seedTwelveFlows(maxPasses = 8): Promise<string[]> {
  const seeded = () => openOutflows().filter((a) =>
    SEED.some((r) => r.toLowerCase() === a.toLowerCase()));
  let open: string[] = [];
  for (let pass = 1; pass <= maxPasses; pass++) {
    open = seeded();
    const missing = SEED.filter((r) => !open.some((a) => a.toLowerCase() === r.toLowerCase()));
    for (const r of missing) {
      const res = cast('send', 'createFlow(address,int96)', r, RATE);
      if (res === null) await sleep(1_500); // nonce/RPC transitorio: breve reposo entre envíos
    }
    open = seeded();
    if (open.length >= 12) return open;
    if (pass < maxPasses) await sleep(4_000);
  }
  return open;
}

test.beforeAll(() => {
  test.setTimeout(540_000); // 12 tx minadas ≈ 2 s/bloque en el RPC académico
  // estado determinista: cierra lo abierto y siembra exactamente 12 flujos
  for (const r of openOutflows()) cast('send', 'closeFlow(address)', r);
  return seedTwelveFlows().then((open) => {
    expect(open.length, `on-chain: 12 flujos SEED abiertos tras 8 pasadas (hay ${open.length})`).toBe(12);
  });
});

test.afterAll(async () => {
  test.setTimeout(300_000);
  for (const r of openOutflows()) cast('send', 'closeFlow(address)', r);
  await sleep(2_000);
  // pasadas de cierre: el RPC puede descartar txs transitoriamente
  for (let i = 0; i < 3 && openOutflows().length > 0; i++) {
    for (const r of openOutflows()) cast('send', 'closeFlow(address)', r);
    await sleep(2_000);
  }
  // restaura el flujo canónico #0→#1 que otras specs esperan encontrar (o crear)
  cast('send', 'createFlow(address,int96)', RECV1, RATE);
});

test('RE-03b · 12 flujos → página 1 con 10 filas y página 2 con 2', async ({ page }) => {
  test.setTimeout(LONG);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await injectWalletMock(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Conectar MetaMask/ }).click();

  // el sondeo (5 s base) debe publicar los 12 flujos salientes
  await expect(page.getByText('Mis streams salientes (12)')).toBeVisible({ timeout: LONG });

  const body = page.getByRole('table').locator('tbody');
  await expect(body.locator('tr')).toHaveCount(10, { timeout: LONG });

  const nav = page.getByRole('navigation', { name: 'paginación de streams' }); // D13 accesible
  await expect(nav).toBeVisible();
  await expect(nav.getByText('página 1/2')).toBeVisible();
  await expect(nav.getByRole('button', { name: '← Anterior' })).toBeDisabled();
  await expect(nav.getByRole('button', { name: 'Siguiente →' })).toBeEnabled();

  // las 10 filas visibles deben coincidir con los 10 primeros receptores sembrados
  const firstPageTxt = await body.innerText();
  expect(firstPageTxt).toContain(FIRST_ROW_LABEL); // destino 1 recortado (slice 0..10)
  expect(firstPageTxt).toContain('0.000771');      // rate canónico 2000 EUR/mes
  expect(firstPageTxt).toContain('Activo');

  await nav.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(nav.getByText('página 2/2')).toBeVisible({ timeout: LONG });
  await expect(body.locator('tr')).toHaveCount(2, { timeout: LONG }); // última página incompleta
  await expect(nav.getByRole('button', { name: 'Siguiente →' })).toBeDisabled();
  await expect(nav.getByRole('button', { name: '← Anterior' })).toBeEnabled();

  await nav.getByRole('button', { name: '← Anterior' }).click();
  await expect(nav.getByText('página 1/2')).toBeVisible({ timeout: LONG });
  await expect(body.locator('tr')).toHaveCount(10, { timeout: LONG });

  expect(errors, errors.join(' | ')).toEqual([]);
});
