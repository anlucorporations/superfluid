import { assertCsrf } from "@/lib/auth";
import { requireAdminSection as guard } from "@/lib/permisos";
import { handle, ok, readJson } from "@/lib/http";
import {
  createEmployee,
  listEmployees,
} from "@/lib/repositories/employees";
import { employeeCreateSchema } from "@/lib/validation";

/** GET /api/employees — listado administrativo (CU-03 paso 1). */
export const GET = handle(async (req) => {
  await guard(req, "empleados");
  const employees = await listEmployees();
  return ok({ employees });
});

/** POST /api/employees — alta de empleado (CU-03 paso 2). */
export const POST = handle(async (req) => {
  const session = await guard(req, "empleados");
  assertCsrf(req, session);

  const body = await readJson(req, employeeCreateSchema);
  const employee = await createEmployee(body, session.wallet);
  return ok({ employee }, 201);
});
