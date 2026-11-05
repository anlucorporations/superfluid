import { requireEmployee } from "@/lib/auth";
import { ApiError, handle, ok } from "@/lib/http";
import { getEmployeeById } from "@/lib/repositories/employees";
import { getSystemConfig } from "@/lib/repositories/system";
import { getSuiteBalances } from "@/lib/flows-onchain";
import { listFlowsByReceiver } from "@/lib/repositories/flows";

/**
 * GET /api/suite/me — ficha, balances on-chain y flujos del empleado (CU-14).
 * Funciona también en el periodo de retiro (hasta 90 días tras la baja).
 */
export const GET = handle(async (req) => {
  const session = await requireEmployee(req);
  if (!session.employeeId) {
    throw new ApiError(403, "prohibido", "La sesión no tiene empleado asociado");
  }
  const employee = await getEmployeeById(session.employeeId.toString());
  if (!employee) throw new ApiError(404, "no_encontrado", "Empleado no encontrado");

  const [config, balances, flows] = await Promise.all([
    getSystemConfig(),
    getSuiteBalances(session.wallet),
    listFlowsByReceiver(session.wallet),
  ]);

  return ok({ employee, config, balances, flows });
});
