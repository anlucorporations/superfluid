import { assertCsrf, requireAdmin } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";
import { getEmployeeById, updateEmployee } from "@/lib/repositories/employees";
import { readId } from "@/lib/repositories/guards";
import { ApiError } from "@/lib/http";
import { employeeUpdateSchema } from "@/lib/validation";

/** GET /api/employees/:id */
export const GET = handle(async (req, ctx) => {
  await requireAdmin(req);
  const id = await readId(ctx);
  const employee = await getEmployeeById(id);
  if (!employee) throw new ApiError(404, "no_encontrado", "Empleado no encontrado");
  return ok({ employee });
});

/** PATCH /api/employees/:id — edición administrativa o baja (CU-03 pasos 3 y 5). */
export const PATCH = handle(async (req, ctx) => {
  const session = await requireAdmin(req);
  assertCsrf(req, session);
  const id = await readId(ctx);
  const patch = await readJson(req, employeeUpdateSchema);
  const employee = await updateEmployee(id, patch, session.wallet);
  return ok({ employee });
});
