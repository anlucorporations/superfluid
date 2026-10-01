import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { injectWalletMock } from './helpers/wallet-mock';

// CU-01..CU-06 / RF-01..RF-06: ciclo de vida completo de un stream por la UI, contra la
// red real Besu (chainId 81234) con la cuenta #0 del curso (pk pública del curso).
// Pasos serializados sobre UNA página compartida; las aserciones usan estados DURABLES
// (fila de la tabla / estado on-chain), no toasts efímeros de 6 s.

const EURX = '0x7046717d32AfcA450DC5D6e75724D4282DFAd16E';
const RPC = 'https://besu.alumnos.codecrypto.academy';
const PK0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const A0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const RECV1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // cuenta #1 del curso
const RATE = '771604938271604'; // 2000 EUR/mes (rate fijo v1)
const ROW_KEY = '0x70997970'; // la tabla recorta el destino: slice(0,10)
const LONG = 150_000; // QBFT académico bajo carga: minado + backoff del poller
const CAST = `${process.env.HOME}/.foundry/bin/cast`;

/** CLI foundry; los reverts de idempotencia devuelven null en vez de tumbar el hook. */
function cast(cmd: 'call' | 'send', sig: string, ...rest: string[]): string | null {
  const args = [cmd, EURX, sig, ...rest, '--rpc-url', RPC];
  if (cmd === 'send') args.push('--private-key', PK0, '--gas-limit', '600000');
  try {
    return execFileSync(CAST, args, { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const weiOf = (out: string | null): bigint => BigInt((out?.match(/\d+(?= \[)/)?.[0]) ?? out?.trim() ?? '0');
const openOutflows = (): string[] =>
  [...((cast('call', 'getOpenOutflows(address)(address[])', A0) ?? '').matchAll(/0x[0-9a-fA-F]{40}/g)).map((m) => m[0])];
const hasFlowTo1 = () => openOutflows().some((a) => a.toLowerCase() === RECV1.toLowerCase());

// ------------------------------------------------------------------ helpers de UI
const ALERTS = '[role="alert"]:not([id="__next-route-announcer__"])';

/**
 * Espera a que el toast anterior desaparezca (los toasts duran 6 s y la UI muestra uno
 * solo a la vez), ejecuta la acción y devuelve el texto del aviso resultante. Así el
 * fallo del test muestra el mensaje REAL de la UI en vez de un timeout opaco.
 */
async function toastAfter(action: () => Promise<void>, re: RegExp): Promise<string> {
  const page = p();
  await page.locator(ALERTS).first().waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined);
  await action();
  const alert = page.locator(ALERTS).first();
  let text = '(la UI no mostró ningún aviso en 90 s)';
  try {
    await alert.waitFor({ state: 'visible', timeout: LONG });
    text = (await alert.innerText()).trim();
  } catch { /* lo reporta la aserción siguiente */ }
  expect(text, `aviso de la UI`).toMatch(re);
  return text;
}
const flowRow = (p: Page) => p.getByRole('row').filter({ hasText: ROW_KEY }).first();
const waitFlowOnChain = (present: boolean) =>
  expect.poll(hasFlowTo1, { timeout: LONG, intervals: [2_000] }).toBe(present);

let page: Page | null = null;
let realBefore = 0n;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(240_000); // el hook hace hasta 4 pasadas de cierre por RPC lento
  // Estado determinista: cerrar cualquier flujo abierto de #0 (la corrida canónica y el
  // dashboard.spec dejan #0→#1 activo y el contrato reverte "EuroX: flow exists"). El RPC
  // QBFT del curso descarta txs transitoriamente → varias pasadas hasta vaciar el listado.
  let open = openOutflows();
  for (let pass = 1; pass <= 4 && open.length; pass++) {
    for (const r of open) cast('send', 'closeFlow(address)', r);
    await sleep(2_000);
    open = openOutflows();
  }
  expect(open, '#0 debe partir sin flujos abiertos (RPC no confirmó los cierres)').toHaveLength(0);
  realBefore = weiOf(cast('call', 'realBalanceOf(address)(uint256)', A0));
});

test.afterAll(async () => {
  test.setTimeout(240_000);
  // No dejar basura: restaura el stream canónico #0→#1 y el balance EURx de partida.
  for (let i = 0; i < 3 && !hasFlowTo1(); i++) { cast('send', 'createFlow(address,int96)', RECV1, RATE); await sleep(2_000); }
  const now = weiOf(cast('call', 'realBalanceOf(address)(uint256)', A0));
  if (realBefore > 0n && now > realBefore) cast('send', 'downgradeTo(uint256)', (now - realBefore).toString());
  if (page) await page.context().close().catch(() => undefined);
  page = null;
});

const p = () => {
  if (!page) throw new Error('la página no está inicializada (falló el paso 00)');
  return page;
};

test('00 · conecta la wallet mock (cuenta #0) y pinta balances', async ({ browser }) => {
  test.setTimeout(LONG);
  const ctx = await browser.newContext();
  page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await injectWalletMock(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Conectar MetaMask/ }).click();
  await expect(page.getByLabel('cuenta conectada')).toContainText('0xf39Fd6', { timeout: LONG });
  await expect(page.getByLabel(/Net rate/)).toContainText('/s', { timeout: LONG }); // sondeo vivo
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('01 · CU-01 wrap 5 EUR → EURx (approve + upgradeTo)', async () => {
  test.setTimeout(LONG);
  const page = p();
  const before = weiOf(cast('call', 'realBalanceOf(address)(uint256)', A0));
  await page.getByLabel('cantidad EUR a envolver').fill('5');
  await toastAfter(() => page.getByRole('button', { name: /Upgrade/ }).click(), /EUR envuelto/);
  await expect
    .poll(() => Number(weiOf(cast('call', 'realBalanceOf(address)(uint256)', A0)) - before), { timeout: LONG, intervals: [2_000] })
    .toBeGreaterThanOrEqual(5_000_000_000_000_000_000);
});

test('02 · CU-03 crear flujo a #1 pasando por el modal de irrevocabilidad (D15)', async () => {
  test.setTimeout(LONG);
  const page = p();
  await page.getByLabel('dirección Ethereum del destinatario').fill(RECV1);
  await page.getByRole('button', { name: 'Crear flujo' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('irrecuperable', { timeout: 20_000 });
  await toastAfter(() => dialog.getByRole('button', { name: /Entendido/ }).click(), /Stream creado/);
  await expect(dialog).toHaveCount(0, { timeout: 20_000 }); // se cierra YA: anti doble disparo
  await waitFlowOnChain(true);                              // prueba dura on-chain
  await expect(flowRow(page)).toContainText('Activo', { timeout: LONG });
});

test('03 · CU-05 Pausar → fila "Pausado (retiene depósito)" (RE-05a/b)', async () => {
  test.setTimeout(LONG);
  const page = p();
  await expect(flowRow(page)).toContainText('Activo', { timeout: LONG });
  await toastAfter(() => flowRow(page).getByRole('button', { name: 'Pausar' }).click(), /Flujo pausado/);
  await expect(flowRow(page)).toContainText('Pausado (retiene depósito)', { timeout: LONG });
  // cast imprime la tupla en UNA línea: "(net, garantizado, depositTotal, settledUpTo, deficit)"
  const info = (cast('call', 'getAccountInfo(address)((int256,int256,uint256,uint40,uint256))', A0) ?? '').trim();
  const fields = info.replace(/^\(/, '').replace(/\)$/, '').split(/\s*,\s*/);
  const deposit = weiOf(fields[2] ?? null);
  const garantizado = BigInt((fields[1] ?? '0').split(' ')[0]);
  expect(garantizado, 'RE-05b: netOutflowGarantizado sigue > 0 en pausa').toBeGreaterThan(0n);
  expect(deposit, 'RE-05b: la pausa retiene la garantía').toBeGreaterThan(0n);
});

test('04 · CU-05 Reanudar → vuelve a "Activo"', async () => {
  test.setTimeout(LONG);
  const page = p();
  await toastAfter(() => flowRow(page).getByRole('button', { name: 'Reanudar' }).click(), /Flujo reanudado/);
  await expect(flowRow(page)).toContainText('Activo', { timeout: LONG });
});

test('05 · CU-06 Cerrar → la fila desaparece de "Mis streams"', async () => {
  test.setTimeout(LONG);
  const page = p();
  await toastAfter(() => flowRow(page).getByRole('button', { name: 'Cerrar' }).click(), /Flujo cerrado/);
  await waitFlowOnChain(false);
  await expect(page.getByRole('row').filter({ hasText: ROW_KEY })).toHaveCount(0, { timeout: LONG });
  await expect(page.getByText('Mis streams salientes (0)')).toBeVisible({ timeout: LONG });
});

test('06 · CU-02 downgrade 4 EURx → EUR', async () => {
  test.setTimeout(LONG);
  const page = p();
  const before = weiOf(cast('call', 'realBalanceOf(address)(uint256)', A0));
  await page.getByLabel('cantidad EURx a desenvolver').fill('4');
  await toastAfter(() => page.getByRole('button', { name: /Downgrade/ }).click(), /EURx desenvuelto/);
  await expect
    .poll(() => Number(before - weiOf(cast('call', 'realBalanceOf(address)(uint256)', A0))), { timeout: LONG, intervals: [2_000] })
    .toBeGreaterThanOrEqual(4_000_000_000_000_000_000);
});
