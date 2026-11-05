import { LoginFlow } from "@/components/LoginFlow";

export const metadata = { title: "Acceso administración · Superfluid Brlt" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <LoginFlow
        purpose="admin"
        title="Panel de administración"
        subtitle="Acceso restringido a wallets de la allowlist de administradores."
        redirectTo="/admin"
        altHref="/suite/login"
        altLabel="¿Eres empleado? Accede a la Suite:"
      />
    </main>
  );
}
