import { ObjectId } from "mongodb";
import { ensureIndexes } from "../db";
import { ApiError } from "../http";
import { revokeSessionsByWallet } from "../auth";
import { recordAudit } from "./audit";
import type { EmployeeDoc, EmployeeDto } from "../types";
import type { EmployeeCreateInput, EmployeeUpdateInput } from "../validation";

export function parseObjectId(value: string, field = "id"): ObjectId {
  if (!ObjectId.isValid(value)) throw new ApiError(400, "id_invalido", `${field} inválido`);
  return new ObjectId(value);
}

interface EmployeeAggregate extends EmployeeDoc {
  proyectoNombre?: string;
}

function toDto(doc: EmployeeAggregate): EmployeeDto {
  return {
    id: doc._id.toString(),
    nombre: doc.nombre,
    wallet: doc.wallet,
    proyectoId: doc.proyectoId ? doc.proyectoId.toString() : null,
    proyectoNombre: doc.proyectoNombre ?? null,
    concepto: doc.concepto,
    montoPeriodo: doc.montoPeriodo,
    periodo: doc.periodo,
    estado: doc.estado,
    datosPersonales: doc.datosPersonales ?? {},
    consentimiento: doc.consentimiento
      ? {
          aceptado: doc.consentimiento.aceptado,
          fecha: doc.consentimiento.fecha ? doc.consentimiento.fecha.toISOString() : null,
        }
      : null,
    borroSolicitado: doc.borroSolicitado ?? false,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

const AGGREGATE: object[] = [
  { $sort: { createdAt: -1 } },
  {
    $lookup: {
      from: "projects",
      localField: "proyectoId",
      foreignField: "_id",
      as: "proyecto",
    },
  },
  { $unwind: { path: "$proyecto", preserveNullAndEmptyArrays: true } },
  { $addFields: { proyectoNombre: "$proyecto.nombre" } },
  { $project: { proyecto: 0 } },
];

export async function listEmployees(): Promise<EmployeeDto[]> {
  const db = await ensureIndexes();
  const docs = await db.collection<EmployeeAggregate>("employees").aggregate<EmployeeAggregate>(AGGREGATE).toArray();
  return docs.map(toDto);
}

export async function getEmployeeById(id: string): Promise<EmployeeDto | null> {
  const db = await ensureIndexes();
  const _id = parseObjectId(id);
  const docs = await db
    .collection<EmployeeAggregate>("employees")
    .aggregate<EmployeeAggregate>([{ $match: { _id } }, ...AGGREGATE])
    .toArray();
  return docs[0] ? toDto(docs[0]) : null;
}

/** Documento crudo por wallet (incluye inactivos) para login de la Suite. */
export async function getEmployeeByWallet(wallet: string): Promise<EmployeeDoc | null> {
  const db = await ensureIndexes();
  return db.collection<EmployeeDoc>("employees").findOne({ walletLower: wallet.toLowerCase() });
}

export async function getEmployeeDoc(id: string): Promise<EmployeeDoc | null> {
  const db = await ensureIndexes();
  return db.collection<EmployeeDoc>("employees").findOne({ _id: parseObjectId(id) });
}

async function assertWalletFree(walletLower: string, exceptId?: ObjectId): Promise<void> {
  const db = await ensureIndexes();
  const filter: Record<string, unknown> = { walletLower };
  if (exceptId) filter._id = { $ne: exceptId };
  const existing = await db.collection<EmployeeDoc>("employees").findOne(filter);
  if (existing) {
    throw new ApiError(409, "wallet_duplicada", "La wallet ya está asignada a otro empleado");
  }
}

async function assertProjectExists(proyectoId: string | null | undefined): Promise<ObjectId | null> {
  if (!proyectoId) return null;
  const db = await ensureIndexes();
  const _id = parseObjectId(proyectoId, "proyectoId");
  const project = await db.collection("projects").findOne({ _id });
  if (!project) throw new ApiError(422, "proyecto_inexistente", "El proyecto indicado no existe");
  return _id;
}

export async function createEmployee(
  input: EmployeeCreateInput,
  actorWallet: string,
): Promise<EmployeeDto> {
  const db = await ensureIndexes();
  await assertWalletFree(input.wallet.toLowerCase());
  const proyectoId = await assertProjectExists(input.proyectoId);

  const now = new Date();
  const doc: Omit<EmployeeDoc, "_id"> = {
    nombre: input.nombre,
    wallet: input.wallet,
    walletLower: input.wallet.toLowerCase(),
    proyectoId,
    concepto: input.concepto,
    montoPeriodo: input.montoPeriodo,
    periodo: input.periodo,
    estado: "activo",
    datosPersonales: input.datosPersonales ?? {},
    consentimiento: { aceptado: false, fecha: null },
    borroSolicitado: false,
    borroSolicitadoAt: null,
    createdAt: now,
    updatedAt: now,
    deactivatedAt: null,
  };

  const result = await db.collection<EmployeeDoc>("employees").insertOne(doc as EmployeeDoc);

  await recordAudit({
    actorWallet,
    accion: "alta",
    empleadoId: result.insertedId.toString(),
    walletNueva: input.wallet,
    meta: { concepto: input.concepto, periodo: input.periodo, montoPeriodo: input.montoPeriodo },
  });

  const created = await getEmployeeById(result.insertedId.toString());
  if (!created) throw new ApiError(500, "interno", "No se pudo leer el empleado recién creado");
  return created;
}

export async function updateEmployee(
  id: string,
  patch: EmployeeUpdateInput,
  actorWallet: string,
): Promise<EmployeeDto> {
  const db = await ensureIndexes();
  const _id = parseObjectId(id);
  const current = await db.collection<EmployeeDoc>("employees").findOne({ _id });
  if (!current) throw new ApiError(404, "no_encontrado", "Empleado no encontrado");

  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.nombre !== undefined) $set.nombre = patch.nombre;
  if (patch.concepto !== undefined) $set.concepto = patch.concepto;
  if (patch.montoPeriodo !== undefined) $set.montoPeriodo = patch.montoPeriodo;
  if (patch.periodo !== undefined) $set.periodo = patch.periodo;
  if (patch.datosPersonales !== undefined) $set.datosPersonales = patch.datosPersonales;
  if (patch.proyectoId !== undefined) $set.proyectoId = await assertProjectExists(patch.proyectoId);

  const deactivating = patch.estado === "inactivo" && current.estado !== "inactivo";
  const reactivating = patch.estado === "activo" && current.estado === "inactivo";
  if (deactivating) {
    $set.estado = "inactivo";
    $set.deactivatedAt = new Date();
  } else if (reactivating) {
    $set.estado = "activo";
    $set.deactivatedAt = null;
  }

  await db.collection<EmployeeDoc>("employees").updateOne({ _id }, { $set });

  if (deactivating) {
    // Revocación inmediata de las sesiones de Suite (AC-08 / CU-03 A5).
    await revokeSessionsByWallet(current.walletLower);
  }

  await recordAudit({
    actorWallet,
    accion: deactivating ? "baja" : "edicion",
    empleadoId: id,
    walletAnterior: current.wallet,
    meta: { patch: Object.keys(patch) },
  });

  const updated = await getEmployeeById(id);
  if (!updated) throw new ApiError(500, "interno", "No se pudo leer el empleado actualizado");
  return updated;
}

/**
 * Cambia la wallet del empleado tras validar las firmas EIP-712 (CU-03/AC-03).
 * No toca la cadena: la tx `changeReceiver` la firma el navegador en H4.
 */
export async function updateEmployeeWallet(
  id: string,
  newWallet: string,
  actorWallet: string,
): Promise<EmployeeDto> {
  const db = await ensureIndexes();
  const _id = parseObjectId(id);
  const current = await db.collection<EmployeeDoc>("employees").findOne({ _id });
  if (!current) throw new ApiError(404, "no_encontrado", "Empleado no encontrado");
  if (current.walletLower === newWallet.toLowerCase()) {
    throw new ApiError(422, "wallet_igual", "La wallet nueva es igual a la actual");
  }
  await assertWalletFree(newWallet.toLowerCase(), _id);

  await db.collection<EmployeeDoc>("employees").updateOne(
    { _id },
    {
      $set: {
        wallet: newWallet,
        walletLower: newWallet.toLowerCase(),
        updatedAt: new Date(),
      },
    },
  );

  // La Suite de la wallet anterior deja de tener acceso.
  await revokeSessionsByWallet(current.walletLower);

  await recordAudit({
    actorWallet,
    accion: "cambio_wallet",
    empleadoId: id,
    walletAnterior: current.wallet,
    walletNueva: newWallet,
  });

  const updated = await getEmployeeById(id);
  if (!updated) throw new ApiError(500, "interno", "No se pudo leer el empleado actualizado");
  return updated;
}

export async function countEmployees(): Promise<{ total: number; activos: number; inactivos: number }> {
  const db = await ensureIndexes();
  const [total, activos] = await Promise.all([
    db.collection("employees").countDocuments(),
    db.collection("employees").countDocuments({ estado: "activo" }),
  ]);
  return { total, activos, inactivos: total - activos };
}
