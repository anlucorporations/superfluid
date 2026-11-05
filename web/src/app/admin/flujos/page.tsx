"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import {
  approveBrlt,
  brltContract,
  burnBrlt,
  createFlow,
  mintBrlt,
  pauseFlow,
  resumeFlow,
  settleFlow,
  terminateFlow,
} from "@/lib/client/contracts";
import { connectWallet, ensureChain, shortAddress } from "@/lib/client/wallet";
import {
  PERIOD_LABELS,
  PERIOD_SECONDS,
  dailyProjection,
  flowRateFor,
  formatBrlt,
  humanDuration,
  monthlyProjection,
  parseBrlt,
  timeLeft,
} from "@/lib/rates";
import type {
  EmployeeDto,
  FlowDto,
  Periodo,
  ScheduledFlowDto,
  SessionInfo,
  TreasuryDto,
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

interface FlowsResponse {
  flows: FlowDto[];
  treasury: TreasuryDto | null;
}

interface SystemResponse {
  config: SystemConfigDto;
}

interface ScheduledResponse {
  scheduled: ScheduledFlowDto[];
}

const TABS = ["flujos", "crear", "programados", "lote", "tesoreria"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  flujos: "Flujos",
  crear: "Crear flujo",
  programados: "Programados",
  lote: "Lote (máx. 10)",
  tesoreria: "Tesorería",
};

const ESTADO_TONE: Record<FlowDto["estado"], "success" | "warning" | "neutral" | "danger"> = {
  activo: "success",
  pausado: "warning",
  vencido: "danger",
  terminado: "neutral",
};

export default function FlowsPage() {
  const [tab, setTab] = useState<Tab>("flujos");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [config, setConfig] = useState<SystemConfigDto | null>(null);
  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [flows, setFlows] = useState<FlowDto[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledFlowDto[]>([]);
  const [treasury, setTreasury] = useState<TreasuryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [me, sys, emp, flowData, sched] = await Promise.all([
      apiFetch<{ session: SessionInfo }>("/api/auth/me"),
      apiFetch<SystemResponse>("/api/system"),
      apiFetch<{ employees: EmployeeDto[] }>("/api/employees"),
      apiFetch<FlowsResponse>("/api/flows"),
      apiFetch<ScheduledResponse>("/api/scheduled-flows"),
    ]);
    setSession(me.session);
    setConfig(sys.config);
    setEmployees(emp.employees);
    setFlows(flowData.flows);
    setTreasury(flowData.treasury);
    setScheduled(sched.scheduled);
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

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.estado === "activo"),
    [employees],
  );

  async function adminAccount(): Promise<string> {
    if (!config) throw new Error("Configuración de red no cargada");
    await ensureChain(config.chainId);
    const account = await connectWallet();
    if (session && account.toLowerCase() !== session.wallet.toLowerCase()) {
      throw new Error(
        `La wallet conectada (${shortAddress(account)}) no es la wallet de la sesión (${shortAddress(
          session.wallet,
        )}). Cambia de cuenta en MetaMask.`,
      );
    }
    return account;
  }

  async function run<T>(label: string, action: () => Promise<T>): Promise<T | null> {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      await load();
      return result;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    } finally {
      setBusy(null);
    }
  }

  /** Crea un flujo on-chain (aprobando BRLT si hace falta) y lo registra en MongoDB. */
  async function createForEmployee(
    employee: EmployeeDto,
    amountWei: string,
    periodo: Periodo,
    options: { batchId?: string; silent?: boolean } = {},
  ): Promise<FlowDto | null> {
    if (!config) throw new Error("Configuración de red no cargada");
    const account = await adminAccount();
    const amount = BigInt(amountWei);

    const brlt = brltContract(config.brltAddress, account);
    const allowance = await brlt.allowance(account, config.brltXAddress);
    if (allowance.lt(amount)) {
      await approveBrlt(config.brltAddress, config.brltXAddress, account, amount);
    }

    const result = await createFlow({
      brltXAddress: config.brltXAddress,
      account,
      amount,
      receiver: employee.wallet,
      durationSeconds: PERIOD_SECONDS[periodo],
    });
    if (!result.value) throw new Error("No se pudo leer el flowId del recibo");

    const { flow } = await apiFetch<{ flow: FlowDto }>("/api/flows", {
      method: "POST",
      body: JSON.stringify({
        flowId: result.value,
        employeeId: employee.id,
        txHash: result.hash,
        batchId: options.batchId,
      }),
    });
    if (!options.silent) {
      setNotice(`Flujo #${flow.flowId} creado para ${employee.nombre}.`);
    }
    return flow;
  }

  async function action(
    operation: "pausa" | "reanudacion" | "terminacion" | "liquidacion",
    flow: FlowDto,
  ) {
    if (!config) return;
    let confirmed = true;
    if (operation === "terminacion") {
      confirmed = window.confirm(
        `¿Terminar el flujo #${flow.flowId}? Se liquidará lo devengado y el remanente volverá a tu wallet.`,
      );
    }
    if (!confirmed) return;

    await run(`flow-${operation}-${flow.id}`, async () => {
      const account = await adminAccount();
      let result;
      if (operation === "pausa") {
        result = await pauseFlow(config.brltXAddress, account, flow.flowId);
      } else if (operation === "reanudacion") {
        result = await resumeFlow(config.brltXAddress, account, flow.flowId, flow.flowRate);
      } else if (operation === "terminacion") {
        result = await terminateFlow(config.brltXAddress, account, flow.flowId);
      } else {
        result = await settleFlow(config.brltXAddress, account, flow.flowId);
      }
      await apiFetch("/api/flows/actions", {
        method: "POST",
        body: JSON.stringify({
          flowId: flow.flowId,
          operacion: operation,
          employeeId: flow.employeeId ?? undefined,
          txHash: result.hash,
        }),
      });
      setNotice(`Flujo #${flow.flowId}: ${operation} confirmada on-chain.`);
    });
  }

  if (loading || !config) {
    return <p className="text-sm text-slate-500">Cargando flujos…</p>;
  }

  const totals = flows.reduce(
    (acc, flow) => {
      if (flow.estado === "activo" || flow.estado === "pausado") {
        acc.escrow += BigInt(flow.deposited) - BigInt(flow.settled);
        acc.rate += BigInt(flow.flowRate);
      }
      return acc;
    },
    { escrow: 0n, rate: 0n },
  );

  const expired = flows.filter((flow) => flow.estado === "vencido");
  const soon = flows.filter(
    (flow) =>
      flow.estado === "activo" &&
      new Date(flow.endsAt).getTime() - Date.now() < 24 * 3_600_000,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Flujos de nómina</h1>
          <p className="text-sm text-slate-600">
            Crear, pausar, reanudar, terminar y liquidar flujos on-chain. Todo se firma con tu
            wallet; el servidor reconcilia el estado con BrltX.
          </p>
        </div>
        <Badge tone="brand">
          {flows.filter((flow) => flow.estado === "activo").length} activos · gasto{" "}
          {formatBrlt(totals.rate, 8)} BRLT/s
        </Badge>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {expired.length > 0 ? (
        <Alert tone="warning">
          {expired.length} flujo(s) vencido(s) pendientes de liquidación. Liquidar devuelve el
          remanente a tu wallet y cierra el flujo.
        </Alert>
      ) : null}
      {soon.length > 0 ? (
        <Alert tone="info">
          {soon.length} flujo(s) terminan en menos de 24 h:{" "}
          {soon.map((flow) => `#${flow.flowId}`).join(", ")}. Revisa si hay que renovarlos.
        </Alert>
      ) : null}

      <TreasuryBar treasury={treasury} config={config} rate={totals.rate} />

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
              tab === item
                ? "border-brand-600 font-medium text-brand-700"
                : "border-transparent text-slate-600 hover:text-ink-900"
            }`}
          >
            {TAB_LABEL[item]}
          </button>
        ))}
      </div>

      {tab === "flujos" ? (
        <FlowsTable flows={flows} busy={busy} onAction={action} />
      ) : null}

      {tab === "crear" ? (
        <CreateFlowForm
          employees={activeEmployees}
          flows={flows}
          busy={busy}
          onCreate={(employee, amount, periodo) =>
            run("crear", async () => {
              const existing = flows.filter(
                (flow) =>
                  flow.employeeId === employee.id &&
                  (flow.estado === "activo" || flow.estado === "pausado"),
              );
              if (existing.length > 0) {
                const total = existing.reduce((sum, flow) => sum + BigInt(flow.flowRate), 0n);
                const go = window.confirm(
                  `${employee.nombre} ya tiene ${existing.length} flujo(s) activo(s) por un total de ${formatBrlt(
                    total,
                    8,
                  )} BRLT/s. ¿Crear otro flujo además de los existentes?`,
                );
                if (!go) return;
              }
              await createForEmployee(employee, amount, periodo);
            })
          }
        />
      ) : null}

      {tab === "programados" ? (
        <ScheduledPanel
          employees={activeEmployees}
          scheduled={scheduled}
          busy={busy}
          onSchedule={(employee, amount, periodo, fechaInicio) =>
            run("programar", async () => {
              await apiFetch("/api/scheduled-flows", {
                method: "POST",
                body: JSON.stringify({
                  employeeId: employee.id,
                  amount,
                  periodo,
                  fechaInicio: fechaInicio.toISOString(),
                }),
              });
              setNotice(`Programado flujo para ${employee.nombre}.`);
            })
          }
          onExecute={(item) =>
            run(`ejecutar-${item.id}`, async () => {
              const employee = employees.find((candidate) => candidate.id === item.employeeId);
              if (!employee) throw new Error("Empleado no encontrado");
              const flow = await createForEmployee(employee, item.amount, item.periodo, {
                silent: true,
              });
              if (!flow) throw new Error("No se pudo crear el flujo programado");
              await apiFetch(`/api/scheduled-flows?id=${item.id}`, {
                method: "PATCH",
                body: JSON.stringify({ estado: "ejecutado", flowId: flow.flowId }),
              });
              setNotice(`Programación ejecutada: flujo #${flow.flowId}.`);
            })
          }
          onCancel={(item) =>
            run(`cancelar-${item.id}`, async () => {
              await apiFetch(`/api/scheduled-flows?id=${item.id}`, {
                method: "PATCH",
                body: JSON.stringify({ estado: "cancelado" }),
              });
              setNotice("Programación cancelada.");
            })
          }
        />
      ) : null}

      {tab === "lote" ? (
        <BatchPanel
          employees={activeEmployees}
          busy={busy}
          onRun={(selected, amount, periodo) =>
            run("lote", async () => {
              if (!config) throw new Error("Configuración no cargada");
              const account = await adminAccount();
              const total = amount * BigInt(selected.length);

              const brlt = brltContract(config.brltAddress, account);
              const allowance = await brlt.allowance(account, config.brltXAddress);
              if (allowance.lt(total)) {
                await approveBrlt(config.brltAddress, config.brltXAddress, account, total);
              }

              const { batch } = await apiFetch<{ batch: { id: string } }>("/api/batches", {
                method: "POST",
                body: JSON.stringify({ employeeIds: selected.map((employee) => employee.id) }),
              });
              const progress = await apiFetch<{ empleadosConFlujo: string[] }>(
                `/api/batches/${batch.id}`,
              );
              const done = new Set(progress.empleadosConFlujo);

              let created = 0;
              for (const employee of selected) {
                if (done.has(employee.id)) continue;
                await createForEmployee(employee, amount.toString(), periodo, {
                  batchId: batch.id,
                  silent: true,
                });
                created += 1;
              }
              setNotice(
                `Lote ${batch.id.slice(-6)}: ${created} flujos creados, ${
                  selected.length - created
                } ya existían.`,
              );
            })
          }
        />
      ) : null}

      {tab === "tesoreria" ? (
        <TreasuryPanel
          treasury={treasury}
          busy={busy}
          onMint={(to, amount) =>
            run("mint", async () => {
              const account = await adminAccount();
              const result = await mintBrlt(config.brltAddress, account, to, amount);
              await apiFetch("/api/flows/actions", {
                method: "POST",
                body: JSON.stringify({ flowId: "0", operacion: "mint", txHash: result.hash }),
              });
              setNotice(`Emitidos ${formatBrlt(amount)} BRLT hacia ${shortAddress(to)}.`);
            })
          }
          onBurn={(amount) =>
            run("burn", async () => {
              const account = await adminAccount();
              const result = await burnBrlt(config.brltAddress, account, amount);
              await apiFetch("/api/flows/actions", {
                method: "POST",
                body: JSON.stringify({ flowId: "0", operacion: "burn", txHash: result.hash }),
              });
              setNotice(`Quemados ${formatBrlt(amount)} BRLT.`);
            })
          }
        />
      ) : null}
    </div>
  );
}

