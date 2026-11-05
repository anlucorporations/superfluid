"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { shortAddress } from "@/lib/client/wallet";
import type { SessionInfo } from "@/lib/types";
import { Button } from "@/components/ui";

const NAV = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/empleados", label: "Empleados" },
  { href: "/admin/flujos", label: "Flujos" },
  { href: "/admin/proyectos", label: "Proyectos" },
  { href: "/admin/sistema", label: "Sistema" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/auditoria", label: "Auditoría" },
  { href: "/ayuda/", label: "Ayuda ↗" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ session: SessionInfo }>("/api/auth/me")
      .then((data) => {
        if (cancelled) return;
        if (data.session.role !== "admin") {
          router.replace("/suite");
          return;
        }
        setSession(data.session);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errorMessage(err));
        router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function logout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // La cookie se limpia igualmente en la siguiente navegación.
    }
    router.replace("/login");
    router.refresh();
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-slate-500">
          {error ?? "Comprobando sesión de administrador…"}
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-sm font-semibold text-ink-900">
              Superfluid <span className="text-brand-600">Brlt</span>
            </Link>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
              Panel admin
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span className="font-mono">{shortAddress(session.wallet)}</span>
            <span className="hidden sm:inline">
              sesión hasta {new Date(session.expiresAt).toLocaleTimeString("es-ES")}
            </span>
            <Button variant="secondary" size="sm" onClick={logout}>
              Salir
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {NAV.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                  active
                    ? "border-brand-600 font-medium text-brand-700"
                    : "border-transparent text-slate-600 hover:text-ink-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
