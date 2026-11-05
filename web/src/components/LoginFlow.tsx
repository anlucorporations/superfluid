"use client";

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
import { Alert, Button, Card, CardBody, CardHeader, Mono } from "./ui";

interface NonceResponse {
  nonce: string;
  message: string;
  expiresAt: string;
}

interface VerifyResponse {
  session: { wallet: string; role: Role; employeeId: string | null; expiresAt: string };
}

type Phase = "idle" | "conectando" | "firmando" | "verificando";

export function LoginFlow({
  purpose,
  title,
  subtitle,
  redirectTo,
  altHref,
  altLabel,
}: {
  purpose: "admin" | "suite";
  title: string;
  subtitle: string;
  redirectTo: string;
  altHref: string;
  altLabel: string;
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
        const expected = purpose === "admin" ? "admin" : "empleado";
        if (data.session.role === expected) router.replace(redirectTo);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [purpose, redirectTo, router]);

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
        body: JSON.stringify({ wallet: account, purpose }),
      });
      const signature = await signMessage(account, nonce.message);

      setPhase("verificando");
      await apiFetch<VerifyResponse>("/api/auth/verify", {
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
        <CardHeader title={title} subtitle={subtitle} />
        <CardBody className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Red: <Mono>{publicEnv.chainId}</Mono> · RPC <Mono>{publicEnv.rpcUrl}</Mono>
          </div>

          {!walletAvailable ? (
            <Alert tone="warning">
              No se detecta ninguna wallet inyectada. Instala MetaMask (u otra wallet EIP-1193)
              y recarga la página.
            </Alert>
          ) : null}

          {address ? (
            <p className="text-sm text-slate-600">
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

          <p className="text-center text-xs text-slate-500">
            {altLabel}{" "}
            <Link href={altHref} className="font-medium text-brand-700 hover:underline">
              {altHref}
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
