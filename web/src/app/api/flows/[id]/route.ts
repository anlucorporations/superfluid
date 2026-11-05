import { requireAdmin } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { getFlowById } from "@/lib/repositories/flows";
import { readId } from "@/lib/repositories/guards";
import { ApiError } from "@/lib/http";

/** GET /api/flows/:id — detalle de un flujo reconciliado con BrltX. */
export const GET = handle(async (req, ctx) => {
  await requireAdmin(req);
  const id = await readId(ctx);
  const flow = await getFlowById(id);
  if (!flow) throw new ApiError(404, "no_encontrado", "Flujo no encontrado");
  return ok({ flow });
});
