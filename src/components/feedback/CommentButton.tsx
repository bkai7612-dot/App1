"use client";
import Link from "next/link";
import { useState } from "react";
import { MessageSquarePlus, Lock, Check } from "lucide-react";
import { api } from "@/lib/client";
import { Modal } from "@/components/ui/Modal";
import { GateError } from "./MfaGateMessage";

const TONES = [["positive", "Positive"], ["neutral", "Neutral"], ["negative", "Negative"]] as const;

/** Plus members write a comment; it is held for moderation and only then appears on the player's account. */
export function CommentButton({ profileId, plus, signedIn }: { profileId: string; plus: boolean; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<string>("positive");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  if (!plus) {
    return <Link href={signedIn ? "/pricing" : "/login"} className="btn-ghost"><Lock className="h-4 w-4" /> Leave a comment <span className="chip border-violet-brand/50 text-violet-lavender">Plus</span></Link>;
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("/api/comments", { body: { playerProfileId: profileId, tone, body } }); setDone(true); setBody(""); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <>
      <button onClick={() => { setOpen(true); setDone(false); }} className="btn-ghost"><MessageSquarePlus className="h-4 w-4" /> Leave a comment</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Leave a comment">
        {done ? (
          <div className="text-center"><Check className="mx-auto h-10 w-10 text-pos" /><p className="mt-3">Thanks. A moderator will check your comment before it appears on this player&apos;s account.</p><button className="btn-ghost mt-5" onClick={() => setOpen(false)}>Close</button></div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <fieldset><legend className="label">Overall tone</legend>
              <div className="grid grid-cols-3 gap-2">{TONES.map(([k, l]) => (
                <label key={k} className={`cursor-pointer rounded-xl border px-3 py-2 text-center text-sm ${tone === k ? "border-violet-brand/70 bg-violet-brand/15 text-text" : "border-ink-line text-text-muted"}`}>
                  <input type="radio" name="tone" value={k} checked={tone === k} onChange={() => setTone(k)} className="sr-only" />{l}
                </label>))}</div>
            </fieldset>
            <label className="block"><span className="label">Your comment</span>
              <textarea required minLength={10} maxLength={1000} rows={5} value={body} onChange={(e) => setBody(e.target.value)} className="input" placeholder="Describe your experience playing with or against this player." />
              <span className="mt-1 block text-xs text-text-muted">{body.length}/1000 · Stick to in-game behaviour you saw. No personal information, insults or accusations of crimes. Moderators remove comments that break the guidelines.</span>
            </label>
            <GateError error={err} />
            <button disabled={busy} className="btn-primary w-full">{busy && <span className="spinner" />}Submit for moderation</button>
          </form>
        )}
      </Modal>
    </>
  );
}
