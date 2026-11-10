"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThumbsUp, Check } from "lucide-react";
import { api } from "@/lib/client";
import { COMMENDATION_LABELS } from "@/lib/categories";
import { Modal } from "@/components/ui/Modal";
import { GateError } from "./MfaGateMessage";

export function CommendButton({ profileId, signedIn, plus = false }: { profileId: string; signedIn: boolean; plus?: boolean }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("excellent_teammate");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);
  const router = useRouter();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api<{ status: string }>("/api/commendations", { body: { playerProfileId: profileId, category, comment: comment.trim() || null } });
      setDone(r.status === "approved" ? "Thanks! Your commendation is live." : "Thanks! Your commendation counts once a moderator approves your comment.");
      router.refresh();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  if (!signedIn) return <a href="/login" className="btn-positive"><ThumbsUp className="h-4 w-4" /> Give Commendation</a>;
  return (
    <>
      <button onClick={() => { setOpen(true); setDone(null); }} className="btn-positive"><ThumbsUp className="h-4 w-4" /> Give Commendation</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Give a commendation">
        {done ? (
          <div className="text-center"><Check className="mx-auto h-10 w-10 text-pos" /><p className="mt-3">{done}</p><button className="btn-ghost mt-5" onClick={() => setOpen(false)}>Close</button></div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <fieldset>
              <legend className="label">What stood out?</legend>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(COMMENDATION_LABELS).map(([k, v]) => (
                  <label key={k} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-sm transition ${category === k ? "border-pos/60 bg-pos/10 text-pos" : "border-ink-line text-text-muted hover:border-pos/30"}`}>
                    <input type="radio" name="category" value={k} checked={category === k} onChange={() => setCategory(k)} className="sr-only" />{v}
                  </label>
                ))}
              </div>
            </fieldset>
            {plus ? <label className="block">
              <span className="label">Comment (optional)</span>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} className="input" placeholder="Great shot-calling and kept the team positive." />
              <span className="mt-1 block text-xs text-text-muted">{comment.length}/500 · Comments are checked by a moderator. Don&apos;t include personal information.</span>
            </label> : <p className="text-xs text-text-muted">Want to add a written comment? That&apos;s a ServerSentry Plus feature.</p>}
            <GateError error={err} />
            <button type="submit" disabled={busy} className="btn-positive w-full">{busy ? <span className="spinner" /> : <ThumbsUp className="h-4 w-4" />} Submit commendation</button>
          </form>
        )}
      </Modal>
    </>
  );
}
