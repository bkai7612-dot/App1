"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { GateError } from "./MfaGateMessage";

export function OwnerReportActions({ reportId, status, responseStatus, appealStatus }: { reportId: string; status: string; responseStatus: string | null; appealStatus: string | null }) {
  const [mode, setMode] = useState<null | "respond" | "appeal">(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const router = useRouter();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api(`/api/reports/${reportId}/${mode === "respond" ? "response" : "appeal"}`, { body: mode === "respond" ? { body: text } : { grounds: text } });
      setMode(null); setText(""); router.refresh();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const canRespond = !responseStatus || responseStatus === "rejected";
  const canAppeal = status !== "resolved" && (!appealStatus || !["submitted", "under_review"].includes(appealStatus)) && appealStatus !== "upheld";
  return (
    <div className="mt-4 border-t border-ink-line pt-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        {responseStatus && <span className="chip border-ink-line">Your response: {responseStatus}</span>}
        {appealStatus && <span className="chip border-ink-line">Your appeal: {appealStatus.replace("_", " ")}</span>}
        {canRespond && <button onClick={() => setMode("respond")} className="btn-ghost px-3 py-1.5 text-xs">Write a response</button>}
        {canAppeal && <button onClick={() => setMode("appeal")} className="btn-ghost px-3 py-1.5 text-xs">Appeal this report</button>}
      </div>
      {mode && (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <label className="block"><span className="label">{mode === "respond" ? "Your public response (moderated before display)" : "Grounds for appeal (private to moderators)"}</span>
            <textarea required minLength={mode === "respond" ? 10 : 20} maxLength={mode === "respond" ? 2000 : 4000} rows={4} value={text} onChange={(e) => setText(e.target.value)} className="input" />
          </label>
          <GateError error={err} />
          <div className="flex gap-2"><button disabled={busy} className="btn-primary">{busy && <span className="spinner" />}Submit</button><button type="button" onClick={() => setMode(null)} className="btn-ghost">Cancel</button></div>
        </form>
      )}
    </div>
  );
}
