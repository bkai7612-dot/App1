"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { KeyRound, Smartphone, LifeBuoy, MonitorSmartphone, AlertTriangle, ShieldCheck } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { api, ClientApiError } from "@/lib/client";
import { useReauth } from "@/components/account/useReauth";

type Passkey = { id: string; nickname: string | null; created_at: string; last_used_at: string | null; backed_up: boolean };
type Session = { id: string; createdAt: string; lastSeenAt: string; device: string; mfaMethod: string | null; current: boolean };
const fmt = (s: string) => new Date(s).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

function Codes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4">
      <p className="text-sm font-semibold text-amber-200">Save these recovery codes now. They will not be shown again.</p>
      <p className="mt-1 text-xs text-amber-100/80">Each code works once. Store them somewhere safe, like a password manager.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">{codes.map((c) => <li key={c} className="rounded bg-ink/60 px-2 py-1">{c}</li>)}</ul>
      <div className="mt-3 flex gap-2">
        <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>Copy</button>
        <button className="btn-primary" onClick={onDone}>I&apos;ve saved them</button>
      </div>
    </div>
  );
}

export function SecuritySettings({ mfaEnabled, hasTotp, codesLeft, passkeys, events }: { mfaEnabled: boolean; hasTotp: boolean; codesLeft: number; passkeys: Passkey[]; events: { type: string; at: string }[] }) {
  const router = useRouter();
  const { run, dialog } = useReauth();
  const [totp, setTotp] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [nick, setNick] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fail = (e: unknown) => setErr(e instanceof ClientApiError ? e.message : "Something went wrong.");
  const loadSessions = () => api<{ sessions: Session[] }>("/api/auth/sessions").then((r) => setSessions(r.sessions)).catch(() => {});
  useEffect(() => { loadSessions(); }, []);

  const startTotp = async () => { setErr(null); try { setTotp(await run(() => api<{ secret: string; qrSvg: string }>("/api/auth/mfa/totp"))); } catch (e) { fail(e); } };
  const confirmTotp = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    try { const r = await run(() => api<{ recoveryCodes: string[] | null }>("/api/auth/mfa/totp", { body: { code } })); setTotp(null); setCode(""); if (r.recoveryCodes) setCodes(r.recoveryCodes); else router.refresh(); setMsg("Authenticator app added."); }
    catch (e) { fail(e); }
  };
  const addPasskey = async () => {
    setErr(null);
    try {
      const opts = await run(() => api<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/auth/mfa/passkey/register-options", { body: {} }));
      const response = await startRegistration({ optionsJSON: opts });
      const r = await run(() => api<{ recoveryCodes: string[] | null }>("/api/auth/mfa/passkey/register-verify", { body: { response, nickname: nick || undefined } }));
      setNick(""); if (r.recoveryCodes) setCodes(r.recoveryCodes); else router.refresh();
      setMsg("Passkey added.");
    } catch (e) { fail(e); }
  };

  return (
    <div className="space-y-6">
      {dialog}
      {codes && <Codes codes={codes} onDone={() => { setCodes(null); router.refresh(); }} />}
      {msg && <p role="status" className="text-sm text-pos">{msg}</p>}
      {err && <p role="alert" className="text-sm text-neg">{err}</p>}

      <section className="glass p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-violet-lavender" /> Two-factor authentication</h2>
          <span className={`chip ${mfaEnabled ? "border-pos/40 bg-pos/10 text-pos" : "border-amber-400/40 bg-amber-400/10 text-amber-300"}`}>{mfaEnabled ? "Enabled" : "Not set up"}</span>
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <h3 className="flex items-center gap-2 font-medium"><KeyRound className="h-4 w-4" /> Passkeys <span className="text-xs text-text-muted">(recommended, phishing-resistant)</span></h3>
            <ul className="mt-2 divide-y divide-ink-line text-sm">
              {passkeys.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <span>{p.nickname ?? "Passkey"} <span className="text-xs text-text-muted">· added {fmt(p.created_at)}{p.last_used_at ? ` · used ${fmt(p.last_used_at)}` : ""}</span></span>
                  <button className="text-xs text-neg hover:underline" onClick={async () => { try { await run(() => api("/api/auth/mfa/passkey/remove", { body: { id: p.id } })); router.refresh(); } catch (e) { fail(e); } }}>Remove</button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={60} placeholder="Name (e.g. Laptop Touch ID)" className="input sm:max-w-xs" aria-label="Passkey name" />
              <button onClick={addPasskey} className="btn-primary">Add passkey</button>
            </div>
          </div>

          <div className="border-t border-ink-line pt-5">
            <h3 className="flex items-center gap-2 font-medium"><Smartphone className="h-4 w-4" /> Authenticator app</h3>
            {hasTotp ? (
              <div className="mt-2 flex items-center justify-between text-sm"><span className="text-pos">Configured</span>
                <button className="text-xs text-neg hover:underline" onClick={async () => { try { await run(() => api("/api/auth/mfa/totp", { method: "DELETE" })); router.refresh(); } catch (e) { fail(e); } }}>Remove</button></div>
            ) : totp ? (
              <form onSubmit={confirmTotp} className="mt-3 grid gap-4 sm:grid-cols-[auto_1fr]">
                <div className="h-40 w-40 rounded-lg bg-white p-2 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: totp.qrSvg }} aria-label="QR code for authenticator app" />
                <div className="space-y-3">
                  <p className="text-sm text-text-muted">Scan with your authenticator app, or enter this key manually:</p>
                  <code className="block break-all rounded bg-ink/70 px-2 py-1 text-xs">{totp.secret}</code>
                  <label className="block"><span className="label">Enter the 6-digit code</span><input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="input font-mono" autoComplete="one-time-code" /></label>
                  <button className="btn-primary">Confirm</button>
                </div>
              </form>
            ) : <button onClick={startTotp} className="btn-ghost mt-2">Set up authenticator app</button>}
          </div>

          {mfaEnabled && (
            <div className="border-t border-ink-line pt-5">
              <h3 className="flex items-center gap-2 font-medium"><LifeBuoy className="h-4 w-4" /> Recovery codes</h3>
              <p className="mt-1 text-sm text-text-muted">{codesLeft} unused code{codesLeft === 1 ? "" : "s"} remaining.</p>
              <button className="btn-ghost mt-2" onClick={async () => { try { const r = await run(() => api<{ recoveryCodes: string[] }>("/api/auth/mfa/recovery-codes", { body: {} })); setCodes(r.recoveryCodes); } catch (e) { fail(e); } }}>Generate new codes</button>
            </div>
          )}
        </div>
      </section>

      <section className="glass p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><MonitorSmartphone className="h-5 w-5 text-violet-lavender" /> Active sessions</h2>
        <ul className="mt-3 divide-y divide-ink-line text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2.5">
              <span>{s.device}{s.current && <span className="ml-2 chip border-pos/40 text-pos">This device</span>}<span className="block text-xs text-text-muted">Last active {fmt(s.lastSeenAt)} · signed in {fmt(s.createdAt)}</span></span>
              {!s.current && <button className="text-xs text-neg hover:underline" onClick={async () => { await api("/api/auth/sessions", { body: { id: s.id } }).catch(fail); loadSessions(); }}>Sign out</button>}
            </li>
          ))}
        </ul>
        <button className="btn-ghost mt-3" onClick={async () => { await api("/api/auth/sessions", { body: { allOthers: true } }).catch(fail); loadSessions(); }}>Sign out all other sessions</button>
      </section>

      <section className="glass p-6">
        <h2 className="font-display text-lg font-semibold">Recent security activity</h2>
        <ul className="mt-3 divide-y divide-ink-line text-sm">
          {events.map((e, i) => <li key={i} className="flex justify-between py-2"><span>{e.type.replace(/_/g, " ")}</span><span className="text-text-muted">{fmt(e.at)}</span></li>)}
        </ul>
      </section>

      <section className="glass border-neg/30 p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><AlertTriangle className="h-5 w-5 text-neg" /> Suspect your account is compromised?</h2>
        <p className="mt-1 text-sm text-text-muted">We&apos;ll sign out every other session, alert our security team and email you next steps.</p>
        <button className="btn-danger mt-3" onClick={async () => { try { await api("/api/account/compromise", { body: {} }); setMsg("Other sessions signed out. Change your password now."); loadSessions(); } catch (e) { fail(e); } }}>Report suspected compromise</button>
      </section>
    </div>
  );
}
