import { ensureIndexes } from "../db";
import type { AuditEventDoc } from "../types";

export interface AuditInput {
  actorWallet: string;
  accion: AuditEventDoc["accion"];
  empleadoId?: string | null;
  walletAnterior?: string | null;
  walletNueva?: string | null;
  txHash?: string | null;
  meta?: Record<string, unknown>;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  const db = await ensureIndexes();
  await db.collection<AuditEventDoc>("audit_events").insertOne({
    actorWallet: input.actorWallet,
    accion: input.accion,
    empleadoId: input.empleadoId ?? null,
    walletAnterior: input.walletAnterior ?? null,
    walletNueva: input.walletNueva ?? null,
    txHash: input.txHash ?? null,
    meta: input.meta ?? {},
    createdAt: new Date(),
  } as AuditEventDoc);
}

export interface AuditEventDto {
  id: string;
  actorWallet: string;
  accion: AuditEventDoc["accion"];
  empleadoId: string | null;
  walletAnterior: string | null;
  walletNueva: string | null;
  txHash: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export async function listAudit(limit = 100, empleadoId?: string): Promise<AuditEventDto[]> {
  const db = await ensureIndexes();
  const filter = empleadoId ? { empleadoId } : {};
  const docs = await db
    .collection<AuditEventDoc>("audit_events")
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 500))
    .toArray();

  return docs.map((doc) => ({
    id: doc._id.toString(),
    actorWallet: doc.actorWallet,
    accion: doc.accion,
    empleadoId: doc.empleadoId,
    walletAnterior: doc.walletAnterior,
    walletNueva: doc.walletNueva,
    txHash: doc.txHash,
    meta: doc.meta,
    createdAt: doc.createdAt.toISOString(),
  }));
}
