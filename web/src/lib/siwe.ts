import { randomBytes } from "node:crypto";
import { SiweMessage } from "siwe";
import { serverEnv } from "./env";
import { ApiError } from "./http";

export const SIWE_CHAIN_ID = 81234;

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

/** Construye el mensaje SIWE completo en el servidor; el cliente solo lo firma. */
export function buildSiweMessage(params: {
  address: string;
  nonce: string;
  statement: string;
}): string {
  const message = new SiweMessage({
    domain: serverEnv.siweDomain,
    address: params.address,
    statement: params.statement,
    uri: `https://${serverEnv.siweDomain}`,
    version: "1",
    chainId: SIWE_CHAIN_ID,
    nonce: params.nonce,
    issuedAt: new Date().toISOString(),
  });
  return message.prepareMessage();
}

export interface VerifiedSiwe {
  address: string;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
}

/**
 * Verifica la firma SIWE con ecrecover (sin provider: no hay EIP-1271).
 * Comprueba además dominio, nonce, versión y chainId.
 */
export async function verifySiweSignature(params: {
  message: string;
  signature: string;
  expectedAddress: string;
  expectedNonce: string;
}): Promise<VerifiedSiwe> {
  let siwe: SiweMessage;
  try {
    siwe = new SiweMessage(params.message);
  } catch {
    throw new ApiError(400, "siwe_invalido", "Mensaje SIWE mal formado");
  }

  if (Number(siwe.chainId) !== SIWE_CHAIN_ID) {
    throw new ApiError(400, "chain_invalida", "chainId inesperado en el mensaje SIWE");
  }
  if (siwe.domain !== serverEnv.siweDomain) {
    throw new ApiError(400, "dominio_invalido", "Dominio inesperado en el mensaje SIWE");
  }
  if (siwe.nonce !== params.expectedNonce) {
    throw new ApiError(401, "nonce_invalido", "Nonce SIWE no coincide");
  }

  const result = await siwe.verify({
    signature: params.signature,
    domain: serverEnv.siweDomain,
    nonce: params.expectedNonce,
  });

  if (!result.success) {
    throw new ApiError(401, "firma_invalida", "Firma SIWE inválida");
  }
  if (siwe.address.toLowerCase() !== params.expectedAddress.toLowerCase()) {
    throw new ApiError(401, "firma_invalida", "La firma no corresponde a la wallet indicada");
  }

  return {
    address: siwe.address,
    nonce: siwe.nonce,
    issuedAt: siwe.issuedAt ?? new Date().toISOString(),
    expirationTime: siwe.expirationTime ?? undefined,
  };
}
