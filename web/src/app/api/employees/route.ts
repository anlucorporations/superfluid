import { assertCsrf, requireAdmin } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";
import {
  createEmployee,
  listEmployees,
} from "@/lib/repositories/employees";
import { employeeCreateSchema } from "@/lib/validation";

/** GET /api/employees — listado administrativo (CU-03 paso 1). */
export const GET = handle(async (req) => {
  await requireAdmin(req);
  const employees = await listEmployees();
  return ok({ employees });
});

/** POST /api/employees — alta de empleado (CU-03 paso 2). */
export const POST = handle(async (req) => {
  const session = await requireAdmin(req);
  assertCsrf(req, session);

  const body = await readJson(req, employeeCreateSchema);
  const employee = await createEmployee(body, session.wallet);
  return ok({ employee }, 201);
});
