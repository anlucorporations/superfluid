"use client";

import { ethers } from "ethers";
import { BRLT_ABI, BRLTX_ABI } from "../contracts";
import { getEthereum } from "./wallet";

/**
 * Operaciones on-chain firmadas por el administrador desde el navegador (H4).
 * La app nunca custodia claves: todo se firma con la wallet conectada.
 */

export interface TxResult {
  hash: string;
  blockNumber: number;
  /** Valor devuelto por la función (flowId, importes…), si aplica. */
  value?: string;
}

function provider(): ethers.providers.Web3Provider {
  const ethereum = getEthereum();
  if (!ethereum) throw new Error("No se detecta una wallet en el navegador");
  return new ethers.providers.Web3Provider(ethereum as never);
}

function signer(address: string): ethers.providers.JsonRpcSigner {
  return provider().getSigner(address);
}

export interface BrltContract extends ethers.Contract {
  balanceOf(address: string): Promise<ethers.BigNumber>;
  allowance(owner: string, spender: string): Promise<ethers.BigNumber>;
  approve(
    spender: string,
    amount: ethers.BigNumberish,
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransaction>;
  mint(
    to: string,
    amount: ethers.BigNumberish,
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransaction>;
  burn(
    amount: ethers.BigNumberish,
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransaction>;
  totalSupply(): Promise<ethers.BigNumber>;
  minter(): Promise<string>;
}

export interface BrltXContract extends ethers.Contract {
  wrapAndCreateFlow(
    amount: ethers.BigNumberish,
    receiver: string,
    durationSeconds: ethers.BigNumberish,
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransaction>;
  updateFlow(
    flowId: ethers.BigNumberish,
    newFlowRate: ethers.BigNumberish,
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransaction>;
  deleteFlow(
    flowId: ethers.BigNumberish,
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransaction>;
  settleFlow(
    flowId: ethers.BigNumberish,
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransaction>;
  downgrade(
    amount: ethers.BigNumberish,
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransaction>;
  changeReceiver(
    flowId: ethers.BigNumberish,
    newReceiver: string,
    overrides?: ethers.Overrides,
  ): Promise<ethers.ContractTransaction>;
  getFlow(flowId: ethers.BigNumberish): Promise<unknown>;
  balanceOf(address: string): Promise<ethers.BigNumber>;
}

export function brltContract(address: string, account: string): BrltContract {
  return new ethers.Contract(address, BRLT_ABI, signer(account)) as BrltContract;
}

export function brltXContract(address: string, account: string): BrltXContract {
  return new ethers.Contract(address, BRLTX_ABI, signer(account)) as BrltXContract;
}

async function wait(tx: ethers.ContractTransaction, value?: unknown): Promise<TxResult> {
  const receipt = await tx.wait();
  return {
    hash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    value: value === undefined ? undefined : String(value),
  };
}

export async function approveBrlt(
  brltAddress: string,
  brltXAddress: string,
  account: string,
  amount: bigint,
): Promise<TxResult> {
  const tx = await brltContract(brltAddress, account).approve(
    brltXAddress,
    ethers.BigNumber.from(amount.toString()),
    { gasLimit: 80_000 },
  );
  return wait(tx);
}

export async function createFlow(input: {
  brltXAddress: string;
  account: string;
  amount: bigint;
  receiver: string;
  durationSeconds: number;
}): Promise<TxResult> {
  const contract = brltXContract(input.brltXAddress, input.account);
  const tx = await contract.wrapAndCreateFlow(
    ethers.BigNumber.from(input.amount.toString()),
    input.receiver,
    input.durationSeconds,
    { gasLimit: 500_000 },
  );
  const receipt = await tx.wait();
  // `FlowCreated` es el evento del contrato; se extrae el flowId del primer log.
  let flowId: string | undefined;
  const iface = new ethers.utils.Interface(BRLTX_ABI);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed.name === "FlowCreated") {
        flowId = parsed.args.flowId.toString();
        break;
      }
    } catch {
      // log de otro contrato
    }
  }
  return { hash: receipt.transactionHash, blockNumber: receipt.blockNumber, value: flowId };
}

export async function pauseFlow(brltXAddress: string, account: string, flowId: string): Promise<TxResult> {
  // H6: la estimación del nodo se queda corta con accesos en frío; se envía límite fijo.
  const tx = await brltXContract(brltXAddress, account).updateFlow(flowId, 0, {
    gasLimit: 350_000,
  });
  return wait(tx);
}

export async function resumeFlow(
  brltXAddress: string,
  account: string,
  flowId: string,
  flowRate: string,
): Promise<TxResult> {
  const tx = await brltXContract(brltXAddress, account).updateFlow(flowId, flowRate, {
    gasLimit: 500_000,
  });
  return wait(tx);
}

export async function terminateFlow(brltXAddress: string, account: string, flowId: string): Promise<TxResult> {
  const tx = await brltXContract(brltXAddress, account).deleteFlow(flowId, {
    gasLimit: 500_000,
  });
  return wait(tx);
}

export async function downgradeBrltx(
  brltXAddress: string,
  account: string,
  amount: bigint,
): Promise<TxResult> {
  const tx = await brltXContract(brltXAddress, account).downgrade(
    ethers.BigNumber.from(amount.toString()),
    { gasLimit: 250_000 },
  );
  return wait(tx);
}

export async function settleFlow(brltXAddress: string, account: string, flowId: string): Promise<TxResult> {
  const tx = await brltXContract(brltXAddress, account).settleFlow(flowId, {
    gasLimit: 500_000,
  });
  return wait(tx);
}

export async function changeFlowReceiver(
  brltXAddress: string,
  account: string,
  flowId: string,
  newReceiver: string,
): Promise<TxResult> {
  const contract = brltXContract(brltXAddress, account);
  const tx = await contract.changeReceiver(flowId, newReceiver, { gasLimit: 700_000 });
  const receipt = await tx.wait();
  // `changeReceiver` cierra el flujo antiguo y ABRE uno nuevo: se devuelve su id.
  let newFlowId: string | undefined;
  const iface = new ethers.utils.Interface(BRLTX_ABI);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed.name === "FlowCreated") newFlowId = parsed.args.flowId.toString();
    } catch {
      // log de otro contrato
    }
  }
  return { hash: receipt.transactionHash, blockNumber: receipt.blockNumber, value: newFlowId };
}

export async function mintBrlt(
  brltAddress: string,
  account: string,
  to: string,
  amount: bigint,
): Promise<TxResult> {
  const tx = await brltContract(brltAddress, account).mint(to, ethers.BigNumber.from(amount.toString()), {
    gasLimit: 150_000,
  });
  return wait(tx);
}

export async function burnBrlt(
  brltAddress: string,
  account: string,
  amount: bigint,
): Promise<TxResult> {
  const tx = await brltContract(brltAddress, account).burn(ethers.BigNumber.from(amount.toString()), {
    gasLimit: 150_000,
  });
  return wait(tx);
}
