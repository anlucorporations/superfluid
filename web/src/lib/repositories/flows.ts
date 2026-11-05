import { ObjectId } from "mongodb";
import { ensureIndexes } from "../db";
import { ApiError } from "../http";
import { getFlowOnChain, getPendingOnChain, deriveFlowStatus } from "../flows-onchain";
import type {
  EmployeeDoc,
  FlowBatchDoc,
  FlowDoc,
  FlowDto,
  ScheduledFlowDoc,
  ScheduledFlowDto,
  ScheduledFlowStatus,
} from "../types";
import { recordAudit } from "./audit";

/**
 * Persistencia de flujos (H4). MongoDB guarda una copia del estado on-chain para
 * listar rápido, historiar y reconciliar (H6); la verdad siempre es el contrato.
 */

function toFlowDto(
  doc: FlowDoc,
  employeeNombre: string | null,
  pending: string,
): FlowDto {
  return {
    id: doc._id.toString(),
    flowId: doc.flowId,
    employeeId: doc.employeeId ? doc.employeeId.toString() : null,
    employeeNombre,
    sender: doc.sender,
    receiver: doc.receiver,
    amount: doc.amount,
    durationSeconds: doc.durationSeconds,
    flowRate: doc.flowRate,
    startedAt: doc.startedAt.toISOString(),
    endsAt: doc.endsAt.toISOString(),
    estado: doc.estado,
    pending,
    deposited: doc.amount,
    settled: doc.paid ?? "0",
    paused: doc.estado === "pausado",
    terminated: doc.estado === "terminado",
    onchain: doc.lastSyncedAt !== null,
    txHash: doc.txHash,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    lastSyncedAt: doc.lastSyncedAt ? doc.lastSyncedAt.toISOString() : null,
  };
}

function toScheduledDto(doc: ScheduledFlowDoc): ScheduledFlowDto {
  return {
    id: doc._id.toString(),
    employeeId: doc.employeeId.toString(),
    employeeNombre: doc.employeeNombre,
    receiver: doc.receiver,
    amount: doc.amount,
    periodo: doc.periodo,
    durationSeconds: doc.durationSeconds,
    fechaInicio: doc.fechaInicio.toISOString(),
    estado: doc.estado,
    flowId: doc.flowId,
    txHash: doc.txHash,
    error: doc.error,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    executedAt: doc.executedAt ? doc.executedAt.toISOString() : null,
  };
}

async function employeeNames(): Promise<Map<string, string>> {
  const db = await ensureIndexes();
  const docs = await db
    .collection<EmployeeDoc>("employees")
    .find({}, { projection: { nombre: 1 } })
    .toArray();
  return new Map(docs.map((doc) => [doc._id.toString(), doc.nombre]));
}

/** Reconciliación de un documento con el contrato. Devuelve el doc actualizado. */
async function syncDoc(doc: FlowDoc): Promise<FlowDoc> {
  const onchain = await getFlowOnChain(doc.flowId);
  if (!onchain) return doc;
  const pending = (await getPendingOnChain(doc.flowId)) ?? 0n;
  const now = new Date();
  const estado = deriveFlowStatus(onchain);
  const update: Partial<FlowDoc> = {
    estado,
    receiver: onchain.receiver,
    receiverLower: onchain.receiver.toLowerCase(),
    // Tasa contractual: al pausar el contrato guarda la tasa en `rateBeforePause`.
    flowRate: (onchain.paused ? onchain.rateBeforePause : onchain.flowRate).toString(),
    amount: onchain.deposited.toString(),
    paid: onchain.settled.toString(),
    startedAt: new Date(onchain.startedAt * 1000),
    endsAt: new Date(onchain.endsAt * 1000),
    updatedAt: now,
    lastSyncedAt: now,
  };
  if (estado === "terminado") {
    update.terminatedAt = doc.terminatedAt ?? now;
    update.returned = (onchain.deposited - onchain.settled).toString();
  }
  const db = await ensureIndexes();
  await db.collection<FlowDoc>("flows").updateOne({ _id: doc._id }, { $set: update });
  return { ...doc, ...update, lastSyncedAt: now, estado, receiver: onchain.receiver } as FlowDoc;
}

export interface FlowFilter {
  employeeId?: string;
  estado?: FlowDoc["estado"];
  limit?: number;
}

