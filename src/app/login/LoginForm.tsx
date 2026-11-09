"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api<{ mfaRequired: boolean }>("/api/auth/login", { body: { email, password } });
      router.push(r.mfaRequired ? `/mfa?next=${encodeURIComponent(next)}` : next);
      router.refresh();
    } catch (e) {
      setErr(e instanceof ClientApiError ? e.message : "Could not log in.");
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block"><span className="label">Email</span><input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" /></label>
      <label className="block"><span className="label">Password</span><input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" /></label>
      {err && <p role="alert" className="text-sm text-neg">{err}</p>}
      <button disabled={busy} className="btn-primary w-full py-3">{busy && <span className="spinner" />}Log in</button>
      <div className="flex justify-between text-sm text-text-muted">
        <Link href="/forgot-password" className="hover:text-text">Forgot password?</Link>
        <Link href="/register" className="hover:text-text">Create account</Link>
      </div>
    </form>
  );
}
