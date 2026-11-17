"use client";

// Portal del Empleado — interfaz aparte de la administración (H5 / H13).
// Identidad visual propia (no AdminLTE): cabecera oscura, acentos violeta/esmeralda.
// La wallet conectada se valida en la entrada y de forma continua: si la cuenta
// activa de MetaMask deja de coincidir con la sesión, se avisa y se exige
// revalidar en /entrar. Desde /entrar, la wallet decide a qué portal redirigir.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { downgradeBrltx } from "@/lib/client/contracts";
import {
  connectWallet,
  ensureChain,
  getEthereum,
  shortAddress,
} from "@/lib/client/wallet";
import { PERIOD_LABELS, formatBrlt, parseBrlt, timeLeft } from "@/lib/rates";
import type { EmployeeDto, FlowDto, SessionInfo } from "@/lib/types";
import type { SystemConfigDto } from "@/lib/repositories/system";
import type { SuiteBalancesDto } from "@/lib/flows-onchain";
import type { DowngradeLimitDto } from "@/lib/downgrade-limit";
import { Button } from "@/components/ui";

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
  limites: DowngradeLimitDto;
}

const ESTADO_STYLE: Record<FlowDto["estado"], string> = {
  activo: "bg-emerald-100 text-emerald-800",
  pausado: "bg-amber-100 text-amber-800",
  vencido: "bg-rose-100 text-rose-800",
  terminado: "bg-slate-200 text-slate-700",
};

const ESTADO_LABEL: Record<string, string> = {
  activo: "Activo",
  pausado: "Pausado",
  vencido: "Vencido",
  terminado: "Terminado",
};

