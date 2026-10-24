import { Suspense } from 'react';
import { Portal } from '@/components/Portal';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-widest text-brand-500">SFhostpot</p>
        <h1 className="text-3xl font-semibold">Acceso WiFi pay-as-you-go</h1>
        <p className="text-sm text-slate-400">
          Abre un flujo continuo de BRLTx y navega mientras dure. Tokens de prueba sin valor real.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-slate-400">Cargando portal…</p>}>
        <Portal />
      </Suspense>
      <footer className="mt-auto border-t border-slate-800 pt-4 text-xs text-slate-500">
        Aviso legal: red educativa. BRLT/BRLTx son tokens de prueba sin respaldo ni valor. No usar para
        pagos reales.
      </footer>
    </main>
  );
}
