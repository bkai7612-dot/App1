import type { ReactNode } from "react";

export function Card({ children, className = "", as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" }) {
  return <As className={`glass p-5 sm:p-6 ${className}`}>{children}</As>;
}

export function PageHeader({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-line px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-text-muted">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode }) {
  const cls = {
    info: "border-violet-brand/30 bg-violet-brand/10 text-violet-lavender",
    warn: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    danger: "border-neg/30 bg-neg/10 text-red-200",
    ok: "border-pos/30 bg-pos/10 text-emerald-200",
  }[tone];
  return <div role={tone === "danger" ? "alert" : "note"} className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
