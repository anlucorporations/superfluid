import { ethers } from "ethers";
import { BRLT_ABI, BRLTX_ABI, FLOW_TUPLE, type OnChainFlow } from "./contracts";
import { getSystemConfig } from "./repositories/system";
import { rpc } from "./rpc";
import type { FlowStatus, TreasuryDto } from "./types";

/**
 * Lecturas on-chain desde el servidor mediante `eth_call` crudo (sin provider).
 * Se usan para reconciliar el estado real de los flujos con MongoDB (H4/H6).
 */

const brltInterface = new ethers.utils.Interface(BRLT_ABI);
const brltXInterface = new ethers.utils.Interface(BRLTX_ABI);
const flowTupleCoder = ethers.utils.defaultAbiCoder;

async function call(rpcUrl: string, to: string, data: string): Promise<string> {
  return rpc<string>(rpcUrl, "eth_call", [{ to, data }, "latest"]);
}

export async function getFlowOnChain(flowId: string): Promise<OnChainFlow | null> {
  const config = await getSystemConfig();
  if (!config.brltXAddress) return null;
  try {
    const data = brltXInterface.encodeFunctionData("getFlow", [flowId]);
    const raw = await call(config.rpcUrl, config.brltXAddress, data);
    const [decoded] = flowTupleCoder.decode([FLOW_TUPLE], raw) as [
      {
        flowRate: ethers.BigNumber;
        startedAt: ethers.BigNumber;
        endsAt: ethers.BigNumber;
        lastSettledAt: ethers.BigNumber;
        pausedAt: ethers.BigNumber;
        rateBeforePause: ethers.BigNumber;
        deposited: ethers.BigNumber;
        settled: ethers.BigNumber;
        sender: string;
        receiver: string;
        paused: boolean;
        terminated: boolean;
      },
    ];
    if (decoded.sender === ethers.constants.AddressZero) return null;
    return {
      flowRate: BigInt(decoded.flowRate.toString()),
      startedAt: decoded.startedAt.toNumber(),
      endsAt: decoded.endsAt.toNumber(),
      lastSettledAt: decoded.lastSettledAt.toNumber(),
      pausedAt: decoded.pausedAt.toNumber(),
      rateBeforePause: BigInt(decoded.rateBeforePause.toString()),
      deposited: BigInt(decoded.deposited.toString()),
      settled: BigInt(decoded.settled.toString()),
      sender: decoded.sender,
      receiver: decoded.receiver,
      paused: decoded.paused,
      terminated: decoded.terminated,
    };
  } catch {
    return null;
  }
}

export async function getPendingOnChain(flowId: string): Promise<bigint | null> {
  const config = await getSystemConfig();
  if (!config.brltXAddress) return null;
  try {
    const data = brltXInterface.encodeFunctionData("getPending", [flowId]);
    const raw = await call(config.rpcUrl, config.brltXAddress, data);
    return BigInt(ethers.utils.defaultAbiCoder.decode(["uint256"], raw)[0].toString());
  } catch {
    return null;
  }
}

/** Estado visible del flujo combinando `terminated`, `paused` y `endsAt`. */
export function deriveFlowStatus(flow: {
  terminated: boolean;
  paused: boolean;
  endsAt: number;
}): FlowStatus {
  if (flow.terminated) return "terminado";
  if (flow.paused) return "pausado";
  if (flow.endsAt * 1000 <= Date.now()) return "vencido";
  return "activo";
}

/** Balances de una wallet para la Suite del Empleado (H5). */
export interface SuiteBalancesDto {
  /** BRLT ya en la wallet (wei). */
  walletBrlt: string;
  /** BrltX en cartera, cobrable de inmediato con `downgrade` (wei). */
  walletBrltx: string;
  /** `getRealtimeBalance`: BrltX + devengo pendiente de todos sus flujos (wei). */
  cobrable: string;
}

