"use client";

// Entrada única de ANLU corporations. Conecta la wallet, consulta su tipo
// (admin / empleado) y redirige a la suite correspondiente. La identidad se
// demuestra con una única firma SIWE del propósito que corresponde.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { connectWallet, ensureChain, hasWallet, shortAddress, signMessage } from "@/lib/client/wallet";
import { publicEnv } from "@/lib/env";
import { Alert, Button, Card, CardBody, CardHeader, Mono } from "./adminlte";

type Phase = "idle" | "conectando" | "consultando" | "firmando" | "verificando" | "redirigiendo";

interface RoleResponse {
  role: "admin" | "empleado" | "ninguno";
  suite: string | null;
}

interface NonceResponse {
  nonce: string;
  message: string;
  expiresAt: string;
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Entrar con wallet",
  conectando: "Conectando wallet…",
  consultando: "Consultando tu tipo de cuenta…",
  firmando: "Firma el mensaje en tu wallet…",
  verificando: "Verificando firma…",
  redirigiendo: "Abriendo tu suite…",
};

export function EntryLogin() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);

  async function entrar() {
    setError(null);
    try {
      setPhase("conectando");
      await ensureChain(publicEnv.chainId);
      const account = await connectWallet();
      setAddress(account);

      // 1) Tipo de cuenta: sin firma ni sesión, solo decide el destino.
      setPhase("consultando");
      const { role, suite } = await apiFetch<RoleResponse>("/api/auth/role", {
        method: "POST",
        body: JSON.stringify({ wallet: account }),
      });
      if (role === "ninguno" || !suite) {
        setError("Esta wallet no tiene acceso a ninguna suite. Pide alta al administrador.");
        setPhase("idle");
        return;
      }

      // 2) Una firma SIWE con el propósito de la suite destino.
      const purpose = role === "admin" ? "admin" : "suite";
      setPhase("firmando");
      const nonce = await apiFetch<NonceResponse>("/api/auth/nonce", {
        method: "POST",
        body: JSON.stringify({ wallet: account, purpose }),
      });
      const signature = await signMessage(account, nonce.message);

      setPhase("verificando");
      await apiFetch("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ message: nonce.message, signature }),
      });

      setPhase("redirigiendo");
      router.replace(suite);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";

  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <div className="bg-adminlte-sidebar px-4 py-3 text-white">
          <p className="text-xs uppercase tracking-wide text-adminlte-sidebarText">ANLU corporations</p>
          <h1 className="text-lg font-semibold">Acceso a Superfluid Brlt</h1>
        </div>
        <CardHeader
          title="Entra con tu wallet"
          subtitle="Te llevamos a la suite que te corresponde: administración o tu Suite del Empleado."
        />
        <CardBody className="space-y-4">
          <div className="rounded bg-adminlte-content px-3 py-2 text-xs text-adminlte-muted">
            Red: <Mono>{publicEnv.chainId}</Mono> · RPC <Mono>{publicEnv.rpcUrl}</Mono>
          </div>

          {!hasWallet() ? (
            <Alert tone="warning">
              No se detecta ninguna wallet. Instala MetaMask (u otra wallet EIP-1193) y recarga.
            </Alert>
          ) : null}

          {address ? (
            <p className="text-sm text-adminlte-muted">
              Wallet: <Mono>{shortAddress(address)}</Mono>
            </p>
          ) : null}

          {error ? <Alert tone="error">{error}</Alert> : null}

          <Button onClick={entrar} disabled={busy || !hasWallet()} className="w-full">
            {PHASE_LABEL[phase]}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
