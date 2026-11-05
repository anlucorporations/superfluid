import { handle, ok, readJson } from "@/lib/http";
import { enforceRateLimit } from "@/lib/repositories/guards";
import { issueNonce } from "@/lib/repositories/nonces";
import { buildSiweMessage } from "@/lib/siwe";
import { nonceRequestSchema } from "@/lib/validation";

const STATEMENTS = {
  // EIP-4361 exige ASCII imprimible en `statement` (sin acentos).
  admin: "Acceso al panel de administracion de Superfluid Brlt Streaming v2",
  suite: "Acceso a la Suite del Empleado de Superfluid Brlt Streaming v2",
} as const;

/**
 * POST /api/auth/nonce
 * Emite un nonce de un solo uso y devuelve el mensaje SIWE ya preparado.
 * El cliente solo tiene que firmarlo con su wallet.
 */
export const POST = handle(async (req) => {
  const body = await readJson(req, nonceRequestSchema);
  await enforceRateLimit(req, body.wallet);

  const { nonce, expiresAt } = await issueNonce({
    wallet: body.wallet,
    purpose: body.purpose,
  });

  return ok({
    nonce,
    expiresAt: expiresAt.toISOString(),
    message: buildSiweMessage({
      address: body.wallet,
      nonce,
      statement: STATEMENTS[body.purpose],
    }),
  });
});
