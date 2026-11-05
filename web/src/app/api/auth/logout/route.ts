import { assertCsrf, clearSessionCookies, requireSession, revokeSession } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { recordAudit } from "@/lib/repositories/audit";

/** POST /api/auth/logout — revoca la sesión y limpia cookies (AC-08). */
export const POST = handle(async (req) => {
  const session = await requireSession(req);
  assertCsrf(req, session);

  await revokeSession(session._id);
  await recordAudit({
    actorWallet: session.wallet,
    accion: "logout",
    empleadoId: session.employeeId ? session.employeeId.toString() : null,
  });

  return clearSessionCookies(ok({ ok: true }));
});
