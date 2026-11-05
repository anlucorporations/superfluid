import type { ObjectId } from "mongodb";

export type Role = "admin" | "empleado";

export type EmployeeStatus = "activo" | "inactivo";

export const CONCEPTOS = [
  "mantenimiento",
  "nomina",
  "proyecto_mvp",
  "actividad_espacial",
  "otros",
] as const;
export type Concepto = (typeof CONCEPTOS)[number];

export const PERIODOS = [6, 15, 30, 90] as const;
export type Periodo = (typeof PERIODOS)[number];

export interface EmployeeDoc {
  _id: ObjectId;
  nombre: string;
  wallet: string;
  walletLower: string;
  proyectoId: ObjectId | null;
  concepto: Concepto;
  /** Importe en wei de BRLT, serializado como string para no perder precisión. */
  montoPeriodo: string;
  periodo: Periodo;
  estado: EmployeeStatus;
  datosPersonales: {
    email?: string;
    telefono?: string;
  };
  /** Consentimiento de tratamiento de datos (GDPR, AC-10). */
  consentimiento: { aceptado: boolean; fecha: Date | null };
  /** Solicitud de borrado de datos personales (borrado inmediato; anonimización a 30 d). */
  borroSolicitado: boolean;
  /** Activa tras el job de anonimización a 30 días (H6). */
  anonymizado?: boolean;
  /** Instante de la solicitud de borrado (ancla del anonimizado a 30 días, AC-10). */
  borroSolicitadoAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
}

