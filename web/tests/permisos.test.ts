import { describe, expect, it } from "vitest";
import {
  SECCIONES_ADMIN,
  SECCIONES_EMPLEADO,
  SECCIONES_OPERADOR,
  SECCIONES_SUPER_ADMIN,
  seccionesDeSesion,
  seccionesPorRol,
} from "../src/lib/permisos";
import type { AllowlistDoc, Seccion } from "../src/lib/types";
import { SECCIONES } from "../src/lib/types";

function entry(rol: AllowlistDoc["rol"], secciones?: Seccion[]): AllowlistDoc {
  return {
    _id: {} as AllowlistDoc["_id"],
    wallet: "0x0000000000000000000000000000000000000001",
    walletLower: "0x0000000000000000000000000000000000000001",
    rol,
    estado: "activo",
    creadoPor: null,
    ...(secciones ? { secciones } : {}),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as AllowlistDoc;
}

describe("permisos del panel (H12)", () => {
  it("super_admin ve todas las secciones", () => {
    expect(seccionesPorRol("super_admin")).toEqual(SECCIONES);
    expect(SECCIONES_SUPER_ADMIN).toEqual(SECCIONES);
  });

  it("admin de sistema ve todo menos sistema", () => {
    const secciones = seccionesPorRol("admin");
    expect(secciones).toContain("resumen");
    expect(secciones).toContain("finanzas");
    expect(secciones).toContain("empleados");
    expect(secciones).not.toContain("sistema");
    expect(SECCIONES_ADMIN).toEqual(secciones);
  });

  it("operador solo ve resumen, finanzas y flujos", () => {
    expect(seccionesPorRol("operador")).toEqual(["resumen", "finanzas", "flujos"]);
    expect(SECCIONES_OPERADOR).toEqual(["resumen", "finanzas", "flujos"]);
  });

  it("la allowlist puede sobreescribir las secciones (sin duplicados ni inválidas)", () => {
    const override = seccionesPorRol("operador", ["flujos", "flujos", "inexistente"]);
    expect(override).toEqual(["flujos"]);
  });

  it("sesión admin sin allowlist activa → sin secciones", () => {
    expect(seccionesDeSesion("admin", null)).toEqual({ secciones: [] });
    const inactiva = { ...entry("admin"), estado: "inactivo" as const };
    expect(seccionesDeSesion("admin", inactiva).secciones).toEqual([]);
  });

  it("sesión de empleado solo tiene finanzas", () => {
    expect(seccionesDeSesion("empleado", null).secciones).toEqual(["finanzas"]);
    expect(SECCIONES_EMPLEADO).toEqual(["finanzas"]);
    expect(seccionesDeSesion("empleado", null).adminRol).toBeUndefined();
  });

  it("sesión admin devuelve su rol de allowlist", () => {
    const { adminRol, secciones } = seccionesDeSesion("admin", entry("super_admin"));
    expect(adminRol).toBe("super_admin");
    expect(secciones).toContain("sistema");
  });
});
