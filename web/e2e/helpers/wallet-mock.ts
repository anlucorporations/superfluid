import type { Page } from '@playwright/test';

// Mock EIP-1193 con firma local usando la pk PÚBLICA del curso (cuenta #0 Anvil).
// Solo E2E contra red educativa; prohibido en producción o con fondos reales.
export const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
export const TEST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
export const RPC = 'https://besu.alumnos.codecrypto.academy';

const ETHERS_BUNDLE_PATH = require.resolve('ethers/dist/ethers.umd.min.js');

export async function injectWalletMock(page: Page, pk: string = TEST_PK) {
  const fs = await import('node:fs');
  const ethersSrc = fs.readFileSync(ETHERS_BUNDLE_PATH, 'utf8');
  await page.addInitScript(({ pk, ethersSrc, rpc }) => {
    // cargar ethers UMD dentro de la página antes de cualquier script de la app
    (0, eval)(ethersSrc);
    const w = window as unknown as { ethers: typeof import('ethers') };
    const provider = new w.ethers.providers.JsonRpcProvider(rpc);
    const wallet = new w.ethers.Wallet(pk, provider);
    Object.defineProperty(window, '__TEST_ADDR__', { value: wallet.address });

    const handler = {
      request: async (args: { method: string; params?: unknown[] }): Promise<unknown> => {
        const m = args.method;
        if (m === 'eth_requestAccounts' || m === 'eth_accounts') return [wallet.address];
        if (m === 'eth_chainId') return '0x13d52';
        if (m === 'wallet_switchEthereumChain' || m === 'wallet_addEthereumChain') return null;
        if (m === 'personal_sign') return wallet.signMessage(args.params?.[0] as string);
        if (m === 'eth_sendTransaction') {
          const tx = (args.params as Record<string, string>[])[0];
          const filled = await wallet.sendTransaction({
            to: tx.to,
            data: tx.data,
            value: tx.value ? parseInt(tx.value, 16) : undefined,
            gasLimit: tx.gas ? parseInt(tx.gas, 16) : undefined,
            gasPrice: tx.gasPrice ? parseInt(tx.gasPrice, 16) : undefined,
          });
          return filled.hash;
        }
        const res = await fetch(rpc, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: m, params: args.params ?? [] }),
        });
        const j = await res.json();
        if (j.error) throw new Error(j.error.message ?? 'rpc error');
        return j.result;
      },
      on: (_ev: string, _h: (a: unknown) => void) => undefined,
    };
    Object.defineProperty(window, 'ethereum', { value: handler, configurable: true });
  }, { pk, ethersSrc, rpc: RPC });
}
