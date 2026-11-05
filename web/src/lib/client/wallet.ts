"use client";

import { ethers } from "ethers";
import { publicEnv } from "../env";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export function getEthereum(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export function hasWallet(): boolean {
  return Boolean(getEthereum());
}

export async function connectWallet(): Promise<string> {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error("No se detecta una wallet (MetaMask) en el navegador");
  const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts[0]) throw new Error("La wallet no devolvió ninguna cuenta");
  return ethers.utils.getAddress(accounts[0]);
}

export async function currentChainId(): Promise<number> {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error("No se detecta una wallet en el navegador");
  const hex = (await ethereum.request({ method: "eth_chainId" })) as string;
  return Number.parseInt(hex, 16);
}

export async function ensureChain(chainId = publicEnv.chainId): Promise<void> {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error("No se detecta una wallet en el navegador");
  const current = await currentChainId();
  if (current === chainId) return;

  const hexChainId = `0x${chainId.toString(16)}`;
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexChainId,
          chainName: "Besu Codecrypto",
          nativeCurrency: { name: "Codecrypto", symbol: "CC", decimals: 18 },
          rpcUrls: [publicEnv.rpcUrl],
          blockExplorerUrls: [],
        },
      ],
    });
  }
}

function signerFor(address: string): ethers.providers.JsonRpcSigner {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error("No se detecta una wallet en el navegador");
  const provider = new ethers.providers.Web3Provider(ethereum as never);
  return provider.getSigner(address);
}

export async function signMessage(address: string, message: string): Promise<string> {
  return signerFor(address).signMessage(message);
}

export async function signTypedData(
  address: string,
  domain: ethers.TypedDataDomain,
  types: Record<string, ethers.TypedDataField[]>,
  value: Record<string, unknown>,
): Promise<string> {
  return signerFor(address)._signTypedData(domain, types, value);
}

/** Abrevia una address para mostrarla en la UI. */
export function shortAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
