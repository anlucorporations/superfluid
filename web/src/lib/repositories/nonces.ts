import { ensureIndexes } from "../db";
import { serverEnv } from "../env";
import { ApiError } from "../http";
import { sha256 } from "../auth";
import { newNonce } from "../siwe";
import type { NonceDoc } from "../types";

export async function issueNonce(input: {
  wallet: string;
  purpose: NonceDoc["purpose"];
}): Promise<{ nonce: string; expiresAt: Date }> {
  const db = await ensureIndexes();
  const nonce = newNonce();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + serverEnv.nonceTtlSeconds * 1000);

  await db.collection<NonceDoc>("siwe_nonces").insertOne({
    nonceHash: sha256(nonce),
    wallet: input.wallet,
    walletLower: input.wallet.toLowerCase(),
    purpose: input.purpose,
    createdAt: now,
    expiresAt,
    usedAt: null,
  } as NonceDoc);

  return { nonce, expiresAt };
}

/** Busca un nonce por su valor en claro (la BD solo guarda el hash). */
export async function findNonce(nonce: string): Promise<NonceDoc | null> {
  const db = await ensureIndexes();
  return db.collection<NonceDoc>("siwe_nonces").findOne({ nonceHash: sha256(nonce) });
}

/** Consume un nonce de un solo uso. Lanza 401 si no existe, expiró o ya se usó. */
export async function consumeNonce(input: {
  nonce: string;
  wallet: string;
  purpose: NonceDoc["purpose"];
}): Promise<void> {
  const db = await ensureIndexes();
  const doc = await db.collection<NonceDoc>("siwe_nonces").findOne({
    nonceHash: sha256(input.nonce),
    walletLower: input.wallet.toLowerCase(),
    purpose: input.purpose,
  });

  if (!doc || doc.usedAt || doc.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(401, "nonce_invalido", "Nonce expirado, ya usado o inexistente");
  }

  const result = await db
    .collection<NonceDoc>("siwe_nonces")
    .updateOne({ _id: doc._id, usedAt: null }, { $set: { usedAt: new Date() } });

  if (result.modifiedCount !== 1) {
    throw new ApiError(401, "nonce_invalido", "Nonce ya consumido");
  }
}
