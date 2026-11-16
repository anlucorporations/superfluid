import { assertCsrf } from "@/lib/auth";
import { requireAdminSection as guard } from "@/lib/permisos";
import { handle, ok, readJson } from "@/lib/http";
import { createBatch } from "@/lib/repositories/flows";
import { batchCreateSchema } from "@/lib/validation";

/** POST /api/batches — abre un lote de hasta 10 empleados (CU-09). */
export const POST = handle(async (req) => {
  const session = await guard(req, "flujos");
  assertCsrf(req, session);
  const body = await readJson(req, batchCreateSchema);
  const batch = await createBatch(body.employeeIds, session.wallet);
  return ok({ batch }, 201);
});
