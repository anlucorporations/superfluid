import Link from "next/link";

export const metadata = {
  title: "ANLU corporations · Tecnología, infraestructura y finanzas digitales",
  description:
    "ANLU corporations: desarrollo de software, infraestructura cloud y plataformas de pagos continuos. Creadores de Superfluid Brlt, nómina en streaming sobre BRLT.",
};

const NAV = [
  { href: "#servicios", label: "Servicios" },
  { href: "#sectores", label: "Sectores" },
  { href: "#plataforma", label: "Plataforma" },
  { href: "#proceso", label: "Cómo trabajamos" },
  { href: "#tecnologia", label: "Tecnología" },
  { href: "#contacto", label: "Contacto" },
];

const SERVICIOS = [
  {
    icono: "◈",
    titulo: "Desarrollo de software a medida",
    detalle:
      "Aplicaciones web y multiplataforma, APIs y backends de alta disponibilidad, diseñados sobre arquitecturas modulares y probadas.",
  },
  {
    icono: "☁",
    titulo: "Infraestructura y cloud",
    detalle:
      "Despliegue en Google Cloud, contenedores, redes privadas y automatización de entornos con observabilidad desde el primer día.",
  },
  {
    icono: "⬡",
    titulo: "Blockchain y activos digitales",
    detalle:
      "Contratos inteligentes auditables, tokenización de activos y liquidación on-chain sobre redes EVM empresariales.",
  },
  {
    icono: "◎",
    titulo: "Pagos y nómina programable",
    detalle:
      "Flujos de pago continuos, liquidación en tiempo real y conciliación automática entre la cadena y los sistemas de gestión.",
  },
  {
    icono: "⊞",
    titulo: "Datos e integraciones",
    detalle:
      "Modelos de datos, migraciones y conectores con sus sistemas existentes, con trazabilidad y auditoría de cada operación.",
  },
  {
    icono: "✓",
    titulo: "Seguridad y cumplimiento",
    detalle:
      "Autenticación con wallet (SIWE), sesiones endurecidas, control de acceso por roles y tratamiento de datos conforme a GDPR.",
  },
];

const SECTORES = [
  {
    titulo: "Empresas y nómina",
    detalle: "Pago continuo a equipos distribuidos, con periodos flexibles y conciliación automática.",
  },
  {
    titulo: "Finanzas y tesorería",
    detalle: "Visibilidad en tiempo real del escrow, movimientos y obligaciones de pago.",
  },
  {
    titulo: "Operaciones industriales",
    detalle: "Contratos por concepto y por proyecto, con evidencia verificable de cada liquidación.",
  },
  {
    titulo: "Servicios profesionales",
    detalle: "Facturación por actividad y retribución variable liquidada segundo a segundo.",
  },
];

const CAPACIDADES = [
  { valor: "Tiempo real", etiqueta: "Liquidación por segundo" },
  { valor: "EVM", etiqueta: "Contratos auditables" },
  { valor: "Cloud", etiqueta: "Despliegue gestionado" },
  { valor: "GDPR", etiqueta: "Datos bajo control" },
];

const PROCESO = [
  {
    paso: "01",
    titulo: "Concepto y alcance",
    detalle:
      "Analizamos el proceso de negocio, extraemos requerimientos funcionales y no funcionales, y fijamos criterios de aceptación medibles.",
  },
  {
    paso: "02",
    titulo: "Auditoría y diseño",
    detalle:
      "Casos de uso con criterios verificables, arquitectura técnica, modelo de datos y decisiones de seguridad documentadas.",
  },
  {
    paso: "03",
    titulo: "Desarrollo por hitos",
    detalle:
      "Ciclos verticales: cada hito es una entrega operativa con pruebas, despliegue y documentación de cierre.",
  },
  {
    paso: "04",
    titulo: "Pruebas y operación",
    detalle:
      "Suites unitarias, de integración y end-to-end, más monitoreo, respaldos y manuales de uso y técnicos.",
  },
];

