"use client";
import { useState } from "react";
import { UserCheck } from "lucide-react";
import { api } from "@/lib/client";
import { Modal } from "@/components/ui/Modal";
import { GateError } from "./MfaGateMessage";

export function ClaimProfileButton({ profileId, signedIn, platformSlug }: { profileId: string; signedIn: boolean; platformSlug: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  if (!signedIn) return <a href="/login" className="btn-ghost text-xs"><UserCheck className="h-4 w-4" /> Is this you? Claim profile</a>;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api<{ redirect?: string }>("/api/identity/claim", { body: { playerProfileId: profileId, note } });
      if (r.redirect) { window.location.assign(r.redirect); return; }
      setDone(true);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost text-xs"><UserCheck className="h-4 w-4" /> Is this you? Claim profile</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Claim this profile">
        {done ? <p>Your claim was submitted. A moderator will review it; we never grant ownership based on a matching username alone.</p> : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-text-muted">
              {platformSlug === "steam"
                ? "Steam profiles are claimed by signing in through Steam's official OpenID page. ServerSentry never sees your Steam password."
                : "This platform has no official ownership-verification integration yet, so claims are reviewed manually by a moderator. Explain how you can prove ownership (for example, a moderator can ask you to set a temporary in-game status or profile text). Never send passwords."}
            </p>
            {platformSlug !== "steam" && (
              <label className="block"><span className="label">How can you prove ownership?</span>
                <textarea required minLength={20} maxLength={1000} rows={4} value={note} onChange={(e) => setNote(e.target.value)} className="input" />
              </label>
            )}
            <GateError error={err} />
            <button disabled={busy} className="btn-primary w-full">{busy ? <span className="spinner" /> : null}{platformSlug === "steam" ? "Continue with Steam" : "Submit claim for review"}</button>
          </form>
        )}
      </Modal>
    </>
  );
}
