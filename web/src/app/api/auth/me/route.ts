import { requireSession } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { seccionesDeSesion } from "@/lib/permisos";
import { getAllowlistByWallet } from "@/lib/repositories/allowlist";
import { getEmployeeById } from "@/lib/repositories/employees";
import type { SessionInfo } from "@/lib/types";

/**
 * GET /api/auth/me
 * Devuelve la sesión actual con sus secciones autorizadas (H12) y, si es
 * empleado, su ficha (sin datos sensibles).
 */
export const GET = handle(async (req) => {
  const session = await requireSession(req);

  if (session.role === "empleado" && session.employeeId) {
    const employee = await getEmployeeById(session.employeeId.toString());
    const info: SessionInfo = {
      wallet: session.wallet,
      role: session.role,
      employeeId: session.employeeId ? session.employeeId.toString() : null,
      expiresAt: session.expiresAt.toISOString(),
      secciones: seccionesDeSesion(session.role, null).secciones,
    };
    return ok({ session: info, employee });
  }

  const allowlist = await getAllowlistByWallet(session.wallet);
  const { adminRol, secciones } = seccionesDeSesion(session.role, allowlist);
  const info: SessionInfo = {
    wallet: session.wallet,
    role: session.role,
    employeeId: session.employeeId ? session.employeeId.toString() : null,
    expiresAt: session.expiresAt.toISOString(),
    adminRol,
    secciones,
  };

  return ok({
    session: info,
    allowlist: allowlist ? { rol: allowlist.rol, estado: allowlist.estado } : null,
  });
});
