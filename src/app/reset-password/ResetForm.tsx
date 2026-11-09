"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client";

export function ResetForm({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [needMfa, setNeedMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api("/api/auth/reset-password", { body: { token, password: pw, code: code || undefined, recoveryCode: recovery || undefined } });
      setOk(true);
    } catch (e) {
      if (e instanceof ClientApiError && e.code === "MFA_REQUIRED") { setNeedMfa(true); setErr(needMfa ? e.message : null); }
      else setErr(e instanceof ClientApiError ? e.message : "Could not reset password.");
    } finally { setBusy(false); }
  };
  if (ok) return <div className="space-y-4"><p>Your password has been changed and all sessions were signed out.</p><Link href="/login" className="btn-primary w-full">Log in</Link></div>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block"><span className="label">New password</span><input type="password" required minLength={12} maxLength={128} value={pw} onChange={(e) => setPw(e.target.value)} className="input" autoComplete="new-password" /></label>
      {needMfa && (
        <>
          <p className="text-sm text-text-muted">Your account has two-factor authentication. Enter an authenticator code or a recovery code.</p>
          <label className="block"><span className="label">Authenticator code</span><input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="input font-mono" /></label>
          <label className="block"><span className="label">or recovery code</span><input value={recovery} onChange={(e) => setRecovery(e.target.value)} className="input font-mono" /></label>
        </>
      )}
      {err && <p role="alert" className="text-sm text-neg">{err}</p>}
      <button disabled={busy || !token} className="btn-primary w-full py-3">{busy && <span className="spinner" />}Set new password</button>
    </form>
  );
}
