"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client";
import { useReauth } from "@/components/account/useReauth";

export type Field = { name: string; label: string; type?: "text" | "textarea" | "select" | "number"; options?: { value: string; label: string }[]; required?: boolean; min?: number; max?: number; placeholder?: string;
  /** M-06: one-click reason templates that fill the field. */ templates?: string[]; /** Who will read this field, shown under the label. */ audience?: "player" | "internal" };

/** Generic moderation action: optional fields, confirmation, re-auth retry, refresh on success. */
export function AdminAction({ endpoint, base, label, tone = "ghost", fields = [], confirm }: {
  endpoint: string; base: Record<string, unknown>; label: string; tone?: "ghost" | "primary" | "danger" | "positive"; fields?: Field[]; confirm?: string;
}) {
  const router = useRouter();
  const { run, dialog } = useReauth();
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const cls = { ghost: "btn-ghost", primary: "btn-primary", danger: "btn-danger", positive: "btn-positive" }[tone];
  const submit = async () => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true); setErr(null);
    const body: Record<string, unknown> = { ...base };
    for (const f of fields) {
      const v = vals[f.name];
      if (v === undefined || v === "") continue;
      body[f.name] = f.type === "number" ? Number(v) : v;
    }
    try { await run(() => api(endpoint, { body })); setOpen(false); setVals({}); setDone(`${label}: done.`); router.refresh(); }
    catch (e) { setErr(e instanceof ClientApiError ? e.message : "Failed."); }
    finally { setBusy(false); }
  };
  if (fields.length === 0) return (<>{dialog}<button disabled={busy} onClick={submit} className={`${cls} px-3 py-1.5 text-xs`}>{label}</button>{err && <span role="alert" className="ml-2 text-xs text-neg">{err}</span>}{done && !err && <span role="status" className="sr-only">{done}</span>}</>);
  return (
    <div className="w-full">
      {dialog}
      {!open ? <button onClick={() => setOpen(true)} className={`${cls} px-3 py-1.5 text-xs`}>{label}</button> : (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="mt-2 space-y-2 rounded-xl border border-ink-line bg-ink/40 p-3">
          {fields.map((f) => (
            <label key={f.name} className="block"><span className="label">{f.label}</span>
              {f.audience && <span className={`mb-1 block text-[11px] ${f.audience === "player" ? "text-amber-300" : "text-text-muted"}`}>{f.audience === "player" ? "The player will see this. Keep it factual and neutral." : "Moderators only. Never shown to players."}</span>}
              {f.templates && <span className="mb-1.5 flex flex-wrap gap-1">{f.templates.map((t) => <button type="button" key={t} onClick={() => setVals({ ...vals, [f.name]: t })} className="chip border-ink-line px-2 py-0.5 text-[11px] text-text-muted hover:border-violet-brand/50 hover:text-text">{t.length > 48 ? t.slice(0, 46) + "…" : t}</button>)}</span>}
              {f.type === "textarea" ? <textarea required={f.required} minLength={f.min} maxLength={f.max} rows={3} className="input" placeholder={f.placeholder} value={vals[f.name] ?? ""} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} />
                : f.type === "select" ? <select required={f.required} className="input" value={vals[f.name] ?? ""} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })}><option value="">Choose…</option>{f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                : <input type={f.type ?? "text"} required={f.required} min={f.min} max={f.max} className="input" placeholder={f.placeholder} value={vals[f.name] ?? ""} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} />}
            </label>
          ))}
          {err && <p role="alert" className="text-xs text-neg">{err}</p>}
          <div className="flex gap-2"><button disabled={busy} className={`${cls} px-3 py-1.5 text-xs`}>{busy && <span className="spinner" />}Confirm: {label}</button><button type="button" onClick={() => setOpen(false)} className="btn-ghost px-3 py-1.5 text-xs">Cancel</button></div>
        </form>
      )}
    </div>
  );
}
