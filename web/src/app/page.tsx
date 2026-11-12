import Link from "next/link";

export const metadata = {
  title: "ANLU corporations · Superfluid Brlt",
  description: "Nómina en streaming sobre BRLT para ANLU corporations.",
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-adminlte-content text-adminlte-text">
      <header className="bg-adminlte-sidebar text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-base font-semibold tracking-tight">
            ANLU <span className="text-adminlte-primary">corporations</span>
          </span>
          <Link
            href="/entrar"
            className="rounded bg-adminlte-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-adminlte-primaryDark"
          >
            Entrar
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-adminlte-primary">
          Tecnología · Finanzas
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-adminlte-text sm:text-5xl">
          Nómina en tiempo real con <span className="text-adminlte-primary">Superfluid Brlt</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base text-adminlte-muted">
          ANLU corporations paga a su equipo por segundo. Los pagos fluyen de forma continua en
          BRLT, y cada colaborador consulta su salario en streaming en tiempo real.
        </p>
        <div className="mt-8">
          <Link
            href="/entrar"
            className="inline-flex items-center rounded bg-adminlte-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-adminlte-primaryDark"
          >
            Entrar con mi wallet →
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-16 sm:grid-cols-2">
        <article className="overflow-hidden rounded bg-adminlte-card shadow-adminlte-card">
          <div className="border-l-4 border-adminlte-primary px-5 py-4">
            <h2 className="text-base font-semibold">Panel de administración</h2>
            <p className="mt-1 text-sm text-adminlte-muted">
              Empleados, proyectos, flujos de nómina, configuración de red, jobs y auditoría.
            </p>
          </div>
        </article>
        <article className="overflow-hidden rounded bg-adminlte-card shadow-adminlte-card">
          <div className="border-l-4 border-adminlte-success px-5 py-4">
            <h2 className="text-base font-semibold">Suite del Empleado</h2>
            <p className="mt-1 text-sm text-adminlte-muted">
              Tus flujos activos, tu proyecto, tu historial de cobros y tu perfil.
            </p>
          </div>
        </article>
      </section>

      <footer className="border-t border-adminlte-border bg-adminlte-card">
        <div className="mx-auto max-w-5xl px-6 py-4 text-xs text-adminlte-muted">
          Acceso mediante SIWE (Sign-In with Ethereum). Nunca se solicita tu clave privada.
        </div>
      </footer>
    </main>
  );
}
