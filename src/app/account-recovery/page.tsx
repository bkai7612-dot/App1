"use client";
import { useState } from "react";
import { AuthShell } from "@/components/forms/AuthShell";
import { api, ClientApiError } from "@/lib/client";

export default function Recovery() {
  const [email, setEmail] = useState("");
  const [details, setDetails] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    try { const r = await api<{ message: string }>("/api/auth/recovery-request", { body: { email, details } }); setMsg(r.message); }
    catch (e) { setErr(e instanceof ClientApiError ? e.message : "Could not submit."); }
  };
  return (
    <AuthShell title="Lost your second factor?" subtitle="If you've lost your passkey, authenticator and recovery codes, an administrator can help after additional checks. This is deliberately slow to protect you from account takeover.">
      {msg ? <p className="text-sm text-text-muted">{msg}</p> : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block"><span className="label">Account email</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" /></label>
          <label className="block"><span className="label">What happened?</span><textarea required minLength={10} maxLength={2000} rows={4} value={details} onChange={(e) => setDetails(e.target.value)} className="input" placeholder="E.g. lost phone. Do not include passwords or codes." /></label>
          {err && <p role="alert" className="text-sm text-neg">{err}</p>}
          <button className="btn-primary w-full py-3">Request recovery</button>
        </form>
      )}
    </AuthShell>
  );
}
