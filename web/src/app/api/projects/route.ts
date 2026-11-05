import { assertCsrf, requireAdmin } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";
import { createProject, listProjects } from "@/lib/repositories/projects";
import { projectCreateSchema } from "@/lib/validation";

/** GET /api/projects — listado de proyectos (CU-04). */
export const GET = handle(async (req) => {
  await requireAdmin(req);
  return ok({ projects: await listProjects() });
});

/** POST /api/projects — alta de proyecto. */
export const POST = handle(async (req) => {
  const session = await requireAdmin(req);
  assertCsrf(req, session);
  const body = await readJson(req, projectCreateSchema);
  const project = await createProject(body, session.wallet);
  return ok({ project }, 201);
});
