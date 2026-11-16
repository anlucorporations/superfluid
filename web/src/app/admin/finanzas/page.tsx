"use client";

import { useEffect, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { formatBrlt } from "@/lib/rates";
import type { EmployeeDto, FlowDto } from "@/lib/types";
import { Badge, Card, CardBody, CardHeader, EmptyState, Mono } from "@/components/adminlte";

interface SuiteBalances {
  walletBrlt: string;
  walletBrltx: string;
  cobrable: string;
}

interface Totales {
  flujosActivos: number;
  cobrableWei: string;
  saldoBrltWei: string;
  saldoBrltxWei: string;
}

interface FinanzasEmpleado {
  tipo: "empleado";
  employee: EmployeeDto | null;
  balances: SuiteBalances | null;
  flows: FlowDto[];
  totales: Totales | null;
}

interface FinanzasAdmin {
  tipo: "admin";
  detalle: {
    employee: EmployeeDto;
    balances: SuiteBalances | null;
    flujosActivos: number;
    flujosTotales: number;
  }[];
}

type FinanzasData = FinanzasEmpleado | FinanzasAdmin;

const ESTADO_BADGE: Record<string, "success" | "warning" | "brand" | "neutral" | "danger"> = {
  activo: "success",
  pausado: "warning",
  vencido_pendiente: "warning",
  terminado: "neutral",
  proximo: "brand",
};

export default function FinanzasPage() {
  const [data, setData] = useState<FinanzasData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<FinanzasData>("/api/finanzas")
      .then((d) => {
        if (!cancelled) setData(d);
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

  if (loading) {
    return <p className="text-sm text-adminlte-muted">Cargando finanzas…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (!data) return null;

  if (data.tipo === "empleado") {
    const t = data.totales;
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Finanzas</h1>
        <p className="text-sm text-adminlte-muted">
          Saldos on-chain y flujos de tu wallet. Los empleados solo pueden ver esta
          sección del panel.
        </p>
        {!data.employee ? (
          <EmptyState>Sin ficha de empleado asociada a esta sesión.</EmptyState>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Saldo BRLT" value={t ? formatBrlt(t.saldoBrltWei) : "—"} />
              <Metric label="Saldo BrltX" value={t ? formatBrlt(t.saldoBrltxWei) : "—"} />
              <Metric label="Cobrable ahora" value={t ? formatBrlt(t.cobrableWei) : "—"} />
              <Metric label="Flujos activos" value={t ? String(t.flujosActivos) : "—"} />
            </div>

            <Card>
              <CardHeader title="Movimientos y flujos de tu wallet" />
              <CardBody>
                {data.flows.length === 0 ? (
                  <EmptyState>Sin flujos registrados para tu wallet.</EmptyState>
                ) : (
                  <TablaFlujos flows={data.flows} />
                )}
              </CardBody>
            </Card>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Finanzas</h1>
      <p className="text-sm text-adminlte-muted">
        Finanzas de los usuarios: saldos on-chain y flujos por empleado activo.
      </p>
      {data.detalle.length === 0 ? (
        <EmptyState>No hay empleados activos con finanzas que mostrar.</EmptyState>
      ) : (
        <Card>
          <CardHeader title={`Empleados activos (${data.detalle.length})`} />
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-adminlte-muted">
                <tr>
                  <th className="px-2 py-2">Empleado</th>
                  <th className="px-2 py-2">Wallet</th>
                  <th className="px-2 py-2 text-right">BRLT</th>
                  <th className="px-2 py-2 text-right">BrltX</th>
                  <th className="px-2 py-2 text-right">Cobrable</th>
                  <th className="px-2 py-2 text-right">Flujos activos</th>
                  <th className="px-2 py-2 text-right">Flujos totales</th>
                </tr>
              </thead>
              <tbody>
                {data.detalle.map((d) => (
                  <tr key={d.employee.id} className="border-t border-adminlte-border">
                    <td className="px-2 py-2 font-medium">{d.employee.nombre}</td>
                    <td className="px-2 py-2">
                      <Mono>{d.employee.wallet.slice(0, 10)}…</Mono>
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {d.balances ? formatBrlt(d.balances.walletBrlt) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {d.balances ? formatBrlt(d.balances.walletBrltx) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {d.balances ? formatBrlt(d.balances.cobrable) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">{d.flujosActivos}</td>
                    <td className="px-2 py-2 text-right">{d.flujosTotales}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-adminlte-border bg-adminlte-card p-4">
      <p className="text-xs uppercase text-adminlte-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold font-mono">{value}</p>
    </div>
  );
}

function TablaFlujos({ flows }: { flows: FlowDto[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-adminlte-muted">
        <tr>
          <th className="px-2 py-2">#</th>
          <th className="px-2 py-2">Estado</th>
          <th className="px-2 py-2 text-right">Tasa (BRLT/s)</th>
          <th className="px-2 py-2 text-right">Deposited</th>
          <th className="px-2 py-2 text-right">Settled</th>
        </tr>
      </thead>
      <tbody>
        {flows.map((f) => (
          <tr key={f.id} className="border-t border-adminlte-border">
            <td className="px-2 py-2 font-mono">{f.flowId}</td>
            <td className="px-2 py-2">
              <Badge tone={ESTADO_BADGE[f.estado] ?? "secondary"}>{f.estado}</Badge>
            </td>
            <td className="px-2 py-2 text-right font-mono">
              {f.flowRate ? (Number(f.flowRate) / 1e18).toFixed(9) : "—"}
            </td>
            <td className="px-2 py-2 text-right font-mono">
              {formatBrlt(f.deposited)}
            </td>
            <td className="px-2 py-2 text-right font-mono">
              {formatBrlt(f.settled)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
