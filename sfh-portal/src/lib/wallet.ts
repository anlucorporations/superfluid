import { createWalletClient, custom, type Address } from 'viem';
import { besu } from './chain';

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, cb: (...args: unknown[]) => void): void;
  removeListener?(event: string, cb: (...args: unknown[]) => void): void;
}

export function ethereum(): EthereumProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum;
}

export async function currentAccounts(): Promise<Address[]> {
  const eth = ethereum();
  if (!eth) return [];
  try {
    return (await eth.request({ method: 'eth_accounts' })) as Address[];
  } catch {
    return [];
  }
}

export async function connectWallet(): Promise<Address> {
  const eth = ethereum();
  if (!eth) throw new Error('No se detecta wallet inyectada (MetaMask).');
  const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
  const first = accounts[0];
  if (!first) throw new Error('La wallet no devolvió cuentas.');
  return first as Address;
}

export async function currentChainId(): Promise<number | undefined> {
  const eth = ethereum();
  if (!eth) return undefined;
  const hex = (await eth.request({ method: 'eth_chainId' })) as string;
  return Number.parseInt(hex, 16);
}

export async function ensureChain(): Promise<void> {
  const eth = ethereum();
  if (!eth) return;
  const target = besu.id;
  const current = await currentChainId();
  if (current === target) return;
  const chainIdHex = `0x${target.toString(16)}`;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
  } catch {
    await eth.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: chainIdHex,
          chainName: besu.name,
          nativeCurrency: besu.nativeCurrency,
          rpcUrls: besu.rpcUrls.default.http,
        },
      ],
    });
  }
}

export function walletFor(account: Address) {
  const eth = ethereum();
  if (!eth) throw new Error('No se detecta wallet inyectada.');
  return createWalletClient({ account, chain: besu, transport: custom(eth) });
}

export async function signBindingMessage(account: Address, message: string): Promise<`0x${string}`> {
  return walletFor(account).signMessage({ account, message });
}

export interface WriteArgs {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
}

export async function sendTx(account: Address, call: WriteArgs): Promise<`0x${string}`> {
  const client = walletFor(account);
  const fn = client.writeContract as unknown as (
    x: WriteArgs & { account: Address; chain: typeof besu },
  ) => Promise<`0x${string}`>;
  return fn({ ...call, account, chain: besu });
}
