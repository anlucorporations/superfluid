"use client";

// Login del panel admin con look & feel AdminLTE. Misma lógica SIWE que
// LoginFlow (nonce → firma → verify), pero aislada para no alterar el acceso
// de empleados (/suite/login), que sigue usando LoginFlow.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, errorMessage } from "@/lib/client/api";
import {
  connectWallet,
  ensureChain,
  hasWallet,
  shortAddress,
  signMessage,
} from "@/lib/client/wallet";
import { publicEnv } from "@/lib/env";
import type { Role } from "@/lib/types";
import { Alert, Button, Card, CardBody, CardHeader, Mono } from "./adminlte";

interface NonceResponse {
  nonce: string;
  message: string;
  expiresAt: string;
}

type Phase = "idle" | "conectando" | "firmando" | "verificando";

export function AdminLoginFlow({
  title,
  subtitle,
  redirectTo,
}: {
  title: string;
  subtitle: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [walletAvailable, setWalletAvailable] = useState(true);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setWalletAvailable(hasWallet());

    let cancelled = false;
    apiFetch<{ session: { role: Role } }>("/api/auth/me")
      .then((data) => {
        if (cancelled) return;
        if (data.session.role === "admin") router.replace(redirectTo);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [redirectTo, router]);

  async function login() {
    setError(null);
    try {
      setPhase("conectando");
      await ensureChain(publicEnv.chainId);
      const account = await connectWallet();
      setAddress(account);

      setPhase("firmando");
      const nonce = await apiFetch<NonceResponse>("/api/auth/nonce", {
        method: "POST",
        body: JSON.stringify({ wallet: account, purpose: "admin" }),
      });
      const signature = await signMessage(account, nonce.message);

      setPhase("verificando");
      await apiFetch("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ message: nonce.message, signature }),
      });

      router.replace(redirectTo);
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
          <p className="text-xs uppercase tracking-wide text-adminlte-sidebarText">Superfluid Brlt</p>
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
        <CardHeader title="Acceso" subtitle={subtitle} />
        <CardBody className="space-y-4">
          <div className="rounded bg-adminlte-content px-3 py-2 text-xs text-adminlte-muted">
            Red: <Mono>{publicEnv.chainId}</Mono> · RPC <Mono>{publicEnv.rpcUrl}</Mono>
          </div>

          {!walletAvailable ? (
            <Alert tone="warning">
              No se detecta ninguna wallet inyectada. Instala MetaMask (u otra wallet EIP-1193)
              y recarga la página.
            </Alert>
          ) : null}

          {address ? (
            <p className="text-sm text-adminlte-muted">
              Wallet conectada: <Mono>{shortAddress(address)}</Mono>
            </p>
          ) : null}

          {error ? <Alert tone="error">{error}</Alert> : null}

          <Button onClick={login} disabled={busy || checking || !walletAvailable} className="w-full">
            {phase === "conectando"
              ? "Conectando wallet…"
              : phase === "firmando"
                ? "Firma el mensaje en tu wallet…"
                : phase === "verificando"
                  ? "Verificando firma…"
                  : "Entrar con wallet"}
          </Button>

          <p className="text-center text-xs text-adminlte-muted">
            ¿Eres empleado? Accede a la Suite:{" "}
            <Link href="/suite/login" className="font-medium text-adminlte-primary hover:underline">
              /suite/login
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
