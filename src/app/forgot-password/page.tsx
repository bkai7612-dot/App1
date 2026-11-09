"use client";
import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/forms/AuthShell";
import { api } from "@/lib/client";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api("/api/auth/forgot-password", { body: { email } }); } catch { /* same message either way */ }
    setSent(true); setBusy(false);
  };
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a single-use link that expires in 1 hour.">
      {sent ? <p className="text-sm text-text-muted">If an account exists for that email, a reset link is on its way.</p> : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block"><span className="label">Email</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" /></label>
          <button disabled={busy} className="btn-primary w-full py-3">{busy && <span className="spinner" />}Send reset link</button>
          <p className="text-center text-sm"><Link href="/login" className="text-text-muted hover:text-text">Back to log in</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
