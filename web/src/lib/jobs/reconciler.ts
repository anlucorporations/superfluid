import { ethers } from "ethers";
import { ensureIndexes } from "../db";
import { BRLTX_ABI } from "../contracts";
import { getFlowOnChain, getPendingOnChain, deriveFlowStatus } from "../flows-onchain";
import { getSystemConfig } from "../repositories/system";
import { recordAudit } from "../repositories/audit";
import type { EmployeeDoc, FlowDoc, FlowHistoryDoc, JobName, JobRunDoc } from "../types";

/**
 * Jobs internos de H6: reconciliación con la cadena, espejo de eventos
 * (`flows_history`), anonimización GDPR a 30 días (AC-10) y marca de
 * programaciones vencidas. Se ejecutan con un timer de proceso (5 min) y se
 * pueden lanzar a mano desde el panel `/admin/jobs`.
 */

export interface JobResult {
  job: JobName;
  result: Record<string, unknown>;
}

const JOBS: JobName[] = [
  "reconcile_flows",
  "flows_history",
  "anonymize_pii",
  "mark_scheduled_due",
];

export function isValidJob(name: string): name is JobName {
  return (JOBS as string[]).includes(name);
}

/**
 * Cruzo de datos "provocada": reemplaza el nombre por un seudónimo irreversible.
 * La wallet se conserva pseudonimizada hasta 90 días para el retiro (AC-10).
 */
export function anonymizedName(fingerprint: string): string {
  return `Anonimizado · ${fingerprint.slice(0, 8)}`;
}

async function recordRun(
  job: JobName,
  trigger: "cron" | "manual",
  start: Date,
  runner: () => Promise<Record<string, unknown>>,
): Promise<JobResult> {
  const db = await ensureIndexes();
  let ok = true;
  let error: string | null = null;
  let result: Record<string, unknown> = {};
  try {
    result = await runner();
  } catch (err) {
    ok = false;
    error = (err as Error).message ?? String(err);
  }
  try {
    await db.collection<JobRunDoc>("job_runs").insertOne({
      job,
      ok,
      startedAt: start,
      finishedAt: new Date(),
      result,
      error,
      trigger,
    } as JobRunDoc);
  } catch {
    // el registro del propio job no puede tumbar el proceso
  }
  if (!ok) throw new Error(error ?? "job fallido");
  return { job, result };
}

// ---------------------------------------------------------------------------
// 1) reconcile_flows — deriva en `flows` vs la cadena
// ---------------------------------------------------------------------------

export async function runReconcileFlows(): Promise<Record<string, unknown>> {
  const db = await ensureIndexes();
  const config = await getSystemConfig();
  if (!config.brltXAddress) return { skipped: "sin addresses configuradas" };

  // a) Reconcilia los flujos persistidos (los terminados no cambian).
  const docs = await db.collection<FlowDoc>("flows").find({ estado: { $ne: "terminado" } }).limit(300).toArray();
  let reconciled = 0;
  let drifts = 0;
  for (const doc of docs) {
    const onchain = await getFlowOnChain(doc.flowId);
    if (!onchain) continue;
    const pending = (await getPendingOnChain(doc.flowId)) ?? 0n;
    const estado = deriveFlowStatus(onchain);
    const hasDrift =
      doc.estado !== estado ||
      doc.receiver.toLowerCase() !== onchain.receiver.toLowerCase() ||
      doc.paid !== onchain.settled.toString();
    const update: Partial<FlowDoc> = {
      estado,
      receiver: onchain.receiver,
      receiverLower: onchain.receiver.toLowerCase(),
      flowRate: (onchain.paused ? onchain.rateBeforePause : onchain.flowRate).toString(),
      amount: onchain.deposited.toString(),
      paid: onchain.settled.toString(),
      startedAt: new Date(onchain.startedAt * 1000),
      endsAt: new Date(onchain.endsAt * 1000),
      updatedAt: new Date(),
      lastSyncedAt: new Date(),
    };
    if (estado === "terminado") {
      update.terminatedAt = doc.terminatedAt ?? new Date();
      update.returned = (onchain.deposited - onchain.settled).toString();
    }
    if (hasDrift) {
      drifts += 1;
      await recordAudit({
        actorWallet: onchain.sender,
        accion: "flujo",
        empleadoId: doc.employeeId ? doc.employeeId.toString() : null,
        meta: {
          operacion: "reconciliacion",
          flowId: doc.flowId,
          estadoAnterior: doc.estado,
          estadoNuevo: estado,
          pending,
        },
      });
    }
    await db.collection<FlowDoc>("flows").updateOne({ _id: doc._id }, { $set: update });
    reconciled += 1;
  }

  // b) Descubre flujos on-chain que MongoDB no registra (baja manual del nodo, etc.).
  const brltX = new ethers.utils.Interface(BRLTX_ABI);
  const { fetchChainId, rpc } = await import("../rpc");
  const chainId = await fetchChainId(config.rpcUrl).catch(() => null);
  let discovered = 0;
  if (chainId === config.chainId) {
    const lastRaw = await rpc<string>(config.rpcUrl, "eth_call", [
      { to: config.brltXAddress, data: brltX.encodeFunctionData("lastFlowId") },
      "latest",
    ]).catch(() => null);
    const last = lastRaw ? Number(ethers.utils.defaultAbiCoder.decode(["uint256"], lastRaw)[0]) : 0;
    const stored = await db.collection<FlowDoc>("flows").distinct("flowId");
    const known = new Set(stored.map(String));
    for (let id = 1; id <= last; id += 1) {
      const flowId = String(id);
      if (known.has(flowId)) continue;
      const onchain = await getFlowOnChain(flowId);
      if (!onchain) continue;
      // El job nunca falsifica al admin: registra con el emisor real on-chain.
      await registerDiscovered(flowId, onchain.sender);
      discovered += 1;
    }
  }

  return { reconciled, drifts, discovered };
}

