import { Contract, Interface, JsonRpcProvider } from 'ethers';
import type { FlowStatus } from './domain/types.js';
import type { TxObservation } from './domain/provisional.js';

export interface FlowState {
  flowRateWei: bigint;
  status: FlowStatus;
  virtualBalanceWei: bigint;
}

export interface IndexedLog {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
  eventType:
    | 'flow_created'
    | 'flow_updated'
    | 'flow_paused'
    | 'flow_resumed'
    | 'flow_closed'
    | 'flow_deleted'
    | 'settled'
    | 'claimed';
  sender?: string;
  receiver?: string;
  flowRateWei?: bigint;
  amountWei?: bigint;
  payload: Record<string, unknown>;
}

export interface ChainClient {
  blockNumber(): Promise<number>;
  getFlow(sender: string, receiver: string): Promise<FlowState>;
  getTransactionObservation(txHash: string): Promise<TxObservation | null>;
  getLogs(fromBlock: number, toBlock: number): Promise<IndexedLog[]>;
}

/** ABI mínima de BarloventoTx (lecturas + eventos usados por el indexador). */
export const BRLTX_ABI = [
  'function getFlow(address sender, address receiver) view returns (int96 flowRate, uint8 status, uint128 accumulatedBalance, int256 virtualDevengo)',
  'function getAccountInfo(address account) view returns (int96 netFlowRate, int96 netOutflowGarantizado, uint256 depositTotal, uint40 settledUpTo, uint256 pendingDeficit)',
  'function virtualBalanceOf(address account) view returns (int256)',
  'event Wrapped(address indexed account, uint256 amount)',
  'event Unwrapped(address indexed account, uint256 amount)',
  'event FlowCreated(address indexed sender, address indexed receiver, int96 flowRate)',
  'event FlowPaused(address indexed sender, address indexed receiver)',
  'event FlowResumed(address indexed sender, address indexed receiver)',
  'event FlowClosed(address indexed sender, address indexed receiver, uint256 deltaLiquidated)',
  'event Settled(address indexed insolvent, uint256 settledUpTo, uint256 deficit)',
  'event Claimed(address indexed receiver, address indexed sender, uint256 amount)',
  // Operaciones usadas para interpretar la tx observada (validateAuthorize/D44/V2-05).
  'function createFlow(address receiver, int96 rate)',
  'function updateFlow(address receiver, int96 rate)',
  'function closeFlow(address receiver)',
  'function pauseFlow(address receiver)',
  'function resumeFlow(address receiver)',
  'function upgradeTo(uint256 amount)',
  'function downgradeTo(uint256 amount)',
] as const;

const STATUS: Record<number, FlowStatus> = { 1: 'active', 2: 'paused', 3: 'closed' };

export function createEthersChain(rpcUrl: string, superTokenAddress: string): ChainClient {
  const provider = new JsonRpcProvider(rpcUrl);
  const iface = new Interface(BRLTX_ABI as unknown as string[]);
  const contract = new Contract(superTokenAddress, BRLTX_ABI as unknown as string[], provider);

  return {
    async blockNumber() {
      return provider.getBlockNumber();
    },

    async getFlow(sender: string, receiver: string): Promise<FlowState> {
      const getFlowFn = contract.getFunction('getFlow') as (
        ...args: unknown[]
      ) => Promise<unknown[]>;
      const [flowRate, status, , virtualDevengo] = (await getFlowFn(sender, receiver)) as [
        bigint,
        bigint,
        bigint,
        bigint,
      ];
      return {
        flowRateWei: BigInt(flowRate),
        status: STATUS[Number(status)] ?? 'closed',
        virtualBalanceWei: BigInt(virtualDevengo),
      };
    },

    async getTransactionObservation(txHash: string): Promise<TxObservation | null> {
      const tx = await provider.getTransaction(txHash);
      if (!tx) return null;
      let method = '';
      let receiver = '';
      let flowRateWei = 0n;
      try {
        const parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
        method = parsed?.name ?? '';
        if (method === 'createFlow') {
          receiver = String(parsed?.args[0]);
          flowRateWei = BigInt(parsed?.args[1]);
        }
      } catch {
        return null;
      }
      return {
        from: tx.from,
        to: tx.to ?? '',
        method,
        receiver,
        flowRateWei,
        // Ejecutable: hay signer y nonce no consumido (aproximación; el nodo valida).
        executable: tx.from !== undefined && tx.nonce !== undefined,
      };
    },

    async getLogs(fromBlock: number, toBlock: number): Promise<IndexedLog[]> {
      const logs = await provider.getLogs({
        address: superTokenAddress,
        fromBlock,
        toBlock,
      });
      const out: IndexedLog[] = [];
      for (const log of logs) {
        try {
          const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
          if (!parsed) continue;
          const map: Record<string, IndexedLog['eventType']> = {
            FlowCreated: 'flow_created',
            FlowPaused: 'flow_paused',
            FlowResumed: 'flow_resumed',
            FlowClosed: 'flow_closed',
            Settled: 'settled',
            Claimed: 'claimed',
          };
          const eventType = map[parsed.name];
          if (!eventType) continue;
          out.push({
            txHash: log.transactionHash,
            logIndex: log.index,
            blockNumber: log.blockNumber,
            blockHash: log.blockHash,
            eventType,
            sender: parsed.args['sender'] as string | undefined,
            receiver: parsed.args['receiver'] as string | undefined,
            flowRateWei:
              parsed.name === 'FlowCreated' ? BigInt(parsed.args['flowRate'] as bigint) : undefined,
            amountWei:
              parsed.name === 'FlowClosed' || parsed.name === 'Settled' || parsed.name === 'Claimed'
                ? BigInt(parsed.args[2] as bigint)
                : undefined,
            payload: { name: parsed.name },
          });
        } catch {
          // log no parseable: se ignora y queda trazado por el checkpoint
        }
      }
      return out;
    },
  };
}
