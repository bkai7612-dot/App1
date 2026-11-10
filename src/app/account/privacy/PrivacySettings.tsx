"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { api, ClientApiError } from "@/lib/client";
import { useReauth } from "@/components/account/useReauth";

const KINDS: Record<string, string> = {
  access: "Access my data (subject access request)", rectification: "Correct inaccurate data", erasure: "Erase my data",
  restriction: "Restrict processing", objection: "Object to processing", portability: "Data portability", complaint: "Privacy complaint",
};

export function PrivacySettings({ requests }: { requests: { id: string; kind: string; status: string; created_at: string; due_at: string }[] }) {
  const router = useRouter();
  const { run, dialog } = useReauth();
  const [kind, setKind] = useState("rectification");
  const [details, setDetails] = useState("");
  const [targetType, setTargetType] = useState("");
  const [targetRef, setTargetRef] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const errText = (e: unknown) => (e instanceof ClientApiError ? e.message : "Something went wrong.");
  return (
    <div className="space-y-6">
      {dialog}
      {msg && <p role="status" className="text-sm text-text-muted">{msg}</p>}
      <section className="glass p-6">
        <h2 className="font-display text-lg font-semibold">Download your data</h2>
        <p className="mt-1 text-sm text-text-muted">A machine-readable JSON copy of the personal data linked to your account. It does not include the identity of anyone who reported you, or evidence files.</p>
        <a href="/api/account/export" className="btn-ghost mt-3"><Download className="h-4 w-4" /> Download export</a>
      </section>
      <section className="glass p-6">
        <h2 className="font-display text-lg font-semibold">Make a request</h2>
        <form className="mt-3 space-y-3" onSubmit={async (e) => { e.preventDefault(); try { await api("/api/account/privacy-request", { body: { kind, details, targetType: targetType || undefined, targetRef: targetRef.trim() || undefined } }); setDetails(""); setTargetRef(""); setMsg("Request received. We'll respond within one month."); router.refresh(); } catch (e) { setMsg(errText(e)); } }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="input" aria-label="Request type">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          {kind === "erasure" && <p className="rounded-lg border border-ink-line bg-ink/50 p-3 text-xs text-text-muted">Erasure removes your personal data, such as your email, display name, sign-in details, comments and votes. Where we must keep a record to stay fair to other people (for example a published report you submitted, or a moderation decision), we keep it without your name. A report <em>about</em> you is assessed on its merits: we remove it if it&apos;s inaccurate or we no longer have a lawful reason to show it. To delete your whole account straight away, use &ldquo;Delete my account&rdquo; below.</p>}
          <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <select value={targetType} onChange={(e) => setTargetType(e.target.value)} className="input" aria-label="What is it about?">
              <option value="">About my whole account</option><option value="report_about_me">A report about me</option><option value="report">A report I submitted</option><option value="player_comment">A comment</option><option value="commendation">A commendation</option><option value="player_profile">A player profile</option><option value="gaming_account">A linked gaming account</option>
            </select>
            {targetType && <input value={targetRef} onChange={(e) => setTargetRef(e.target.value)} maxLength={300} className="input" placeholder="Link or reference, e.g. R-1A2B3C4D" aria-label="Link or reference" />}
          </div>
          <textarea required minLength={10} maxLength={4000} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} className="input" placeholder="Tell us what you need." aria-label="Details" />
          <button className="btn-ghost">Submit request</button>
        </form>
        {requests.length > 0 && (
          <ul className="mt-5 divide-y divide-ink-line text-sm">
            {requests.map((r) => <li key={r.id} className="flex justify-between py-2"><span>{KINDS[r.kind] ?? r.kind}</span><span className="text-text-muted">{r.status.replace("_", " ")} · due {new Date(r.due_at).toLocaleDateString("en-GB", { dateStyle: "medium" })}</span></li>)}
          </ul>
        )}
      </section>
      <section className="glass p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-neg"><Trash2 className="h-5 w-5" /> Delete account</h2>
        <p className="mt-1 text-sm text-text-muted">Your account is disabled immediately and deleted after 30 days. Reports you submitted may be kept in anonymised form where needed to keep moderation decisions accurate. See the Privacy Notice for details.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder='Type "DELETE" to confirm' className="input sm:max-w-xs" aria-label="Type DELETE to confirm" />
          <button disabled={confirm !== "DELETE"} className="btn-danger" onClick={async () => { try { await run(() => api("/api/account/delete", { body: { confirm: "DELETE" } })); window.location.assign("/"); } catch (e) { setMsg(errText(e)); } }}>Delete my account</button>
        </div>
      </section>
    </div>
  );
}
