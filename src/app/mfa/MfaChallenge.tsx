"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { api, ClientApiError } from "@/lib/client";

export function MfaChallenge({ next, hasTotp, hasPasskey }: { next: string; hasTotp: boolean; hasPasskey: boolean }) {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const done = () => { router.push(next); router.refresh(); };
  const fail = (e: unknown) => {
    if (e instanceof ClientApiError && e.code === "MFA_LOCKED") { router.push("/login"); return; }
    setErr(e instanceof ClientApiError ? e.message : "Verification failed.");
  };
  const passkey = async () => {
    setBusy(true); setErr(null);
    try {
      const opts = await api<Parameters<typeof startAuthentication>[0]["optionsJSON"]>("/api/auth/mfa/passkey/auth-options", { body: {} });
      const response = await startAuthentication({ optionsJSON: opts });
      await api("/api/auth/mfa/passkey/auth-verify", { body: { response } });
      done();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api("/api/auth/mfa/verify", { body: useRecovery ? { recoveryCode: recovery } : { code } });
      done();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-5">
      {hasPasskey && <button onClick={passkey} disabled={busy} className="btn-primary w-full py-3"><KeyRound className="h-4 w-4" /> Use passkey</button>}
      {(hasTotp || useRecovery) && (
        <form onSubmit={submit} className="space-y-3">
          {useRecovery ? (
            <label className="block"><span className="label">Recovery code</span><input value={recovery} onChange={(e) => setRecovery(e.target.value)} className="input font-mono" autoComplete="one-time-code" placeholder="XXXXX-XXXXX" /></label>
          ) : (
            <label className="block"><span className="label">6-digit authenticator code</span><input inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="input text-center font-mono text-lg tracking-[0.4em]" autoComplete="one-time-code" autoFocus={!hasPasskey} /></label>
          )}
          <button disabled={busy} className={hasPasskey ? "btn-ghost w-full" : "btn-primary w-full py-3"}>{busy && <span className="spinner" />}Verify</button>
        </form>
      )}
      {err && <p role="alert" className="text-sm text-neg">{err}</p>}
      <div className="flex justify-between text-sm text-text-muted">
        <button onClick={() => { setUseRecovery(!useRecovery); setErr(null); }} className="hover:text-text">{useRecovery ? "Use authenticator code" : "Use a recovery code"}</button>
        <Link href="/account-recovery" className="hover:text-text">Lost access?</Link>
      </div>
    </div>
  );
}
