"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { api, ClientApiError } from "@/lib/client";

export function CheckoutButton({ returnTo, label = "Upgrade" }: { returnTo: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ url: string }>("/api/billing/checkout", { body: { returnTo } });
      window.location.assign(r.url);
    } catch (e) {
      setErr(e instanceof ClientApiError ? e.message : "Could not start checkout.");
      setBusy(false);
    }
  };
  return (
    <div>
      <button onClick={go} disabled={busy} className="btn-primary px-6 py-3">{busy ? <span className="spinner" /> : <Sparkles className="h-4 w-4" />} {label}</button>
      {err && <p role="alert" className="mt-3 text-sm text-neg">{err}</p>}
    </div>
  );
}
