"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Flag } from "lucide-react";
import { api } from "@/lib/client";
import { GateError } from "./MfaGateMessage";

/** Owner reports an approved comment on their own account as inaccurate (free). */
export function DisputeCommentButton({ commentId }: { commentId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  if (!open) return <button onClick={() => setOpen(true)} className="btn-ghost px-3 py-1.5 text-xs"><Flag className="h-3.5 w-3.5" /> Report as inaccurate</button>;
  return (
    <form className="mt-2 w-full space-y-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { await api(`/api/comments/${commentId}/dispute`, { body: { reason } }); setOpen(false); router.refresh(); } catch (x) { setErr(x); } finally { setBusy(false); } }}>
      <label className="block"><span className="label">Why is this comment inaccurate?</span>
        <textarea required minLength={10} maxLength={2000} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="input" placeholder="Explain what is wrong. A moderator will review it and can remove the comment." /></label>
      <GateError error={err} />
      <div className="flex gap-2"><button disabled={busy} className="btn-primary px-3 py-1.5 text-xs">{busy && <span className="spinner" />}Send to moderators</button><button type="button" onClick={() => setOpen(false)} className="btn-ghost px-3 py-1.5 text-xs">Cancel</button></div>
    </form>
  );
}
