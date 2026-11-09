"use client";
import { useCallback, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { api, ClientApiError } from "@/lib/client";
import { Modal } from "@/components/ui/Modal";

/**
 * Wraps a sensitive action: if the server answers REAUTH_REQUIRED, prompt for password + code (or passkey),
 * then retry the action once.
 */
export function useReauth() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = () => new Promise<boolean>((res) => { resolver.current = res; setErr(null); setPw(""); setCode(""); setOpen(true); });
  const finish = (ok: boolean) => { setOpen(false); resolver.current?.(ok); resolver.current = null; };

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    try { return await fn(); } catch (e) {
      if (e instanceof ClientApiError && e.code === "REAUTH_REQUIRED") {
        if (await ask()) return fn();
      }
      throw e;
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("/api/auth/reauth", { body: { password: pw, code: code || undefined } }); finish(true); }
    catch (e) { setErr(e instanceof ClientApiError ? e.message : "Failed."); } finally { setBusy(false); }
  };
  const passkey = async () => {
    setBusy(true); setErr(null);
    try {
      const opts = await api<Parameters<typeof startAuthentication>[0]["optionsJSON"]>("/api/auth/mfa/passkey/auth-options", { body: {} });
      const response = await startAuthentication({ optionsJSON: opts });
      await api("/api/auth/mfa/passkey/auth-verify", { body: { response } });
      finish(true);
    } catch (e) { setErr(e instanceof ClientApiError ? e.message : "Passkey verification failed."); } finally { setBusy(false); }
  };

  const dialog = (
    <Modal open={open} onClose={() => finish(false)} title="Confirm it's you">
      <p className="mb-4 text-sm text-text-muted">For your security, sensitive changes need a fresh sign-in check.</p>
      <button type="button" onClick={passkey} disabled={busy} className="btn-ghost mb-4 w-full"><KeyRound className="h-4 w-4" /> Use a passkey</button>
      <form onSubmit={submit} className="space-y-3">
        <label className="block"><span className="label">Password</span><input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} className="input" autoComplete="current-password" /></label>
        <label className="block"><span className="label">Authenticator code (if enabled)</span><input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="input font-mono" autoComplete="one-time-code" /></label>
        {err && <p role="alert" className="text-sm text-neg">{err}</p>}
        <button disabled={busy} className="btn-primary w-full">{busy && <span className="spinner" />}Confirm</button>
      </form>
    </Modal>
  );
  return { run, dialog };
}
