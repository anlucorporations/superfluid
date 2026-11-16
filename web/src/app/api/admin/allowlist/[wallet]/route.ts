import { assertCsrf } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/permisos";
import { handle, ok, readJson } from "@/lib/http";
import { updateAllowlistEntry } from "@/lib/repositories/allowlist";
import { readParam } from "@/lib/repositories/guards";
import { allowlistUpdateSchema, walletSchema } from "@/lib/validation";

/**
 * PATCH /api/admin/allowlist/:wallet — cambia estado o rol.
 * Nunca permite dejar la lista sin administradores activos (CU-11 A5).
 */
export const PATCH = handle(async (req, ctx) => {
  const session = await requireSuperAdmin(req);
  assertCsrf(req, session);
  const wallet = walletSchema.parse(await readParam(ctx, "wallet"));
  const patch = await readJson(req, allowlistUpdateSchema);
  const entry = await updateAllowlistEntry(wallet, patch, session.wallet);
  return ok({ entry });
});