export interface ProjectDoc {
  _id: ObjectId;
  nombre: string;
  descripcion: string;
  /** Presupuesto informativo en wei de BRLT. */
  presupuesto: string;
  estado: "activo" | "cerrado";
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDoc {
  _id: ObjectId;
  /** sha256 del token de sesión; el token en claro solo vive en la cookie. */
  tokenHash: string;
  wallet: string;
  walletLower: string;
  role: Role;
  employeeId: ObjectId | null;
  csrfToken: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent?: string;
}

export interface NonceDoc {
  _id: ObjectId;
  /** sha256 del nonce; el nonce en claro solo se entrega al cliente. */
  nonceHash: string;
  wallet: string;
  walletLower: string;
  purpose: "admin" | "suite" | "wallet_change";
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface AllowlistDoc {
  _id: ObjectId;
  wallet: string;
  walletLower: string;
  rol: "admin" | "operador";
  estado: "activo" | "inactivo";
  creadoPor: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditEventDoc {
  _id: ObjectId;
  actorWallet: string;
  accion:
    | "alta"
    | "edicion"
    | "cambio_wallet"
    | "baja"
    | "config"
    | "login"
    | "logout"
    | "perfil"
    | "solicitud_borrado"
    | "job"
    | "flujo";
  empleadoId: string | null;
  walletAnterior: string | null;
  walletNueva: string | null;
  txHash: string | null;
  meta: Record<string, unknown>;
  createdAt: Date;
}

export interface SystemConfigDoc {
  _id: "system";
  chainId: number;
  rpcUrl: string;
  brltAddress: string;
  brltXAddress: string;
  deployBlock: number;
  tasaRefrescoMs: number;
  faucetUrl: string;
  updatedAt: Date;
}

/** Estado de un flujo, derivado de BrltX + MongoDB (CU-06..CU-08). */
export type FlowStatus = "activo" | "pausado" | "vencido" | "terminado";

/** Copia local de un flujo on-chain para listar e historiar (RF-09). */
export interface FlowDoc {
  _id: ObjectId;
  flowId: string;
  employeeId: ObjectId | null;
  sender: string;
  receiver: string;
  /** receiver en minúsculas para búsquedas por wallet del empleado (Suite). */
  receiverLower: string;
  /** BRLT depositado en escrow (wei). */
  amount: string;
  durationSeconds: number;
  /** Tasa en wei/s. */
  flowRate: string;
  startedAt: Date;
  endsAt: Date;
  estado: FlowStatus;
  txHash: string | null;
  /** Lote al que pertenece el flujo (CU-09); permite reanudar sin duplicar. */
  batchId: ObjectId | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  terminatedAt: Date | null;
  paid: string | null;
  returned: string | null;
  lastSyncedAt: Date | null;
}

export type ScheduledFlowStatus = "proximo" | "ejecutado" | "cancelado" | "fallido";

/** Programación de nómina (CU-05, AC-05). */
export interface ScheduledFlowDoc {
  _id: ObjectId;
  employeeId: ObjectId;
  employeeNombre: string;
  receiver: string;
  /** Importe en wei de BRLT. */
  amount: string;
  periodo: Periodo;
  durationSeconds: number;
  /** Fecha/hora de inicio programada. */
  fechaInicio: Date;
  estado: ScheduledFlowStatus;
  flowId: string | null;
  txHash: string | null;
  error: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  executedAt: Date | null;
}

/** Lote de flujos (CU-09): permite reanudar sin duplicar pagos. */
export interface FlowBatchDoc {
  _id: ObjectId;
  estado: "en_curso" | "completado" | "cancelado";
  total: number;
  completados: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Registro de un evento on-chain de BrltX (H6, flows_history). */
export interface FlowHistoryDoc {
  _id?: ObjectId;
  /** Clave de idempotencia: txHash-logIndex. */
  key: string;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  evento:
    | "FlowCreated"
    | "FlowUpdated"
    | "FlowSettled"
    | "FlowDeleted"
    | "FlowExpired"
    | "Upgraded"
    | "Downgraded"
    | "DurationAllowed";
  flowId: string | null;
  sender: string | null;
  receiver: string | null;
  /** Importe del evento (amount/paid/returned según evento). */
  amount: string | null;
  extra: Record<string, unknown>;
  createdAt: Date;
}

/** Ejecución de un job interno (H6, panel de estado). */
export interface JobRunDoc {
  _id?: ObjectId;
  job: JobName;
  ok: boolean;
  startedAt: Date;
  finishedAt: Date;
  /** Resumen de lo tocado (número de docs, filas, etc.). */
  result: Record<string, unknown>;
  error?: string | null;
  /** "cron" (programado) o "manual" (botón del panel). */
  trigger: "cron" | "manual";
}

export type JobName =
  | "reconcile_flows"
  | "flows_history"
  | "anonymize_pii"
  | "mark_scheduled_due";

// ---------------------------------------------------------------------------
// DTOs serializables (frontera API / UI)
// ---------------------------------------------------------------------------

export interface EmployeeDto {
  id: string;
  nombre: string;
  wallet: string;
  proyectoId: string | null;
  proyectoNombre: string | null;
  concepto: Concepto;
  montoPeriodo: string;
  periodo: Periodo;
  estado: EmployeeStatus;
  datosPersonales: { email?: string; telefono?: string };
  consentimiento: { aceptado: boolean; fecha: string | null } | null;
  borroSolicitado: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDto {
  id: string;
  nombre: string;
  descripcion: string;
  presupuesto: string;
  estado: "activo" | "cerrado";
  createdAt: string;
  updatedAt: string;
}

export interface SessionInfo {
  wallet: string;
  role: Role;
  employeeId: string | null;
  expiresAt: string;
}

export interface FlowDto {
  id: string;
  flowId: string;
  employeeId: string | null;
  employeeNombre: string | null;
  sender: string;
  receiver: string;
  amount: string;
  durationSeconds: number;
  flowRate: string;
  startedAt: string;
  endsAt: string;
  estado: FlowStatus;
  /** Devengo pendiente de acreditar (wei), calculado on-chain. */
  pending: string;
  deposited: string;
  settled: string;
  paused: boolean;
  terminated: boolean;
  onchain: boolean;
  txHash: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string | null;
}

export interface ScheduledFlowDto {
  id: string;
  employeeId: string;
  employeeNombre: string;
  receiver: string;
  amount: string;
  periodo: Periodo;
  durationSeconds: number;
  fechaInicio: string;
  estado: ScheduledFlowStatus;
  flowId: string | null;
  txHash: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  executedAt: string | null;
}

export interface TreasuryDto {
  adminBrlt: string;
  adminBrltX: string;
  brltXSupply: string;
  escrow: string;
  backing: string;
  allowance: string;
  totalSupplyBrlt: string;
}
