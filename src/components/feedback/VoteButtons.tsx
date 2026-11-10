"use client";
import { useState } from "react";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { api } from "@/lib/client";
import { GateError } from "./MfaGateMessage";

/** Free upvote/downvote. One vote per member per player; click again to withdraw. */
export function VoteButtons({ profileId, initial, canVote, reason }: {
  profileId: string; initial: { upvotes: number; downvotes: number; myVote: number }; canVote: boolean; reason?: string;
}) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const vote = async (v: 1 | -1) => {
    if (!canVote || busy) return;
    setBusy(true); setErr(null);
    const value = s.myVote === v ? 0 : v;
    try { const r = await api<{ upvotes: number; downvotes: number; myVote: number }>("/api/votes", { body: { playerProfileId: profileId, value } }); setS(r); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const base = "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed";
  return (
    <div>
      <div className="flex gap-2" role="group" aria-label="Vote on this player">
        <button type="button" onClick={() => vote(1)} disabled={!canVote || busy} aria-pressed={s.myVote === 1} title={canVote ? "Upvote" : reason}
          className={`${base} ${s.myVote === 1 ? "border-pos/60 bg-pos/20 text-pos" : "border-pos/25 bg-pos/[0.06] text-pos hover:bg-pos/15"}`}>
          <ArrowBigUp className="h-5 w-5" aria-hidden="true" /><span className="tabular-nums">{s.upvotes}</span><span className="sr-only">upvotes</span>
        </button>
        <button type="button" onClick={() => vote(-1)} disabled={!canVote || busy} aria-pressed={s.myVote === -1} title={canVote ? "Downvote" : reason}
          className={`${base} ${s.myVote === -1 ? "border-neg/60 bg-neg/20 text-neg" : "border-neg/25 bg-neg/[0.06] text-neg hover:bg-neg/15"}`}>
          <ArrowBigDown className="h-5 w-5" aria-hidden="true" /><span className="tabular-nums">{s.downvotes}</span><span className="sr-only">downvotes</span>
        </button>
      </div>
      {!canVote && reason && <p className="mt-1.5 text-xs text-text-muted">{reason}</p>}
      <div className="mt-1.5"><GateError error={err} /></div>
    </div>
  );
}