function TreasuryBar({
  treasury,
  config,
  rate,
}: {
  treasury: TreasuryDto | null;
  config: SystemConfigDto;
  rate: bigint;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardBody>
          <p className="text-xs uppercase tracking-wide text-slate-500">BRLT del admin</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">
            {treasury ? formatBrlt(treasury.adminBrlt) : "—"}
          </p>
          <p className="text-xs text-slate-500">
            BrltX <Mono>{treasury ? formatBrlt(treasury.adminBrltX) : "—"}</Mono>
          </p>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <p className="text-xs uppercase tracking-wide text-slate-500">En escrow</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">
            {treasury ? formatBrlt(treasury.escrow) : "—"}
          </p>
          <p className="text-xs text-slate-500">respaldo 1:1 · {formatBrlt(treasury?.backing ?? "0")}</p>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <p className="text-xs uppercase tracking-wide text-slate-500">Allowance a BrltX</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">
            {treasury ? formatBrlt(treasury.allowance) : "—"}
          </p>
          <p className="text-xs text-slate-500">se amplía al crear flujos</p>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <p className="text-xs uppercase tracking-wide text-slate-500">Supply BrltX</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">
            {treasury ? formatBrlt(treasury.brltXSupply) : "—"}
          </p>
          <p className="text-xs text-slate-500">
            BRLT total <Mono>{treasury ? formatBrlt(treasury.totalSupplyBrlt) : "—"}</Mono>
          </p>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <p className="text-xs uppercase tracking-wide text-slate-500">Gasto proyectado</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">
            {formatBrlt(dailyProjection(rate.toString()))}
          </p>
          <p className="text-xs text-slate-500">
            BRLT/día · {formatBrlt(monthlyProjection(rate.toString()))} BRLT/mes
          </p>
        </CardBody>
      </Card>
      <p className="col-span-full text-xs text-slate-400">
        BrltX <Mono>{config.brltXAddress}</Mono> · BRLT <Mono>{config.brltAddress}</Mono>
      </p>
    </div>
  );
}

