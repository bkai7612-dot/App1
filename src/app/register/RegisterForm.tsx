"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client";

export function RegisterForm() {
  const [f, setF] = useState({ email: "", password: "", displayName: "", acceptTerms: false, confirmAge: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api("/api/auth/register", { body: f });
      setSent(true);
    } catch (e) { setErr(e instanceof ClientApiError ? e.message : "Could not register."); } finally { setBusy(false); }
  };
  if (sent) return <div className="space-y-4 text-sm text-text-muted"><p>Check your email for a verification link, then log in and set up two-factor authentication. If you already have an account, we&apos;ve emailed you a sign-in reminder instead.</p><Link href="/login?next=/account/security%3Fwelcome%3D1" className="btn-primary w-full">Go to log in</Link></div>;
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block"><span className="label">Display name</span><input required minLength={2} maxLength={40} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} className="input" autoComplete="nickname" /></label>
      <label className="block"><span className="label">Email</span><input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="input" autoComplete="email" /></label>
      <label className="block"><span className="label">Password</span><input type="password" required minLength={12} maxLength={128} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="input" autoComplete="new-password" />
        <span className="mt-1 block text-xs text-text-muted">At least 12 characters. A passphrase of several words works well.</span></label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={f.confirmAge} onChange={(e) => setF({ ...f, confirmAge: e.target.checked })} className="mt-1 h-4 w-4 accent-violet-500" /><span>I confirm I am 18 or over.</span></label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={f.acceptTerms} onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })} className="mt-1 h-4 w-4 accent-violet-500" />
        <span>I agree to the <Link href="/terms" className="underline">Terms of Use</Link> and <Link href="/guidelines" className="underline">Community Guidelines</Link>, and have read the <Link href="/privacy" className="underline">Privacy Notice</Link>.</span></label>
      {err && <p role="alert" className="text-sm text-neg">{err}</p>}
      <button disabled={busy} className="btn-primary w-full py-3">{busy && <span className="spinner" />}Create free account</button>
      <p className="text-center text-sm text-text-muted">Already have an account? <Link href="/login" className="text-violet-lavender hover:underline">Log in</Link></p>
    </form>
  );
}
