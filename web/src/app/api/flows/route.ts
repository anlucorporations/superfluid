import { assertCsrf, requireAdmin } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";
import { getTreasury } from "@/lib/flows-onchain";
import { listFlows, registerFlow } from "@/lib/repositories/flows";
import { flowRegisterSchema } from "@/lib/validation";
import type { FlowDoc } from "@/lib/types";

/**
 * GET /api/flows — flujos con reconciliación on-chain + tesorería (CU-06..CU-10).
 * `?empleadoId=` y `?estado=` filtran; el estado real se lee de BrltX.
 */
export const GET = handle(async (req) => {
  const session = await requireAdmin(req);
  const params = req.nextUrl.searchParams;
  const empleadoId = params.get("empleadoId") ?? undefined;
  const estado = params.get("estado") as FlowDoc["estado"] | null;

  const [flows, treasury] = await Promise.all([
    listFlows({ employeeId: empleadoId, estado: estado ?? undefined }),
    getTreasury(session.wallet),
  ]);

  return ok({
    flows,
    treasury,
    blockTimeMs: 5_000,
  });
});

/** POST /api/flows — registra un flujo recién creado on-chain (verificado por RPC). */
export const POST = handle(async (req) => {
  const session = await requireAdmin(req);
  assertCsrf(req, session);
  const body = await readJson(req, flowRegisterSchema);

  const flow = await registerFlow({
    flowId: body.flowId,
    employeeId: body.employeeId ?? null,
    txHash: body.txHash ?? null,
    batchId: body.batchId ?? null,
    actorWallet: session.wallet,
  });

  return ok({ flow }, 201);
});
