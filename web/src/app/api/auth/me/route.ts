import { requireSession } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { getAllowlistByWallet } from "@/lib/repositories/allowlist";
import { getEmployeeById } from "@/lib/repositories/employees";
import type { SessionInfo } from "@/lib/types";

/**
 * GET /api/auth/me
 * Devuelve la sesión actual y, si es empleado, su ficha (sin datos sensibles).
 */
export const GET = handle(async (req) => {
  const session = await requireSession(req);

  const info: SessionInfo = {
    wallet: session.wallet,
    role: session.role,
    employeeId: session.employeeId ? session.employeeId.toString() : null,
    expiresAt: session.expiresAt.toISOString(),
  };

  if (session.role === "empleado" && session.employeeId) {
    const employee = await getEmployeeById(session.employeeId.toString());
    return ok({ session: info, employee });
  }

  const allowlist = await getAllowlistByWallet(session.wallet);
  return ok({
    session: info,
    allowlist: allowlist ? { rol: allowlist.rol, estado: allowlist.estado } : null,
  });
});
