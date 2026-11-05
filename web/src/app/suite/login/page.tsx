import { LoginFlow } from "@/components/LoginFlow";

export const metadata = { title: "Suite del Empleado · Superfluid Brlt" };

export default function SuiteLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <LoginFlow
        purpose="suite"
        title="Suite del Empleado"
        subtitle="Accede con la wallet registrada por tu administrador."
        redirectTo="/suite"
        altHref="/login"
        altLabel="¿Eres administrador? Accede al panel:"
      />
    </main>
  );
}
