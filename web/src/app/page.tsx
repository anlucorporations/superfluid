import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
          Besu Codecrypto · chain 81234
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
          Superfluid <span className="text-brand-600">Brlt</span> Streaming v2
        </h1>
        <p className="max-w-2xl text-base text-slate-600">
          Nómina en streaming sobre BRLT: el administrador crea y gobierna los flujos y el
          empleado cobra su salario segundo a segundo desde la Suite del Empleado.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/login"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-brand-300 hover:shadow-md"
        >
          <h2 className="text-lg font-semibold text-ink-900">Panel de administración</h2>
          <p className="mt-1 text-sm text-slate-600">
            Empleados, proyectos, flujos, configuración de red y auditoría.
          </p>
          <span className="mt-4 inline-block text-sm font-medium text-brand-700 group-hover:underline">
            Entrar con wallet →
          </span>
        </Link>

        <Link
          href="/suite/login"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-brand-300 hover:shadow-md"
        >
          <h2 className="text-lg font-semibold text-ink-900">Suite del Empleado</h2>
          <p className="mt-1 text-sm text-slate-600">
            Consulta tu salario en streaming, tu proyecto y tu historial de cobros.
          </p>
          <span className="mt-4 inline-block text-sm font-medium text-brand-700 group-hover:underline">
            Acceder con wallet →
          </span>
        </Link>
      </div>

      <footer className="text-xs text-slate-500">
        Acceso mediante SIWE (Sign-In with Ethereum). Nunca se solicita tu clave privada.
      </footer>
    </main>
  );
}
