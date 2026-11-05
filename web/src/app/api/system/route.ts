import { assertCsrf, requireAdmin } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";
import { getSystemConfig, updateSystemConfig } from "@/lib/repositories/system";
import { systemUpdateSchema } from "@/lib/validation";

/** GET /api/system — configuración vigente (CU-11 paso 1). */
export const GET = handle(async (req) => {
  await requireAdmin(req);
  return ok({ config: await getSystemConfig(true) });
});

/** PATCH /api/system — addresses, RPC, refresco y faucet (CU-11 pasos 2-4). */
export const PATCH = handle(async (req) => {
  const session = await requireAdmin(req);
  assertCsrf(req, session);
  const patch = await readJson(req, systemUpdateSchema);
  const config = await updateSystemConfig(patch, session.wallet);
  return ok({ config });
});
