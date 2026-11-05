"use client";

import { useCallback, useEffect, useState } from "react";
import type { TypedDataDomain, TypedDataField } from "ethers";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { changeFlowReceiver } from "@/lib/client/contracts";
import { connectWallet, ensureChain, shortAddress, signTypedData } from "@/lib/client/wallet";
import { formatBrlt, parseBrlt, toDecimalString } from "@/lib/rates";
import {
  CONCEPTOS,
  PERIODOS,
  type Concepto,
  type EmployeeDto,
  type FlowDto,
  type Periodo,
  type ProjectDto,
  type SessionInfo,
} from "@/lib/types";
import type { SystemConfigDto } from "@/lib/repositories/system";
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
  Mono,
  Select,
} from "@/components/ui";

const CONCEPTO_LABEL: Record<Concepto, string> = {
  mantenimiento: "Mantenimiento",
  nomina: "Nómina",
  proyecto_mvp: "Proyecto MVP",
  actividad_espacial: "Actividad espacial",
  otros: "Otros",
};

interface EmployeesResponse {
  employees: EmployeeDto[];
}

interface EmployeeResponse {
  employee: EmployeeDto;
}

interface ProjectsResponse {
  projects: ProjectDto[];
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeDto | null>(null);
  const [walletTarget, setWalletTarget] = useState<EmployeeDto | null>(null);
  const [config, setConfig] = useState<SystemConfigDto | null>(null);

