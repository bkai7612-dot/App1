"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Zap, KeyRound } from "lucide-react";
import { api } from "@/lib/client";
import { IdentityBadge } from "@/components/ui/Badges";
import { GateError } from "@/components/feedback/MfaGateMessage";
import { useReauth } from "@/components/account/useReauth";
import { QrHandoff } from "@/components/feedback/QrHandoff";

type Profile = { id: string; public_id: string; display_name: string; game: string; platform: string };
type Option = { method: string; label: string; detail: string; automatic: boolean };
type Account = { id: string; player_profile_id: string; username: string; platform: string; platform_slug: string; verification_status: string; verification_method: string | null; options: Option[]; pendingCode: string | null; pending: boolean; pendingId: string | null; pendingMethod: string | null };

export function VerifyOptions({ options, onPick, busy, target }: { options: Option[]; onPick: (m: string) => void; busy: boolean; target?: { gamingAccountId?: string; playerProfileId?: string } }) {
  const [qrFor, setQrFor] = useState<Option | null>(null);
  if (qrFor && target) return (
    <div className="mt-3 glass p-4">
      <QrHandoff target={target} method={qrFor.method} label={qrFor.label.replace(/^(Sign in with|Verify with) /, "")} />
      <button className="btn-ghost mt-3 px-3 py-1.5 text-xs" onClick={() => setQrFor(null)}>Back to options</button>
    </div>
  );
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <div key={o.method} className="glass flex flex-col gap-3 p-3">
          <div className="flex items-start gap-3">
            {o.automatic ? <Zap className="mt-0.5 h-4 w-4 shrink-0 text-pos" /> : <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-violet-lavender" />}
            <span><span className="block text-sm font-semibold">{o.label}{o.automatic && <span className="ml-2 chip border-pos/40 text-pos">Instant</span>}</span><span className="block text-xs text-text-muted">{o.detail}</span></span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => onPick(o.method)} className="btn-primary px-3 py-1.5 text-xs">{o.automatic ? "Continue on this device" : "Get my code"}</button>
            {o.automatic && target && <button disabled={busy} onClick={() => setQrFor(o)} className="btn-ghost px-3 py-1.5 text-xs">Use my phone (QR code)</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CodeInstructions({ code, platform }: { code: string; platform: string }) {
  return (
    <div className="mt-3 rounded-xl border border-violet-brand/40 bg-violet-brand/10 p-4 text-sm">
      <p className="font-semibold">Your verification code: <span className="font-mono text-lg tracking-wider text-violet-lavender">{code}</span></p>
      <ol className="mt-2 list-inside list-decimal space-y-1 text-text-muted">
        <li>Open your {platform} profile and paste <b className="text-text">{code}</b> into a public field: bio, &ldquo;about me&rdquo;, status or real-name field.</li>
        <li>Leave it there until a moderator confirms (usually within a day). You&apos;ll get a notification.</li>
        <li>You can remove the code once you&apos;re verified.</li>
      </ol>
      <p className="mt-2 text-xs text-text-muted">The code expires in 14 days. Never share your password with anyone, including ServerSentry staff.</p>
    </div>
  );
}

export function LinkedAccountsManager({ profiles, platforms, accounts }: { profiles: Profile[]; platforms: { slug: string; name: string; identifier_label: string; automatic: boolean }[]; accounts: Account[] }) {
  const router = useRouter();
  const { run, dialog } = useReauth();
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ playerProfileId: profiles[0]?.id, platformSlug: "", username: "" });

  const verify = async (a: Account, method: string) => {
    setErr(null); setBusy(true);
    try {
      const r = await api<{ redirect?: string; code?: string }>(`/api/identity/accounts/${a.id}/verify`, { body: { method } });
      if (r.redirect) { window.location.assign(r.redirect); return; }
      if (r.code) setCodes((c) => ({ ...c, [a.id]: r.code! }));
      setOpenFor(null); router.refresh();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      {dialog}
      <GateError error={err} />
      {profiles.map((p) => (
        <section key={p.id} className="glass p-6">
          <h2 className="font-display text-lg font-semibold">{p.display_name} <span className="text-sm font-normal text-text-muted">· {p.game} · {p.platform} · {p.public_id}</span></h2>
          <ul className="mt-4 divide-y divide-ink-line">
            {accounts.filter((a) => a.player_profile_id === p.id).map((a) => {
              const code = codes[a.id] ?? a.pendingCode;
              return (
                <li key={a.id} className="py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium">{a.username}</span>
                    <span className="text-sm text-text-muted">{a.platform}</span>
                    <IdentityBadge status={a.verification_status} />
                    {a.pending && !code && <span className="chip border-sky-400/40 text-sky-300">{a.pendingMethod === "manual_review" ? "Moderator review pending" : "Verification in progress"}</span>}
                    <span className="ml-auto flex gap-2">
                      {a.verification_status !== "verified" && !code && !a.pending && (
                        <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => setOpenFor(openFor === a.id ? null : a.id)}>Verify this account</button>
                      )}
                      <button className="btn-danger px-3 py-1.5 text-xs" onClick={async () => { setErr(null); try { await run(() => api(`/api/identity/accounts/${a.id}/unlink`, { body: {} })); router.refresh(); } catch (e) { setErr(e); } }}>Unlink</button>
                    </span>
                  </div>
                  {openFor === a.id && <VerifyOptions options={a.options} busy={busy} onPick={(m) => verify(a, m)} target={{ gamingAccountId: a.id }} />}
                  {code && a.verification_status !== "verified" && <CodeInstructions code={code} platform={a.platform} />}
                  {a.pending && a.pendingId && a.verification_status !== "verified" && (
                    <button className="btn-ghost mt-3 px-3 py-1.5 text-xs" disabled={busy} onClick={async () => {
                      setErr(null); setBusy(true);
                      try { await api(`/api/identity/verifications/${a.pendingId}/cancel`, { body: {} }); setCodes((c) => { const n = { ...c }; delete n[a.id]; return n; }); setOpenFor(a.id); router.refresh(); }
                      catch (e) { setErr(e); } finally { setBusy(false); }
                    }}>Cancel and try another way</button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <section className="glass space-y-4 p-6" aria-labelledby="add-acct">
        <h2 id="add-acct" className="font-display text-lg font-semibold">Link a gaming account</h2>
        <p className="text-sm text-text-muted">Pick your platform. <span className="text-pos">⚡ Instant</span> platforms verify with an official sign-in, on this device or by scanning a QR code with your phone.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" role="radiogroup" aria-label="Platform">
          {platforms.map((p) => (
            <button key={p.slug} type="button" role="radio" aria-checked={form.platformSlug === p.slug} onClick={() => setForm({ ...form, platformSlug: p.slug })}
              className={`rounded-xl border px-3 py-3 text-left text-sm transition ${form.platformSlug === p.slug ? "border-violet-brand/70 bg-violet-brand/15" : "border-ink-line hover:border-violet-brand/40"}`}>
              <span className="block font-semibold">{p.name}</span>
              <span className={`block text-xs ${p.automatic ? "text-pos" : "text-text-muted"}`}>{p.automatic ? "⚡ Instant verification" : "Code check"}</span>
            </button>
          ))}
        </div>
        {form.platformSlug && (
          <form className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { const r = await api<{ id: string }>("/api/identity/accounts", { body: form }); setForm({ ...form, username: "", platformSlug: "" }); setOpenFor(r.id); router.refresh(); } catch (x) { setErr(x); } }}>
            <select className="input" value={form.playerProfileId} onChange={(e) => setForm({ ...form, playerProfileId: e.target.value })} aria-label="Profile">{profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name} ({p.game})</option>)}</select>
            <input className="input" required maxLength={64} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder={platforms.find((p) => p.slug === form.platformSlug)?.identifier_label} aria-label="Username on that platform" />
            <button className="btn-primary">Add, then verify</button>
          </form>
        )}
      </section>
    </div>
  );
}
