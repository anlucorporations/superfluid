import { assertCsrf, requireAdmin } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";
import { recordFlowAction, registerFlow } from "@/lib/repositories/flows";
import { flowActionSchema } from "@/lib/validation";

/**
 * POST /api/flows/actions — audita una operación ya firmada on-chain
 * (pausa, reanudación, terminación, liquidación, cambio de receptor, mint/burn)
 * y refresca la copia local con el estado real del contrato.
 *
 * `cambio_receptor` cierra el flujo antiguo y abre uno nuevo en BrltX; por eso
 * acepta `newFlowId` y lo registra con la misma verificación que un alta (AC-03).
 */
export const POST = handle(async (req) => {
  const session = await requireAdmin(req);
  assertCsrf(req, session);
  const body = await readJson(req, flowActionSchema);

  if (body.operacion === "cambio_receptor" && body.newFlowId) {
    await registerFlow({
      flowId: body.newFlowId,
      employeeId: body.employeeId ?? null,
      txHash: body.txHash ?? null,
      actorWallet: session.wallet,
    });
  }

  await recordFlowAction({
    flowId: body.flowId,
    operacion: body.operacion,
    actorWallet: session.wallet,
    txHash: body.txHash ?? null,
    employeeId: body.employeeId ?? null,
    meta: body.newFlowId ? { ...body.meta, newFlowId: body.newFlowId } : body.meta,
  });

  return ok({ ok: true });
});
