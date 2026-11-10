"use client";
import { useState } from "react";
import { UserCheck } from "lucide-react";
import { api } from "@/lib/client";
import { Modal } from "@/components/ui/Modal";
import { GateError } from "./MfaGateMessage";
import { VerifyOptions, CodeInstructions } from "@/app/me/linked-accounts/LinkedAccountsManager";

type Option = { method: string; label: string; detail: string; automatic: boolean };

/** Claim an unowned profile: official sign-in / Discord (instant) or a profile-code check. Never by username alone. */
export function ClaimProfileButton({ profileId, signedIn, platformName, options }: { profileId: string; signedIn: boolean; platformName: string; options: Option[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [code, setCode] = useState<string | null>(null);
  const [vid, setVid] = useState<string | null>(null);
  if (!signedIn) return <a href="/login" className="btn-ghost text-xs"><UserCheck className="h-4 w-4" /> Is this you? Claim profile</a>;
  const pick = async (method: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ redirect?: string; code?: string; verificationId?: string }>("/api/identity/claim", { body: { playerProfileId: profileId, method } });
      if (r.redirect) { window.location.assign(r.redirect); return; }
      if (r.code) { setCode(r.code); setVid(r.verificationId ?? null); }
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost text-xs"><UserCheck className="h-4 w-4" /> Is this you? Claim profile</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Claim this profile">
        {code ? <CodeInstructions code={code} platform={platformName} verificationId={vid} /> : (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">Prove this {platformName} account is yours. We never grant ownership because a username matches, and we never ask for your password.</p>
            <VerifyOptions options={options} busy={busy} onPick={pick} target={{ playerProfileId: profileId }} />
            <GateError error={err} />
          </div>
        )}
      </Modal>
    </>
  );
}
