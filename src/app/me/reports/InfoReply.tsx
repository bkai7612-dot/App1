"use client";
import { useState } from "react";
import { api, ClientApiError } from "@/lib/client";

export function InfoReply({ reportId }: { reportId: string }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  if (msg) return <p className="mt-2 text-xs text-text-muted">{msg}</p>;
  return (
    <form className="mt-2 space-y-2" onSubmit={async (e) => { e.preventDefault(); try { await api(`/api/reports/${reportId}/info`, { body: { text } }); setMsg("Sent to the moderator."); } catch (e) { setMsg(e instanceof ClientApiError ? e.message : "Failed."); } }}>
      <textarea required minLength={10} maxLength={2000} rows={3} value={text} onChange={(e) => setText(e.target.value)} className="input" aria-label="Additional information" />
      <button className="btn-ghost px-3 py-1.5 text-xs">Send</button>
    </form>
  );
}
