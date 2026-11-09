"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { IdentityBadge } from "@/components/ui/Badges";
import { GateError } from "@/components/feedback/MfaGateMessage";
import { useReauth } from "@/components/account/useReauth";

type Profile = { id: string; public_id: string; display_name: string; game: string; platform: string };
type Account = { id: string; player_profile_id: string; username: string; platform: string; platform_slug: string; integration_status: string; verification_status: string; verification_method: string | null; linked_at: string; last_verified_at: string | null };

export function LinkedAccountsManager({ profiles, platforms, accounts, pendingAccountIds }: { profiles: Profile[]; platforms: { slug: string; name: string }[]; accounts: Account[]; pendingAccountIds: string[] }) {
  const router = useRouter();
  const { run, dialog } = useReauth();
  const [err, setErr] = useState<unknown>(null);
  const [form, setForm] = useState({ playerProfileId: profiles[0]?.id, platformSlug: platforms[0]?.slug, username: "" });
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const verify = async (a: Account) => {
    setErr(null);
    try {
      const r = await api<{ redirect?: string; pending?: boolean }>(`/api/identity/accounts/${a.id}/verify`, { body: a.platform_slug === "steam" ? {} : { note } });
      if (r.redirect) { window.location.assign(r.redirect); return; }
      setNoteFor(null); setNote(""); router.refresh();
    } catch (e) { setErr(e); }
  };

  return (
    <div className="space-y-6">
      {dialog}
      <GateError error={err} />
      {profiles.map((p) => (
        <section key={p.id} className="glass p-6">
          <h2 className="font-display text-lg font-semibold">{p.display_name} <span className="text-sm font-normal text-text-muted">· {p.game} · {p.platform} · {p.public_id}</span></h2>
          <ul className="mt-4 divide-y divide-ink-line">
            {accounts.filter((a) => a.player_profile_id === p.id).map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{a.username}</span>
                  <span className="text-sm text-text-muted">{a.platform}</span>
                  <IdentityBadge status={a.verification_status} />
                  {pendingAccountIds.includes(a.id) && <span className="chip border-sky-400/40 text-sky-300">Review pending</span>}
                  <span className="ml-auto flex gap-2">
                    {a.verification_status !== "verified" && !pendingAccountIds.includes(a.id) && (
                      a.platform_slug === "steam"
                        ? <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => verify(a)}>Verify with Steam</button>
                        : <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setNoteFor(noteFor === a.id ? null : a.id)}>Request verification</button>
                    )}
                    <button className="btn-danger px-3 py-1.5 text-xs" onClick={async () => { setErr(null); try { await run(() => api(`/api/identity/accounts/${a.id}/unlink`, { body: {} })); router.refresh(); } catch (e) { setErr(e); } }}>Unlink</button>
                  </span>
                </div>
                {noteFor === a.id && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-text-muted">No official verification is available for {a.platform} yet. Describe a way a moderator can confirm ownership, such as temporarily setting a status or profile text that we give you. Never send passwords or private messages.</p>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} minLength={20} maxLength={1000} rows={3} className="input" aria-label="Ownership proof" />
                    <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => verify(a)}>Submit for review</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <form className="glass space-y-3 p-6" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await api("/api/identity/accounts", { body: form }); setForm({ ...form, username: "" }); router.refresh(); } catch (e) { setErr(e); } }}>
        <h2 className="font-display text-lg font-semibold">Link another account</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <select className="input" value={form.playerProfileId} onChange={(e) => setForm({ ...form, playerProfileId: e.target.value })} aria-label="Profile">{profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name} ({p.game})</option>)}</select>
          <select className="input" value={form.platformSlug} onChange={(e) => setForm({ ...form, platformSlug: e.target.value })} aria-label="Platform">{platforms.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select>
          <input className="input" required maxLength={64} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Username on that platform" aria-label="Username" />
        </div>
        <button className="btn-primary">Add as unverified</button>
      </form>
    </div>
  );
}
