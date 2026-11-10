"use client";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client";
import { COMPLAINT_CATEGORIES, COMPLAINT_LABELS } from "@/lib/complaints";

export function ComplaintForm({ signedIn, initialRef = "", initialCategory = "" }: { signedIn: boolean; initialRef?: string; initialCategory?: string }) {
  const [category, setCategory] = useState(COMPLAINT_CATEGORIES.includes(initialCategory as never) ? initialCategory : "");
  const [ref, setRef] = useState(initialRef);
  const [body, setBody] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api<{ ref: string }>("/api/complaints", { body: { category, targetRef: ref.trim() || undefined, body, contactEmail: email.trim() || undefined } });
      setDone(r.ref);
    } catch (e) { setErr(e instanceof ClientApiError ? e.message : "Could not send your complaint. Please try again."); }
    finally { setBusy(false); }
  };
  if (done) return (
    <div role="status" className="glass p-5 text-sm">
      <p className="font-semibold">Complaint {done} received.</p>
      <p className="mt-1 text-text-muted">We&apos;ll acknowledge it within 2 working days and aim to decide within 14 days. Keep the reference {done} for any follow-up.</p>
    </div>
  );
  return (
    <form onSubmit={submit} className="glass space-y-4 p-5 not-prose">
      <label className="block"><span className="label">What is your complaint about?</span>
        <select required value={category} onChange={(e) => setCategory(e.target.value)} className="input"><option value="" disabled>Choose…</option>{COMPLAINT_CATEGORIES.map((c) => <option key={c} value={c}>{COMPLAINT_LABELS[c]}</option>)}</select>
      </label>
      <label className="block"><span className="label">Link or reference (optional)</span>
        <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={300} className="input" placeholder="Profile link, report reference (e.g. R-1A2B3C4D) or comment link" />
      </label>
      <label className="block"><span className="label">Tell us what&apos;s wrong</span>
        <textarea required minLength={20} maxLength={5000} rows={6} value={body} onChange={(e) => setBody(e.target.value)} className="input" />
        <span className="mt-1 block text-xs text-text-muted">{body.trim().length}/5000 · at least 20 characters. Please don&apos;t include other people&apos;s personal information.</span>
      </label>
      {!signedIn && <label className="block"><span className="label">Your email (so we can reply)</span><input type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" /></label>}
      {err && <p role="alert" className="text-sm text-neg">{err}</p>}
      <button disabled={busy} className="btn-primary">{busy && <span className="spinner" />}Send complaint</button>
    </form>
  );
}
