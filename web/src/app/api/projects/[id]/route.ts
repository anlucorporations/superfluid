import { assertCsrf, requireAdmin } from "@/lib/auth";
import { ApiError, handle, ok, readJson } from "@/lib/http";
import { deleteProject, getProjectById, updateProject } from "@/lib/repositories/projects";
import { readId } from "@/lib/repositories/guards";
import { projectUpdateSchema } from "@/lib/validation";

/** GET /api/projects/:id */
export const GET = handle(async (req, ctx) => {
  await requireAdmin(req);
  const id = await readId(ctx);
  const project = await getProjectById(id);
  if (!project) throw new ApiError(404, "no_encontrado", "Proyecto no encontrado");
  return ok({ project });
});

/** PATCH /api/projects/:id */
export const PATCH = handle(async (req, ctx) => {
  const session = await requireAdmin(req);
  assertCsrf(req, session);
  const id = await readId(ctx);
  const patch = await readJson(req, projectUpdateSchema);
  const project = await updateProject(id, patch, session.wallet);
  return ok({ project });
});

/** DELETE /api/projects/:id — bloqueado si tiene empleados asignados. */
export const DELETE = handle(async (req, ctx) => {
  const session = await requireAdmin(req);
  assertCsrf(req, session);
  const id = await readId(ctx);
  await deleteProject(id, session.wallet);
  return ok({ deleted: true });
});
