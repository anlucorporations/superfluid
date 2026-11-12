"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { downgradeBrltx } from "@/lib/client/contracts";
import { connectWallet, ensureChain, shortAddress } from "@/lib/client/wallet";
import { PERIOD_LABELS, formatBrlt, parseBrlt, timeLeft } from "@/lib/rates";
import type { EmployeeDto, FlowDto, SessionInfo } from "@/lib/types";
import type { SystemConfigDto } from "@/lib/repositories/system";
import type { SuiteBalancesDto } from "@/lib/flows-onchain";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Mono,
} from "@/components/ui";

const CONCEPTO_LABEL: Record<string, string> = {
  mantenimiento: "Mantenimiento",
  nomina: "Nómina",
  proyecto_mvp: "Proyecto MVP",
  actividad_espacial: "Actividad espacial",
  otros: "Otros",
};

interface SuiteResponse {
  employee: EmployeeDto;
  config: SystemConfigDto;
  balances: SuiteBalancesDto | null;
  flows: FlowDto[];
}

const ESTADO_TONE: Record<FlowDto["estado"], "success" | "warning" | "neutral" | "danger"> = {
  activo: "success",
  pausado: "warning",
  vencido: "danger",
  terminado: "neutral",
};

export default function SuitePage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [employee, setEmployee] = useState<EmployeeDto | null>(null);
  const [config, setConfig] = useState<SystemConfigDto | null>(null);
  const [balances, setBalances] = useState<SuiteBalancesDto | null>(null);
  const [flows, setFlows] = useState<FlowDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState(""); // en decimales BRLT
  const [profileDraft, setProfileDraft] = useState({ email: "", telefono: "" });
  const profileDraftSeeded = useRef(false);

  const load = useCallback(async () => {
    const data = await apiFetch<SuiteResponse>("/api/suite/me");
    setEmployee(data.employee);
    setConfig(data.config);
    setBalances(data.balances);
    setFlows(data.flows);
    if (!profileDraftSeeded.current) {
      profileDraftSeeded.current = true;
      setProfileDraft({
        email: data.employee.datosPersonales.email ?? "",
        telefono: data.employee.datosPersonales.telefono ?? "",
      });
    }
  }, []);

  // Sesión + refresco de 5 s (RF-08) mientras haya sesión de empleado activa.
  useEffect(() => {
    let cancelled = false;
    void apiFetch<{ session: SessionInfo }>("/api/auth/me")
      .then((data) => {
        if (cancelled) return;
        if (data.session.role !== "empleado") {
          router.replace("/admin");
          return;
        }
        setSession(data.session);
      })
      .catch(() => {
        if (!cancelled) router.replace("/entrar");
      });

    if (cancelled) return;
    const interval = setInterval(() => {
      load().catch(() => undefined); // el siguiente tick reintenta
    }, 5_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [router, load]);

  // Primera carga inmediata al montar el refresco.
  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function logout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // La cookie se limpia igualmente en la siguiente navegación.
    }
    router.replace("/entrar");
    router.refresh();
  }

  async function walletAccount() {
    if (!config) throw new Error("Configuración de red no cargada");
    await ensureChain(config.chainId);
    const account = await connectWallet();
    if (session && account.toLowerCase() !== session.wallet.toLowerCase()) {
      throw new Error(
        `La wallet conectada (${shortAddress(account)}) no es la de tu sesión (${shortAddress(
          session.wallet,
        )}). Cambia de cuenta en MetaMask.`,
      );
    }
    return account;
  }

  /** Cobro autónomo: quema BrltX propio y recibe BRLT en la misma tx (CU-16, RF-21). */
  async function withdraw(wei: string) {
    if (!config) return;
    if (BigInt(wei) <= 0n) throw new Error("El importe debe ser mayor que 0");
    setBusy("cobro");
    setError(null);
    setNotice(null);
    try {
      const account = await walletAccount();
      const tx = await downgradeBrltx(config.brltXAddress, account, BigInt(wei));
      await apiFetch("/api/suite/actions", {
        method: "POST",
        body: JSON.stringify({ operacion: "cobro", txHash: tx.hash }),
      });
      setNotice(`Cobraste ${formatBrlt(wei)} BRLT a tu wallet.`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }


  async function saveProfile(patch: {
    datosPersonales?: { email?: string; telefono?: string };
    consentimiento?: boolean;
  }) {
    setBusy("perfil");
    setError(null);
    setNotice(null);
    try {
      await apiFetch("/api/suite/profile", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setNotice(
        patch.consentimiento === undefined
          ? "Perfil actualizado."
          : patch.consentimiento
            ? "Consentimiento registrado."
            : "Consentimiento retirado.",
      );
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function requestErase() {
    if (
      !window.confirm(
        "¿Borrar tus datos personales? Efecto inmediato y no reversible; la wallet se conserva hasta 90 días para el retiro.",
      )
    ) {
      return;
    }
    setBusy("erase");
    setError(null);
    setNotice(null);
    try {
      await apiFetch("/api/suite/erase", { method: "POST" });
      setProfileDraft({ email: "", telefono: "" });
      setNotice("Solicitud registrada: tus datos personales se han borrado.");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (!employee || !session || !config) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm text-slate-500">Cargando tu Suite…</p>
      </main>
    );
  }

  const cobrableWei = balances ? BigInt(balances.walletBrltx) : 0n;
  // El empleado ve solo flujos en proceso (activo/pausado) o terminados. Los vencidos
  // pendientes de liquidar no se muestran: son un estado administrativo.
  const visibleFlows = flows.filter(
    (flow) => flow.estado === "activo" || flow.estado === "pausado" || flow.estado === "terminado",
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-ink-900">
              Superfluid <span className="text-brand-600">Brlt</span>
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Suite del Empleado
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <Mono>{shortAddress(session.wallet)}</Mono>
            <Button variant="secondary" size="sm" onClick={logout}>
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}
        {employee.estado !== "activo" ? (
          <Alert tone="warning">
            Tu ficha está dada de baja: puedes consultar y retirar tu saldo durante 90 días
            (ventana de retiro). No se generan nuevos pagos.
          </Alert>
        ) : null}
        {employee.borroSolicitado ? (
          <Alert tone="info">
            Has solicitado el borrado de tus datos personales (efecto inmediato). Puedes
            volver a rellenarlos si lo necesitas.
          </Alert>
        ) : null}

        <SummaryCards employee={employee} balances={balances} />

        <Card>
          <CardHeader
            title="Cobro autónomo"
            subtitle="Quema BrltX de tu cartera y recibe BRLT en esta wallet, en la misma transacción (CU-16 / RF-21)."
          />
          <CardBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Importe (BRLT)">
                <Input
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0,0"
                />
              </Field>
              <div className="flex items-end gap-2">
                <Button
                  disabled={busy !== null || cobrableWei <= 0n}
                  onClick={() => {
                    try {
                      void withdraw(parseBrlt(withdrawAmount));
                    } catch {
                      setError("Importe inválido");
                    }
                  }}
                >
                  {busy === "cobro" ? "Firmando cobro…" : "Cobrar"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy !== null || cobrableWei <= 0n}
                  onClick={() => {
                    if (!balances) return;
                    // Cambia , por . solo para el input; el parseo usa parseBrlt().
                    const decimal = formatBrlt(balances.walletBrltx)
                      .replace(/\u00a0/g, "")
                      .replace(/\./g, "")
                      .replace(",", ".");
                    setWithdrawAmount(decimal);
                  }}
                >
                  Todo ({balances ? formatBrlt(balances.walletBrltx) : "—"} BRLT)
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Puedes cobrar aunque tu ficha esté dada de baja (ventana de retiro) y siempre
              que el contrato no haya sido detenido por el admin. Lo devengado y aún no
              acreditado se incorpora a tu BrltX cuando el flujo se liquida on-chain.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Mis flujos"
            subtitle="Estado leído de BrltX · refresco automático cada 5 s"
          />
          {flows.length === 0 ? (
            <CardBody className="text-sm text-slate-600">
              Aún no tienes flujos. Cuando el administrador active tu nómina lo verás aquí
              segundo a segundo.
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold text-right">Tasa</th>
                    <th className="px-3 py-2 font-semibold">Fin</th>
                    <th className="px-3 py-2 font-semibold text-right">Acumulado</th>
                    <th className="px-3 py-2 font-semibold text-right">Pendiente</th>
                    <th className="px-3 py-2 font-semibold">Estado</th>
                    <th className="px-3 py-2 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleFlows.map((flow) => (
                    <tr key={flow.id} className="align-top">
                      <td className="px-3 py-3 font-mono text-xs text-slate-600">
                        #{flow.flowId}
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-slate-600">
                        {flow.estado === "terminado"
                          ? "—"
                          : `${formatBrlt(flow.flowRate, 8)} BRLT/s`}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {new Date(flow.endsAt).toLocaleString("es-ES")}
                        <span className="block text-slate-400">{timeLeft(flow.endsAt)}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-ink-900">
                        {formatBrlt(flow.settled, 6)}
                      </td>
                      <td className="px-3 py-3 text-right text-emerald-700">
                        {formatBrlt(flow.pending, 8)}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={ESTADO_TONE[flow.estado]}>{flow.estado}</Badge>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {/* Solo lectura: el empleado no liquida flujos. El cobro (downgrade) se hace desde la tarjeta superior. */}
                        <span className="text-xs text-slate-400">solo lectura</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Mi ficha" />
          <CardBody className="grid gap-3 text-sm sm:grid-cols-2">
            <Fila label="Wallet" value={shortAddress(employee.wallet)} mono />
            <Fila
              label="Estado"
              value={employee.estado}
              badge={employee.estado === "activo"}
            />
            <Fila label="Proyecto" value={employee.proyectoNombre ?? "—"} />
            <Fila
              label="Concepto"
              value={CONCEPTO_LABEL[employee.concepto] ?? employee.concepto}
            />
            <Fila label="Periodo" value={PERIOD_LABELS[employee.periodo]} />
            <Fila
              label="Alta"
              value={new Date(employee.createdAt).toLocaleDateString("es-ES")}
            />
            <Fila
              label="Consentimiento"
              value={
                employee.consentimiento?.aceptado
                  ? `activo · ${new Date(employee.consentimiento.fecha ?? 0).toLocaleDateString("es-ES")}`
                  : "sin consentimiento"
              }
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Mi perfil"
            subtitle="Tratamiento de datos (AC-10): borrado inmediato a tu petición."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email">
                <Input
                  value={profileDraft.email}
                  onChange={(event) =>
                    setProfileDraft((previous) => ({
                      ...previous,
                      email: event.target.value,
                    }))
                  }
                  disabled={busy !== null}
                />
              </Field>
              <Field label="Teléfono">
                <Input
                  value={profileDraft.telefono}
                  onChange={(event) =>
                    setProfileDraft((previous) => ({
                      ...previous,
                      telefono: event.target.value,
                    }))
                  }
                  disabled={busy !== null}
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  void saveProfile({
                    datosPersonales: {
                      email: profileDraft.email.trim() || undefined,
                      telefono: profileDraft.telefono.trim() || undefined,
                    },
                  })
                }
              >
                Guardar perfil
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void saveProfile({ consentimiento: true })}
              >
                Dar consentimiento
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== null || !employee.consentimiento?.aceptado}
                onClick={() => void saveProfile({ consentimiento: false })}
              >
                Retirar consentimiento
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <p className="max-w-lg text-xs text-slate-500">
                Borrar mis datos elimina email y teléfono de inmediato; el histórico se
                anonimiza a 30 días (job de H6) y la wallet queda pseudonimizada hasta 90
                días para el retiro del pasivo.
              </p>
              <Button
                size="sm"
                variant="danger"
                disabled={busy !== null}
                onClick={() => void requestErase()}
              >
                Borrar mis datos
              </Button>
            </div>
          </CardBody>
        </Card>
      </main>
    </div>
  );
}

function SummaryCards({
  employee,
  balances,
}: {
  employee: EmployeeDto;
  balances: SuiteBalancesDto | null;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardBody>
          <p className="text-xs uppercase tracking-wide text-slate-500">Cobrable ahora</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">
            {balances ? formatBrlt(balances.walletBrltx) : "—"}{" "}
            <span className="text-sm font-normal text-slate-500">BRLT</span>
          </p>
          <p className="text-xs text-slate-500">
            con devengo: {balances ? formatBrlt(balances.cobrable, 8) : "—"} BrltX
          </p>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <p className="text-xs uppercase tracking-wide text-slate-500">BRLT en wallet</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">
            {balances ? formatBrlt(balances.walletBrlt) : "—"}
          </p>
          <p className="text-xs text-slate-500">ya retirado a tu cartera</p>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <p className="text-xs uppercase tracking-wide text-slate-500">Salario por periodo</p>
          <p className="mt-1 text-2xl font-semibold text-ink-900">
            {formatBrlt(employee.montoPeriodo)} BRLT
          </p>
          <p className="text-xs text-slate-500">{PERIOD_LABELS[employee.periodo]}</p>
        </CardBody>
      </Card>
    </div>
  );
}

function Fila({
  label,
  value,
  mono,
  badge,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-slate-500">{label}</span>
      {badge ? (
        <Badge tone={employeeBadgeTone(value)}>{value}</Badge>
      ) : mono ? (
        <Mono>{value}</Mono>
      ) : (
        <span className="font-medium text-ink-900">{value}</span>
      )}
    </div>
  );
}

function employeeBadgeTone(value: string): "success" | "warning" | "neutral" {
  if (value === "activo") return "success";
  if (value === "inactivo") return "warning";
  return "neutral";
}
