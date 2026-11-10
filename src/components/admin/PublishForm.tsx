"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { api, ClientApiError } from "@/lib/client";
import { publishWarnings } from "@/lib/moderation-checks";
import { REPORT_LABELS } from "@/lib/categories";

const TEMPLATES = [
  "A community member alleges that this player repeatedly used abusive language towards teammates in voice chat during a match.",
  "A community member alleges that this player deliberately sabotaged their own team during a match.",
  "A community member alleges that this player sent hostile messages to them after a match.",
  "A community member alleges unusual in-game behaviour consistent with cheating. ServerSentry does not determine whether cheating occurred.",
];

/** M-02: publish with a live public preview and a safety checklist (also enforced server-side). */
export function PublishForm({ reportId, evidenceCount, flags, identityVerified, category, playerName }: {
  reportId: string; evidenceCount: number; flags: string[]; identityVerified: boolean; category: string; playerName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [note, setNote] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const warnings = useMemo(() => publishWarnings({ summary, evidenceCount, flags, identityVerified, category }), [summary, evidenceCount, flags, identityVerified, category]);
  if (!open) return <button onClick={() => setOpen(true)} className="btn-primary px-3 py-1.5 text-xs">Publish as allegation…</button>;
  const submit = async () => {
    setBusy(true); setErr(null);
    try { await api(`/api/admin/reports/${reportId}`, { body: { action: "publish", publicSummary: summary, note: note || undefined, acknowledgeWarnings: warnings.length > 0 ? ack : undefined } }); router.refresh(); setOpen(false); }
    catch (e) { setErr(e instanceof ClientApiError ? e.message : "Couldn't publish."); } finally { setBusy(false); }
  };
  return (
    <div className="w-full space-y-3 rounded-xl border border-ink-line bg-ink/40 p-3 text-sm">
      <label className="block"><span className="label">Neutral public summary</span>
        <span className="mb-1 block text-[11px] text-amber-300">Shown publicly. Describe the alleged behaviour only: no names, personal data, evidence, quotes from private messages or words like &ldquo;cheater&rdquo;.</span>
        <span className="mb-1.5 flex flex-wrap gap-1">{TEMPLATES.map((t) => <button type="button" key={t} onClick={() => setSummary(t)} className="chip border-ink-line px-2 py-0.5 text-[11px] text-text-muted hover:text-text">{t.slice(0, 44)}…</button>)}</span>
        <textarea rows={4} maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)} className="input" />
      </label>
      <div className="rounded-lg border border-ink-line bg-white/[0.02] p-3">
        <p className="text-[11px] uppercase tracking-wider text-text-muted">Public preview</p>
        <div className="mt-2 flex flex-wrap gap-2"><span className="chip border-orange-400/40 bg-orange-400/10 text-orange-300">Allegation</span><span className="chip border-ink-line text-text-muted">{REPORT_LABELS[category]}</span>{!identityVerified && <span className="chip border-amber-400/40 text-amber-300">Profile identity unverified</span>}</div>
        <p className="mt-2 text-xs uppercase tracking-wider text-text-muted">Moderator summary of the allegation · {playerName}</p>
        <p className="mt-1 whitespace-pre-wrap">{summary || <span className="text-text-muted">Your summary will appear here.</span>}</p>
      </div>
      <div className="rounded-lg border border-ink-line p-3">
        <p className="text-[11px] uppercase tracking-wider text-text-muted">Publication checklist</p>
        {warnings.length === 0 ? <p className="mt-1 flex items-center gap-2 text-pos"><CheckCircle2 className="h-4 w-4" /> No issues found.</p> : (
          <ul className="mt-1 space-y-1">{warnings.map((w) => <li key={w} className="flex gap-2 text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</li>)}</ul>
        )}
        {warnings.length > 0 && <label className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4 accent-violet-500" /><span>I&apos;ve reviewed these warnings and the evidence, and publishing this neutral summary is justified. My decision is recorded.</span></label>}
      </div>
      <label className="block"><span className="label">Internal reasoning (optional)</span><span className="mb-1 block text-[11px] text-text-muted">Moderators only. Never shown to players.</span><textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} className="input" /></label>
      {err && <p role="alert" className="text-neg">{err}</p>}
      <div className="flex gap-2"><button disabled={busy || summary.trim().length < 20 || (warnings.length > 0 && !ack)} onClick={submit} className="btn-primary px-3 py-1.5 text-xs">{busy && <span className="spinner" />}Publish</button><button onClick={() => setOpen(false)} className="btn-ghost px-3 py-1.5 text-xs">Cancel</button></div>
    </div>
  );
}
