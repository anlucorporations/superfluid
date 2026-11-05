import { ethers, utils } from "ethers";

export const EIP712_DOMAIN_NAME = "Superfluid Brlt Streaming";
export const EIP712_DOMAIN_VERSION = "2";

export function changeWalletDomain(chainId: number, verifyingContract: string) {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract: verifyingContract && utils.isAddress(verifyingContract)
      ? utils.getAddress(verifyingContract)
      : ethers.constants.AddressZero,
  };
}

/** Autorización firmada por la wallet nueva del empleado (CU-03 paso 4.i). */
export const CHANGE_WALLET_TYPES = {
  ChangeWallet: [
    { name: "employeeId", type: "string" },
    { name: "oldWallet", type: "address" },
    { name: "newWallet", type: "address" },
    { name: "nonce", type: "string" },
    { name: "issuedAt", type: "uint256" },
  ],
};

/** Step-up firmado por la wallet admin (CU-03 paso 4.ii). */
export const ADMIN_STEP_UP_TYPES = {
  AdminStepUp: [
    { name: "action", type: "string" },
    { name: "employeeId", type: "string" },
    { name: "oldWallet", type: "address" },
    { name: "newWallet", type: "address" },
    { name: "nonce", type: "string" },
    { name: "issuedAt", type: "uint256" },
  ],
};

export interface ChangeWalletValue {
  employeeId: string;
  oldWallet: string;
  newWallet: string;
  nonce: string;
  issuedAt: number;
}

export interface AdminStepUpValue extends ChangeWalletValue {
  action: string;
}

export function recoverTypedSigner(
  domain: ReturnType<typeof changeWalletDomain>,
  types: typeof CHANGE_WALLET_TYPES | typeof ADMIN_STEP_UP_TYPES,
  value: Record<string, unknown>,
  signature: string,
): string {
  return utils.verifyTypedData(domain, types, value, signature);
}
