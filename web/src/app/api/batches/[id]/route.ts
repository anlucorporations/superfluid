import { requireAdmin } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
import { getBatchProgress } from "@/lib/repositories/flows";
import { readId } from "@/lib/repositories/guards";

/** GET /api/batches/:id — progreso del lote para reanudar sin duplicar pagos (CU-09). */
export const GET = handle(async (req, ctx) => {
  await requireAdmin(req);
  const id = await readId(ctx);
  return ok(await getBatchProgress(id));
});
