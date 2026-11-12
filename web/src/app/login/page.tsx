import { AdminLoginFlow } from "@/components/AdminLoginFlow";

export const metadata = { title: "Acceso administración · Superfluid Brlt" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-adminlte-content px-6 py-12">
      <AdminLoginFlow
        title="Panel de administración"
        subtitle="Acceso restringido a wallets de la allowlist de administradores."
        redirectTo="/admin"
      />
    </main>
  );
}
