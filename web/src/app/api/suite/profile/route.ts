import { assertCsrf, requireEmployee } from "@/lib/auth";
import { ApiError, handle, ok, readJson } from "@/lib/http";
import { updateOwnProfile } from "@/lib/repositories/suite";
import { suiteProfileSchema } from "@/lib/validation";

/**
 * PATCH /api/suite/profile — el empleado edita sus datos personales y da o retira
 * su consentimiento GDPR (AC-10). Solo su propia ficha.
 */
export const PATCH = handle(async (req) => {
  const session = await requireEmployee(req);
  assertCsrf(req, session);
  if (!session.employeeId) {
    throw new ApiError(403, "prohibido", "La sesión no tiene empleado asociado");
  }
  const body = await readJson(req, suiteProfileSchema);
  const doc = await updateOwnProfile(session.employeeId.toString(), body);
  return ok({
    profile: {
      datosPersonales: doc.datosPersonales,
      consentimiento: doc.consentimiento
        ? {
            aceptado: doc.consentimiento.aceptado,
            fecha: doc.consentimiento.fecha ? doc.consentimiento.fecha.toISOString() : null,
          }
        : null,
    },
  });
});
