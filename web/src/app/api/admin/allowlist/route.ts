import { SiweMessage } from "siwe";
import { assertCsrf, requireAdmin } from "@/lib/auth";
import { ApiError, handle, ok, readJson } from "@/lib/http";
import {
  addAllowlistEntry,
  getAllowlistByWallet,
  listAllowlist,
} from "@/lib/repositories/allowlist";
import { consumeNonce, findNonce } from "@/lib/repositories/nonces";
import { verifySiweSignature } from "@/lib/siwe";
import { allowlistCreateSchema } from "@/lib/validation";

/** GET /api/admin/allowlist — wallets autorizadas (CU-11 paso 6 / AC-15). */
export const GET = handle(async (req) => {
  await requireAdmin(req);
  return ok({ allowlist: await listAllowlist() });
});

/**
 * POST /api/admin/allowlist
 * Alta con confirmación firmada por la wallet nueva (AC-15 / CU-11 A6).
 */
export const POST = handle(async (req) => {
  const session = await requireAdmin(req);
  assertCsrf(req, session);
  const body = await readJson(req, allowlistCreateSchema);

  const existing = await getAllowlistByWallet(body.wallet);
  if (existing) {
    throw new ApiError(
      409,
      "wallet_ya_existe",
      "La wallet ya está en la allowlist; edita su estado o rol en lugar de añadirla.",
    );
  }

  let parsed: SiweMessage;
  try {
    parsed = new SiweMessage(body.message);
  } catch {
    throw new ApiError(400, "siwe_invalido", "Mensaje SIWE mal formado");
  }

  const nonceDoc = await findNonce(parsed.nonce);
  if (!nonceDoc || nonceDoc.purpose !== "admin") {
    throw new ApiError(401, "nonce_invalido", "Nonce de confirmación no válido");
  }
  if (nonceDoc.walletLower !== body.wallet.toLowerCase()) {
    throw new ApiError(401, "nonce_invalido", "El nonce no pertenece a esa wallet");
  }
  if (nonceDoc.usedAt || nonceDoc.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(401, "nonce_invalido", "Nonce expirado o ya usado");
  }

  await verifySiweSignature({
    message: body.message,
    signature: body.signature,
    expectedAddress: body.wallet,
    expectedNonce: parsed.nonce,
  });
  await consumeNonce({ nonce: parsed.nonce, wallet: body.wallet, purpose: "admin" });

  const entry = await addAllowlistEntry({
    wallet: body.wallet,
    rol: body.rol ?? "admin",
    creadoPor: session.wallet,
  });

  return ok({ entry }, 201);
});