export default function EmpleadoPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [employee, setEmployee] = useState<EmployeeDto | null>(null);
  const [config, setConfig] = useState<SystemConfigDto | null>(null);
  const [balances, setBalances] = useState<SuiteBalancesDto | null>(null);
  const [limites, setLimites] = useState<DowngradeLimitDto | null>(null);
  const [flows, setFlows] = useState<FlowDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cobroAmount, setCobroAmount] = useState(""); // cobro autónomo libre
  const [downgradeAmount, setDowngradeAmount] = useState(""); // downgrade tope 80%
  const [downgradeFlow, setDowngradeFlow] = useState<string>(""); // flowId elegido
  const [walletOk, setWalletOk] = useState<boolean | null>(null); // null: comprobando
  const [profileDraft, setProfileDraft] = useState({ email: "", telefono: "" });
  const profileDraftSeeded = useRef(false);

  const load = useCallback(async () => {
    const data = await apiFetch<SuiteResponse>("/api/suite/me");
    setEmployee(data.employee);
    setConfig(data.config);
    setBalances(data.balances);
    setLimites(data.limites);
    setFlows(data.flows);
    if (!profileDraftSeeded.current) {
      profileDraftSeeded.current = true;
      setProfileDraft({
        email: data.employee.datosPersonales.email ?? "",
        telefono: data.employee.datosPersonales.telefono ?? "",
      });
    }
  }, []);

  // Sesión + refresco de 5 s (RF-08). La wallet conectada decide el portal:
  // sesión de admin → /admin; sin sesión → /entrar (entrada única por wallet).
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

  // Validación continua de la wallet conectada contra la sesión: si el empleado
  // cambia de cuenta en MetaMask, el portal deja de operar hasta revalidar.
  useEffect(() => {
    const ethereum = getEthereum();
    if (!ethereum || !session) return;
    const check = async () => {
      try {
        const accounts = (await ethereum.request({
          method: "eth_accounts",
        })) as string[];
        const connected = accounts[0]?.toLowerCase();
        setWalletOk(connected === session.wallet.toLowerCase());
      } catch {
        setWalletOk(null);
      }
    };
    void check();
    const handler = () => void check();
    ethereum.on?.("accountsChanged", handler);
    const interval = setInterval(handler, 10_000);
    return () => {
      ethereum.removeListener?.("accountsChanged", handler);
      clearInterval(interval);
    };
  }, [session]);

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
        )}). Cambia de cuenta en MetaMask o vuelve a entrar.`,
      );
    }
    return account;
  }

  /** Cobro libre (CU-16 / RF-21): quema BrltX propio y recibe BRLT. */
  async function cobrar(wei: string) {
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

  /**
   * Downgrade de flujo (tope del 80% acumulado): obtiene BRLT en el saldo
   * del empleado descargando de un flujo concreto. El servidor audita el cobro
   * contra la cadena y exige que el acumulado no supere el 80% de lo asignado.
   */
  async function downgradeFlujo(wei: string, flowId: string) {
    if (!config) return;
    if (BigInt(wei) <= 0n) throw new Error("El importe debe ser mayor que 0");
    if (!flowId) throw new Error("Selecciona el flujo del que descargas");
    setBusy("downgrade");
    setError(null);
    setNotice(null);
    try {
      const account = await walletAccount();
      const tx = await downgradeBrltx(config.brltXAddress, account, BigInt(wei));
      await apiFetch("/api/suite/actions", {
        method: "POST",
        body: JSON.stringify({ operacion: "cobro", flowId, txHash: tx.hash }),
      });
      setNotice(
        `Descargaste ${formatBrlt(wei)} BRLT del flujo #${flowId} a tu saldo.`,
      );
      setDowngradeAmount("");
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
      <main className="flex min-h-screen items-center justify-center bg-empleado-bg px-4">
        <p className="text-sm text-emerald-200/70">Cargando tu portal…</p>
      </main>
    );
  }

  const cobrableWei = balances ? BigInt(balances.walletBrltx) : 0n;
  const disponibleWei = limites ? BigInt(limites.downgradeDisponible) : 0n;
  // Descargable de verdad: BrltX ya en cartera Y dentro del tope del 80%.
  const descargableWei = cobrableWei < disponibleWei ? cobrableWei : disponibleWei;

  // El empleado ve solo flujos en proceso (activo/pausado) o terminados.
  const visibleFlows = flows.filter(
    (flow) => flow.estado === "activo" || flow.estado === "pausado" || flow.estado === "terminado",
  );

  return (
    <div className="min-h-screen bg-empleado-bg">
      <header className="border-b border-white/10 bg-gradient-to-r from-empleado-header via-empleado-header2 to-empleado-header">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/20 text-lg">
              ⛓
            </span>
            <div>
              <p className="text-lg font-semibold text-white">
                Portal del <span className="text-violet-300">Empleado</span>
              </p>
              <p className="text-xs text-emerald-200/60">Superfluid Brlt · ANLU corporations</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-emerald-200/80">
            <span className="rounded-full bg-white/10 px-2 py-1">
              Wallet <span className="font-mono">{shortAddress(session.wallet)}</span>
            </span>
            <span className="rounded-full bg-white/10 px-2 py-1">
              {new Date().toLocaleDateString("es-ES")}
            </span>
            <button
              onClick={logout}
              className="rounded-md border border-white/20 px-3 py-1 font-medium text-white transition hover:bg-white/10"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        {walletOk === false ? (
          <Banner tone="warning" title="Wallet distinta a tu sesión">
            La cuenta activa de MetaMask no es la de tu sesión. Vuelve a{" "}
            <button onClick={() => router.replace("/entrar")} className="underline">
              validar tu wallet
            </button>{" "}
            para seguir operando.
          </Banner>
        ) : null}

        {error ? <Banner tone="error">{error}</Banner> : null}
        {notice ? <Banner tone="success">{notice}</Banner> : null}
        {employee.estado !== "activo" ? (
          <Banner tone="warning" title="Ficha dada de baja">
            Puedes consultar y retirar tu saldo durante 90 días (ventana de retiro). No se
            generan nuevos pagos.
          </Banner>
        ) : null}
        {employee.borroSolicitado ? (
          <Banner tone="info" title="Datos personales borrados">
            Has solicitado el borrado de tus datos personales (efecto inmediato). Puedes
            volver a rellenarlos si lo necesitas.
          </Banner>
        ) : null}

        {/* Resumen del empleado */}
        <section className="grid gap-4 sm:grid-cols-3">
          <Panel>
            <PanelLabel>BRLT en tu saldo</PanelLabel>
            <PanelValue value={balances ? formatBrlt(balances.walletBrlt) : "—"} />
            <PanelNote>ya descargado a tu cartera</PanelNote>
          </Panel>
          <Panel>
            <PanelLabel>Cobrable ahora (BrltX)</PanelLabel>
            <PanelValue value={balances ? formatBrlt(balances.walletBrltx) : "—"} />
            <PanelNote>
              con devengo: {balances ? formatBrlt(balances.cobrable, 8) : "—"} BrltX
            </PanelNote>
          </Panel>
          <Panel>
            <PanelLabel>Salario por periodo</PanelLabel>
            <PanelValue value={`${formatBrlt(employee.montoPeriodo)} BRLT`} />
            <PanelNote>{PERIOD_LABELS[employee.periodo]}</PanelNote>
          </Panel>
        </section>

        {/* Downgrade de flujos — tope del 80% (nueva función) */}
        <Panel padded id="downgrade-panel">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-white">Downgrade de flujos</h2>
              <p className="text-xs text-emerald-200/60">
                Descarga BRLT a tu saldo desde un flujo asignado a tu cuenta. Tope
                acumulado del <strong className="text-violet-300">80%</strong> del total
                asignado.
              </p>
            </div>
          </div>

          {limites ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <LimitChip label="Asignado a tu cuenta" value={formatBrlt(limites.asignadoTotal)} />
              <LimitChip label="Tope 80%" value={formatBrlt(limites.downgradeMaximo)} />
              <LimitChip label="Ya descargado" value={formatBrlt(limites.downgradeUsado)} />
              <LimitChip
                label="Disponible"
                value={formatBrlt(limites.downgradeDisponible)}
                highlight
              />
            </div>
          ) : (
            <p className="mt-3 text-xs text-emerald-200/60">Calculando tu tope…</p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-emerald-200/70">
                Flujo del que descargas
              </span>
              <select
                value={downgradeFlow}
                onChange={(event) => setDowngradeFlow(event.target.value)}
                disabled={busy !== null || visibleFlows.length === 0}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              >
                <option value="" className="bg-slate-900">
                  Selecciona un flujo…
                </option>
                {visibleFlows.map((flow) => (
                  <option key={flow.id} value={flow.flowId} className="bg-slate-900">
                    #{flow.flowId} · {ESTADO_LABEL[flow.estado]} ·{" "}
                    {formatBrlt(flow.deposited, 2)} BRLT asignados
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-emerald-200/70">
                Importe a descargar (BRLT)
              </span>
              <input
                value={downgradeAmount}
                onChange={(event) => setDowngradeAmount(event.target.value)}
                inputMode="decimal"
                placeholder="0,0"
                disabled={busy !== null || descargableWei <= 0n}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  try {
                    void downgradeFlujo(parseBrlt(downgradeAmount), downgradeFlow);
                  } catch {
                    setError("Importe inválido");
                  }
                }}
                disabled={busy !== null || descargableWei <= 0n || !downgradeFlow}
                className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "downgrade" ? "Firmando…" : "Descargar"}
              </button>
              <button
                onClick={() => {
                  setDowngradeFlow(downgradeFlow || visibleFlows[0]?.flowId || "");
                  setDowngradeAmount(
                    formatBrlt(descargableWei, 8)
                      .replace(/\u00a0/g, "")
                      .replace(/\./g, "")
                      .replace(",", "."),
                  );
                }}
                disabled={busy !== null || descargableWei <= 0n}
                className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white transition hover:bg-white/10 disabled:opacity-40"
              >
                Máximo ({descargableWei > 0n ? formatBrlt(descargableWei, 6) : "0"})
              </button>
            </div>
          </div>

          {descargableWei <= 0n ? (
            <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-amber-200/80">
              No hay nada descargable ahora mismo: el tope del 80% está agotado o tu
              BrltX en cartera es 0. El devengo pendiente de un flujo activo se acredita
              a tu BrltX cuando el flujo se liquida on-chain.
            </p>
          ) : (
            <p className="mt-3 text-xs text-emerald-200/50">
              Máximo descargable ahora: <strong>{formatBrlt(descargableWei, 6)} BRLT</strong>{" "}
              (el menor entre tu BrltX en cartera y lo disponible del tope del 80%). El
              servidor verifica cada cobro contra la cadena y rechaza el que supere el tope.
            </p>
          )}
        </Panel>

        {/* Cobro autónomo libre */}
        <Panel padded>
          <h2 className="text-base font-semibold text-white">Cobro autónomo</h2>
          <p className="text-xs text-emerald-200/60">
            Quema BrltX de tu cartera y recibe BRLT en esta wallet, en la misma
            transacción (CU-16 / RF-21).
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-emerald-200/70">
                Importe (BRLT)
              </span>
              <input
                value={cobroAmount}
                onChange={(event) => setCobroAmount(event.target.value)}
                inputMode="decimal"
                placeholder="0,0"
                disabled={busy !== null || cobrableWei <= 0n}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
            <button
              onClick={() => {
                try {
                  void cobrar(parseBrlt(cobroAmount));
                } catch {
                  setError("Importe inválido");
                }
              }}
              disabled={busy !== null || cobrableWei <= 0n}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "cobro" ? "Firmando cobro…" : "Cobrar"}
            </button>
            <button
              onClick={() => {
                if (!balances) return;
                setCobroAmount(
                  formatBrlt(balances.walletBrltx)
                    .replace(/\u00a0/g, "")
                    .replace(/\./g, "")
                    .replace(",", "."),
                );
              }}
              disabled={busy !== null || cobrableWei <= 0n}
              className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white transition hover:bg-white/10 disabled:opacity-40"
            >
              Todo ({balances ? formatBrlt(balances.walletBrltx) : "—"})
            </button>
          </div>
          <p className="mt-3 text-xs text-emerald-200/50">
            Puedes cobrar aunque tu ficha esté dada de baja (ventana de retiro) y siempre
            que el contrato no haya sido detenido por el admin.
          </p>
        </Panel>

        {/* Mis flujos */}
        <Panel padded>
          <h2 className="text-base font-semibold text-white">Mis flujos</h2>
          <p className="text-xs text-emerald-200/60">
            Estado leído de BrltX · refresco automático cada 5 s
          </p>
          {flows.length === 0 ? (
            <p className="mt-3 text-sm text-emerald-100/60">
              Aún no tienes flujos. Cuando el administrador active tu nómina lo verás aquí
              segundo a segundo.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-emerald-200/60">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2 text-right">Asignado</th>
                    <th className="px-3 py-2 text-right">Tasa</th>
                    <th className="px-3 py-2">Fin</th>
                    <th className="px-3 py-2 text-right">Acumulado</th>
                    <th className="px-3 py-2 text-right">Pendiente</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-emerald-50/90">
                  {visibleFlows.map((flow) => (
                    <tr key={flow.id} className="align-top">
                      <td className="px-3 py-3 font-mono text-xs">#{flow.flowId}</td>
                      <td className="px-3 py-3 text-right text-xs">
                        {formatBrlt(flow.deposited, 2)}
                      </td>
                      <td className="px-3 py-3 text-right text-xs">
                        {flow.estado === "terminado"
                          ? "—"
                          : `${formatBrlt(flow.flowRate, 8)} BRLT/s`}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {new Date(flow.endsAt).toLocaleString("es-ES")}
                        <span className="block text-emerald-200/40">{timeLeft(flow.endsAt)}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-medium">
                        {formatBrlt(flow.settled, 6)}
                      </td>
                      <td className="px-3 py-3 text-right text-emerald-300">
                        {formatBrlt(flow.pending, 8)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_STYLE[flow.estado]}`}
                        >
                          {ESTADO_LABEL[flow.estado]}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {flow.estado === "terminado" ? (
                          <span className="text-xs text-emerald-200/40">—</span>
                        ) : (
                          <button
                            onClick={() => {
                              setDowngradeFlow(flow.flowId);
                              document
                                .getElementById("downgrade-panel")
                                ?.scrollIntoView({ behavior: "smooth" });
                            }}
                            className="rounded-md border border-violet-400/40 px-2 py-1 text-xs text-violet-300 transition hover:bg-violet-500/10"
                          >
                            Descargar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* Mi ficha */}
        <Panel padded>
          <h2 className="text-base font-semibold text-white">Mi ficha</h2>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Fila label="Wallet" value={shortAddress(employee.wallet)} mono />
            <Fila label="Estado" value={employee.estado} badge />
            <Fila label="Proyecto" value={employee.proyectoNombre ?? "—"} />
            <Fila label="Concepto" value={CONCEPTO_LABEL[employee.concepto] ?? employee.concepto} />
            <Fila label="Periodo" value={PERIOD_LABELS[employee.periodo]} />
            <Fila label="Alta" value={new Date(employee.createdAt).toLocaleDateString("es-ES")} />
            <Fila
              label="Consentimiento"
              value={
                employee.consentimiento?.aceptado
                  ? `activo · ${new Date(employee.consentimiento.fecha ?? 0).toLocaleDateString("es-ES")}`
                  : "sin consentimiento"
              }
            />
          </div>
        </Panel>

        {/* Mi perfil */}
        <Panel padded>
          <h2 className="text-base font-semibold text-white">Mi perfil</h2>
          <p className="text-xs text-emerald-200/60">
            Tratamiento de datos (AC-10): borrado inmediato a tu petición.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-emerald-200/70">Email</span>
              <input
                value={profileDraft.email}
                onChange={(event) =>
                  setProfileDraft((previous) => ({ ...previous, email: event.target.value }))
                }
                disabled={busy !== null}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-emerald-200/70">Teléfono</span>
              <input
                value={profileDraft.telefono}
                onChange={(event) =>
                  setProfileDraft((previous) => ({ ...previous, telefono: event.target.value }))
                }
                disabled={busy !== null}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
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
            <Button
              size="sm"
              variant="danger"
              disabled={busy !== null}
              onClick={() => void requestErase()}
            >
              Borrar mis datos
            </Button>
          </div>
          <p className="mt-3 text-xs text-emerald-200/50">
            Borrar mis datos elimina email y teléfono de inmediato; el histórico se
            anonimiza a 30 días (job de H6) y la wallet queda pseudonimizada hasta 90
            días para el retiro del pasivo.
          </p>
        </Panel>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-emerald-200/40">
        Portal del Empleado · ANLU corporations · Red {config.chainId}
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componentes de la interfaz del empleado (identidad propia, no AdminLTE)
// ---------------------------------------------------------------------------

function Panel({
  children,
  padded,
  id,
}: {
  children: React.ReactNode;
  padded?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`rounded-2xl border border-white/10 bg-empleado-card shadow-lg shadow-black/20 ${
        padded ? "p-5" : ""
      }`}
    >
      {children}
    </section>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs uppercase tracking-wide text-emerald-200/60">{children}</p>;
}

function PanelValue({ value }: { value: string }) {
  return (
    <p className="mt-1 text-2xl font-semibold text-white">
      {value}
      <span className="ml-1 text-sm font-normal text-emerald-200/50">BRLT</span>
    </p>
  );
}

function PanelNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 text-xs text-emerald-200/50">{children}</p>;
}

function LimitChip({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        highlight ? "border-violet-400/40 bg-violet-500/10" : "border-white/10 bg-white/5"
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-emerald-200/60">{label}</p>
      <p className="text-sm font-semibold text-white">{value}</p>
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
  const tone = value === "activo" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 py-1.5 last:border-0">
      <span className="text-emerald-200/60">{label}</span>
      {badge ? (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{value}</span>
      ) : mono ? (
        <span className="font-mono text-xs text-white">{value}</span>
      ) : (
        <span className="font-medium text-white">{value}</span>
      )}
    </div>
  );
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "error" | "success" | "warning" | "info";
  title?: string;
  children: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    error: "border-rose-400/40 bg-rose-500/10 text-rose-100",
    success: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
    warning: "border-amber-400/40 bg-amber-500/10 text-amber-100",
    info: "border-sky-400/40 bg-sky-500/10 text-sky-100",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${styles[tone]}`}>
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}
