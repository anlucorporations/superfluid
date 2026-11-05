import { ensureIndexes } from "../db";
import { ApiError } from "../http";
import { recordAudit } from "./audit";
import type { AllowlistDoc } from "../types";

export interface AllowlistDto {
  id: string;
  wallet: string;
  rol: AllowlistDoc["rol"];
  estado: AllowlistDoc["estado"];
  creadoPor: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDto(doc: AllowlistDoc): AllowlistDto {
  return {
    id: doc._id.toString(),
    wallet: doc.wallet,
    rol: doc.rol,
    estado: doc.estado,
    creadoPor: doc.creadoPor ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function listAllowlist(): Promise<AllowlistDto[]> {
  const db = await ensureIndexes();
  const docs = await db
    .collection<AllowlistDoc>("admin_allowlist")
    .find()
    .sort({ createdAt: 1 })
    .toArray();
  return docs.map(toDto);
}

export async function getAllowlistByWallet(wallet: string): Promise<AllowlistDoc | null> {
  const db = await ensureIndexes();
  return db
    .collection<AllowlistDoc>("admin_allowlist")
    .findOne({ walletLower: wallet.toLowerCase() });
}

/** Solo las wallets activas con rol `admin` pueden acceder al panel (CU-01 / AC-15). */
export async function isAllowedAdmin(wallet: string): Promise<boolean> {
  const entry = await getAllowlistByWallet(wallet);
  return Boolean(entry && entry.estado === "activo" && entry.rol === "admin");
}

export async function countActiveAdmins(): Promise<number> {
  const db = await ensureIndexes();
  return db
    .collection<AllowlistDoc>("admin_allowlist")
    .countDocuments({ estado: "activo", rol: "admin" });
}

export async function addAllowlistEntry(input: {
  wallet: string;
  rol: AllowlistDoc["rol"];
  creadoPor: string | null;
}): Promise<AllowlistDto> {
  const db = await ensureIndexes();
  const now = new Date();
  const doc: Omit<AllowlistDoc, "_id"> = {
    wallet: input.wallet,
    walletLower: input.wallet.toLowerCase(),
    rol: input.rol,
    estado: "activo",
    creadoPor: input.creadoPor,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db
    .collection<AllowlistDoc>("admin_allowlist")
    .insertOne(doc as AllowlistDoc);

  await recordAudit({
    actorWallet: input.creadoPor ?? input.wallet,
    accion: "config",
    walletNueva: input.wallet,
    meta: { entidad: "admin_allowlist", operacion: "alta", rol: input.rol },
  });

  return toDto({ _id: result.insertedId, ...doc });
}

export async function updateAllowlistEntry(
  wallet: string,
  patch: { estado?: AllowlistDoc["estado"]; rol?: AllowlistDoc["rol"] },
  actorWallet: string,
): Promise<AllowlistDto> {
  const db = await ensureIndexes();
  const current = await getAllowlistByWallet(wallet);
  if (!current) throw new ApiError(404, "no_encontrado", "Wallet no encontrada en la allowlist");

  const willBeInactive = patch.estado === "inactivo";
  const willLoseAdminRole = patch.rol === "operador";
  const wasActiveAdmin = current.estado === "activo" && current.rol === "admin";

  if (wasActiveAdmin && (willBeInactive || willLoseAdminRole)) {
    const activeAdmins = await countActiveAdmins();
    if (activeAdmins <= 1) {
      // AC-15 / CU-11 A5: nunca se permite quedarse sin ningún admin.
      throw new ApiError(
        409,
        "ultimo_admin",
        "No se puede revocar la última wallet administradora activa. Añade otra antes.",
      );
    }
  }

  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.estado !== undefined) $set.estado = patch.estado;
  if (patch.rol !== undefined) $set.rol = patch.rol;

  await db
    .collection<AllowlistDoc>("admin_allowlist")
    .updateOne({ _id: current._id }, { $set });

  await recordAudit({
    actorWallet,
    accion: "config",
    walletAnterior: current.wallet,
    meta: {
      entidad: "admin_allowlist",
      operacion: "edicion",
      cambios: patch,
    },
  });

  const updated = await getAllowlistByWallet(wallet);
  if (!updated) throw new ApiError(500, "interno", "No se pudo leer la allowlist actualizada");
  return toDto(updated);
}