export async function getSuiteBalances(wallet: string): Promise<SuiteBalancesDto | null> {
  const config = await getSystemConfig();
  if (!config.brltAddress || !config.brltXAddress) return null;
  try {
    const [brltRaw, brltxRaw, realtimeRaw] = await Promise.all([
      call(
        config.rpcUrl,
        config.brltAddress,
        brltInterface.encodeFunctionData("balanceOf", [wallet]),
      ),
      call(
        config.rpcUrl,
        config.brltXAddress,
        brltXInterface.encodeFunctionData("balanceOf", [wallet]),
      ),
      call(
        config.rpcUrl,
        config.brltXAddress,
        brltXInterface.encodeFunctionData("getRealtimeBalance", [wallet]),
      ),
    ]);
    const decodeUint = (raw: string) =>
      ethers.utils.defaultAbiCoder.decode(["uint256"], raw)[0].toString();
    return {
      walletBrlt: decodeUint(brltRaw),
      walletBrltx: decodeUint(brltxRaw),
      cobrable: decodeUint(realtimeRaw),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Verificación de transacciones firmadas por el empleado (H5, CU-16)
// ---------------------------------------------------------------------------

export interface VerifiedAction {
  from: string;
  operacion: "cobro" | "liquidacion";
  flowId?: string;
  amount?: string;
}

/**
 * Lee el recibo de una transacción real y verifica que el firmante sea la wallet
 * que declara la Suite y que el evento corresponda a la operación.
 * Nunca se confía en lo que envía el cliente: se comprueba contra la cadena.
 */
export async function verifyWalletAction(
  txHash: string,
  walletLower: string,
  operacion: "cobro" | "liquidacion",
  expectedFlowId?: string,
): Promise<VerifiedAction | null> {
  const config = await getSystemConfig();
  if (!config.brltXAddress) return null;
  try {
    const receipt = await rpc<{
      from: string;
      status: string | number;
      logs: { topics: string[]; data: string }[];
    } | null>(config.rpcUrl, "eth_getTransactionReceipt", [txHash]);
    if (!receipt || Number(receipt.status) !== 1) return null;
    if (receipt.from.toLowerCase() !== walletLower) return null;

    for (const log of receipt.logs as { topics: string[]; data: string }[]) {
      try {
        const parsed = brltXInterface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (operacion === "cobro" && parsed.name === "Downgraded") {
          if (String(parsed.args.account).toLowerCase() !== walletLower) continue;
          return {
            from: receipt.from,
            operacion: "cobro",
            amount: parsed.args.amount.toString(),
          };
        }
        if (operacion === "liquidacion" && parsed.name === "FlowSettled") {
          const flowId = parsed.args.flowId.toString();
          if (expectedFlowId && flowId !== expectedFlowId) continue;
          if (String(parsed.args.receiver).toLowerCase() !== walletLower) continue;
          return {
            from: receipt.from,
            operacion: "liquidacion",
            flowId,
            amount: parsed.args.amount.toString(),
          };
        }
      } catch {
        // log de otro contrato
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function getTreasury(adminWallet: string): Promise<TreasuryDto | null> {
  const config = await getSystemConfig();
  if (!config.brltAddress || !config.brltXAddress) return null;
  try {
    const [balance, allowance] = await Promise.all([
      call(
        config.rpcUrl,
        config.brltAddress,
        brltInterface.encodeFunctionData("balanceOf", [adminWallet]),
      ),
      call(
        config.rpcUrl,
        config.brltAddress,
        brltInterface.encodeFunctionData("allowance", [adminWallet, config.brltXAddress]),
      ),
    ]);
    const [brltXBalance, supply, escrow, backing, brltSupply] = await Promise.all([
      call(
        config.rpcUrl,
        config.brltXAddress,
        brltXInterface.encodeFunctionData("balanceOf", [adminWallet]),
      ),
      call(config.rpcUrl, config.brltXAddress, brltXInterface.encodeFunctionData("totalSupply")),
      call(config.rpcUrl, config.brltXAddress, brltXInterface.encodeFunctionData("totalEscrow")),
      call(config.rpcUrl, config.brltXAddress, brltXInterface.encodeFunctionData("brltBacking")),
      call(config.rpcUrl, config.brltAddress, brltInterface.encodeFunctionData("totalSupply")),
    ]);
    const decodeUint = (raw: string) =>
      ethers.utils.defaultAbiCoder.decode(["uint256"], raw)[0].toString();
    return {
      adminBrlt: decodeUint(balance),
      adminBrltX: decodeUint(brltXBalance),
      allowance: decodeUint(allowance),
      brltXSupply: decodeUint(supply),
      escrow: decodeUint(escrow),
      backing: decodeUint(backing),
      totalSupplyBrlt: decodeUint(brltSupply),
    };
  } catch {
    return null;
  }
}
