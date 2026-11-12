"use client";

// Componentes con look & feel AdminLTE para el panel admin.
// Vive aparte de ui.tsx (que también usa la Suite pública) para no alterar el
// portal del empleado. Mismas props que ui.tsx donde aplica, para migrar sin
// cambiar la lógica de las páginas.

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/* ---------- Card (AdminLTE card) ---------- */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`overflow-hidden rounded bg-adminlte-card shadow-adminlte-card ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-adminlte-border bg-white px-4 py-3">
      <div>
        <h2 className="text-base font-semibold text-adminlte-text">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-adminlte-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

/* ---------- Infobox (tarjeta de métrica AdminLTE) ---------- */

export function InfoBox({
  label,
  value,
  icon,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "primary" | "info" | "success" | "warning" | "danger";
}) {
  const tones: Record<string, string> = {
    primary: "bg-adminlte-primary",
    info: "bg-adminlte-info",
    success: "bg-adminlte-success",
    warning: "bg-adminlte-warning text-adminlte-text",
    danger: "bg-adminlte-danger",
  };
  return (
    <div className="flex items-center overflow-hidden rounded bg-adminlte-card shadow-adminlte-card">
      <span className={`flex h-full w-16 shrink-0 items-center justify-center self-stretch text-white ${tones[tone]}`}>
        {icon ?? <span className="text-lg">●</span>}
      </span>
      <div className="px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-adminlte-muted">{label}</p>
        <p className="text-xl font-semibold text-adminlte-text">{value}</p>
      </div>
    </div>
  );
}

/* ---------- Button ---------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "success" | "ghost";
  size?: "sm" | "md";
};

const BUTTON_VARIANTS: Record<string, string> = {
  primary:
    "bg-adminlte-primary text-white hover:bg-adminlte-primaryDark disabled:opacity-60 focus-visible:outline-adminlte-primary",
  secondary:
    "border border-adminlte-border bg-white text-adminlte-text hover:bg-slate-100 disabled:text-adminlte-muted",
  danger: "bg-adminlte-danger text-white hover:brightness-95 disabled:opacity-60 focus-visible:outline-adminlte-danger",
  success:
    "bg-adminlte-success text-white hover:brightness-95 disabled:opacity-60 focus-visible:outline-adminlte-success",
  ghost: "text-adminlte-primary hover:bg-adminlte-primary/10 disabled:text-adminlte-muted",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded font-medium transition disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm"
      } ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

/* ---------- Form controls ---------- */

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-adminlte-text">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-adminlte-muted">{hint}</span> : null}
    </label>
  );
}

const CONTROL =
  "w-full rounded border border-adminlte-border bg-white px-3 py-2 text-sm text-adminlte-text placeholder:text-slate-400 focus:border-adminlte-primary focus:outline-none focus:ring-1 focus:ring-adminlte-primary disabled:bg-slate-100";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} ${className}`} {...props} />;
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${CONTROL} ${className}`} {...props}>
      {children}
    </select>
  );
}

/* ---------- Estado vacío y utilidades ---------- */

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-adminlte-muted">{children}</p>;
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs text-adminlte-text">{children}</span>;
}

/* ---------- Alert & Badge ---------- */

export function Alert({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "warning" | "success";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    info: "border-adminlte-info/40 bg-adminlte-info/10 text-adminlte-text",
    error: "border-adminlte-danger/40 bg-adminlte-danger/10 text-adminlte-text",
    warning: "border-adminlte-warning/60 bg-adminlte-warning/20 text-adminlte-text",
    success: "border-adminlte-success/40 bg-adminlte-success/10 text-adminlte-text",
  };
  return (
    <div className={`rounded border px-3 py-2 text-sm ${tones[tone]}`} role="status">
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "brand";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-slate-200 text-slate-700",
    success: "bg-adminlte-success text-white",
    warning: "bg-adminlte-warning text-adminlte-text",
    danger: "bg-adminlte-danger text-white",
    brand: "bg-adminlte-primary text-white",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
