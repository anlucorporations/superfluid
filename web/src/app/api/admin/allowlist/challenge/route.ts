import { assertCsrf } from "@/lib/auth";
import { requireAdminSection as guard } from "@/lib/permisos";
import { handle, ok, readJson } from "@/lib/http";
import { issueNonce } from "@/lib/repositories/nonces";
import { buildSiweMessage } from "@/lib/siwe";
import { allowlistChallengeSchema } from "@/lib/validation";

/**
 * POST /api/admin/allowlist/challenge
 * Devuelve el mensaje SIWE que debe firmar la wallet candidata (CU-11 A6 / AC-15).
 */
export const POST = handle(async (req) => {
  const session = await guard(req, "sistema");
  assertCsrf(req, session);
  const body = await readJson(req, allowlistChallengeSchema);

  const { nonce, expiresAt } = await issueNonce({ wallet: body.wallet, purpose: "admin" });
  const message = buildSiweMessage({
    address: body.wallet,
    nonce,
    statement:
      // Clear signing: la wallet candidata entiende que solo confirma su rol,
      // sin mover fondos ni autorizar gastos (la firma es gratuita).
      "Confirmar esta wallet como administradora de Superfluid Brlt. Esta firma no mueve fondos ni autoriza gastos.",
  });

  return ok({ message, nonce, expiresAt: expiresAt.toISOString() });
});
