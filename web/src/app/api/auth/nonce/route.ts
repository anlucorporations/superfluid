import { handle, ok, readJson } from "@/lib/http";
import { enforceRateLimit } from "@/lib/repositories/guards";
import { issueNonce } from "@/lib/repositories/nonces";
import { buildSiweMessage } from "@/lib/siwe";
import { nonceRequestSchema } from "@/lib/validation";

const STATEMENTS = {
  // EIP-4361 exige ASCII imprimible en `statement` (sin acentos).
  // Clear signing (regla del proyecto): que hace, para que, y que NO hace la firma.
  admin:
    "Acceder al panel de administracion de Superfluid Brlt. Esta firma solo prueba que esta wallet es tuya. No mueve fondos ni autoriza gastos.",
  suite:
    "Acceder a tu Portal del Empleado de Superfluid Brlt. Esta firma solo prueba que esta wallet es tuya. No mueve fondos ni autoriza gastos.",
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
