"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/client";
import { GateError } from "./MfaGateMessage";

type State = { response: string | null; response_body: string | null; response_id: string | null; appeal: string | null; appeal_id: string | null; appeal_note: string | null; appeal_q?: string | null; appeal_reply?: string | null } | null;
const LABEL: Record<string, string> = { pending: "awaiting moderation", published: "published", rejected: "not published", submitted: "submitted", under_review: "under review", upheld: "successful", };

/** Owner's right of reply and appeal: clear confirmations, your own text, and withdraw while pending (T-07). */
export function OwnerReportActions({ reportId, status, state }: { reportId: string; status: string; state: State }) {
  const [mode, setMode] = useState<null | "respond" | "appeal">(null);
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const min = mode === "respond" ? 10 : 20;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (text.trim().length < min) { setErr(new Error(`Please write at least ${min} characters (${text.trim().length} so far).`)); return; }
    setBusy(true);
    try {
      await api(`/api/reports/${reportId}/${mode === "respond" ? "response" : "appeal"}`, { body: mode === "respond" ? { body: text } : { grounds: text } });
      setMsg(mode === "respond" ? "Response sent. A moderator will check it before it's shown publicly. We'll notify you." : "Appeal submitted. A senior moderator who didn't publish this report will decide, and we'll tell you the outcome and the reason.");
      setMode(null); setText(""); setConfirm(false); router.refresh();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const withdraw = async (what: "response" | "appeal") => {
    setErr(null); setBusy(true);
    try { await api(`/api/reports/${reportId}/${what}/withdraw`, { body: {} }); setMsg(what === "response" ? "Response withdrawn." : "Appeal withdrawn."); router.refresh(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const [reply, setReply] = useState("");
  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (reply.trim().length < 5) { setErr(new Error("Please write at least 5 characters.")); return; }
    setBusy(true);
    try { await api(`/api/reports/${reportId}/appeal/info`, { body: { text: reply } }); setMsg("Thanks. Your answer was sent to the moderator."); setReply(""); router.refresh(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const canRespond = !state?.response || state.response === "rejected";
  const appealOpen = state?.appeal === "submitted" || state?.appeal === "under_review";
  const canAppeal = status !== "resolved" && !appealOpen && state?.appeal !== "upheld";
  return (
    <div className="mt-4 space-y-3 border-t border-ink-line pt-4 text-sm">
      {msg && <p role="status" className="flex items-start gap-2 text-pos"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{msg}</p>}
      {state?.response && (
        <div className="rounded-lg border border-ink-line bg-white/[0.02] p-3">
          <p className="text-xs uppercase tracking-wider text-text-muted">Your response · {LABEL[state.response] ?? state.response}</p>
          {state.response_body && <p className="mt-1 whitespace-pre-wrap break-words">{state.response_body}</p>}
          {state.response === "pending" && <button disabled={busy} onClick={() => withdraw("response")} className="btn-ghost mt-2 px-3 py-1 text-xs">Withdraw response</button>}
        </div>
      )}
      {state?.appeal && (
        <div className="rounded-lg border border-ink-line bg-white/[0.02] p-3">
          <p className="text-xs uppercase tracking-wider text-text-muted">Your appeal · {LABEL[state.appeal] ?? state.appeal}</p>
          {state.appeal_note && <p className="mt-1 text-text-muted">Moderator&apos;s reason: {state.appeal_note}</p>}
          {state.appeal_q && (state.appeal === "submitted" || state.appeal === "under_review") && (
            <div className="mt-2 rounded-lg border border-sky-400/40 bg-sky-400/5 p-3">
              <p className="text-sky-300">A moderator asked: {state.appeal_q}</p>
              {state.appeal_reply ? <p className="mt-1 text-text-muted">Your answer: {state.appeal_reply}</p> : (
                <form onSubmit={sendReply} className="mt-2 space-y-2">
                  <label className="block"><span className="sr-only">Your answer</span><textarea className="input" rows={3} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Your answer" /></label>
                  <button disabled={busy} className="btn-primary px-3 py-1.5 text-xs">Send answer</button>
                </form>)}
            </div>)}
          {state.appeal === "submitted" && <button disabled={busy} onClick={() => withdraw("appeal")} className="btn-ghost mt-2 px-3 py-1 text-xs">Withdraw appeal</button>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {canRespond && <button onClick={() => { setMode("respond"); setMsg(null); }} className="btn-ghost px-3 py-1.5 text-xs">Write a public response</button>}
        {canAppeal && <button onClick={() => { setMode("appeal"); setMsg(null); }} className="btn-ghost px-3 py-1.5 text-xs">Appeal this report</button>}
      </div>
      {mode && (
        <form onSubmit={submit} noValidate className="space-y-2">
          <label className="block"><span className="label">{mode === "respond" ? "Your public response (checked by a moderator, then shown to everyone for free)" : "Grounds for appeal (private to moderators)"}</span>
            <textarea maxLength={mode === "respond" ? 2000 : 4000} rows={4} value={text} onChange={(e) => setText(e.target.value)} className="input" aria-describedby={`len-${reportId}`} />
            <span id={`len-${reportId}`} className="mt-1 block text-xs text-text-muted">At least {min} characters · {text.trim().length} written. Stick to facts; don&apos;t include personal information about anyone.</span>
          </label>
          {mode === "appeal" && (
            <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 h-4 w-4 accent-violet-500" />
              <span>I understand one appeal is reviewed per report, by a senior moderator who didn&apos;t publish it. I can withdraw it until review starts.</span></label>
          )}
          <GateError error={err} />
          <div className="flex gap-2"><button disabled={busy || (mode === "appeal" && !confirm)} className="btn-primary">{busy && <span className="spinner" />}{mode === "respond" ? "Send response" : "Submit appeal"}</button><button type="button" onClick={() => { setMode(null); setErr(null); }} className="btn-ghost">Cancel</button></div>
        </form>
      )}
      {!mode && err ? <GateError error={err} /> : null}
    </div>
  );
}
