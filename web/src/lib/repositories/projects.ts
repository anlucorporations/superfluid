import { ensureIndexes } from "../db";
import { ApiError } from "../http";
import { recordAudit } from "./audit";
import { parseObjectId } from "./employees";
import type { ProjectCreateInput, ProjectUpdateInput } from "../validation";
import type { ProjectDoc, ProjectDto } from "../types";

function toDto(doc: ProjectDoc): ProjectDto {
  return {
    id: doc._id.toString(),
    nombre: doc.nombre,
    descripcion: doc.descripcion ?? "",
    presupuesto: doc.presupuesto ?? "0",
    estado: doc.estado,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function listProjects(): Promise<ProjectDto[]> {
  const db = await ensureIndexes();
  const docs = await db.collection<ProjectDoc>("projects").find().sort({ createdAt: -1 }).toArray();
  return docs.map(toDto);
}

export async function getProjectById(id: string): Promise<ProjectDto | null> {
  const db = await ensureIndexes();
  const doc = await db.collection<ProjectDoc>("projects").findOne({ _id: parseObjectId(id) });
  return doc ? toDto(doc) : null;
}

export async function createProject(input: ProjectCreateInput, actorWallet: string): Promise<ProjectDto> {
  const db = await ensureIndexes();
  const now = new Date();
  const doc: Omit<ProjectDoc, "_id"> = {
    nombre: input.nombre,
    descripcion: input.descripcion ?? "",
    presupuesto: input.presupuesto ?? "0",
    estado: input.estado ?? "activo",
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection<ProjectDoc>("projects").insertOne(doc as ProjectDoc);
  await recordAudit({
    actorWallet,
    accion: "edicion",
    meta: { entidad: "proyecto", proyectoId: result.insertedId.toString(), operacion: "alta" },
  });
  return toDto({ _id: result.insertedId, ...doc });
}

export async function updateProject(
  id: string,
  patch: ProjectUpdateInput,
  actorWallet: string,
): Promise<ProjectDto> {
  const db = await ensureIndexes();
  const _id = parseObjectId(id);
  const current = await db.collection<ProjectDoc>("projects").findOne({ _id });
  if (!current) throw new ApiError(404, "no_encontrado", "Proyecto no encontrado");

  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.nombre !== undefined) $set.nombre = patch.nombre;
  if (patch.descripcion !== undefined) $set.descripcion = patch.descripcion;
  if (patch.presupuesto !== undefined) $set.presupuesto = patch.presupuesto;
  if (patch.estado !== undefined) $set.estado = patch.estado;

  await db.collection<ProjectDoc>("projects").updateOne({ _id }, { $set });
  await recordAudit({
    actorWallet,
    accion: "edicion",
    meta: { entidad: "proyecto", proyectoId: id, operacion: "edicion" },
  });

  const updated = await getProjectById(id);
  if (!updated) throw new ApiError(500, "interno", "No se pudo leer el proyecto actualizado");
  return updated;
}

export async function deleteProject(id: string, actorWallet: string): Promise<void> {
  const db = await ensureIndexes();
  const _id = parseObjectId(id);
  const inUse = await db.collection("employees").countDocuments({ proyectoId: _id });
  if (inUse > 0) {
    throw new ApiError(409, "proyecto_en_uso", "El proyecto tiene empleados asignados");
  }
  const result = await db.collection<ProjectDoc>("projects").deleteOne({ _id });
  if (result.deletedCount === 0) throw new ApiError(404, "no_encontrado", "Proyecto no encontrado");
  await recordAudit({
    actorWallet,
    accion: "edicion",
    meta: { entidad: "proyecto", proyectoId: id, operacion: "baja" },
  });
}
