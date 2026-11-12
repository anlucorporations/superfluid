"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { connectWallet, shortAddress, signMessage } from "@/lib/client/wallet";
import type { AllowlistDto } from "@/lib/repositories/allowlist";
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
} from "@/components/adminlte";

interface SystemResponse {
  config: SystemConfigDto;
}

interface AllowlistResponse {
  allowlist: AllowlistDto[];
}

export default function SystemPage() {
  const [config, setConfig] = useState<SystemConfigDto | null>(null);
  const [allowlist, setAllowlist] = useState<AllowlistDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [sys, list] = await Promise.all([
      apiFetch<SystemResponse>("/api/system"),
      apiFetch<AllowlistResponse>("/api/admin/allowlist"),
    ]);
    setConfig(sys.config);
    setAllowlist(list.allowlist);
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

  if (loading || !config) {
    return <p className="text-sm text-slate-500">Cargando configuración…</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Sistema</h1>
        <p className="text-sm text-slate-600">
          Addresses de los contratos, RPC, tasa de refresco y wallets administradoras.
        </p>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <ConfigForm
        config={config}
        onSaved={(updated) => {
          setConfig(updated);
          setNotice("Configuración guardada y validada contra la red.");
        }}
        onError={(message) => setError(message)}
      />

      <AllowlistCard
        entries={allowlist}
        onReload={load}
        onNotice={setNotice}
        onError={setError}
      />
    </div>
  );
}

function ConfigForm({
  config,
  onSaved,
  onError,
}: {
  config: SystemConfigDto;
  onSaved: (config: SystemConfigDto) => void;
  onError: (message: string) => void;
}) {
  const [rpcUrl, setRpcUrl] = useState(config.rpcUrl);
  const [brltAddress, setBrltAddress] = useState(config.brltAddress);
  const [brltXAddress, setBrltXAddress] = useState(config.brltXAddress);
  const [deployBlock, setDeployBlock] = useState(String(config.deployBlock));
  const [tasaRefrescoMs, setTasaRefrescoMs] = useState(String(config.tasaRefrescoMs));
  const [faucetUrl, setFaucetUrl] = useState(config.faucetUrl);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    onError("");
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        rpcUrl,
        deployBlock: Number(deployBlock),
        tasaRefrescoMs: Number(tasaRefrescoMs),
        faucetUrl,
      };
      if (brltAddress.trim()) payload.brltAddress = brltAddress.trim();
      if (brltXAddress.trim()) payload.brltXAddress = brltXAddress.trim();

      const { config: updated } = await apiFetch<SystemResponse>("/api/system", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      onSaved(updated);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Configuración de red"
        subtitle="El guardado exige chainId 81234 y comprueba que las addresses tengan código."
      />
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="RPC URL">
              <Input value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} required />
            </Field>
            <Field label="chainId (fijo)">
              <Input value={config.chainId} disabled />
            </Field>
            <Field label="BRLT address" hint="Vacío = conservar la actual">
              <Input
                value={brltAddress}
                onChange={(e) => setBrltAddress(e.target.value)}
                placeholder="0x…"
              />
            </Field>
            <Field label="BrltX address" hint="Vacío = conservar la actual">
              <Input
                value={brltXAddress}
                onChange={(e) => setBrltXAddress(e.target.value)}
                placeholder="0x…"
              />
            </Field>
            <Field label="Bloque del deploy">
              <Input
                type="number"
                min={0}
                value={deployBlock}
                onChange={(e) => setDeployBlock(e.target.value)}
              />
            </Field>
            <Field label="Tasa de refresco (ms)" hint="1000–120000 ms">
              <Input
                type="number"
                min={1000}
                max={120000}
                value={tasaRefrescoMs}
                onChange={(e) => setTasaRefrescoMs(e.target.value)}
              />
            </Field>
            <Field label="Faucet URL" className="sm:col-span-2">
              <Input value={faucetUrl} onChange={(e) => setFaucetUrl(e.target.value)} />
            </Field>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Validando y guardando…" : "Guardar configuración"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function AllowlistCard({
  entries,
  onReload,
  onNotice,
  onError,
}: {
  entries: AllowlistDto[];
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [wallet, setWallet] = useState("");
  const [rol, setRol] = useState<"admin" | "operador">("admin");
  const [phase, setPhase] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    onError("");
    setBusy(true);
    try {
      setPhase("Emitiendo challenge…");
      const challenge = await apiFetch<{ message: string }>("/api/admin/allowlist/challenge", {
        method: "POST",
        body: JSON.stringify({ wallet }),
      });

      setPhase("Firma el mensaje con la wallet nueva…");
      const account = await connectWallet();
      if (account.toLowerCase() !== wallet.toLowerCase()) {
        throw new Error("La wallet conectada no coincide con la dirección introducida.");
      }
      const signature = await signMessage(account, challenge.message);

      setPhase("Verificando y añadiendo…");
      await apiFetch("/api/admin/allowlist", {
        method: "POST",
        body: JSON.stringify({ wallet, rol, message: challenge.message, signature }),
      });

      setWallet("");
      setPhase(null);
      await onReload();
      onNotice("Wallet añadida a la allowlist.");
    } catch (err) {
      onError(errorMessage(err));
      setPhase(null);
    } finally {
      setBusy(false);
    }
  }

  async function update(entry: AllowlistDto, patch: { estado?: string; rol?: string }) {
    onError("");
    try {
      await apiFetch(`/api/admin/allowlist/${entry.wallet}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await onReload();
      onNotice("Allowlist actualizada.");
    } catch (err) {
      onError(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Wallets administradoras"
        subtitle="Alta con confirmación firmada; nunca se permite quedarse sin admin activo."
      />
      <CardBody className="space-y-4">
        {entries.length === 0 ? (
          <EmptyState>No hay wallets en la allowlist.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Wallet</th>
                  <th className="px-3 py-2 font-semibold">Rol</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                  <th className="px-3 py-2 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-3 py-2">
                      <Mono>{shortAddress(entry.wallet)}</Mono>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={entry.rol === "admin" ? "brand" : "neutral"}>{entry.rol}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {entry.estado === "activo" ? (
                        <Badge tone="success">activo</Badge>
                      ) : (
                        <Badge tone="danger">inactivo</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        {entry.estado === "activo" ? (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => update(entry, { estado: "inactivo" })}
                          >
                            Revocar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => update(entry, { estado: "activo" })}
                          >
                            Reactivar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={add} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto_auto]">
          <Field label="Wallet nueva">
            <Input
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder="0x…"
              required
            />
          </Field>
          <Field label="Rol">
            <Select value={rol} onChange={(e) => setRol(e.target.value as "admin" | "operador")}>
              <option value="admin">admin</option>
              <option value="operador">operador</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Procesando…" : "Añadir con firma"}
            </Button>
          </div>
        </form>

        {phase ? <Alert tone="info">{phase}</Alert> : null}
      </CardBody>
    </Card>
  );
}
