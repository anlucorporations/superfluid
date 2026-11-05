import { assertCsrf, requireEmployee } from "@/lib/auth";
import { ApiError, handle, ok, readJson } from "@/lib/http";
import { verifyWalletAction } from "@/lib/flows-onchain";
import { recordFlowAction } from "@/lib/repositories/flows";
import { suiteActionSchema } from "@/lib/validation";

/**
 * POST /api/suite/actions — audita el cobro (`downgrade`) o la liquidación
 * (`settleFlow`) que el empleado acaba de firmar on-chain (CU-16, RF-21).
 *
 * Se verifica contra la cadena: la tx debe existir, estar confirmada, tener como
 * firmante la wallet de la sesión y emitir el evento correcto. Sin verificación,
 * la operación se rechaza (la auditoría nunca registra algo que no pasó).
 */
export const POST = handle(async (req) => {
  const session = await requireEmployee(req);
  assertCsrf(req, session);
  if (!session.employeeId) {
    throw new ApiError(403, "prohibido", "La sesión no tiene empleado asociado");
  }
  const body = await readJson(req, suiteActionSchema);

  const verified = await verifyWalletAction(
    body.txHash,
    session.wallet.toLowerCase(),
    body.operacion,
    body.flowId,
  );
  if (!verified) {
    throw new ApiError(
      422,
      "tx_no_verificada",
      "La transacción no corresponde a la operación declarada (cartera, evento o estado).",
    );
  }

  await recordFlowAction({
    flowId: verified.flowId ?? "0",
    operacion: verified.operacion,
    actorWallet: session.wallet,
    txHash: body.txHash,
    employeeId: session.employeeId.toString(),
    meta:
      verified.operacion === "cobro"
        ? { amount: verified.amount, via: "suite" }
        : { amount: verified.amount, via: "suite" },
  });

  return ok({
    operacion: verified.operacion,
    amount: verified.amount ?? null,
    flowId: verified.flowId ?? null,
  });
});
