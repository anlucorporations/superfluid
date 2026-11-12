import { z } from "zod";
import { handle, ok, readJson } from "@/lib/http";
import { isAllowedAdmin } from "@/lib/repositories/allowlist";
import { getEmployeeByWallet } from "@/lib/repositories/employees";
import { walletSchema } from "@/lib/validation";

const roleQuerySchema = z.object({ wallet: walletSchema });

/**
 * POST /api/auth/role
 * Indica a qué suite pertenece una wallet, para que la entrada única redirija:
 *   - "admin"    → wallet en admin_allowlist activa (tiene prioridad)
 *   - "empleado" → wallet de un empleado activo (o en periodo de retiro)
 *   - "ninguno"  → sin acceso a ninguna suite
 *
 * No crea sesión ni autentica: la identidad se demuestra con la firma SIWE en
 * /api/auth/verify. Este endpoint solo decide el destino de la redirección.
 */
export const POST = handle(async (req) => {
  const body = await readJson(req, roleQuerySchema);

  if (await isAllowedAdmin(body.wallet)) {
    return ok({ role: "admin", suite: "/admin" });
  }

  const employee = await getEmployeeByWallet(body.wallet);
  const RETIRO_MS = 90 * 24 * 3_600_000;
  const empleadoActivo =
    employee?.estado === "activo" ||
    (employee?.deactivatedAt !== null &&
      employee?.deactivatedAt !== undefined &&
      Date.now() - employee.deactivatedAt.getTime() < RETIRO_MS);

  if (employee && empleadoActivo) {
    return ok({ role: "empleado", suite: "/suite" });
  }

  return ok({ role: "ninguno", suite: null });
});

export const dynamic = "force-dynamic";