export async function listFlows(filter: FlowFilter = {}): Promise<FlowDto[]> {
  const db = await ensureIndexes();
  const query: Record<string, unknown> = {};
  if (filter.employeeId && ObjectId.isValid(filter.employeeId)) {
    query.employeeId = new ObjectId(filter.employeeId);
  }
  if (filter.estado) query.estado = filter.estado;

  const docs = await db
    .collection<FlowDoc>("flows")
    .find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(filter.limit ?? 100, 200))
    .toArray();

  const names = await employeeNames();

  // Reconciliación acotada: como máximo 60 lecturas por petición.
  const toSync = docs.filter((doc) => doc.estado !== "terminado").slice(0, 60);
  const synced = new Map<string, FlowDoc>();
  await Promise.all(
    toSync.map(async (doc) => {
      synced.set(doc._id.toString(), await syncDoc(doc));
    }),
  );

  const result: FlowDto[] = [];
  for (const original of docs) {
    const doc = synced.get(original._id.toString()) ?? original;
    const pendingValue =
      doc.estado === "terminado" ? "0" : ((await getPendingOnChain(doc.flowId)) ?? 0n).toString();
    result.push(
      toFlowDto(doc, doc.employeeId ? names.get(doc.employeeId.toString()) ?? null : null, pendingValue),
    );
  }
  return result;
}

/**
 * Flujos de una wallet receptora (Suite del Empleado, H5). Se reconcilian igual
 * que el listado admin pero sin límite de paginación (la wallet de una persona).
 */
export async function listFlowsByReceiver(receiver: string): Promise<FlowDto[]> {
  const receiverLower = receiver.toLowerCase();
  const db = await ensureIndexes();
  const docs = await db
    .collection<FlowDoc>("flows")
    .find({ receiverLower })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();

  const names = await employeeNames();
  const synced = new Map<string, FlowDoc>();
  await Promise.all(
    docs
      .filter((doc) => doc.estado !== "terminado")
      .map(async (doc) => {
        synced.set(doc._id.toString(), await syncDoc(doc));
      }),
  );

  const result: FlowDto[] = [];
  for (const original of docs) {
    const doc = synced.get(original._id.toString()) ?? original;
    const pendingValue =
      doc.estado === "terminado" ? "0" : ((await getPendingOnChain(doc.flowId)) ?? 0n).toString();
    result.push(
      toFlowDto(
        doc,
        doc.employeeId ? names.get(doc.employeeId.toString()) ?? null : null,
        pendingValue,
      ),
    );
  }
  return result;
}

export async function getFlowById(id: string): Promise<FlowDto | null> {  if (!ObjectId.isValid(id)) return null;
  const db = await ensureIndexes();
  const doc = await db.collection<FlowDoc>("flows").findOne({ _id: new ObjectId(id) });
  if (!doc) return null;
  const synced = await syncDoc(doc);
  const names = await employeeNames();
  const pending = ((await getPendingOnChain(synced.flowId)) ?? 0n).toString();
  return toFlowDto(
    synced,
    synced.employeeId ? names.get(synced.employeeId.toString()) ?? null : null,
    pending,
  );
}

export interface RegisterFlowInput {
  flowId: string;
  employeeId?: string | null;
  txHash?: string | null;
  batchId?: string | null;
  actorWallet: string;
  /**
   * `false` solo en el job de reconciliación (H6): el actor es el sistema y el
   * flujo se descubre leyendo la cadena, no la petición del usuario.
   */
  verifySender?: boolean;
}

/**
 * Registra en MongoDB un flujo ya creado on-chain. Nunca se confía en el cliente:
 * se lee `getFlow`; por defecto se exige que el emisor sea el admin de la sesión.
 */
