"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { formatBrlt } from "@/lib/rates";
import type { EmployeeDto, ProjectDto } from "@/lib/types";
import type { SystemConfigDto } from "@/lib/repositories/system";
import type { AuditEventDto } from "@/lib/repositories/audit";
import { Badge, Card, CardBody, CardHeader, EmptyState, Mono } from "@/components/adminlte";

interface Health {
  status: string;
  db: boolean;
  rpc: boolean;
  chainId: number | null;
}

export default function AdminHomePage() {
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [config, setConfig] = useState<SystemConfigDto | null>(null);
  const [events, setEvents] = useState<AuditEventDto[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiFetch<{ employees: EmployeeDto[] }>("/api/employees"),
      apiFetch<{ projects: ProjectDto[] }>("/api/projects"),
      apiFetch<{ config: SystemConfigDto }>("/api/system"),
      apiFetch<{ events: AuditEventDto[] }>("/api/audit?limit=6"),
      apiFetch<Health>("/api/health").catch(() => null),
    ])
      .then(([emp, proj, sys, audit, healthData]) => {
        if (cancelled) return;
        setEmployees(emp.employees);
        setProjects(proj.projects);
        setConfig(sys.config);
        setEvents(audit.events);
        setHealth(healthData);
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

  const activos = employees.filter((e) => e.estado === "activo").length;
  const totalPeriodo = employees
    .filter((e) => e.estado === "activo")
    .reduce((acc, e) => acc + BigInt(e.montoPeriodo), 0n);

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando resumen…</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Resumen</h1>
        <p className="text-sm text-slate-600">
          Estado de la nómina, la configuración de red y la actividad reciente.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-slate-500">Empleados activos</p>
            <p className="mt-1 text-3xl font-semibold text-ink-900">{activos}</p>
            <p className="text-xs text-slate-500">{employees.length} en total</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-slate-500">Nómina por periodo</p>
            <p className="mt-1 text-2xl font-semibold text-ink-900">
              {formatBrlt(totalPeriodo)} BRLT
            </p>
            <p className="text-xs text-slate-500">suma de empleados activos</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-slate-500">Proyectos</p>
            <p className="mt-1 text-3xl font-semibold text-ink-900">
              {projects.filter((p) => p.estado === "activo").length}
            </p>
            <p className="text-xs text-slate-500">{projects.length} registrados</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-slate-500">Red</p>
            <p className="mt-1 text-lg font-semibold text-ink-900">
              {health?.rpc ? (
                <Badge tone="success">conectada · {health.chainId}</Badge>
              ) : (
                <Badge tone="warning">sin conexión</Badge>
              )}
            </p>
            <p className="text-xs text-slate-500">
              MongoDB {health?.db ? "OK" : "no disponible"}
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Configuración de red"
            actions={
              <Link href="/admin/sistema" className="text-xs font-medium text-brand-700 hover:underline">
                Editar
              </Link>
            }
          />
          <CardBody className="space-y-2 text-sm">
            {config ? (
              <>
                <Row label="chainId" value={String(config.chainId)} />
                <Row label="RPC" value={config.rpcUrl} mono />
                <Row label="BRLT" value={config.brltAddress || "sin configurar"} mono />
                <Row label="BrltX" value={config.brltXAddress || "sin configurar"} mono />
                <Row label="Bloque de deploy" value={String(config.deployBlock)} />
                <Row label="Refresco" value={`${config.tasaRefrescoMs} ms`} />
              </>
            ) : (
              <p className="text-slate-500">Sin configuración.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Actividad reciente" subtitle="Últimos eventos de auditoría" />
          {events.length === 0 ? (
            <EmptyState>No hay eventos todavía.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {events.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-ink-900">{event.accion}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(event.createdAt).toLocaleString("es-ES")} ·{" "}
                      <Mono>{event.actorWallet.slice(0, 10)}…</Mono>
                    </p>
                  </div>
                  {event.walletNueva ? <Badge tone="brand">wallet</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      {mono ? <Mono>{value}</Mono> : <span className="font-medium text-ink-900">{value}</span>}
    </div>
  );
}