async function registerDiscovered(
  flowId: string,
  sender: string,
): Promise<void> {
  const db = await ensureIndexes();
  const onchain = await getFlowOnChain(flowId);
  if (!onchain) return;
  const estado = deriveFlowStatus(onchain);
  const now = new Date();
  const doc: Omit<FlowDoc, "_id"> = {
    flowId,
    employeeId: null,
    sender: onchain.sender,
    receiver: onchain.receiver,
    receiverLower: onchain.receiver.toLowerCase(),
    amount: onchain.deposited.toString(),
    durationSeconds: Math.max(1, onchain.endsAt - onchain.startedAt),
    flowRate: (onchain.paused ? onchain.rateBeforePause : onchain.flowRate).toString(),
    startedAt: new Date(onchain.startedAt * 1000),
    endsAt: new Date(onchain.endsAt * 1000),
    estado,
    txHash: null,
    batchId: null,
    createdBy: sender,
    createdAt: now,
    updatedAt: now,
    terminatedAt: estado === "terminado" ? now : null,
    paid: onchain.settled.toString(),
    returned: estado === "terminado" ? (onchain.deposited - onchain.settled).toString() : null,
    lastSyncedAt: now,
  };
  await db.collection<FlowDoc>("flows").updateOne({ flowId }, { $set: doc }, { upsert: true });
  await recordAudit({
    actorWallet: sender,
    accion: "job",
    empleadoId: doc.employeeId ? doc.employeeId.toString() : null,
    meta: { job: "reconcile_flows", flowId, descubierto: true },
  });
}

// ---------------------------------------------------------------------------
// 2) flows_history — espejo de eventos de BrltX
// ---------------------------------------------------------------------------

export async function runFlowsHistory(): Promise<Record<string, unknown>> {
  const db = await ensureIndexes();
  const config = await getSystemConfig();
  if (!config.brltXAddress || !config.rpcUrl) return { skipped: "sin config" };

  const { fetchChainId, rpc } = await import("../rpc");
  const latestHex = await rpc<string>(config.rpcUrl, "eth_blockNumber");
  const latest = Number(ethers.BigNumber.from(latestHex));

  const iface = new ethers.utils.Interface(BRLTX_ABI);
  const events = ["FlowCreated", "FlowUpdated", "FlowSettled", "FlowDeleted", "FlowExpired", "Upgraded", "Downgraded"];

  const fromBlock = Math.max(0, config.deployBlock || Math.max(0, latest - 5_000));
  let inserted = 0;
  const CHUNK = 2_000;
  for (let start = fromBlock; start <= latest; start += CHUNK + 1) {
    const toBlock = Math.min(start + CHUNK, latest);
    for (const name of events) {
      const logs = await rpc<
        { blockNumber: string; transactionHash: string; logIndex: string; data: string; topics: string[] }[]
      >(config.rpcUrl, "eth_getLogs", [
        {
          address: config.brltXAddress,
          fromBlock: `0x${start.toString(16)}`,
          toBlock: `0x${toBlock.toString(16)}`,
          topics: [iface.getEventTopic(name)],
        },
      ]).catch(() => []);
      for (const log of logs) {
        let flowId: string | null = null;
        let sender: string | null = null;
        let receiver: string | null = null;
        let amount: string | null = null;
        try {
          const parsed = iface.parseLog({ topics: log.topics, data: log.data });
          flowId =
            parsed.args.flowId !== undefined ? parsed.args.flowId.toString() : null;
          sender = parsed.args.sender ? parsed.args.sender : null;
          receiver = parsed.args.receiver ? parsed.args.receiver : null;
          amount =
            parsed.args.amount?.toString() ??
            parsed.args.paid?.toString() ??
            parsed.args.returnedAmount?.toString() ??
            null;
        } catch {
          // log no decodificable: se guarda el crudo
        }
        const extra: Record<string, unknown> = {};
        const blockNumber = ethers.BigNumber.from(log.blockNumber).toNumber();
        const txHash = log.transactionHash;
        const logIndex = ethers.BigNumber.from(log.logIndex).toNumber();
        const doc: Omit<FlowHistoryDoc, "_id"> = {
          key: `${txHash}-${logIndex}`,
          blockNumber,
          txHash,
          logIndex,
          evento: name as FlowHistoryDoc["evento"],
          flowId,
          sender,
          receiver,
          amount,
          extra,
          createdAt: new Date(),
        };
        const res = await db
          .collection<FlowHistoryDoc>("flows_history")
          .updateOne({ key: doc.key }, { $set: doc }, { upsert: true });
        if (res.upsertedCount) inserted += 1;
      }
    }
  }

  const total = await db.collection<FlowHistoryDoc>("flows_history").countDocuments();
  return { fromBlock, toBlock: latest, inserted, total };
}

