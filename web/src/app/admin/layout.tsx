"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { shortAddress } from "@/lib/client/wallet";
import type { SessionInfo } from "@/lib/types";
import { Button } from "@/components/adminlte";

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
        router.replace("/entrar");
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
    router.replace("/entrar");
    router.refresh();
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-adminlte-content px-6">
        <p className="text-sm text-adminlte-muted">
          {error ?? "Comprobando sesión de administrador…"}
        </p>
      </main>
    );
  }

  const activeLabel =
    NAV.find((item) =>
      item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href),
    )?.label ?? "Panel";

  return (
    <div className="flex min-h-screen bg-adminlte-content text-adminlte-text">
      {/* Sidebar oscuro estilo AdminLTE */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-adminlte-sidebar text-adminlte-sidebarText md:flex">
        <Link
          href="/admin"
          className="flex h-14 items-center gap-2 border-b border-white/10 px-4 text-base font-semibold text-white"
        >
          <span className="rounded bg-adminlte-primary px-1.5 py-0.5 text-xs">SF</span>
          Superfluid <span className="text-adminlte-primary">Brlt</span>
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Navegación admin">
          {NAV.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center rounded px-3 py-2 text-sm transition ${
                  active
                    ? "bg-adminlte-sidebarActive font-medium text-white"
                    : "hover:bg-adminlte-sidebarHover hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header claro estilo AdminLTE (navbar) */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-adminlte-border bg-adminlte-card px-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-sm font-semibold text-adminlte-text">{activeLabel}</span>
            <span className="hidden rounded-full bg-adminlte-info/10 px-2 py-0.5 text-xs font-medium text-adminlte-info sm:inline">
              Panel admin
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-adminlte-muted">
            <span className="hidden font-mono sm:inline">{shortAddress(session.wallet)}</span>
            <span className="hidden lg:inline">
              sesión hasta {new Date(session.expiresAt).toLocaleTimeString("es-ES")}
            </span>
            <Button variant="secondary" size="sm" onClick={logout}>
              Salir
            </Button>
          </div>
        </header>

        {/* Navegación móvil (el sidebar se oculta bajo md) */}
        <nav
          className="flex gap-1 overflow-x-auto border-b border-adminlte-border bg-adminlte-card px-2 md:hidden"
          aria-label="Navegación admin móvil"
        >
          {NAV.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                  active
                    ? "border-adminlte-primary font-medium text-adminlte-primary"
                    : "border-transparent text-adminlte-muted"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 px-4 py-5 md:px-6">{children}</main>
      </div>
    </div>
  );
}