  const load = useCallback(async () => {
    const [emp, proj, me, sys] = await Promise.all([
      apiFetch<EmployeesResponse>("/api/employees"),
      apiFetch<ProjectsResponse>("/api/projects"),
      apiFetch<{ session: SessionInfo }>("/api/auth/me"),
      apiFetch<{ config: SystemConfigDto }>("/api/system"),
    ]);
    setEmployees(emp.employees);
    setProjects(proj.projects);
    setSession(me.session);
    setConfig(sys.config);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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

  function onSaved(employee: EmployeeDto, created: boolean) {
    setEmployees((current) => {
      const rest = current.filter((item) => item.id !== employee.id);
      return [employee, ...rest];
    });
    setNotice(created ? "Empleado creado." : "Empleado actualizado.");
    setFormOpen(false);
    setEditing(null);
  }

  async function toggleEstado(employee: EmployeeDto) {
    const next = employee.estado === "activo" ? "inactivo" : "activo";
    if (
      next === "inactivo" &&
      !window.confirm(
        `¿Dar de baja a ${employee.nombre}? Se revocará su sesión de la Suite inmediatamente.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      const { employee: updated } = await apiFetch<EmployeeResponse>(
        `/api/employees/${employee.id}`,
        { method: "PATCH", body: JSON.stringify({ estado: next }) },
      );
      setEmployees((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(next === "activo" ? "Empleado reactivado." : "Empleado dado de baja.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Cargando empleados…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Empleados</h1>
          <p className="text-sm text-slate-600">
            Alta, edición, cambio de wallet y baja. Los cambios son administrativos y no
            alteran los flujos on-chain en curso.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Nuevo empleado
        </Button>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {formOpen || editing ? (
        <EmployeeForm
          key={editing?.id ?? "nuevo"}
          projects={projects}
          initial={editing}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={onSaved}
        />
      ) : null}

      {walletTarget ? (
        <WalletChangeForm
          key={walletTarget.id}
          employee={walletTarget}
          adminWallet={session?.wallet ?? ""}
          config={config}
          onCancel={() => setWalletTarget(null)}
          onDone={(employee) => {
            setEmployees((current) =>
              current.map((item) => (item.id === employee.id ? employee : item)),
            );
            setWalletTarget(null);
            setNotice("Wallet actualizada y auditoría registrada.");
          }}
        />
      ) : null}

      <Card>
        <CardHeader title="Plantilla" subtitle={`${employees.length} empleados registrados`} />
        {employees.length === 0 ? (
          <EmptyState>Todavía no hay empleados. Crea el primero con «Nuevo empleado».</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Empleado</th>
                  <th className="px-4 py-2 font-semibold">Wallet</th>
                  <th className="px-4 py-2 font-semibold">Proyecto</th>
                  <th className="px-4 py-2 font-semibold">Concepto</th>
                  <th className="px-4 py-2 font-semibold text-right">Monto / periodo</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((employee) => (
                  <tr key={employee.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900">{employee.nombre}</p>
                      {employee.datosPersonales.email ? (
                        <p className="text-xs text-slate-500">{employee.datosPersonales.email}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Mono>{shortAddress(employee.wallet)}</Mono>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {employee.proyectoNombre ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {CONCEPTO_LABEL[employee.concepto]}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-medium text-ink-900">
                        {formatBrlt(employee.montoPeriodo)} BRLT
                      </p>
                      <p className="text-xs text-slate-500">{employee.periodo} días</p>
                    </td>
                    <td className="px-4 py-3">
                      {employee.estado === "activo" ? (
                        <Badge tone="success">activo</Badge>
                      ) : (
                        <Badge tone="danger">inactivo</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditing(employee);
                            setFormOpen(false);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setWalletTarget(employee)}
                        >
                          Wallet
                        </Button>
                        <Button
                          size="sm"
                          variant={employee.estado === "activo" ? "danger" : "secondary"}
                          onClick={() => toggleEstado(employee)}
                        >
                          {employee.estado === "activo" ? "Baja" : "Reactivar"}
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

function EmployeeForm({
  projects,
  initial,
  onSaved,
  onCancel,
}: {
  projects: ProjectDto[];
  initial: EmployeeDto | null;
  onSaved: (employee: EmployeeDto, created: boolean) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [wallet, setWallet] = useState(initial?.wallet ?? "");
  const [proyectoId, setProyectoId] = useState(initial?.proyectoId ?? "");
  const [concepto, setConcepto] = useState<Concepto>(initial?.concepto ?? "nomina");
  const [monto, setMonto] = useState(
    initial ? toDecimalString(initial.montoPeriodo) : "2000",
  );
  const [periodo, setPeriodo] = useState<Periodo>(initial?.periodo ?? 30);
  const [email, setEmail] = useState(initial?.datosPersonales.email ?? "");
  const [telefono, setTelefono] = useState(initial?.datosPersonales.telefono ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    let montoPeriodo: string;
    try {
      montoPeriodo = parseBrlt(monto);
    } catch {
      setError("Importe en BRLT inválido (usa punto o coma decimal).");
      return;
    }
    if (BigInt(montoPeriodo) <= 0n) {
      setError("El importe debe ser mayor que 0.");
      return;
    }

    const datosPersonales: { email?: string; telefono?: string } = {};
    if (email.trim()) datosPersonales.email = email.trim();
    if (telefono.trim()) datosPersonales.telefono = telefono.trim();

    setBusy(true);
    try {
      if (initial) {
        const { employee } = await apiFetch<EmployeeResponse>(`/api/employees/${initial.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            nombre,
            proyectoId: proyectoId || null,
            concepto,
            montoPeriodo,
            periodo,
            datosPersonales,
          }),
        });
        onSaved(employee, false);
      } else {
        const { employee } = await apiFetch<EmployeeResponse>("/api/employees", {
          method: "POST",
          body: JSON.stringify({
            nombre,
            wallet,
            proyectoId: proyectoId || null,
            concepto,
            montoPeriodo,
            periodo,
            datosPersonales,
          }),
        });
        onSaved(employee, true);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={initial ? `Editar ${initial.nombre}` : "Nuevo empleado"}
        subtitle={
          initial
            ? "El cambio de wallet se hace con la acción «Wallet» y doble firma."
            : "La wallet debe ser única en toda la plantilla."
        }
      />
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={120} />
            </Field>
            <Field
              label="Wallet"
              hint={initial ? "Usa «Wallet» para cambiarla con autorización firmada." : "0x… (40 hex)"}
            >
              <Input
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                required
                disabled={Boolean(initial)}
                placeholder="0x…"
              />
            </Field>
            <Field label="Proyecto">
              <Select value={proyectoId ?? ""} onChange={(e) => setProyectoId(e.target.value)}>
                <option value="">Sin proyecto</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Concepto">
              <Select
                value={concepto}
                onChange={(e) => setConcepto(e.target.value as Concepto)}
              >
                {CONCEPTOS.map((value) => (
                  <option key={value} value={value}>
                    {CONCEPTO_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Monto por periodo (BRLT)">
              <Input
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                inputMode="decimal"
                required
              />
            </Field>
            <Field label="Periodo">
              <Select
                value={String(periodo)}
                onChange={(e) => setPeriodo(Number(e.target.value) as Periodo)}
              >
                {PERIODOS.map((value) => (
                  <option key={value} value={value}>
                    {value} días
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Email (opcional)">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </Field>
            <Field label="Teléfono (opcional)">
              <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </Field>
          </div>

          {error ? <Alert tone="error">{error}</Alert> : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Guardando…" : initial ? "Guardar cambios" : "Crear empleado"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

interface WalletAuthorization {
  nonce: string;
  issuedAt: number;
  expiresAt: string;
  domain: TypedDataDomain;
  types: {
    employee: Record<string, TypedDataField[]>;
    admin: Record<string, TypedDataField[]>;
  };
  employeeValue: Record<string, unknown>;
  adminValue: Record<string, unknown>;
}

function WalletChangeForm({
  employee,
  adminWallet,
  config,
  onDone,
  onCancel,
}: {
  employee: EmployeeDto;
  adminWallet: string;
  config: SystemConfigDto | null;
  onDone: (employee: EmployeeDto) => void;
  onCancel: () => void;
}) {
  const [newWallet, setNewWallet] = useState("");
  const [auth, setAuth] = useState<WalletAuthorization | null>(null);
  const [employeeSig, setEmployeeSig] = useState("");
  const [adminSig, setAdminSig] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState<EmployeeDto | null>(null);
  const [flows, setFlows] = useState<FlowDto[]>([]);
  const [migrated, setMigrated] = useState<string[]>([]);

  async function prepare() {
    setError(null);
    setBusy(true);
    setPhase("Emitiendo nonce y autorización…");
    try {
      const authorization = await apiFetch<WalletAuthorization>(
        `/api/employees/${employee.id}/wallet/authorization`,
        { method: "POST", body: JSON.stringify({ employeeId: employee.id, newWallet }) },
      );
      setAuth(authorization);
      setEmployeeSig("");
      setAdminSig("");
      setPhase(null);
    } catch (err) {
      setError(errorMessage(err));
      setPhase(null);
    } finally {
      setBusy(false);
    }
  }

  async function signAsEmployee() {
    if (!auth) return;
    setError(null);
    setBusy(true);
    try {
      setPhase("Conectando wallet del empleado…");
      const account = await connectWallet();
      if (account.toLowerCase() !== newWallet.toLowerCase()) {
        throw new Error("Selecciona en la wallet la dirección nueva del empleado.");
      }
      setPhase("Firma la autorización como empleado…");
      const signature = await signTypedData(
        account,
        auth.domain,
        auth.types.employee,
        auth.employeeValue,
      );
      setEmployeeSig(signature);
      setPhase(null);
    } catch (err) {
      setError(errorMessage(err));
      setPhase(null);
    } finally {
      setBusy(false);
    }
  }

  async function signAsAdmin() {
    if (!auth) return;
    setError(null);
    setBusy(true);
    try {
      setPhase("Conectando wallet admin…");
      const account = await connectWallet();
      if (account.toLowerCase() !== adminWallet.toLowerCase()) {
        throw new Error("Selecciona en la wallet la misma cuenta administradora de la sesión.");
      }
      setPhase("Firma el step-up como administrador…");
      const signature = await signTypedData(
        account,
        auth.domain,
        auth.types.admin,
        auth.adminValue,
      );
      setAdminSig(signature);
      setPhase(null);
    } catch (err) {
      setError(errorMessage(err));
      setPhase(null);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!auth || !employeeSig || !adminSig) return;
    setError(null);
    setBusy(true);
    setPhase("Validando firmas y actualizando la wallet…");
    try {
      const { employee: updated } = await apiFetch<EmployeeResponse>(
        `/api/employees/${employee.id}/wallet`,
        {
          method: "POST",
          body: JSON.stringify({
            newWallet,
            employeeSignature: employeeSig,
            adminSignature: adminSig,
            nonce: auth.nonce,
            issuedAt: auth.issuedAt,
          }),
        },
      );
      setUpdated(updated);
      setPhase(null);
      const { flows: employeeFlows } = await apiFetch<{ flows: FlowDto[] }>(
        `/api/flows?empleadoId=${employee.id}`,
      );
      setFlows(employeeFlows.filter((flow) => flow.estado !== "terminado"));
    } catch (err) {
      setError(errorMessage(err));
      setPhase(null);
    } finally {
      setBusy(false);
    }
  }

  /** Migra un flujo activo a la wallet nueva con `changeReceiver` (AC-03). */
  async function migrateFlow(flow: FlowDto) {
    if (!updated || !config) return;
    setError(null);
    setBusy(true);
    setPhase(`Migrando flujo #${flow.flowId} a la wallet nueva…`);
    try {
      await ensureChain(config.chainId);
      const account = await connectWallet();
      if (account.toLowerCase() !== adminWallet.toLowerCase()) {
        throw new Error("Selecciona la wallet admin de la sesión para firmar.");
      }
      const result = await changeFlowReceiver(
        config.brltXAddress,
        account,
        flow.flowId,
        updated.wallet,
      );
      await apiFetch("/api/flows/actions", {
        method: "POST",
        body: JSON.stringify({
          flowId: flow.flowId,
          operacion: "cambio_receptor",
          employeeId: employee.id,
          txHash: result.hash,
          newFlowId: result.value,
          meta: { receiver: updated.wallet },
        }),
      });
      setMigrated((current) => [...current, flow.flowId]);
      const { flows: refreshed } = await apiFetch<{ flows: FlowDto[] }>(
        `/api/flows?empleadoId=${employee.id}`,
      );
      setFlows(refreshed.filter((item) => item.estado !== "terminado"));
      setPhase(null);
    } catch (err) {
      setError(errorMessage(err));
      setPhase(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={`Cambiar wallet de ${employee.nombre}`}
        subtitle="Requiere la firma de la wallet nueva y el step-up de la wallet admin (EIP-712)."
      />
      <CardBody className="space-y-4">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Actual: <Mono>{employee.wallet}</Mono>
        </div>

        <Field label="Wallet nueva">
          <Input
            value={newWallet}
            onChange={(e) => setNewWallet(e.target.value)}
            placeholder="0x…"
            disabled={Boolean(auth)}
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={prepare} disabled={busy || !newWallet || Boolean(auth)}>
            1. Preparar autorización
          </Button>
          <Button
            variant={employeeSig ? "secondary" : "primary"}
            onClick={signAsEmployee}
            disabled={busy || !auth || Boolean(employeeSig)}
          >
            {employeeSig ? "✓ Firmada (empleado)" : "2. Firmar como empleado"}
          </Button>
          <Button
            variant={adminSig ? "secondary" : "primary"}
            onClick={signAsAdmin}
            disabled={busy || !auth || Boolean(adminSig)}
          >
            {adminSig ? "✓ Firmada (admin)" : "3. Firmar como admin"}
          </Button>
          <Button onClick={submit} disabled={busy || !employeeSig || !adminSig}>
            4. Confirmar cambio
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        </div>

        {phase ? <Alert tone="info">{phase}</Alert> : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
        <p className="text-xs text-slate-500">
          Nota: si cambias de cuenta en la wallet, actualiza la sesión del panel con la cuenta
          admin al terminar.
        </p>
      </CardBody>
    </Card>
  );
}