// ---------------------------------------------------------------------------
// 3) anonymize_pii — GDPR a 30 días de la solicitud (AC-10)
// ---------------------------------------------------------------------------

export async function runAnonymizePii(now = new Date()): Promise<Record<string, unknown>> {
  const db = await ensureIndexes();
  const THIRTY_DAYS = 30 * 24 * 3_600_000;
  const cutoff = new Date(now.getTime() - THIRTY_DAYS);

  const docs = await db
    .collection<EmployeeDoc>("employees")
    .find({ borroSolicitado: true, borroSolicitadoAt: { $ne: null, $lte: cutoff }, anonymizado: { $ne: true } })
    .limit(200)
    .toArray();

  let anonymized = 0;
  for (const doc of docs) {
    const fingerprint = doc.wallet.toLowerCase().slice(2);
    await db.collection<EmployeeDoc>("employees").updateOne(
      { _id: doc._id },
      {
        $set: {
          nombre: anonymizedName(fingerprint),
          datosPersonales: {},
          estado: "inactivo",
          anonymizado: true,
          updatedAt: now,
        },
      },
    );
    await recordAudit({
      actorWallet: doc.wallet,
      accion: "job",
      empleadoId: doc._id.toString(),
      meta: { job: "anonymize_pii", anchor: doc.borroSolicitadoAt?.toISOString() ?? null },
    });
    anonymized += 1;
  }

  return { candidatos: docs.length, anonymized };
}

// ---------------------------------------------------------------------------
// 4) mark_scheduled_due — programaciones cuya fecha ya llegó
// ---------------------------------------------------------------------------

export async function runMarkScheduledDue(now = new Date()): Promise<Record<string, unknown>> {
  const db = await ensureIndexes();
  const docs = await db
    .collection("scheduled_flows")
    .find({ estado: "proximo", fechaInicio: { $lte: now } })
    .limit(500)
    .toArray();
  return { pendientes: docs.length, ids: docs.map((doc) => doc._id?.toString()) };
}

// ---------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------

export async function runJob(job: JobName, trigger: "cron" | "manual" = "manual"): Promise<JobResult> {
  const started = new Date();
  switch (job) {
    case "reconcile_flows":
      return recordRun(job, trigger, started, runReconcileFlows);
    case "flows_history":
      return recordRun(job, trigger, started, runFlowsHistory);
    case "anonymize_pii":
      return recordRun(job, trigger, started, () => runAnonymizePii(new Date()));
    case "mark_scheduled_due":
      return recordRun(job, trigger, started, () => runMarkScheduledDue(new Date()));
  }
}

export async function getJobStatus(): Promise<{
  jobs: JobName[];
  lastRuns: {
    job: JobName;
    ok: boolean;
    startedAt: string;
    finishedAt: string;
    trigger: string;
    result: Record<string, unknown>;
    error: string | null;
  }[];
}> {
  const db = await ensureIndexes();
  const runs = await db
    .collection<JobRunDoc>("job_runs")
    .find()
    .sort({ startedAt: -1 })
    .limit(20)
    .toArray();
  return {
    jobs: JOBS,
    lastRuns: runs.map((run) => ({
      job: run.job,
      ok: run.ok,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt.toISOString(),
      trigger: run.trigger,
      result: run.result,
      error: run.error ?? null,
    })),
  };
}