const TECNOLOGIA = [
  "Next.js",
  "React",
  "TypeScript",
  "Node.js",
  "Solidity",
  "Foundry",
  "Hyperledger Besu",
  "Google Cloud / Cloud Run",
  "MongoDB",
  "Docker",
  "Tailwind CSS",
  "EIP-4361 (SIWE)",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-adminlte-content text-adminlte-text">
      {/* Cabecera fija con navegación por secciones */}
      <header className="sticky top-0 z-20 border-b border-black/10 bg-adminlte-sidebar/95 text-white backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="rounded bg-adminlte-primary px-1.5 py-0.5 text-xs font-bold">A</span>
            <span className="text-base font-semibold tracking-tight">
              ANLU <span className="text-adminlte-primary">corporations</span>
            </span>
          </Link>
          <nav aria-label="Secciones" className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded px-3 py-1.5 text-sm text-adminlte-sidebarText transition hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <Link
            href="/entrar"
            className="shrink-0 rounded bg-adminlte-primary px-3.5 py-1.5 text-sm font-medium text-white hover:bg-adminlte-primaryDark"
          >
            Entrar
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-adminlte-border bg-gradient-to-b from-white to-adminlte-content">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-adminlte-primary">
              Tecnología · Infraestructura · Finanzas digitales
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-adminlte-text sm:text-5xl">
              Software que mueve dinero <span className="text-adminlte-primary">en tiempo real</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-adminlte-muted">
              ANLU corporations diseña, construye y opera plataformas digitales para empresas:
              desde la infraestructura cloud hasta los pagos programables. Nuestro producto
              insignia, <strong className="font-semibold text-adminlte-text">Superfluid Brlt</strong>,
              liquida la nómina de un equipo segundo a segundo sobre la stablecoin BRLT.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/entrar"
                className="inline-flex items-center rounded bg-adminlte-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-adminlte-primaryDark"
              >
                Entrar con mi wallet →
              </Link>
              <a
                href="#plataforma"
                className="inline-flex items-center rounded border border-adminlte-border bg-white px-5 py-2.5 text-sm font-medium text-adminlte-text hover:bg-slate-50"
              >
                Ver Superfluid Brlt
              </a>
            </div>
            <p className="mt-4 text-xs text-adminlte-muted">
              Acceso mediante SIWE. Nunca solicitamos tu clave privada.
            </p>
          </div>

          <div className="overflow-hidden rounded-lg bg-adminlte-card shadow-adminlte-card">
            <div className="border-b border-adminlte-border bg-adminlte-sidebar px-5 py-3 text-white">
              <p className="text-xs uppercase tracking-wide text-adminlte-sidebarText">
                Superfluid Brlt · vista de panel
              </p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-adminlte-border">
              {CAPACIDADES.map((item) => (
                <div key={item.etiqueta} className="border-b border-adminlte-border px-5 py-4">
                  <p className="text-lg font-semibold text-adminlte-primary">{item.valor}</p>
                  <p className="mt-0.5 text-xs text-adminlte-muted">{item.etiqueta}</p>
                </div>
              ))}
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-adminlte-muted">
                Nómina continua, conciliada con la cadena y auditable en cada operación.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Servicios */}
      <section id="servicios" className="scroll-mt-20 border-b border-adminlte-border bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-adminlte-primary">
            Servicios
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Capacidades de ingeniería de punta a punta
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-adminlte-muted">
            Cubrimos el ciclo completo: definición, arquitectura, desarrollo, despliegue y
            operación sostenida.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICIOS.map((servicio) => (
              <article
                key={servicio.titulo}
                className="rounded border border-adminlte-border bg-adminlte-card p-5 transition hover:shadow-adminlte-card"
              >
                <span aria-hidden className="text-xl text-adminlte-primary">
                  {servicio.icono}
                </span>
                <h3 className="mt-3 text-base font-semibold">{servicio.titulo}</h3>
                <p className="mt-2 text-sm text-adminlte-muted">{servicio.detalle}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Sectores */}
      <section id="sectores" className="scroll-mt-20 border-b border-adminlte-border">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-adminlte-primary">
            Sectores
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Dónde aportamos valor
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {SECTORES.map((sector) => (
              <article
                key={sector.titulo}
                className="rounded bg-adminlte-card p-5 shadow-adminlte-card"
              >
                <h3 className="text-base font-semibold">{sector.titulo}</h3>
                <p className="mt-2 text-sm text-adminlte-muted">{sector.detalle}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Plataforma */}
      <section id="plataforma" className="scroll-mt-20 border-b border-adminlte-border bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-adminlte-primary">
                Producto insignia
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                Superfluid Brlt: nómina en streaming
              </h2>
              <p className="mt-3 text-sm text-adminlte-muted">
                Una plataforma para pagar a un equipo de forma continua, con dos experiencias
                separadas y complementarias.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-adminlte-text">
                <li className="flex gap-3">
                  <span aria-hidden className="mt-0.5 text-adminlte-success">✓</span>
                  <span>
                    <strong className="font-semibold">Pagos por segundo.</strong> Cada colaborador
                    devenga su salario de forma continua, no en un único pago periódico.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-0.5 text-adminlte-success">✓</span>
                  <span>
                    <strong className="font-semibold">Cobro autónomo.</strong> El empleado retira
                    lo devengado en cualquier momento, en una sola transacción.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-0.5 text-adminlte-success">✓</span>
                  <span>
                    <strong className="font-semibold">Control administrativo.</strong> Empleados,
                    proyectos, flujos programados, lotes, tesorería y auditoría.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-0.5 text-adminlte-success">✓</span>
                  <span>
                    <strong className="font-semibold">Conciliación on-chain.</strong> El estado de
                    cada flujo se lee de la cadena y se reconcilia automáticamente.
                  </span>
                </li>
              </ul>
            </div>

            <div className="grid gap-4">
              <article className="overflow-hidden rounded bg-adminlte-card shadow-adminlte-card">
                <div className="border-l-4 border-adminlte-primary px-5 py-4">
                  <h3 className="text-base font-semibold">Panel de administración</h3>
                  <p className="mt-1 text-sm text-adminlte-muted">
                    Resumen, empleados, proyectos, flujos de nómina, configuración de red, jobs y
                    auditoría. Todo firmado desde la wallet del administrador.
                  </p>
                  <p className="mt-3">
                    <Link
                      href="/entrar"
                      className="text-sm font-medium text-adminlte-primary hover:underline"
                    >
                      Acceder al panel →
                    </Link>
                  </p>
                </div>
              </article>
              <article className="overflow-hidden rounded bg-adminlte-card shadow-adminlte-card">
                <div className="border-l-4 border-adminlte-success px-5 py-4">
                  <h3 className="text-base font-semibold">Suite del Empleado</h3>
                  <p className="mt-1 text-sm text-adminlte-muted">
                    Salario en streaming, flujos en proceso y terminados en modo lectura, cobro
                    autónomo, y perfil con consentimiento de datos.
                  </p>
                  <p className="mt-3">
                    <Link
                      href="/entrar"
                      className="text-sm font-medium text-adminlte-primary hover:underline"
                    >
                      Acceder a mi suite →
                    </Link>
                  </p>
                </div>
              </article>
              <p className="text-xs text-adminlte-muted">
                Una única entrada detecta el tipo de wallet y te lleva a la suite que corresponde.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Proceso */}
      <section id="proceso" className="scroll-mt-20 border-b border-adminlte-border">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-adminlte-primary">
            Cómo trabajamos
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Un proceso verificable, hito a hito
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PROCESO.map((fase) => (
              <article key={fase.paso} className="rounded bg-adminlte-card p-5 shadow-adminlte-card">
                <p className="text-2xl font-semibold text-adminlte-primary">{fase.paso}</p>
                <h3 className="mt-2 text-base font-semibold">{fase.titulo}</h3>
                <p className="mt-2 text-sm text-adminlte-muted">{fase.detalle}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Tecnología */}
      <section id="tecnologia" className="scroll-mt-20 border-b border-adminlte-border bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-adminlte-primary">
            Tecnología
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Un stack probado y mantenible
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-adminlte-muted">
            Elegimos herramientas abiertas y con soporte a largo plazo, para que la plataforma no
            quede atada a un proveedor.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {TECNOLOGIA.map((tech) => (
              <li
                key={tech}
                className="rounded-full border border-adminlte-border bg-adminlte-content px-3 py-1 text-xs font-medium text-adminlte-text"
              >
                {tech}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Contacto / CTA */}
      <section id="contacto" className="scroll-mt-20 bg-adminlte-sidebar text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">
              ¿Hablamos de tu próximo proyecto?
            </h2>
            <p className="mt-3 max-w-lg text-sm text-adminlte-sidebarText">
              Cuéntanos qué proceso quieres digitalizar. Preparamos una primera propuesta con
              alcance, hitos y criterios de aceptación.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/entrar"
                className="inline-flex items-center rounded bg-adminlte-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-adminlte-primaryDark"
              >
                Entrar con mi wallet →
              </Link>
              <a
                href="mailto:info@anlucorporations.com"
                className="inline-flex items-center rounded border border-white/25 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/10"
              >
                Escríbenos
              </a>
            </div>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="rounded border border-white/15 p-4">
              <dt className="text-xs uppercase tracking-wide text-adminlte-sidebarText">Áreas</dt>
              <dd className="mt-1">Software · Cloud · Blockchain · Pagos</dd>
            </div>
            <div className="rounded border border-white/15 p-4">
              <dt className="text-xs uppercase tracking-wide text-adminlte-sidebarText">Modelo</dt>
              <dd className="mt-1">Proyectos por hitos entregables</dd>
            </div>
            <div className="rounded border border-white/15 p-4">
              <dt className="text-xs uppercase tracking-wide text-adminlte-sidebarText">
                Seguridad
              </dt>
              <dd className="mt-1">SIWE · roles · auditoría · GDPR</dd>
            </div>
            <div className="rounded border border-white/15 p-4">
              <dt className="text-xs uppercase tracking-wide text-adminlte-sidebarText">
                Documentación
              </dt>
              <dd className="mt-1">Manuales técnicos y de usuario</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Pie */}
      <footer className="border-t border-black/10 bg-adminlte-sidebar text-adminlte-sidebarText">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-base font-semibold text-white">
              ANLU <span className="text-adminlte-primary">corporations</span>
            </p>
            <p className="mt-2 text-xs">
              Tecnología, infraestructura y finanzas digitales para empresas.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white">Producto</p>
            <ul className="mt-2 space-y-1 text-xs">
              <li>
                <a href="#plataforma" className="hover:text-white">
                  Superfluid Brlt
                </a>
              </li>
              <li>
                <Link href="/entrar" className="hover:text-white">
                  Acceso con wallet
                </Link>
              </li>
              <li>
                <a href="/ayuda/index.html" className="hover:text-white">
                  Ayuda
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white">Empresa</p>
            <ul className="mt-2 space-y-1 text-xs">
              <li>
                <a href="#servicios" className="hover:text-white">
                  Servicios
                </a>
              </li>
              <li>
                <a href="#proceso" className="hover:text-white">
                  Cómo trabajamos
                </a>
              </li>
              <li>
                <a href="#contacto" className="hover:text-white">
                  Contacto
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white">Legal</p>
            <ul className="mt-2 space-y-1 text-xs">
              <li>Privacidad y tratamiento de datos</li>
              <li>Acceso mediante SIWE</li>
              <li>Sin custodia de claves privadas</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 px-6 py-4">
          <div className="mx-auto max-w-6xl text-xs text-adminlte-sidebarText">
            © {new Date().getFullYear()} ANLU corporations. Todos los derechos reservados.
          </div>
        </div>
      </footer>
    </main>
  );
}
