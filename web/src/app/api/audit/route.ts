
import { requireAdminSection as guard } from "@/lib/permisos";
import { handle, ok } from "@/lib/http";
import { listAudit } from "@/lib/repositories/audit";
import { auditQuerySchema } from "@/lib/validation";

/** GET /api/audit?limit=100&empleadoId=... — historial de auditoría (AC-03/AC-15). */
export const GET = handle(async (req) => {
  await guard(req, "auditoria");
  const query = auditQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const events = await listAudit(query.limit, query.empleadoId);
  return ok({ events });
});
