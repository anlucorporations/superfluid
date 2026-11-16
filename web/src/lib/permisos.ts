import type { NextRequest } from "next/server";
import { ApiError } from "./http";
import { requireSession } from "./auth";
import { getAllowlistByWallet } from "./repositories/allowlist";
import type { AdminRol, AllowlistDoc, Seccion, SessionDoc } from "./types";
import { SECCIONES } from "./types";

/**
 * Permisos del panel admin (H12):
 * - super_admin: todas las secciones (incluida la gestión de allowlist y roles).
 * - admin (Administrador de sistema): todas menos `sistema` (config + allowlist).
 * - operador: resumen, finanzas y flujos (solo lectura de operación).
 * - empleado (sesión de Suite): solo `finanzas` (sus propias finanzas).
 * La allowlist puede sobreescribir la lista con `secciones: Seccion[]`.
 */

export const SECCIONES_SUPER_ADMIN: Seccion[] = [...SECCIONES];

export const SECCIONES_ADMIN: Seccion[] = SECCIONES.filter((s) => s !== "sistema");

export const SECCIONES_OPERADOR: Seccion[] = ["resumen", "finanzas", "flujos"];

export const SECCIONES_EMPLEADO: Seccion[] = ["finanzas"];

export function seccionesPorRol(rol: AdminRol, secciones?: Seccion[]): Seccion[] {
  if (Array.isArray(secciones)) {
    // Solo valores válidos y sin duplicados; siempre se respeta lo declarado.
    return [...new Set(secciones.filter((s) => (SECCIONES as readonly string[]).includes(s)))];
  }
  switch (rol) {
    case "super_admin":
      return SECCIONES_SUPER_ADMIN;
    case "admin":
      return SECCIONES_ADMIN;
    case "operador":
      return SECCIONES_OPERADOR;
  }
}

export function seccionesDeSesion(role: SessionDoc["role"], allowlist: AllowlistDoc | null): {
  adminRol?: AdminRol;
  secciones: Seccion[];
} {
  if (role === "admin") {
    if (!allowlist || allowlist.estado !== "activo") return { secciones: [] };
    return {
      adminRol: allowlist.rol,
      secciones: seccionesPorRol(allowlist.rol, allowlist.secciones),
    };
  }
  return { secciones: SECCIONES_EMPLEADO };
}

/** Exige sesión admin autorizada para la sección pedida. */
export async function requireAdminSection(
  req: NextRequest,
  seccion: Seccion,
): Promise<SessionDoc> {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    throw new ApiError(403, "prohibido", "Se requiere rol administrador");
  }
  const entry = await getAllowlistByWallet(session.wallet);
  const { secciones } = seccionesDeSesion(session.role, entry);
  if (!secciones.includes(seccion)) {
    throw new ApiError(403, "seccion_no_autorizada", `Sección "${seccion}" no autorizada`);
  }
  return session;
}

/** Exige sesión de Super Administrador (gestión de allowlist y roles). */
export async function requireSuperAdmin(req: NextRequest): Promise<SessionDoc> {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    throw new ApiError(403, "prohibido", "Se requiere rol administrador");
  }
  const entry = await getAllowlistByWallet(session.wallet);
  if (!entry || entry.estado !== "activo" || entry.rol !== "super_admin") {
    throw new ApiError(403, "super_admin_requerido", "Se requiere Super Administrador");
  }
  return session;
}
