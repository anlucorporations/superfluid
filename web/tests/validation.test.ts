import { describe, expect, it } from "vitest";
import {
  allowlistCreateSchema,
  employeeCreateSchema,
  employeeUpdateSchema,
  periodoSchema,
  systemUpdateSchema,
  walletSchema,
  weiSchema,
} from "@/lib/validation";

const WALLET = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

describe("walletSchema", () => {
  it("normaliza a checksum", () => {
    const parsed = walletSchema.parse(WALLET.toLowerCase());
    expect(parsed).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });

  it("rechaza addresses inválidas", () => {
    expect(walletSchema.safeParse("0x123").success).toBe(false);
    expect(walletSchema.safeParse("no-es-wallet").success).toBe(false);
  });
});

describe("weiSchema", () => {
  it("acepta enteros positivos", () => {
    expect(weiSchema.parse("1000")).toBe("1000");
  });

  it("rechaza cero, decimales y negativos", () => {
    expect(weiSchema.safeParse("0").success).toBe(false);
    expect(weiSchema.safeParse("1.5").success).toBe(false);
    expect(weiSchema.safeParse("-1").success).toBe(false);
  });
});

describe("employeeCreateSchema", () => {
  it("aplica defaults de proyecto y datos personales", () => {
    const parsed = employeeCreateSchema.parse({
      nombre: "Ana",
      wallet: WALLET,
      concepto: "nomina",
      montoPeriodo: "2000000000000000000000",
      periodo: 30,
    });
    expect(parsed.proyectoId).toBeNull();
    expect(parsed.datosPersonales).toEqual({});
  });

  it("rechaza periodos no soportados", () => {
    const result = employeeCreateSchema.safeParse({
      nombre: "Ana",
      wallet: WALLET,
      concepto: "nomina",
      montoPeriodo: "1",
      periodo: 7,
    });
    expect(result.success).toBe(false);
  });
});

describe("periodoSchema / employeeUpdateSchema", () => {
  it("solo admite 6, 15, 30 y 90", () => {
    for (const value of [6, 15, 30, 90]) expect(periodoSchema.safeParse(value).success).toBe(true);
    expect(periodoSchema.safeParse(12).success).toBe(false);
  });

  it("permite edición parcial", () => {
    expect(employeeUpdateSchema.parse({}).nombre).toBeUndefined();
    expect(employeeUpdateSchema.parse({ estado: "inactivo" }).estado).toBe("inactivo");
  });
});

describe("systemUpdateSchema", () => {
  it("acota la tasa de refresco", () => {
    expect(systemUpdateSchema.safeParse({ tasaRefrescoMs: 500 }).success).toBe(false);
    expect(systemUpdateSchema.safeParse({ tasaRefrescoMs: 5000 }).success).toBe(true);
    expect(systemUpdateSchema.safeParse({ tasaRefrescoMs: 200_000 }).success).toBe(false);
  });

  it("valida addresses hex de 40 caracteres", () => {
    expect(systemUpdateSchema.safeParse({ brltAddress: "0x123" }).success).toBe(false);
    expect(systemUpdateSchema.safeParse({ brltAddress: WALLET }).success).toBe(true);
  });
});

describe("allowlistCreateSchema", () => {
  it("exige la firma de confirmación (AC-15)", () => {
    const base = { wallet: WALLET, rol: "admin" };
    expect(allowlistCreateSchema.safeParse(base).success).toBe(false);
    expect(
      allowlistCreateSchema.safeParse({
        ...base,
        message: "mensaje",
        signature: `0x${"a".repeat(130)}`,
      }).success,
    ).toBe(true);
  });
});
