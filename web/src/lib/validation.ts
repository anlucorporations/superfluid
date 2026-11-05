import { utils } from "ethers";
import { z } from "zod";
import { CONCEPTOS, PERIODOS } from "./types";

export function normalizeWallet(value: string): string {
  const trimmed = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) throw new Error("wallet invalida");
  return utils.getAddress(trimmed);
}

export function walletsEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export const walletSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      try {
        normalizeWallet(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "wallet inválida" },
  )
  .transform((value) => normalizeWallet(value));

export const weiSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "importe inválido")
  .refine((value) => /^\d+$/.test(value) && BigInt(value) > 0n, "el importe debe ser mayor que 0")
  .refine(
    (value) => /^\d+$/.test(value) && BigInt(value) <= 10n ** 30n,
    "importe fuera de rango",
  );

export const periodoSchema = z.union(PERIODOS.map((p) => z.literal(p)) as [
  z.ZodLiteral<6>,
  z.ZodLiteral<15>,
  z.ZodLiteral<30>,
  z.ZodLiteral<90>,
]);

export const conceptoSchema = z.enum(CONCEPTOS);

export const datosPersonalesSchema = z
  .object({
    email: z.string().trim().email("email inválido").max(160).optional().or(z.literal("")),
    telefono: z.string().trim().max(40).optional().or(z.literal("")),
  })
  .transform((value) => ({
    ...(value.email ? { email: value.email } : {}),
    ...(value.telefono ? { telefono: value.telefono } : {}),
  }));

export const employeeCreateSchema = z.object({
  nombre: z.string().trim().min(1, "nombre obligatorio").max(120),
  wallet: walletSchema,
  proyectoId: z.string().trim().min(1).nullable().optional().default(null),
  concepto: conceptoSchema,
  montoPeriodo: weiSchema,
  periodo: periodoSchema,
  datosPersonales: datosPersonalesSchema.optional().default({}),
});

export const employeeUpdateSchema = z.object({
  nombre: z.string().trim().min(1).max(120).optional(),
  proyectoId: z.string().trim().min(1).nullable().optional(),
  concepto: conceptoSchema.optional(),
  montoPeriodo: weiSchema.optional(),
  periodo: periodoSchema.optional(),
  datosPersonales: datosPersonalesSchema.optional(),
  estado: z.enum(["activo", "inactivo"]).optional(),
});

export const walletChangeRequestSchema = z.object({
  newWallet: walletSchema,
  employeeSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  adminSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  nonce: z.string().trim().min(8).max(128),
  issuedAt: z.number().int().nonnegative(),
});

export const walletChangeAuthorizationSchema = z.object({
  employeeId: z.string().trim().min(1),
  newWallet: walletSchema,
});

export const projectCreateSchema = z.object({
  nombre: z.string().trim().min(1, "nombre obligatorio").max(120),
  descripcion: z.string().trim().max(500).optional().default(""),
  presupuesto: weiSchema.or(z.literal("0")).optional().default("0"),
  estado: z.enum(["activo", "cerrado"]).optional().default("activo"),
});

export const projectUpdateSchema = z.object({
  nombre: z.string().trim().min(1).max(120).optional(),
  descripcion: z.string().trim().max(500).optional(),
  presupuesto: weiSchema.or(z.literal("0")).optional(),
  estado: z.enum(["activo", "cerrado"]).optional(),
});

export const allowlistCreateSchema = z.object({
  wallet: walletSchema,
  rol: z.enum(["admin", "operador"]).optional().default("admin"),
  /** Mensaje SIWE firmado por la wallet nueva (AC-15). */
  message: z.string().min(1).max(4000),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});

export const allowlistChallengeSchema = z.object({
  wallet: walletSchema,
});

export const allowlistUpdateSchema = z.object({
  estado: z.enum(["activo", "inactivo"]),
  rol: z.enum(["admin", "operador"]).optional(),
});

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  empleadoId: z.string().trim().min(1).optional(),
});

export const systemUpdateSchema = z.object({
  brltAddress: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  brltXAddress: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  deployBlock: z.number().int().nonnegative().optional(),
  tasaRefrescoMs: z.number().int().min(1000).max(120_000).optional(),
  faucetUrl: z.string().trim().url().optional(),
  rpcUrl: z.string().trim().url().optional(),
});

export const nonceRequestSchema = z.object({
  wallet: walletSchema,
  purpose: z.enum(["admin", "suite"]),
});

export const flowRegisterSchema = z.object({
  flowId: z.string().trim().regex(/^\d+$/, "flowId inválido").max(40),
  employeeId: z.string().trim().min(1).optional(),
  txHash: z.string().trim().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  batchId: z.string().trim().min(1).optional(),
});

export const flowActionSchema = z.object({
  flowId: z.string().trim().regex(/^\d+$/).max(40),
  operacion: z.enum([
    "pausa",
    "reanudacion",
    "terminacion",
    "liquidacion",
    "cambio_receptor",
    "mint",
    "burn",
  ]),
  employeeId: z.string().trim().min(1).optional(),
  txHash: z.string().trim().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  /** Flujo nuevo que abre `changeReceiver` al migrar a otra wallet (AC-03). */
  newFlowId: z.string().trim().regex(/^\d+$/).optional(),
  meta: z.record(z.unknown()).optional(),
});

export const scheduledFlowCreateSchema = z.object({
  employeeId: z.string().trim().min(1),
  amount: weiSchema,
  periodo: periodoSchema,
  fechaInicio: z.string().trim().datetime({ offset: true }),
});

export const scheduledFlowUpdateSchema = z.object({
  estado: z.enum(["ejecutado", "cancelado", "fallido"]),
  flowId: z.string().trim().regex(/^\d+$/).optional(),
  txHash: z.string().trim().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  error: z.string().trim().max(500).optional(),
});

export const batchCreateSchema = z.object({
  employeeIds: z.array(z.string().trim().min(1)).min(1).max(10),
});

export const suiteProfileSchema = z.object({
  datosPersonales: z
    .object({
      email: z.string().trim().email().max(200),
      telefono: z.string().trim().max(40),
    })
    .partial()
    .optional(),
  consentimiento: z.boolean().optional(),
});

export const suiteActionSchema = z.object({
  operacion: z.enum(["cobro", "liquidacion"]),
  flowId: z.string().trim().regex(/^\d+$/).optional(),
  txHash: z.string().trim().regex(/^0x[0-9a-fA-F]{64}$/),
});

export const verifyRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type SystemUpdateInput = z.infer<typeof systemUpdateSchema>;
export type FlowRegisterInput = z.infer<typeof flowRegisterSchema>;
export type FlowActionInput = z.infer<typeof flowActionSchema>;
export type ScheduledFlowCreateInput = z.infer<typeof scheduledFlowCreateSchema>;
export type ScheduledFlowUpdateInput = z.infer<typeof scheduledFlowUpdateSchema>;
export type SuiteProfileInput = z.infer<typeof suiteProfileSchema>;
export type SuiteActionInput = z.infer<typeof suiteActionSchema>;
