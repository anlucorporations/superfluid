import { describe, expect, it } from "vitest";
import {
  PERIOD_SECONDS,
  WEI_PER_BRLT,
  dailyProjection,
  flowRateFor,
  formatBrlt,
  monthlyProjection,
  parseBrlt,
  residueFor,
  toDecimalString,
} from "@/lib/rates";

const amount = 2000n * WEI_PER_BRLT;

describe("flow rate (regla H-06: floor al wei)", () => {
  it("2000 BRLT / 30 días = 771604938271604 wei/s", () => {
    expect(flowRateFor(amount, 30)).toBe("771604938271604");
  });

  it("no pierde tokens: tasa × segundos + residuo = importe", () => {
    const rate = BigInt(flowRateFor(amount, 30));
    const residue = BigInt(residueFor(amount, 30));
    expect(rate * BigInt(PERIOD_SECONDS[30]) + residue).toBe(amount);
    expect(residue).toBeLessThan(BigInt(PERIOD_SECONDS[30]));
  });

  it("acepta importes como string", () => {
    expect(flowRateFor(amount.toString(), 30)).toBe(flowRateFor(amount, 30));
  });

  it("expone los segundos de cada periodo", () => {
    expect(PERIOD_SECONDS[6]).toBe(518_400);
    expect(PERIOD_SECONDS[15]).toBe(1_296_000);
    expect(PERIOD_SECONDS[30]).toBe(2_592_000);
    expect(PERIOD_SECONDS[90]).toBe(7_776_000);
  });
});

describe("conversión BRLT (18 decimales)", () => {
  it("parsea enteros y decimales con punto o coma", () => {
    expect(parseBrlt("2000")).toBe("2000000000000000000000");
    expect(parseBrlt("2000.5")).toBe("2000500000000000000000");
    expect(parseBrlt("2000,5")).toBe("2000500000000000000000");
    expect(parseBrlt("0.000000000000000001")).toBe("1");
  });

  it("rechaza importes mal formados", () => {
    expect(() => parseBrlt("")).toThrow();
    expect(() => parseBrlt("1.2.3")).toThrow();
    expect(() => parseBrlt("abc")).toThrow();
    expect(() => parseBrlt("-5")).toThrow();
  });

  it("formatea sin notación científica", () => {
    expect(formatBrlt("2000500000000000000000")).toBe("2.000,5");
    expect(formatBrlt(0n)).toBe("0,0");
  });

  it("roundtrip input de formulario", () => {
    expect(toDecimalString(parseBrlt("2000.5"))).toBe("2000.5");
    expect(toDecimalString("0")).toBe("0");
    expect(toDecimalString(1n)).toBe("0.000000000000000001");
  });
});

describe("proyecciones informativas", () => {
  it("mensual = tasa × 30 días", () => {
    expect(monthlyProjection("771604938271604")).toBe("1999999999999997568000");
  });

  it("diaria = tasa × 86400", () => {
    expect(dailyProjection("1000000000000000")).toBe("86400000000000000000");
  });
});
