"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, CheckCircle2 } from "lucide-react";
import { api, ClientApiError } from "@/lib/client";

/** Shows a one-time QR code; the player scans it with their phone camera and approves with the official sign-in. */
export function QrHandoff({ target, method, label }: { target: { gamingAccountId?: string; playerProfileId?: string }; method: string; label: string }) {
  const router = useRouter();
  const [qr, setQr] = useState<{ id: string; qrSvg: string; url: string } | null>(null);
  const [state, setState] = useState("waiting");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    api<{ id: string; qrSvg: string; url: string }>("/api/identity/handoff", { body: { ...target, method } })
      .then((r) => !stop && setQr(r)).catch((e) => setErr(e instanceof ClientApiError ? e.message : "Couldn't create a QR code."));
    return () => { stop = true; };
  }, [target.gamingAccountId, target.playerProfileId, method]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!qr || ["verified", "review", "rejected", "expired", "cancelled"].includes(state)) return;
    const t = setInterval(async () => {
      try { const r = await api<{ state: string }>(`/api/identity/handoff/${qr.id}`); setState(r.state); if (r.state === "verified" || r.state === "review") router.refresh(); } catch { /* keep polling */ }
    }, 2000);
    return () => clearInterval(t);
  }, [qr, state, router]);
  if (err) return <p role="alert" className="text-sm text-neg">{err}</p>;
  if (state === "verified") return <p className="flex items-center gap-2 text-pos"><CheckCircle2 className="h-5 w-5" /> Verified! Your account is now confirmed.</p>;
  if (state === "review") return <p className="text-amber-300">Sign-in worked but the name didn&apos;t match exactly, so a moderator will check it.</p>;
  if (["rejected", "expired", "cancelled"].includes(state)) return <p className="text-text-muted">That didn&apos;t complete ({state}). Close this and try again.</p>;
  return (
    <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
      {qr
        ? <div className="h-44 w-44 shrink-0 rounded-xl bg-white p-2 [&>svg]:h-full [&>svg]:w-full" aria-label="QR code to verify on your phone" role="img" dangerouslySetInnerHTML={{ __html: qr.qrSvg }} />
        : <div className="grid h-44 w-44 shrink-0 place-items-center rounded-xl bg-white/5" aria-busy="true"><span className="spinner" /></div>}
      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-2 font-semibold"><Smartphone className="h-4 w-4" /> Scan with your phone camera</p>
        <ol className="list-inside list-decimal space-y-1 text-text-muted">
          <li>Point your phone camera at the code.</li>
          <li>Tap the link, check it shows your ServerSentry name, and continue.</li>
          <li>Approve on {label}&apos;s official page.</li>
        </ol>
        <p className="text-xs text-text-muted">{state === "scanned" ? "Scanned: waiting for you to approve on your phone…" : "Waiting for scan… The code works once and expires in 10 minutes."}</p>
      </div>
    </div>
  );
}
