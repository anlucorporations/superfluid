'use client';
// RT-07: capa Superfluid con las 6 firmas del brief + pauseFlow/resumeFlow/closeFlow/
// settle/claimSettled/getAccountInfo. D2: ninguna clave privada aquí; la firma ocurre
// en MetaMask (o lectura pura por JsonRpcProvider si no hay wallet).

import { ethers } from 'ethers';

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (arg: unknown) => void): void;
}

function getEth(): EthereumProvider | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { ethereum?: EthereumProvider }).ethereum;
}

class WalletRejected extends Error { constructor(public code?: number, msg = 'wallet rejected') { super(msg); } }

import { CHAIN, CONTRACTS, RATE_WEI_PER_SEC } from '@/config/web3';
import EUR_ABI from '@/abi/EUR.json';
import EURX_ABI from '@/abi/EURx.json';

export type FlowStatus = 0 | 1 | 2 | 3; // None/Active/Paused/Closed

// ethers v5 devuelve BigNumber; se normaliza a bigint en la frontera de lectura.
type Numeric = { toString(): string };
const B = (v: Numeric | bigint | number): bigint =>
  typeof v === 'bigint' ? v : BigInt(v.toString());

export interface FlowInfo {
  flowRate: bigint;
  status: FlowStatus;
  accumulatedBalance: bigint;
  virtualDevengo: bigint;
}

export interface AccountInfo {
  netFlowRate: bigint;
  netOutflowGarantizado: bigint;
  depositTotal: bigint;
  settledUpTo: bigint;
  pendingDeficit: bigint;
}

let readProvider: ethers.providers.JsonRpcProvider | null = null;
export function getReadProvider() {
  if (!readProvider) readProvider = new ethers.providers.JsonRpcProvider(CHAIN.rpcUrl);
  return readProvider;
}

async function eurx(readonly: boolean): Promise<ethers.Contract> {
  const signerOrProvider = readonly ? getReadProvider() : await requireSigner();
  return new ethers.Contract(CONTRACTS.EURx, EURX_ABI, signerOrProvider);
}

async function euroToken(readonly: boolean): Promise<ethers.Contract> {
  const signerOrProvider = readonly ? getReadProvider() : await requireSigner();
  return new ethers.Contract(CONTRACTS.EUR, EUR_ABI, signerOrProvider);
}

async function requireSigner(): Promise<ethers.Signer> {
  const eth = getEth();
  if (!eth) throw new Error('NO_WALLET: conecta MetaMask para firmar');
  const provider = new ethers.providers.Web3Provider(eth as never);
  const net = await provider.getNetwork();
  if (net.chainId !== CHAIN.chainId) {
    throw new Error('NETWORK_MISMATCH: la wallet está en otra red (cambia a Codecrypto ' + CHAIN.chainId + ')');
  }
  const signer = provider.getSigner();
  if (!signer) throw new Error('NO_ACCOUNT: desbloquea tu cuenta');
  return signer;
}

// ------------------------------------------------------------------ wallet (CU-09)
export async function connectWallet(): Promise<string[]> {
  const eth = getEth();
  if (!eth) return [];
  const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
  const chainHex = '0x' + CHAIN.chainId.toString(16);
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
  } catch (err) {
    const code = (err as WalletRejected)?.code ?? (err as { code?: number })?.code;
    if (code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: chainHex,
          chainName: CHAIN.name,
          nativeCurrency: { name: 'CC', symbol: 'CC', decimals: 18 },
          rpcUrls: [CHAIN.rpcUrl],
        }],
      });
    } else if (code === 4001) {
      // RE-09: usuario rechazó → modo solo lectura sin bucle
    }
  }
  return accounts;
}

export async function activeChainId(): Promise<number | null> {
  const eth = getEth();
  if (!eth) return null;
  const hex = (await eth.request({ method: 'eth_chainId' })) as string;
  return parseInt(hex, 16);
}

// ------------------------------------------------------------- wrap / unwrap (CU-01/02)
// Gas con techo explícito: el estimateGas del QBFT académico es intermitente
// (relojes desincronizados entre validadores inflan el devengo simulado → revert
// espurio en la estimación que NO ocurre al minar). Sobran sobra: se devuelve.
const GAS = {
  approve: 120_000n, upgrade: 260_000n, downgrade: 300_000n,
  createFlow: 450_000n, pause: 220_000n, resume: 200_000n,
  close: 320_000n, settle: 2_000_000n, claim: 300_000n,
} as const;