export async function registerFlow(input: RegisterFlowInput): Promise<FlowDto> {
  const onchain = await getFlowOnChain(input.flowId);
  if (!onchain) {
    throw new ApiError(
      422,
      "flujo_no_encontrado",
      "El flujo no existe on-chain (o el RPC no responde).",
    );
  }
  if (input.verifySender !== false && onchain.sender.toLowerCase() !== input.actorWallet.toLowerCase()) {
    throw new ApiError(403, "emisor_invalido", "El flujo no pertenece a esta wallet admin.");
  }

  const db = await ensureIndexes();
  const existing = await db.collection<FlowDoc>("flows").findOne({ flowId: input.flowId });

  let employeeId: ObjectId | null = null;
  if (input.employeeId && ObjectId.isValid(input.employeeId)) {
    employeeId = new ObjectId(input.employeeId);
  } else {
    const employee = await db.collection<EmployeeDoc>("employees").findOne({
      walletLower: onchain.receiver.toLowerCase(),
    });
    employeeId = employee ? employee._id : null;
  }

  const now = new Date();
  const estado = deriveFlowStatus(onchain);
  const doc: Omit<FlowDoc, "_id"> = {
    flowId: input.flowId,
    employeeId,
    sender: onchain.sender,
    receiver: onchain.receiver,
    receiverLower: onchain.receiver.toLowerCase(),
    amount: onchain.deposited.toString(),
    durationSeconds: Math.max(1, onchain.endsAt - onchain.startedAt),
    flowRate: (onchain.paused ? onchain.rateBeforePause : onchain.flowRate).toString(),
    startedAt: new Date(onchain.startedAt * 1000),
    endsAt: new Date(onchain.endsAt * 1000),
    estado,
    txHash: input.txHash ?? existing?.txHash ?? null,
    batchId: input.batchId && ObjectId.isValid(input.batchId) ? new ObjectId(input.batchId) : null,
    createdBy: input.actorWallet,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    terminatedAt: estado === "terminado" ? now : null,
    paid: onchain.settled.toString(),
    returned: estado === "terminado" ? (onchain.deposited - onchain.settled).toString() : null,
    lastSyncedAt: now,
  };

  await db
    .collection<FlowDoc>("flows")
    .updateOne({ flowId: input.flowId }, { $set: doc }, { upsert: true });

  const stored = await db.collection<FlowDoc>("flows").findOne({ flowId: input.flowId });
  if (!stored) {
    throw new ApiError(500, "registro_fallido", "No se pudo persistir el flujo");
  }

  if (!existing) {
    await recordAudit({
      actorWallet: input.actorWallet,
      accion: "flujo",
      empleadoId: employeeId ? employeeId.toString() : null,
      txHash: input.txHash ?? null,
      meta: {
        operacion: "alta",
        flowId: input.flowId,
        receiver: onchain.receiver,
        amount: doc.amount,
        estado,
      },
    });
  }

  const names = await employeeNames();
  return toFlowDto(
    stored,
    employeeId ? names.get(employeeId.toString()) ?? null : null,
    ((await getPendingOnChain(input.flowId)) ?? 0n).toString(),
  );
}

