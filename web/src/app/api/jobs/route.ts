import { z } from "zod";
import { assertCsrf, requireAdmin } from "@/lib/auth";
import { ApiError, handle, ok, readJson } from "@/lib/http";
import { getJobStatus, runJob, isValidJob } from "@/lib/jobs/reconciler";

/**
 * GET  /api/jobs — estado de los jobs internos (últimas 20 ejecuciones, H6).
 * POST /api/jobs — lanza un job a mano desde el panel (`{ job }`).
 */
export const GET = handle(async (req) => {
  await requireAdmin(req);
  return ok(await getJobStatus());
});

const runSchema = z.object({ job: z.string().min(1) });

export const POST = handle(async (req) => {
  const session = await requireAdmin(req);
  assertCsrf(req, session);
  const body = await readJson(req, runSchema);
  if (!isValidJob(body.job)) {
    throw new ApiError(400, "job_invalido", "Job desconocido");
  }
  const output = await runJob(body.job, "manual");
  return ok(output);
});

export const runtime = "nodejs";
