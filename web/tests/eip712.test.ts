import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import {
  ADMIN_STEP_UP_TYPES,
  CHANGE_WALLET_TYPES,
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  changeWalletDomain,
  recoverTypedSigner,
} from "@/lib/eip712";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const NONCE = "a1b2c3d4e5f60718";

function values(oldWallet: string, newWallet: string, issuedAt = 1_760_000_000) {
  return { employeeId: "6710f2a4b1c2d3e4f5a6b7c8", oldWallet, newWallet, nonce: NONCE, issuedAt };
}

describe("dominio EIP-712", () => {
  it("usa el nombre y la versión del proyecto", () => {
    const domain = changeWalletDomain(81234, CONTRACT);
    expect(domain.name).toBe(EIP712_DOMAIN_NAME);
    expect(domain.version).toBe(EIP712_DOMAIN_VERSION);
    expect(domain.chainId).toBe(81234);
    expect(domain.verifyingContract).toBe(CONTRACT);
  });

  it("cae a AddressZero si no hay contrato configurado", () => {
    expect(changeWalletDomain(81234, "").verifyingContract).toBe(
      ethers.constants.AddressZero,
    );
  });
});

describe("autorización de cambio de wallet (AC-03)", () => {
  it("recupera la wallet nueva desde la firma del empleado", async () => {
    const employee = ethers.Wallet.createRandom();
    const admin = ethers.Wallet.createRandom();
    const value = values(admin.address, employee.address);
    const domain = changeWalletDomain(81234, CONTRACT);

    const signature = await employee._signTypedData(domain, CHANGE_WALLET_TYPES, value);
    const recovered = recoverTypedSigner(domain, CHANGE_WALLET_TYPES, value, signature);
    expect(recovered.toLowerCase()).toBe(employee.address.toLowerCase());
  });

  it("el step-up admin firma un payload distinto", async () => {
    const employee = ethers.Wallet.createRandom();
    const admin = ethers.Wallet.createRandom();
    const domain = changeWalletDomain(81234, CONTRACT);
    const value = { action: "change_wallet", ...values(admin.address, employee.address) };

    const signature = await admin._signTypedData(domain, ADMIN_STEP_UP_TYPES, value);
    const recovered = recoverTypedSigner(domain, ADMIN_STEP_UP_TYPES, value, signature);
    expect(recovered.toLowerCase()).toBe(admin.address.toLowerCase());
  });

  it("detecta manipulación de la wallet nueva", async () => {
    const employee = ethers.Wallet.createRandom();
    const admin = ethers.Wallet.createRandom();
    const attacker = ethers.Wallet.createRandom();
    const domain = changeWalletDomain(81234, CONTRACT);
    const original = values(admin.address, employee.address);

    const signature = await employee._signTypedData(domain, CHANGE_WALLET_TYPES, original);
    const tampered = { ...original, newWallet: attacker.address };
    const recovered = recoverTypedSigner(domain, CHANGE_WALLET_TYPES, tampered, signature);
    expect(recovered.toLowerCase()).not.toBe(attacker.address.toLowerCase());
  });

  it("detecta cambio de nonce", async () => {
    const employee = ethers.Wallet.createRandom();
    const admin = ethers.Wallet.createRandom();
    const domain = changeWalletDomain(81234, CONTRACT);
    const original = values(admin.address, employee.address);

    const signature = await employee._signTypedData(domain, CHANGE_WALLET_TYPES, original);
    const tampered = { ...original, nonce: "ffffffffffffffff" };
    const recovered = recoverTypedSigner(domain, CHANGE_WALLET_TYPES, tampered, signature);
    expect(recovered.toLowerCase()).not.toBe(employee.address.toLowerCase());
  });
});
