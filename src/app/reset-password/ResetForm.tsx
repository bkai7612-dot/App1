"use client";
import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { api, ClientApiError } from "@/lib/client";

export function ResetForm({ token, mfa }: { token: string; mfa: boolean }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api("/api/auth/reset-password", { body: { token, password: pw, ...(mfa ? (useRecovery ? { recoveryCode: code.trim() } : { code }) : {}) } });
      setOk(true);
    } catch (e) {
      if (e instanceof ClientApiError && e.code === "MFA_REQUIRED") setErr(useRecovery ? "That recovery code didn't work. Check it, or use your authenticator app instead." : "That code didn't work. Codes change every 30 seconds, so try the current one.");
      else setErr(e instanceof ClientApiError ? e.message : "Could not reset password.");
    } finally { setBusy(false); }
  };
  if (ok) return <div className="space-y-4"><p>Your password has been changed and all sessions were signed out.</p><Link href="/login" className="btn-primary w-full">Log in</Link></div>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block"><span className="label">New password</span>
        <span className="relative block">
          <input type={show ? "text" : "password"} required minLength={12} maxLength={128} value={pw} onChange={(e) => setPw(e.target.value)} className="input pr-11" autoComplete="new-password" aria-describedby="pw-hint" />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-text-muted hover:text-text">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
        </span>
        <span id="pw-hint" className="mt-1 block text-xs text-text-muted">At least 12 characters. A short phrase is easiest to remember. {pw.length > 0 && pw.length < 12 && <span className="text-amber-300">({12 - pw.length} more)</span>}</span>
      </label>
      {mfa && (
        <fieldset className="space-y-2 rounded-xl border border-ink-line p-3">
          <legend className="px-1 text-sm">Two-step check</legend>
          <p className="text-xs text-text-muted">Your account uses two-step verification, so we need {useRecovery ? "one of your recovery codes" : "the 6-digit code from your authenticator app"}.</p>
          <label className="block"><span className="label">{useRecovery ? "Recovery code" : "Authenticator code"}</span>
            {useRecovery ? <input required value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} className="input font-mono" autoComplete="off" />
              : <input required inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="input font-mono" autoComplete="one-time-code" />}
          </label>
          <button type="button" className="text-xs text-violet-lavender underline" onClick={() => { setUseRecovery(!useRecovery); setCode(""); }}>{useRecovery ? "Use authenticator app instead" : "Lost your phone? Use a recovery code"}</button>
        </fieldset>
      )}
      {err && <p role="alert" className="text-sm text-neg">{err}</p>}
      <button disabled={busy} className="btn-primary w-full py-3">{busy && <span className="spinner" />}Set new password</button>
      {mfa && <p className="text-center text-xs text-text-muted">No access to either? <Link href="/account-recovery" className="underline">Request account recovery</Link></p>}
    </form>
  );
}
