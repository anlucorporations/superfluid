"use client";

// Resumen de firma (clear signing): explica en lenguaje humano qué va a pedir
// la wallet ANTES de que el usuario firme. Se usa en todos los flujos de firma:
// SIWE (login), EIP-191 (allowlist) y EIP-712 (cambio de wallet).
// Reglas: segunda persona, sin jerga, con datos concretos y nota de coste 0
// para firmas off-chain. Los datos reales los rellena cada flujo.

export interface FirmaResumenProps {
  /** Acción principal en primera línea (máx. ~120 caracteres). */
  titulo: string;
  /** Filas concretas: qué, quién, vigencia… */
  filas: { label: string; value: string }[];
  /** Nota de impacto real; por defecto las firmas off-chain no cuestan gas. */
  nota?: string;
}

export function FirmaResumen({ titulo, filas, nota }: FirmaResumenProps) {
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm">
      <p className="font-semibold text-ink-900">{titulo}</p>
      <dl className="mt-1.5 space-y-1">
        {filas.map((fila) => (
          <div key={fila.label} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-xs text-slate-500">{fila.label}</dt>
            <dd className="truncate text-right font-mono text-xs text-ink-900" title={fila.value}>
              {fila.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-1.5 text-xs text-slate-500">
        {nota ?? "La firma es gratuita: no mueve fondos ni autoriza gastos."}
      </p>
    </div>
  );
}
