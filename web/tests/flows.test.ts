import { describe, expect, it } from "vitest";
import { deriveFlowStatus } from "@/lib/flows-onchain";
import { humanDuration, timeLeft } from "@/lib/rates";
import {
  batchCreateSchema,
  flowActionSchema,
  flowRegisterSchema,
  scheduledFlowCreateSchema,
  scheduledFlowUpdateSchema,
  suiteActionSchema,
  suiteProfileSchema,
} from "@/lib/validation";

const WALLET = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const nowSeconds = Math.floor(Date.now() / 1000);

describe("deriveFlowStatus (estado visible del flujo)", () => {
  it("terminado gana sobre cualquier otro estado", () => {
    expect(
      deriveFlowStatus({ terminated: true, paused: true, endsAt: nowSeconds + 3600 }),
    ).toBe("terminado");
  });

  it("pausado se muestra aunque endsAt haya pasado", () => {
    expect(
      deriveFlowStatus({ terminated: false, paused: true, endsAt: nowSeconds - 10 }),
    ).toBe("pausado");
  });

  it("vencido cuando endsAt ya pasó (AC-02, pendiente de liquidar)", () => {
    expect(
      deriveFlowStatus({ terminated: false, paused: false, endsAt: nowSeconds - 10 }),
    ).toBe("vencido");
  });

  it("activo mientras queda tiempo", () => {
    expect(
      deriveFlowStatus({ terminated: false, paused: false, endsAt: nowSeconds + 3600 }),
    ).toBe("activo");
  });
});

describe("humanDuration / timeLeft", () => {
  it("formatea días, horas y minutos", () => {
    expect(humanDuration(0)).toBe("0 s");
    expect(humanDuration(45)).toBe("45 s");
    expect(humanDuration(90)).toBe("1 min");
    expect(humanDuration(3_600)).toBe("1 h");
    expect(humanDuration(3_900)).toBe("1 h 5 min");
    expect(humanDuration(86_400)).toBe("1 d");
    expect(humanDuration(93_600)).toBe("1 d 2 h");
  });

  it("timeLeft marca vencido en el pasado", () => {
    expect(timeLeft(new Date(Date.now() - 60_000).toISOString())).toBe("vencido");
    expect(timeLeft(new Date(Date.now() + 90 * 60_000).toISOString())).toBe("1 h 30 min");
  });
});

describe("esquemas de Suite (H5)", () => {
  it("suiteProfileSchema acepta datos parciales y consentimiento", () => {
    expect(suiteProfileSchema.safeParse({ consentimiento: true }).success).toBe(true);
    expect(
      suiteProfileSchema.safeParse({ datosPersonales: { email: "a@b.es" } }).success,
    ).toBe(true);
    expect(
      suiteProfileSchema.safeParse({ datosPersonales: { email: "no-es-mail" } }).success,
    ).toBe(false);
  });

  it("suiteActionSchema exige tx real y operación válida", () => {
    const base = { operacion: "cobro", txHash: `0x${"a".repeat(64)}` };
    expect(suiteActionSchema.safeParse(base).success).toBe(true);
    expect(suiteActionSchema.safeParse({ ...base, txHash: "0xabc" }).success).toBe(false);
    expect(
      suiteActionSchema.safeParse({ ...base, flowId: "7" }).success,
    ).toBe(true);
    expect(
      suiteActionSchema.safeParse({ ...base, operacion: "mint" }).success,
    ).toBe(false);
  });
});

describe("esquemas de flujos (H4)", () => {
  it("flowRegisterSchema exige un flowId numérico", () => {
    expect(flowRegisterSchema.safeParse({ flowId: "12" }).success).toBe(true);
    expect(flowRegisterSchema.safeParse({ flowId: "0x12" }).success).toBe(false);
    expect(flowRegisterSchema.safeParse({ flowId: "" }).success).toBe(false);
  });

  it("flowRegisterSchema valida el txHash si viene", () => {
    expect(
      flowRegisterSchema.safeParse({ flowId: "1", txHash: `0x${"a".repeat(64)}` }).success,
    ).toBe(true);
    expect(flowRegisterSchema.safeParse({ flowId: "1", txHash: "0xabc" }).success).toBe(false);
  });

  it("flowActionSchema limita las operaciones permitidas", () => {
    for (const operacion of [
      "pausa",
      "reanudacion",
      "terminacion",
      "liquidacion",
      "cambio_receptor",
      "mint",
      "burn",
    ]) {
      expect(flowActionSchema.safeParse({ flowId: "1", operacion }).success).toBe(true);
    }
    expect(flowActionSchema.safeParse({ flowId: "1", operacion: "otra" }).success).toBe(false);
  });

  it("scheduledFlowCreateSchema exige importe entero, periodo y fecha ISO", () => {
    const base = {
      employeeId: "64b7f9f1f1f1f1f1f1f1f1f1",
      amount: "2000000000000000000000",
      periodo: 30,
      fechaInicio: new Date(Date.now() + 86_400_000).toISOString(),
    };
    expect(scheduledFlowCreateSchema.safeParse(base).success).toBe(true);
    expect(scheduledFlowCreateSchema.safeParse({ ...base, periodo: 12 }).success).toBe(false);
    expect(scheduledFlowCreateSchema.safeParse({ ...base, fechaInicio: "mañana" }).success).toBe(
      false,
    );
  });

  it("scheduledFlowUpdateSchema solo admite el enum de AC-05", () => {
    for (const estado of ["ejecutado", "cancelado", "fallido"]) {
      expect(scheduledFlowUpdateSchema.safeParse({ estado }).success).toBe(true);
    }
    expect(scheduledFlowUpdateSchema.safeParse({ estado: "proximo" }).success).toBe(false);
  });

  it("batchCreateSchema acota el lote a 10 empleados (AC-09)", () => {
    expect(batchCreateSchema.safeParse({ employeeIds: [WALLET] }).success).toBe(true);
    expect(
      batchCreateSchema.safeParse({ employeeIds: Array.from({ length: 10 }, () => WALLET) })
        .success,
    ).toBe(true);
    expect(
      batchCreateSchema.safeParse({ employeeIds: Array.from({ length: 11 }, () => WALLET) })
        .success,
    ).toBe(false);
    expect(batchCreateSchema.safeParse({ employeeIds: [] }).success).toBe(false);
  });
});
