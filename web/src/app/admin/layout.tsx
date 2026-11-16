"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { shortAddress } from "@/lib/client/wallet";
import type { SessionInfo, Seccion } from "@/lib/types";
import { Button } from "@/components/adminlte";

/** Sección por ruta del panel (H12): el acceso real lo exige cada API (lib/permisos). */
const NAV: { href: string; label: string; seccion: Seccion | null }[] = [
  { href: "/admin", label: "Resumen", seccion: "resumen" },
  { href: "/admin/finanzas", label: "Finanzas", seccion: "finanzas" },
  { href: "/admin/empleados", label: "Empleados", seccion: "empleados" },
  { href: "/admin/flujos", label: "Flujos", seccion: "flujos" },
  { href: "/admin/proyectos", label: "Proyectos", seccion: "proyectos" },
  { href: "/admin/sistema", label: "Sistema", seccion: "sistema" },
  { href: "/admin/jobs", label: "Jobs", seccion: "jobs" },
  { href: "/admin/auditoria", label: "Auditoría", seccion: "auditoria" },
  { href: "/ayuda/", label: "Ayuda ↗", seccion: null },
];

function seccionDePathname(pathname: string): Seccion | null {
  const item = NAV.find((n) =>
    n.seccion === null ? false : n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href),
  );
  return item?.seccion ?? null;
}

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
        const s = data.session;
        // Empleados: solo Finanzas en el panel; todo lo demás en la Suite.
        if (s.role === "empleado") {
          if (pathname !== "/admin/finanzas") {
            router.replace("/admin/finanzas");
            return;
          }
        } else if (s.role === "admin") {
          const actual = seccionDePathname(pathname);
          if (!actual || !s.secciones.includes(actual)) {
            const primera = NAV.find((n) => n.seccion && s.secciones.includes(n.seccion));
            router.replace(primera?.href ?? "/entrar");
            return;
          }
        } else {
          router.replace("/entrar");
          return;
        }
        setSession(s);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errorMessage(err));
        router.replace("/entrar");
      });
    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

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
          {error ?? "Comprobando sesión y permisos…"}
        </p>
      </main>
    );
  }

  const NAV_AUTORIZADO = NAV.filter(
    (n) => n.seccion === null || session.secciones.includes(n.seccion),
  );

  const activeLabel =
    NAV_AUTORIZADO.find((item) =>
      item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href),
    )?.label ?? "Panel";

  const rolEtiqueta =
    session.role === "empleado"
      ? "Empleado"
      : session.adminRol === "super_admin"
        ? "Super Admin"
        : session.adminRol === "operador"
          ? "Operador"
          : "Admin";

  return (
    <div className="flex min-h-screen bg-adminlte-content text-adminlte-text">
      {/* Sidebar oscuro estilo AdminLTE */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-adminlte-sidebar text-adminlte-sidebarText md:flex">
        <Link
          href={NAV_AUTORIZADO[0]?.href ?? "/entrar"}
          className="flex h-14 items-center gap-2 border-b border-white/10 px-4 text-base font-semibold text-white"
        >
          <span className="rounded bg-adminlte-primary px-1.5 py-0.5 text-xs">SF</span>
          Superfluid <span className="text-adminlte-primary">Brlt</span>
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Navegación admin">
          {NAV_AUTORIZADO.map((item) => {
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
              {rolEtiqueta}
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
          {NAV_AUTORIZADO.map((item) => {
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
