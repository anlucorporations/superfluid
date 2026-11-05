import { assertCsrf, requireAdmin } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";
import {
  createScheduledFlow,
  listScheduledFlows,
  markScheduledFlow,
} from "@/lib/repositories/flows";
import { scheduledFlowCreateSchema, scheduledFlowUpdateSchema } from "@/lib/validation";
import { ApiError } from "@/lib/http";

/** GET /api/scheduled-flows — programaciones de nómina (CU-05). */
export const GET = handle(async (req) => {
  await requireAdmin(req);
  return ok({ scheduled: await listScheduledFlows() });
});

/** POST /api/scheduled-flows — crea una programación en estado `proximo`. */
export const POST = handle(async (req) => {
  const session = await requireAdmin(req);
  assertCsrf(req, session);
  const body = await readJson(req, scheduledFlowCreateSchema);

  const scheduled = await createScheduledFlow({
    employeeId: body.employeeId,
    amount: body.amount,
    periodo: body.periodo,
    fechaInicio: new Date(body.fechaInicio),
    actorWallet: session.wallet,
  });
  return ok({ scheduled }, 201);
});

/** PATCH /api/scheduled-flows — ejecuta, cancela o marca fallido por `id`. */
export const PATCH = handle(async (req) => {
  const session = await requireAdmin(req);
  assertCsrf(req, session);
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError(400, "id_invalido", "Falta el identificador de la programación");
  const body = await readJson(req, scheduledFlowUpdateSchema);

  const scheduled = await markScheduledFlow(
    id,
    body.estado,
    { flowId: body.flowId ?? null, txHash: body.txHash ?? null, error: body.error ?? null },
    session.wallet,
  );
  return ok({ scheduled });
});
