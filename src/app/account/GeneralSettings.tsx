"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client";
import { useReauth } from "@/components/account/useReauth";

type N = { key: string; label: string; locked: boolean; on: boolean };

export function GeneralSettings({ displayName, email, emailVerified, notifications }: { displayName: string; email: string; emailVerified: boolean; notifications: N[] }) {
  const router = useRouter();
  const { run, dialog } = useReauth();
  const [name, setName] = useState(displayName);
  const [prefs, setPrefs] = useState(Object.fromEntries(notifications.map((n) => [n.key, n.on])));
  const [newEmail, setNewEmail] = useState("");
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState<Record<string, string>>({});
  const say = (k: string, v: string) => setMsg((m) => ({ ...m, [k]: v }));
  const errText = (e: unknown) => (e instanceof ClientApiError ? e.message : "Something went wrong.");

  return (
    <div className="space-y-6">
      {dialog}
      <section className="glass p-6">
        <h2 className="font-display text-lg font-semibold">Profile</h2>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={async (e) => { e.preventDefault(); try { await api("/api/account/profile", { method: "PATCH", body: { displayName: name } }); say("name", "Saved."); router.refresh(); } catch (e) { say("name", errText(e)); } }}>
          <label className="flex-1"><span className="label">Display name</span><input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={40} className="input" /></label>
          <button className="btn-primary self-end">Save</button>
        </form>
        {msg.name && <p className="mt-2 text-sm text-text-muted" role="status">{msg.name}</p>}
      </section>

      <section className="glass p-6">
        <h2 className="font-display text-lg font-semibold">Email</h2>
        <p className="mt-1 text-sm text-text-muted">{email} · {emailVerified ? "verified" : "not verified"}</p>
        {!emailVerified && <button className="btn-ghost mt-3" onClick={async () => { try { await api("/api/auth/resend-verification", { body: {} }); say("verify", "Verification email sent."); } catch (e) { say("verify", errText(e)); } }}>Resend verification email</button>}
        {msg.verify && <p className="mt-2 text-sm text-text-muted" role="status">{msg.verify}</p>}
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={async (e) => { e.preventDefault(); try { const r = await run(() => api<{ message: string }>("/api/account/email", { body: { newEmail } })); say("email", r.message); } catch (e) { say("email", errText(e)); } }}>
          <label className="flex-1"><span className="label">New email address</span><input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="input" /></label>
          <button className="btn-ghost self-end">Change email</button>
        </form>
        {msg.email && <p className="mt-2 text-sm text-text-muted" role="status">{msg.email}</p>}
      </section>

      <section className="glass p-6">
        <h2 className="font-display text-lg font-semibold">Password</h2>
        <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={async (e) => { e.preventDefault(); try { await run(() => api("/api/account/password", { body: { newPassword: newPw } })); setNewPw(""); say("pw", "Password changed. Other sessions were signed out."); } catch (e) { say("pw", errText(e)); } }}>
          <label className="flex-1"><span className="label">New password</span><input type="password" required minLength={12} maxLength={128} value={newPw} onChange={(e) => setNewPw(e.target.value)} className="input" autoComplete="new-password" /></label>
          <button className="btn-ghost self-end">Change password</button>
        </form>
        {msg.pw && <p className="mt-2 text-sm text-text-muted" role="status">{msg.pw}</p>}
      </section>

      <section className="glass p-6">
        <h2 className="font-display text-lg font-semibold">Notification preferences</h2>
        <p className="mt-1 text-sm text-text-muted">Notifications never include evidence or the identity of anyone who reported you.</p>
        <ul className="mt-4 divide-y divide-ink-line">
          {notifications.map((n) => (
            <li key={n.key} className="flex items-center justify-between py-3 text-sm">
              <span>{n.label}</span>
              <input type="checkbox" className="h-5 w-5 accent-violet-500" disabled={n.locked} checked={!!prefs[n.key]} aria-label={n.label}
                onChange={async (e) => {
                  const v = e.target.checked; setPrefs((p) => ({ ...p, [n.key]: v }));
                  try { await api("/api/account/profile", { method: "PATCH", body: { notificationPrefs: { [n.key]: v } } }); } catch { setPrefs((p) => ({ ...p, [n.key]: !v })); }
                }} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