export async function upgradeToEuroX(amountWei: bigint): Promise<ethers.ContractReceipt> {
  const token = await euroToken(false);
  await (await token.approve(CONTRACTS.EURx, amountWei, { gasLimit: GAS.approve })).wait();
  const x = await eurx(false);
  const tx = await x.upgradeTo(amountWei, { gasLimit: GAS.upgrade });
  return tx.wait();
}

export async function downgradeFromEuroX(amountWei: bigint): Promise<ethers.ContractReceipt> {
  const x = await eurx(false);
  const tx = await x.downgradeTo(amountWei, { gasLimit: GAS.downgrade });
  return tx.wait();
}

// ------------------------------------------------------------------ flows (CU-03..06)
export async function createFlow(receiver: string, rateWeiPerSec: bigint = RATE_WEI_PER_SEC): Promise<ethers.ContractReceipt> {
  const x = await eurx(false);
  const tx = await x.createFlow(receiver, rateWeiPerSec, { gasLimit: GAS.createFlow });
  return tx.wait();
}

/// alias del brief: deleteFlow = cerrar + liberar (resolución H-03/D10)
export async function deleteFlow(receiver: string): Promise<ethers.ContractReceipt> {
  return closeFlow(receiver);
}

export async function closeFlow(receiver: string): Promise<ethers.ContractReceipt> {
  const x = await eurx(false);
  const tx = await x.closeFlow(receiver, { gasLimit: GAS.close });
  return tx.wait();
}

export async function pauseFlow(receiver: string): Promise<ethers.ContractReceipt> {
  const x = await eurx(false);
  const tx = await x.pauseFlow(receiver, { gasLimit: GAS.pause });
  return tx.wait();
}

export async function resumeFlow(receiver: string): Promise<ethers.ContractReceipt> {
  const x = await eurx(false);
  const tx = await x.resumeFlow(receiver, { gasLimit: GAS.resume });
  return tx.wait();
}

// ------------------------------------------------------------ insolvencia (CU-07)
export async function settle(account: string): Promise<ethers.ContractReceipt> {
  const x = await eurx(false);
  const tx = await x.settle(account, { gasLimit: GAS.settle });
  return tx.wait();
}

export async function claimSettled(from: string): Promise<ethers.ContractReceipt> {
  const x = await eurx(false);
  const tx = await x.claimSettled(from, { gasLimit: GAS.claim });
  return tx.wait();
}

// ------------------------------------------------------------------ vistas (CU-13)
export async function getFlow(sender: string, receiver: string): Promise<FlowInfo | null> {
  const x = await eurx(true);
  const [flowRate, status, acc, virtual] = await x.getFlow(sender, receiver);
  const st = Number(status) as FlowStatus;
  if (st === 0 && flowRate.isZero?.()) return null;
  return { flowRate: B(flowRate), status: st, accumulatedBalance: B(acc), virtualDevengo: B(virtual) };
}

export async function getAccountInfo(account: string): Promise<AccountInfo> {
  const x = await eurx(true);
  const [net, g, dep, st, def] = await x.getAccountInfo(account);
  return { netFlowRate: B(net), netOutflowGarantizado: B(g), depositTotal: B(dep), settledUpTo: B(st), pendingDeficit: B(def) };
}

export async function getRealtimeBalance(account: string): Promise<{
  real: bigint; virtual: bigint; eur: bigint; owed: bigint; info: AccountInfo;
}> {
  const x = await eurx(true);
  const token = await euroToken(true);
  const [real, virtual, eur, owed, info] = await Promise.all([
    x.realBalanceOf(account),
    x.virtualBalanceOf(account),
    token.balanceOf(account),
    x.owedTotalOf(account),
    getAccountInfo(account),
  ]);
  return { real: B(real), virtual: B(virtual), eur: B(eur), owed: B(owed), info };
}

export async function getOpenOutflows(sender: string): Promise<string[]> {
  const x = await eurx(true);
  return x.getOpenOutflows(sender);
}

export async function incomingUnclaimed(receiver: string, senders: string[]): Promise<{ total: bigint; perSender: bigint[] }> {
  if (!senders.length) return { total: BigInt(0), perSender: [] };
  const x = await eurx(true);
  const [total, per] = await x.incomingUnclaimed(receiver, senders);
  return { total: B(total), perSender: (per as { toString(): string }[]).map(B) };
}

/// Traducción de errores de contrato a mensajes UI (D7).
/// Fase 4 (pruebas): el cuerpo es lógica pura y vive en lib/ui-logic.ts; se reexporta
/// desde este módulo para conservar los import existentes de la UI.
export { humanizeError } from './ui-logic';

