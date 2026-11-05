import { assertCsrf, requireEmployee } from "@/lib/auth";
import { ApiError, handle, ok } from "@/lib/http";
import { requestErase } from "@/lib/repositories/suite";

/**
 * POST /api/suite/erase — AC-10: el empleado solicita borrar sus datos personales.
 * Efecto inmediato sobre la ficha; el anonimizado del histórico a 30 días se
 * ejecuta con el job de H6. La wallet queda pseudonimizada hasta 90 días para el
 * retiro del pasivo.
 */
export const POST = handle(async (req) => {
  const session = await requireEmployee(req);
  assertCsrf(req, session);
  if (!session.employeeId) {
    throw new ApiError(403, "prohibido", "La sesión no tiene empleado asociado");
  }
  const doc = await requestErase(session.employeeId.toString());
  return ok({
    profile: {
      datosPersonales: doc.datosPersonales,
      borroSolicitado: doc.borroSolicitado,
      consentimiento: doc.consentimiento
        ? {
            aceptado: doc.consentimiento.aceptado,
            fecha: doc.consentimiento.fecha ? doc.consentimiento.fecha.toISOString() : null,
          }
        : null,
    },
  });
});
