import { ObjectId } from "mongodb";
import { ensureIndexes } from "../db";
import { ApiError } from "../http";
import { recordAudit } from "./audit";
import type { EmployeeDoc } from "../types";

/**
 * Operaciones de la Suite del Empleado sobre su propia ficha (H5):
 * consentimiento GDPR (AC-10) y solicitud de borrado con efecto inmediato.
 * El empleado solo puede tocar su propio documento; no wallet, no estado.
 */

export interface SuiteProfileUpdate {
  datosPersonales?: { email?: string; telefono?: string };
  consentimiento?: boolean;
}

function cleanDatos(datos: SuiteProfileUpdate["datosPersonales"]) {
  if (!datos) return undefined;
  const cleaned: { email?: string; telefono?: string } = {};
  const email = datos.email?.trim();
  const telefono = datos.telefono?.trim();
  if (email) cleaned.email = email;
  if (telefono) cleaned.telefono = telefono;
  return cleaned;
}

export async function updateOwnProfile(
  employeeId: string,
  patch: SuiteProfileUpdate,
): Promise<EmployeeDoc> {
  const db = await ensureIndexes();
  const doc = await db.collection<EmployeeDoc>("employees").findOne({
    _id: new ObjectId(employeeId),
  });
  if (!doc) throw new ApiError(404, "no_encontrado", "Empleado no encontrado");

  const $set: Partial<EmployeeDoc> = { updatedAt: new Date() };
  const datos = cleanDatos(patch.datosPersonales);
  if (datos) $set.datosPersonales = datos;
  if (patch.consentimiento !== undefined) {
    $set.consentimiento = { aceptado: patch.consentimiento, fecha: new Date() };
  }

  await db.collection<EmployeeDoc>("employees").updateOne({ _id: doc._id }, { $set });

  await recordAudit({
    actorWallet: doc.wallet,
    accion: "perfil",
    empleadoId: employeeId,
    meta: { campos: Object.keys(patch) },
  });

  const updated = await db.collection<EmployeeDoc>("employees").findOne({ _id: doc._id });
  return updated as EmployeeDoc;
}

/**
 * AC-10 — borrado inmediato de los datos personales identificables a petición del
 * empleado. El anonimizado del resto de registros a 30 días se ejecuta con el job
 * de H6; la wallet se conserva pseudonimizada hasta 90 días para el retiro.
 */
export async function requestErase(employeeId: string): Promise<EmployeeDoc> {
  const db = await ensureIndexes();
  const doc = await db.collection<EmployeeDoc>("employees").findOne({
    _id: new ObjectId(employeeId),
  });
  if (!doc) throw new ApiError(404, "no_encontrado", "Empleado no encontrado");

  const now = new Date();
  await db.collection<EmployeeDoc>("employees").updateOne(
    { _id: doc._id },
    {
      $set: {
        datosPersonales: {},
        borroSolicitado: true,
        borroSolicitadoAt: now,
        consentimiento: { aceptado: false, fecha: now },
        updatedAt: now,
      },
    },
  );

  await recordAudit({
    actorWallet: doc.wallet,
    accion: "solicitud_borrado",
    empleadoId: employeeId,
    meta: { efecto: "borrado_inmediato" },
  });

  const updated = await db.collection<EmployeeDoc>("employees").findOne({ _id: doc._id });
  return updated as EmployeeDoc;
}