/** Anota una operación (pausa/terminación/liquidación) en la auditoría. */
export async function recordFlowAction(input: {
  flowId: string;
  operacion:
    | "pausa"
    | "reanudacion"
    | "terminacion"
    | "liquidacion"
    | "cobro"
    | "cambio_receptor"
    | "mint"
    | "burn";
  actorWallet: string;
  txHash?: string | null;
  employeeId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await recordAudit({
    actorWallet: input.actorWallet,
    accion: "flujo",
    empleadoId: input.employeeId ?? null,
    txHash: input.txHash ?? null,
    meta: { operacion: input.operacion, flowId: input.flowId, ...input.meta },
  });
  const db = await ensureIndexes();
  const doc = await db.collection<FlowDoc>("flows").findOne({ flowId: input.flowId });
  if (doc) await syncDoc(doc);
}

// ---------------------------------------------------------------------------
// Flujos programados (CU-05 / AC-05)
// ---------------------------------------------------------------------------

export async function listScheduledFlows(): Promise<ScheduledFlowDto[]> {
  const db = await ensureIndexes();
  const docs = await db
    .collection<ScheduledFlowDoc>("scheduled_flows")
    .find()
    .sort({ fechaInicio: 1 })
    .limit(300)
    .toArray();
  return docs.map(toScheduledDto);
}

export async function createScheduledFlow(input: {
  employeeId: string;
  amount: string;
  periodo: ScheduledFlowDoc["periodo"];
  fechaInicio: Date;
  actorWallet: string;
}): Promise<ScheduledFlowDto> {
  if (!ObjectId.isValid(input.employeeId)) {
    throw new ApiError(400, "id_invalido", "Empleado inválido");
  }
  const db = await ensureIndexes();
  const employee = await db
    .collection<EmployeeDoc>("employees")
    .findOne({ _id: new ObjectId(input.employeeId) });
  if (!employee) throw new ApiError(404, "no_encontrado", "Empleado no encontrado");
  if (employee.estado !== "activo") {
    throw new ApiError(409, "empleado_inactivo", "El empleado está dado de baja");
  }

  const now = new Date();
  const doc: Omit<ScheduledFlowDoc, "_id"> = {
    employeeId: employee._id,
    employeeNombre: employee.nombre,
    receiver: employee.wallet,
    amount: input.amount,
    periodo: input.periodo,
    durationSeconds: input.periodo * 86_400,
    fechaInicio: input.fechaInicio,
    estado: "proximo",
    flowId: null,
    txHash: null,
    error: null,
    createdBy: input.actorWallet,
    createdAt: now,
    updatedAt: now,
    executedAt: null,
  };
  const result = await db
    .collection<ScheduledFlowDoc>("scheduled_flows")
    .insertOne(doc as ScheduledFlowDoc);

  await recordAudit({
    actorWallet: input.actorWallet,
    accion: "flujo",
    empleadoId: input.employeeId,
    meta: { operacion: "programacion", amount: input.amount, periodo: input.periodo },
  });

  return toScheduledDto({ _id: result.insertedId, ...doc } as ScheduledFlowDoc);
}

export async function markScheduledFlow(
  id: string,
  estado: ScheduledFlowStatus,
  patch: { flowId?: string | null; txHash?: string | null; error?: string | null },
  actorWallet: string,
): Promise<ScheduledFlowDto> {
  if (!ObjectId.isValid(id)) throw new ApiError(400, "id_invalido", "Programación inválida");
  const db = await ensureIndexes();
  const current = await db
    .collection<ScheduledFlowDoc>("scheduled_flows")
    .findOne({ _id: new ObjectId(id) });
  if (!current) throw new ApiError(404, "no_encontrado", "Programación no encontrada");
  if (current.estado === "ejecutado") {
    throw new ApiError(409, "ya_ejecutado", "La programación ya se ejecutó");
  }
  if (current.estado === "cancelado") {
    throw new ApiError(409, "ya_cancelado", "La programación está cancelada");
  }

  const now = new Date();
  await db.collection<ScheduledFlowDoc>("scheduled_flows").updateOne(
    { _id: current._id },
    {
      $set: {
        estado,
        flowId: patch.flowId ?? current.flowId,
        txHash: patch.txHash ?? current.txHash,
        error: patch.error ?? null,
        executedAt: estado === "ejecutado" ? now : current.executedAt,
        updatedAt: now,
      },
    },
  );

  await recordAudit({
    actorWallet,
    accion: "flujo",
    empleadoId: current.employeeId.toString(),
    txHash: patch.txHash ?? null,
    meta: { operacion: estado === "ejecutado" ? "programado_ejecutado" : estado, scheduledId: id },
  });

  const updated = await db
    .collection<ScheduledFlowDoc>("scheduled_flows")
    .findOne({ _id: current._id });
  return toScheduledDto(updated as ScheduledFlowDoc);
}

// ---------------------------------------------------------------------------
// Lotes (CU-09)
// ---------------------------------------------------------------------------

export async function createBatch(
  employeeIds: string[],
  actorWallet: string,
): Promise<{ id: string; empleados: string[] }> {
  const db = await ensureIndexes();
  const now = new Date();
  const doc: Omit<FlowBatchDoc, "_id"> & { empleados: ObjectId[] } = {
    estado: "en_curso",
    total: employeeIds.length,
    completados: 0,
    empleados: employeeIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id)),
    createdBy: actorWallet,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db
    .collection<FlowBatchDoc>("flow_batches")
    .insertOne(doc as unknown as FlowBatchDoc);
  return { id: result.insertedId.toString(), empleados: employeeIds };
}

export async function getBatchProgress(
  batchId: string,
): Promise<{ id: string; total: number; completados: number; empleadosConFlujo: string[] }> {
  if (!ObjectId.isValid(batchId)) throw new ApiError(400, "id_invalido", "Lote inválido");
  const db = await ensureIndexes();
  const batch = await db
    .collection<FlowBatchDoc & { empleados?: ObjectId[] }>("flow_batches")
    .findOne({ _id: new ObjectId(batchId) });
  if (!batch) throw new ApiError(404, "no_encontrado", "Lote no encontrado");

  const flows = await db
    .collection<FlowDoc>("flows")
    .find({ batchId: new ObjectId(batchId) })
    .project({ employeeId: 1 })
    .toArray();

  return {
    id: batchId,
    total: batch.total,
    completados: flows.length,
    empleadosConFlujo: flows
      .map((flow) => (flow.employeeId ? flow.employeeId.toString() : ""))
      .filter(Boolean),
  };
}
