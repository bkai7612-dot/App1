"use client";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client";

export function HandoffContinue({ token, provider }: { token: string; provider: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button disabled={busy} className="btn-primary w-full py-3" onClick={async () => {
        setBusy(true); setErr(null);
        try { const r = await api<{ redirect: string }>("/api/identity/handoff/continue", { body: { token, confirm: true } }); window.location.assign(r.redirect); }
        catch (e) { setErr(e instanceof ClientApiError ? e.message : "Something went wrong."); setBusy(false); }
      }}>{busy && <span className="spinner" />}Yes, it&apos;s me: continue with {provider}</button>
      {err && <p role="alert" className="text-neg">{err}</p>}
    </div>
  );
}
