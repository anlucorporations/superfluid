"use client";

import { useEffect, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { AuditEventDto } from "@/lib/repositories/audit";
import { Alert, Badge, Card, CardHeader, EmptyState, Mono } from "@/components/ui";

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEventDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ events: AuditEventDto[] }>("/api/audit?limit=200")
      .then((data) => {
        if (!cancelled) setEvents(data.events);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Auditoría</h1>
        <p className="text-sm text-slate-600">
          Registro inmutable de altas, ediciones, cambios de wallet, bajas y configuración.
        </p>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card>
        <CardHeader title="Eventos" subtitle={`${events.length} registros`} />
        {loading ? (
          <EmptyState>Cargando eventos…</EmptyState>
        ) : events.length === 0 ? (
          <EmptyState>No hay eventos de auditoría.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Fecha</th>
                  <th className="px-4 py-2 font-semibold">Acción</th>
                  <th className="px-4 py-2 font-semibold">Actor</th>
                  <th className="px-4 py-2 font-semibold">Empleado</th>
                  <th className="px-4 py-2 font-semibold">Wallets</th>
                  <th className="px-4 py-2 font-semibold">Meta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((event) => (
                  <tr key={event.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-600">
                      {new Date(event.createdAt).toLocaleString("es-ES")}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={event.accion === "baja" ? "danger" : "brand"}>
                        {event.accion}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Mono>{event.actorWallet}</Mono>
                    </td>
                    <td className="px-4 py-2">
                      <Mono>{event.empleadoId ?? "—"}</Mono>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {event.walletAnterior ? (
                        <p>
                          de <Mono>{event.walletAnterior}</Mono>
                        </p>
                      ) : null}
                      {event.walletNueva ? (
                        <p>
                          a <Mono>{event.walletNueva}</Mono>
                        </p>
                      ) : null}
                      {!event.walletAnterior && !event.walletNueva ? "—" : null}
                    </td>
                    <td className="max-w-xs px-4 py-2">
                      <code className="block truncate text-xs text-slate-500">
                        {JSON.stringify(event.meta)}
                      </code>
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
