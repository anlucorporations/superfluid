/** ABIs mínimas usadas por el portal (human-readable → parseAbi para viem). */
import { parseAbi } from 'viem';


export const erc20Abi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
]);

export const brltxAbi = parseAbi([
  'function upgradeTo(uint256 amount)',
  'function downgradeTo(uint256 amount)',
  'function createFlow(address receiver, int96 rate)',
  'function pauseFlow(address receiver)',
  'function resumeFlow(address receiver)',
  'function closeFlow(address receiver)',
  'function getFlow(address sender, address receiver) view returns (int96 flowRate, uint8 status, uint128 accumulatedBalance, int256 virtualDevengo)',
  'function getAccountInfo(address account) view returns (int96 netFlowRate, int96 netOutflowGarantizado, uint256 depositTotal, uint40 settledUpTo, uint256 pendingDeficit)',
  'function virtualBalanceOf(address account) view returns (int256)',
  'function realBalanceOf(address account) view returns (uint256)',
]);
