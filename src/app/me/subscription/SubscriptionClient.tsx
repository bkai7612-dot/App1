"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ClientApiError } from "@/lib/client";
import { Notice } from "@/components/ui/Card";

export function PortalButton() {
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button className="btn-ghost" onClick={async () => { try { const r = await api<{ url: string }>("/api/billing/portal", { body: {} }); window.location.assign(r.url); } catch (e) { setErr(e instanceof ClientApiError ? e.message : "Failed."); } }}>Manage or cancel</button>
      {err && <p className="mt-2 text-sm text-neg">{err}</p>}
    </div>
  );
}

/** After Checkout, wait for the VERIFIED webhook to grant access (never trust the redirect alone), then return the user. */
export function CheckoutReturn({ returnTo, alreadyActive }: { returnTo: string; alreadyActive: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState(alreadyActive);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (active) { const t = setTimeout(() => router.push(returnTo), 1500); return () => clearTimeout(t); }
    if (tries > 20) return;
    const t = setTimeout(async () => {
      const r = await api<{ plus: boolean }>("/api/billing/status").catch(() => ({ plus: false }));
      if (r.plus) setActive(true); else setTries((n) => n + 1);
    }, 1500);
    return () => clearTimeout(t);
  }, [active, tries, returnTo, router]);
  if (active) return <Notice tone="ok">Welcome to ServerSentry Plus! Taking you back…</Notice>;
  if (tries > 20) return <Notice tone="warn">Payment received. Activation is taking longer than usual. Refresh in a minute.</Notice>;
  return <Notice>Confirming your payment with Stripe… <span className="spinner ml-2 inline-block align-middle" /></Notice>;
}
