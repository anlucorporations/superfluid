
import { requireAdminSection as guard } from "@/lib/permisos";
import { handle, ok } from "@/lib/http";
import { getBatchProgress } from "@/lib/repositories/flows";
import { readId } from "@/lib/repositories/guards";

/** GET /api/batches/:id — progreso del lote para reanudar sin duplicar pagos (CU-09). */
export const GET = handle(async (req, ctx) => {
  await guard(req, "flujos");
  const id = await readId(ctx);
  return ok(await getBatchProgress(id));
});
