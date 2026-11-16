import { requireSession } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { getSuiteBalances } from "@/lib/flows-onchain";
import { getEmployeeById, listEmployees } from "@/lib/repositories/employees";
import { listFlowsByReceiver } from "@/lib/repositories/flows";

/**
 * GET /api/finanzas — finanzas del usuario autenticado (H12).
 * - Empleado: sus balances on-chain, sus flujos y su ficha (única sección
 *   visible del panel para empleados).
 * - Admin/Super Admin: resumen de finanzas de todos los empleados activos.
 */
export const GET = handle(async (req) => {
  const session = await requireSession(req);
  const url = new URL(req.url);

  // Modo ligero (?saldos=1): solo balances on-chain, sin flujos ni fichas.
  // Lo usa el refresco automático de la UI (cada 10 s, solo saldos).
  if (url.searchParams.get("saldos") === "1") {
    if (session.role === "empleado") {
      const balances = await getSuiteBalances(session.wallet);
      return ok({ tipo: "empleado" as const, balances });
    }
    const empleados = (await listEmployees()).filter((e) => e.estado === "activo");
    const saldos = await Promise.all(
      empleados.map(async (e) => ({
        employeeId: e.id,
        balances: await getSuiteBalances(e.wallet),
      })),
    );
    return ok({ tipo: "admin" as const, saldos });
  }

  if (session.role === "empleado") {
    if (!session.employeeId) {
      return ok({ tipo: "empleado", employee: null, balances: null, flows: [], totales: null });
    }
    const employee = await getEmployeeById(session.employeeId.toString());
    const [balances, flows] = await Promise.all([
      getSuiteBalances(session.wallet),
      listFlowsByReceiver(session.wallet),
    ]);
    const activos = flows.filter((f) => f.estado === "activo");
    return ok({
      tipo: "empleado" as const,
      employee,
      balances,
      flows,
      totales: {
        flujosActivos: activos.length,
        cobrableWei: balances?.cobrable ?? "0",
        saldoBrltWei: balances?.walletBrlt ?? "0",
        saldoBrltxWei: balances?.walletBrltx ?? "0",
      },
    });
  }

  // Admin / Super Admin: finanzas de todos los empleados activos.
  const empleados = (await listEmployees()).filter((e) => e.estado === "activo");
  const detalle = await Promise.all(
    empleados.map(async (e) => {
      const [balances, flows] = await Promise.all([
        getSuiteBalances(e.wallet),
        listFlowsByReceiver(e.wallet),
      ]);
      const activos = flows.filter((f) => f.estado === "activo");
      return {
        employee: e,
        balances,
        flujosActivos: activos.length,
        flujosTotales: flows.length,
      };
    }),
  );
  return ok({ tipo: "admin" as const, detalle });
});
