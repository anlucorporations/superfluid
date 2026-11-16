import { assertCsrf } from "@/lib/auth";
import { requireAdminSection as guard } from "@/lib/permisos";
import { handle, ok, readJson } from "@/lib/http";
import { createProject, listProjects } from "@/lib/repositories/projects";
import { projectCreateSchema } from "@/lib/validation";

/** GET /api/projects — listado de proyectos (CU-04). */
export const GET = handle(async (req) => {
  await guard(req, "proyectos");
  return ok({ projects: await listProjects() });
});

/** POST /api/projects — alta de proyecto. */
export const POST = handle(async (req) => {
  const session = await guard(req, "proyectos");
  assertCsrf(req, session);
  const body = await readJson(req, projectCreateSchema);
  const project = await createProject(body, session.wallet);
  return ok({ project }, 201);
});