function FlowsTable({
  flows,
  busy,
  onAction,
}: {
  flows: FlowDto[];
  busy: string | null;
  onAction: (
    operation: "pausa" | "reanudacion" | "terminacion" | "liquidacion",
    flow: FlowDto,
  ) => void;
}) {
  if (flows.length === 0) {
    return (
      <Card>
        <EmptyState>Todavía no hay flujos. Crea el primero desde «Crear flujo».</EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Flujos" subtitle={`${flows.length} registros · estado leído de BrltX`} />
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Empleado / receptor</th>
              <th className="px-3 py-2 font-semibold text-right">Depositado</th>
              <th className="px-3 py-2 font-semibold text-right">Tasa</th>
              <th className="px-3 py-2 font-semibold">Fin</th>
              <th className="px-3 py-2 font-semibold text-right">Pendiente</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
              <th className="px-3 py-2 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {flows.map((flow) => {
              const key = `${flow.id}`;
              return (
                <tr key={key} className="align-top">
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">#{flow.flowId}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-ink-900">
                      {flow.employeeNombre ?? "Sin empleado"}
                    </p>
                    <Mono>{shortAddress(flow.receiver)}</Mono>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <p className="font-medium text-ink-900">{formatBrlt(flow.amount)}</p>
                    <p className="text-xs text-slate-500">
                      {humanDuration(flow.durationSeconds)}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-slate-600">
                    {formatBrlt(flow.flowRate, 8)} BRLT/s
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">
                    <p>{new Date(flow.endsAt).toLocaleString("es-ES")}</p>
                    <p className="text-slate-400">{timeLeft(flow.endsAt)}</p>
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-emerald-700">
                    {formatBrlt(flow.pending, 6)}
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={ESTADO_TONE[flow.estado]}>{flow.estado}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      {flow.estado === "activo" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy !== null}
                          onClick={() => onAction("pausa", flow)}
                        >
                          Pausar
                        </Button>
                      ) : null}
                      {flow.estado === "pausado" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy !== null}
                          onClick={() => onAction("reanudacion", flow)}
                        >
                          Reanudar
                        </Button>
                      ) : null}
                      {flow.estado === "vencido" ? (
                        <Button
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => onAction("liquidacion", flow)}
                        >
                          Liquidar
                        </Button>
                      ) : null}
                      {flow.estado !== "terminado" ? (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busy !== null}
                          onClick={() => onAction("terminacion", flow)}
                        >
                          Terminar
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CreateFlowForm({
  employees,
  flows,
  busy,
  onCreate,
}: {
  employees: EmployeeDto[];
  flows: FlowDto[];
  busy: string | null;
  onCreate: (employee: EmployeeDto, amountWei: string, periodo: Periodo) => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("2000");
  const [periodo, setPeriodo] = useState<Periodo>(30);
  const [localError, setLocalError] = useState<string | null>(null);

  const employee = employees.find((candidate) => candidate.id === employeeId) ?? null;
  const employeeFlows = employee
    ? flows.filter(
        (flow) =>
          flow.employeeId === employee.id &&
          (flow.estado === "activo" || flow.estado === "pausado"),
      )
    : [];
  const employeeRate = employeeFlows.reduce((sum, flow) => sum + BigInt(flow.flowRate), 0n);
  const rate = (() => {
    try {
      return flowRateFor(parseBrlt(amount), periodo);
    } catch {
      return null;
    }
  })();
  const totalWei = (() => {
    try {
      return parseBrlt(amount);
    } catch {
      return null;
    }
  })();

  return (
    <Card>
      <CardHeader
        title="Crear flujo"
        subtitle="Aprueba BRLT y deposita el importe completo; el contrato lo reparte segundo a segundo."
      />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Empleado">
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Selecciona…</option>
              {employees.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre} · {shortAddress(item.wallet)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Importe (BRLT)">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Periodo">
            <Select
              value={String(periodo)}
              onChange={(e) => setPeriodo(Number(e.target.value) as Periodo)}
            >
              {[6, 15, 30, 90].map((value) => (
                <option key={value} value={value}>
                  {PERIOD_LABELS[value as Periodo]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {employee ? (
          <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p>
              Receptor <Mono>{employee.wallet}</Mono>
              {rate && totalWei ? (
                <>
                  {" "}
                  · tasa <Mono>{formatBrlt(rate, 8)} BRLT/s</Mono> · total{" "}
                  <Mono>{formatBrlt(totalWei)} BRLT</Mono>
                </>
              ) : null}
            </p>
            {employeeFlows.length > 0 ? (
              <p className="text-amber-700">
                Ya tiene {employeeFlows.length} flujo(s) activo(s) por{" "}
                <Mono>{formatBrlt(employeeRate, 8)} BRLT/s</Mono> (proyección{" "}
                {formatBrlt(dailyProjection(employeeRate.toString()))} BRLT/día). Se pedirá
                confirmación antes de sumar otro.
              </p>
            ) : null}
          </div>
        ) : null}

        {localError ? <Alert tone="error">{localError}</Alert> : null}

        <div className="flex justify-end">
          <Button
            disabled={busy !== null || !employee}
            onClick={() => {
              setLocalError(null);
              if (!employee) return setLocalError("Selecciona un empleado");
              let wei: string;
              try {
                wei = parseBrlt(amount);
              } catch {
                return setLocalError("Importe inválido");
              }
              if (BigInt(wei) <= 0n) return setLocalError("El importe debe ser mayor que 0");
              onCreate(employee, wei, periodo);
            }}
          >
            {busy === "crear" ? "Firmando y creando…" : "Aprobar y crear flujo"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function ScheduledPanel({
  employees,
  scheduled,
  busy,
  onSchedule,
  onExecute,
  onCancel,
}: {
  employees: EmployeeDto[];
  scheduled: ScheduledFlowDto[];
  busy: string | null;
  onSchedule: (employee: EmployeeDto, amount: string, periodo: Periodo, fechaInicio: Date) => void;
  onExecute: (item: ScheduledFlowDto) => void;
  onCancel: (item: ScheduledFlowDto) => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("2000");
  const [periodo, setPeriodo] = useState<Periodo>(30);
  const [fecha, setFecha] = useState(() => {
    const next = new Date(Date.now() + 86_400_000);
    next.setSeconds(0, 0);
    return next.toISOString().slice(0, 16);
  });
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Programar nómina"
          subtitle="Queda en estado «próximo»; se ejecuta con firma manual cuando llega la fecha."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Empleado">
              <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Selecciona…</option>
                {employees.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Importe (BRLT)">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Periodo">
              <Select
                value={String(periodo)}
                onChange={(e) => setPeriodo(Number(e.target.value) as Periodo)}
              >
                {[6, 15, 30, 90].map((value) => (
                  <option key={value} value={value}>
                    {PERIOD_LABELS[value as Periodo]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Inicio">
              <Input
                type="datetime-local"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </Field>
          </div>

          {localError ? <Alert tone="error">{localError}</Alert> : null}

          <div className="flex justify-end">
            <Button
              disabled={busy !== null || !employeeId}
              onClick={() => {
                setLocalError(null);
                const employee = employees.find((candidate) => candidate.id === employeeId);
                if (!employee) return setLocalError("Selecciona un empleado");
                let wei: string;
                try {
                  wei = parseBrlt(amount);
                } catch {
                  return setLocalError("Importe inválido");
                }
                const when = new Date(fecha);
                if (Number.isNaN(when.getTime())) return setLocalError("Fecha inválida");
                onSchedule(employee, wei, periodo, when);
              }}
            >
              {busy === "programar" ? "Guardando…" : "Programar"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Programaciones" subtitle={`${scheduled.length} registros`} />
        {scheduled.length === 0 ? (
          <EmptyState>No hay flujos programados.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Empleado</th>
                  <th className="px-3 py-2 font-semibold text-right">Importe</th>
                  <th className="px-3 py-2 font-semibold">Periodo</th>
                  <th className="px-3 py-2 font-semibold">Inicio</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                  <th className="px-3 py-2 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scheduled.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="px-3 py-3 font-medium text-ink-900">{item.employeeNombre}</td>
                    <td className="px-3 py-3 text-right">{formatBrlt(item.amount)}</td>
                    <td className="px-3 py-3">{PERIOD_LABELS[item.periodo]}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {new Date(item.fechaInicio).toLocaleString("es-ES")}
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        tone={
                          item.estado === "ejecutado"
                            ? "success"
                            : item.estado === "fallido"
                              ? "danger"
                              : item.estado === "cancelado"
                                ? "neutral"
                                : "warning"
                        }
                      >
                        {item.estado}
                      </Badge>
                      {item.flowId ? <p className="text-xs text-slate-500">flujo #{item.flowId}</p> : null}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        {item.estado === "proximo" ? (
                          <>
                            <Button
                              size="sm"
                              disabled={busy !== null}
                              onClick={() => onExecute(item)}
                            >
                              Ejecutar
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy !== null}
                              onClick={() => onCancel(item)}
                            >
                              Cancelar
                            </Button>
                          </>
                        ) : null}
                        {item.estado === "fallido" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy !== null}
                            onClick={() => onExecute(item)}
                          >
                            Reintentar
                          </Button>
                        ) : null}
                        {item.estado === "ejecutado" ? (
                          <span className="text-xs text-slate-400">
                            {item.executedAt
                              ? new Date(item.executedAt).toLocaleDateString("es-ES")
                              : ""}
                          </span>
                        ) : null}
                        {item.error ? (
                          <p className="max-w-[16rem] text-xs text-rose-600">{item.error}</p>
                        ) : null}
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

function BatchPanel({
  employees,
  busy,
  onRun,
}: {
  employees: EmployeeDto[];
  busy: string | null;
  onRun: (selected: EmployeeDto[], amount: bigint, periodo: Periodo) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState("2000");
  const [periodo, setPeriodo] = useState<Periodo>(30);
  const [localError, setLocalError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= 10
          ? current
          : [...current, id],
    );
  }

  const total = (() => {
    try {
      return BigInt(parseBrlt(amount)) * BigInt(selected.length);
    } catch {
      return 0n;
    }
  })();

  return (
    <Card>
      <CardHeader
        title="Lote de flujos"
        subtitle="Hasta 10 empleados. Si se interrumpe, al reintentar se saltan los flujos ya creados."
      />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Importe por empleado (BRLT)">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Periodo común">
            <Select
              value={String(periodo)}
              onChange={(e) => setPeriodo(Number(e.target.value) as Periodo)}
            >
              {[6, 15, 30, 90].map((value) => (
                <option key={value} value={value}>
                  {PERIOD_LABELS[value as Periodo]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((employee) => {
            const checked = selected.includes(employee.id);
            return (
              <label
                key={employee.id}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                  checked ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white"
                }`}
              >
                <span>
                  {employee.nombre}
                  <span className="block text-xs text-slate-500">{shortAddress(employee.wallet)}</span>
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(employee.id)}
                  className="h-4 w-4"
                />
              </label>
            );
          })}
        </div>

        {localError ? <Alert tone="error">{localError}</Alert> : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">
            {selected.length} seleccionados · total{" "}
            <span className="font-medium text-ink-900">{formatBrlt(total)} BRLT</span>
          </p>
          <Button
            disabled={busy !== null || selected.length === 0}
            onClick={() => {
              setLocalError(null);
              if (selected.length === 0) return setLocalError("Selecciona al menos un empleado");
              let wei: string;
              try {
                wei = parseBrlt(amount);
              } catch {
                return setLocalError("Importe inválido");
              }
              onRun(
                employees.filter((employee) => selected.includes(employee.id)),
                BigInt(wei),
                periodo,
              );
            }}
          >
            {busy === "lote" ? "Ejecutando lote…" : `Crear ${selected.length} flujos`}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function TreasuryPanel({
  treasury,
  busy,
  onMint,
  onBurn,
}: {
  treasury: TreasuryDto | null;
  busy: string | null;
  onMint: (to: string, amount: bigint) => void;
  onBurn: (amount: bigint) => void;
}) {
  const [to, setTo] = useState("");
  const [mintAmount, setMintAmount] = useState("1000");
  const [burnAmount, setBurnAmount] = useState("0");
  const [localError, setLocalError] = useState<string | null>(null);

  const maxMint = treasury
    ? (50_000_000n * 10n ** 18n - BigInt(treasury.totalSupplyBrlt)).toString()
    : "0";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Emisión y quema de BRLT"
          subtitle="Solo el minter (tu wallet admin). Tope duro de 50.000.000 BRLT."
        />
        <CardBody className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Supply actual <Mono>{formatBrlt(treasury?.totalSupplyBrlt ?? "0")} BRLT</Mono> ·
            disponible hasta el tope <Mono>{formatBrlt(maxMint)} BRLT</Mono>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Destino del mint">
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" />
            </Field>
            <Field label="Importe a emitir (BRLT)">
              <Input
                value={mintAmount}
                onChange={(e) => setMintAmount(e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <div className="flex items-end">
              <Button
                disabled={busy !== null || !to}
                onClick={() => {
                  setLocalError(null);
                  try {
                    const amount = BigInt(parseBrlt(mintAmount));
                    if (amount <= 0n) throw new Error("importe inválido");
                    onMint(to, amount);
                  } catch {
                    setLocalError("Importe a emitir inválido");
                  }
                }}
              >
                {busy === "mint" ? "Emitiendo…" : "Emitir"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
            <Field label="Importe a quemar (BRLT)">
              <Input
                value={burnAmount}
                onChange={(e) => setBurnAmount(e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <div className="flex items-end">
              <Button
                variant="danger"
                disabled={busy !== null}
                onClick={() => {
                  setLocalError(null);
                  try {
                    const amount = BigInt(parseBrlt(burnAmount));
                    if (amount <= 0n) throw new Error("importe inválido");
                    onBurn(amount);
                  } catch {
                    setLocalError("Importe a quemar inválido");
                  }
                }}
              >
                {busy === "burn" ? "Quemando…" : "Quemar"}
              </Button>
            </div>
          </div>

          {localError ? <Alert tone="error">{localError}</Alert> : null}
          <p className="text-xs text-slate-500">
            Quemar reduce el circulante de tu propia wallet; no afecta a los flujos en curso
            (su escrow está en BrltX y respaldado por BRLT).
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
