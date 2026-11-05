/**
 * ABIs mínimas de los contratos de H1 (human-readable, compatibles con ethers 5).
 * Se comparten entre cliente (firma con MetaMask) y servidor (lecturas `eth_call`).
 */

export const BRLT_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
  "function burn(uint256 amount)",
  "function minter() view returns (address)",
  "function owner() view returns (address)",
  "function MAX_SUPPLY() view returns (uint256)",
];

export const BRLTX_ABI = [
  "function brlt() view returns (address)",
  "function lastFlowId() view returns (uint256)",
  "function totalEscrow() view returns (uint256)",
  "function brltBacking() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function getFlow(uint256 flowId) view returns (tuple(uint128 flowRate, uint64 startedAt, uint64 endsAt, uint64 lastSettledAt, uint64 pausedAt, uint256 rateBeforePause, uint256 deposited, uint256 settled, address sender, address receiver, bool paused, bool terminated))",
  "function getPending(uint256 flowId) view returns (uint256)",
  "function getRealtimeBalance(address account) view returns (uint256)",
  "function getFlowIdsBySender(address sender) view returns (uint256[])",
  "function getFlowIdsByReceiver(address receiver) view returns (uint256[])",
  "function wrapAndCreateFlow(uint256 amount, address receiver, uint64 durationSeconds) returns (uint256)",
  "function updateFlow(uint256 flowId, uint128 newFlowRate)",
  "function deleteFlow(uint256 flowId) returns (uint256 paid, uint256 returnedAmount)",
  "function settleFlow(uint256 flowId) returns (uint256 paid, uint256 returnedAmount)",
  "function changeReceiver(uint256 flowId, address newReceiver) returns (uint256 newFlowId)",
  "function upgrade(uint256 amount)",
  "function downgrade(uint256 amount)",
  "event FlowCreated(uint256 indexed flowId, address indexed sender, address indexed receiver, uint256 amount, uint256 flowRate, uint64 endsAt)",
  "event FlowUpdated(uint256 indexed flowId, address indexed sender, address indexed receiver, uint256 oldFlowRate, uint256 newFlowRate)",
  "event FlowSettled(uint256 indexed flowId, address indexed sender, address indexed receiver, uint256 amount, uint256 cumulative)",
  "event FlowDeleted(uint256 indexed flowId, address indexed sender, address indexed receiver, uint256 paid, uint256 returnedAmount)",
  "event FlowExpired(uint256 indexed flowId, address indexed sender, address indexed receiver, uint256 paid, uint256 returnedAmount)",
  "event Upgraded(address indexed account, uint256 amount)",
  "event Downgraded(address indexed account, uint256 amount)",
  "event DurationAllowed(uint64 duration, bool allowed)",
];

/** Orden exacto de los campos del struct `Flow` (para decodificar `eth_call`). */
export const FLOW_TUPLE =
  "tuple(uint128 flowRate,uint64 startedAt,uint64 endsAt,uint64 lastSettledAt,uint64 pausedAt,uint256 rateBeforePause,uint256 deposited,uint256 settled,address sender,address receiver,bool paused,bool terminated)";

export interface OnChainFlow {
  flowRate: bigint;
  startedAt: number;
  endsAt: number;
  lastSettledAt: number;
  pausedAt: number;
  rateBeforePause: bigint;
  deposited: bigint;
  settled: bigint;
  sender: string;
  receiver: string;
  paused: boolean;
  terminated: boolean;
}

/** Selectores de función (calculados una vez con ethers en `flows-onchain.ts`). */
export const FLOW_FUNCTION_SIGNATURE =
  "getFlow(uint256) returns (tuple(uint128,uint64,uint64,uint64,uint64,uint256,uint256,uint256,address,address,bool,bool))";
