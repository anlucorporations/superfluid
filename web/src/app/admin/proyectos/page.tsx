"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { formatBrlt, parseBrlt, toDecimalString } from "@/lib/rates";
import type { ProjectDto } from "@/lib/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
} from "@/components/adminlte";

interface ProjectsResponse {
  projects: ProjectDto[];
}

interface ProjectResponse {
  project: ProjectDto;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectDto | null>(null);

  const load = useCallback(async () => {
    const data = await apiFetch<ProjectsResponse>("/api/projects");
    setProjects(data.projects);
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  function onSaved(project: ProjectDto, created: boolean) {
    setProjects((current) => {
      const rest = current.filter((item) => item.id !== project.id);
      return [project, ...rest];
    });
    setNotice(created ? "Proyecto creado." : "Proyecto actualizado.");
    setFormOpen(false);
    setEditing(null);
  }

  async function remove(project: ProjectDto) {
    if (!window.confirm(`¿Eliminar el proyecto «${project.nombre}»?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/projects/${project.id}`, { method: "DELETE" });
      setProjects((current) => current.filter((item) => item.id !== project.id));
      setNotice("Proyecto eliminado.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando proyectos…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Proyectos</h1>
          <p className="text-sm text-slate-600">
            Agrupación administrativa de empleados. El presupuesto es informativo.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Nuevo proyecto
        </Button>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {formOpen || editing ? (
        <ProjectForm
          key={editing?.id ?? "nuevo"}
          initial={editing}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={onSaved}
        />
      ) : null}

      <Card>
        <CardHeader title="Listado" subtitle={`${projects.length} proyectos`} />
        {projects.length === 0 ? (
          <EmptyState>No hay proyectos todavía.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Nombre</th>
                  <th className="px-4 py-2 font-semibold">Descripción</th>
                  <th className="px-4 py-2 font-semibold text-right">Presupuesto</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td className="px-4 py-3 font-medium text-ink-900">{project.nombre}</td>
                    <td className="max-w-xs px-4 py-3 text-slate-600">
                      {project.descripcion || "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {formatBrlt(project.presupuesto)} BRLT
                    </td>
                    <td className="px-4 py-3">
                      {project.estado === "activo" ? (
                        <Badge tone="success">activo</Badge>
                      ) : (
                        <Badge tone="neutral">cerrado</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditing(project);
                            setFormOpen(false);
                          }}
                        >
                          Editar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => remove(project)}>
                          Eliminar
                        </Button>
                      </div>
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

function ProjectForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: ProjectDto | null;
  onSaved: (project: ProjectDto, created: boolean) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [presupuesto, setPresupuesto] = useState(
    initial && initial.presupuesto !== "0"
      ? toDecimalString(initial.presupuesto)
      : "0",
  );
  const [estado, setEstado] = useState<"activo" | "cerrado">(initial?.estado ?? "activo");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    let presupuestoWei: string;
    try {
      presupuestoWei = parseBrlt(presupuesto || "0");
    } catch {
      setError("Presupuesto inválido.");
      return;
    }

    setBusy(true);
    try {
      if (initial) {
        const { project } = await apiFetch<ProjectResponse>(`/api/projects/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify({ nombre, descripcion, presupuesto: presupuestoWei, estado }),
        });
        onSaved(project, false);
      } else {
        const { project } = await apiFetch<ProjectResponse>("/api/projects", {
          method: "POST",
          body: JSON.stringify({ nombre, descripcion, presupuesto: presupuestoWei, estado }),
        });
        onSaved(project, true);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title={initial ? `Editar ${initial.nombre}` : "Nuevo proyecto"} />
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={120} />
            </Field>
            <Field label="Presupuesto (BRLT, informativo)">
              <Input
                value={presupuesto}
                onChange={(e) => setPresupuesto(e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Descripción" className="sm:col-span-2">
              <Input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                maxLength={500}
              />
            </Field>
            <Field label="Estado">
              <Select
                value={estado}
                onChange={(e) => setEstado(e.target.value as "activo" | "cerrado")}
              >
                <option value="activo">Activo</option>
                <option value="cerrado">Cerrado</option>
              </Select>
            </Field>
          </div>

          {error ? <Alert tone="error">{error}</Alert> : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Guardando…" : initial ? "Guardar cambios" : "Crear proyecto"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
