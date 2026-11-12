"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { JobName } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Mono,
} from "@/components/adminlte";

interface JobRun {
  job: JobName;
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  trigger: string;
  result: Record<string, unknown>;
  error: string | null;
}

interface JobsResponse {
  jobs: JobName[];
  lastRuns: JobRun[];
}

const JOB_LABEL: Record<JobName, string> = {
  reconcile_flows: "Reconciliación de flujos (5 min)",
  flows_history: "Espejo de eventos (15 min)",
  anonymize_pii: "Anonimización GDPR (diario)",
  mark_scheduled_due: "Programaciones vencidas (5 min)",
};

export default function JobsPage() {
  const [data, setData] = useState<JobsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<JobsResponse>("/api/jobs"));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 15_000);
    return () => clearInterval(interval);
  }, [load]);

  async function runNow(job: JobName) {
    setBusy(job);
    setError(null);
    setNotice(null);
    try {
      const result = await apiFetch<{ job: string; result: Record<string, unknown> }>(
        "/api/jobs",
        {
          method: "POST",
          body: JSON.stringify({ job }),
        },
      );
      setNotice(`${result.job}: ${JSON.stringify(result.result)}`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Cargando jobs…</p>;

  const jobs = data?.jobs ?? [];
  const lastRuns = data?.lastRuns ?? [];
  const summary = jobs.map((job) => {
    const last = lastRuns.find((run) => run.job === job);
    return { job, last };
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Jobs internos</h1>
        <p className="text-sm text-slate-600">
          Reconciliación con la cadena, espejo de eventos, GDPR y programaciones
          vencidas. Se ejecutan con un timer de 5 min y se pueden lanzar a mano.
        </p>
      </div>

      {error ? (
        <Card>
          <CardBody className="text-sm text-rose-700">{error}</CardBody>
        </Card>
      ) : null}
      {notice ? (
        <Card>
          <CardBody className="text-sm text-emerald-700">
            <Mono>{notice}</Mono>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {summary.map(({ job, last }) => (
          <Card key={job}>
            <CardHeader
              title={JOB_LABEL[job]}
              subtitle={
                last
                  ? `última: ${new Date(last.startedAt).toLocaleString("es-ES")} · ${last.trigger}`
                  : "sin ejecuciones registradas"
              }
            />
            <CardBody className="flex items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                {last ? (
                  last.ok ? (
                    <Badge tone="success">ok</Badge>
                  ) : (
                    <Badge tone="danger">fallo</Badge>
                  )
                ) : (
                  <Badge tone="neutral">pendiente</Badge>
                )}
                <span className="ml-2">
                  {last && last.error ? <span className="text-rose-600">{last.error}</span> : (
                    <Mono>{JSON.stringify(last?.result ?? {})}</Mono>
                  )}
                </span>
              </div>
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() => void runNow(job)}
              >
                {busy === job ? "Ejecutando…" : "Ejecutar"}
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Historial" subtitle={`${lastRuns.length} ejecuciones recientes`} />
        {lastRuns.length === 0 ? (
          <EmptyState>Todavía no se ha ejecutado ningún job.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Job</th>
                  <th className="px-3 py-2 font-semibold">Inicio</th>
                  <th className="px-3 py-2 font-semibold">Disparador</th>
                  <th className="px-3 py-2 font-semibold">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lastRuns.map((run, index) => (
                  <tr key={`${run.job}-${run.startedAt}-${index}`}>
                    <td className="px-3 py-2 font-medium text-ink-900">{JOB_LABEL[run.job]}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {new Date(run.startedAt).toLocaleString("es-ES")}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{run.trigger}</td>
                    <td className="px-3 py-2 text-xs">
                      {run.ok ? (
                        <span className="text-emerald-700">
                          <Mono>{JSON.stringify(run.result)}</Mono>
                        </span>
                      ) : (
                        <span className="text-rose-600">{run.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
