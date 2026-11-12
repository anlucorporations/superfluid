import { EntryLogin } from "@/components/EntryLogin";

export const metadata = { title: "Entrar · ANLU corporations" };

export default function EntrarPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-adminlte-content px-6 py-12">
      <EntryLogin />
    </main>
  );
}
