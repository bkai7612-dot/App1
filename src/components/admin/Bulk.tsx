"use client";
import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ClientApiError } from "@/lib/client";
import { useReauth } from "@/components/account/useReauth";

type Ctx = { sel: Set<string>; toggle: (id: string) => void };
const BulkCtx = createContext<Ctx | null>(null);

/** M-04: wraps a queue so items can be selected and approved/rejected together (max 50). */
export function BulkProvider({ kind, ids, children }: { kind: "commendation" | "comment"; ids: string[]; children: React.ReactNode }) {
  const router = useRouter();
  const { run, dialog } = useReauth();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else if (n.size < 50) n.add(id); return n; });
  const all = ids.slice(0, 50);
  const go = async (decision: "approve" | "reject") => {
    if (decision === "reject" && note.trim().length < 5) { setMsg("Write a reason (at least 5 characters) to reject. The authors will see it."); return; }
    if (!window.confirm(`${decision === "approve" ? "Approve" : "Reject"} ${sel.size} item(s)?`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await run(() => api<{ done: number; skipped: number }>("/api/admin/bulk", { body: { kind, ids: [...sel], decision, note: note.trim() || undefined } }));
      setMsg(`${r.done} done${r.skipped ? `, ${r.skipped} skipped (already handled or conflict of interest)` : ""}.`);
      setSel(new Set()); setNote(""); router.refresh();
    } catch (e) { setMsg(e instanceof ClientApiError ? e.message : "Failed."); }
    finally { setBusy(false); }
  };
  return (
    <BulkCtx.Provider value={{ sel, toggle }}>
      {dialog}
      {ids.length > 1 && (
        <div className="sticky top-16 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-ink-line bg-ink/90 p-3 text-xs backdrop-blur">
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setSel(sel.size ? new Set() : new Set(all))}>{sel.size ? "Clear selection" : `Select all (${all.length})`}</button>
          <span className="text-text-muted">{sel.size} selected</span>
          {sel.size > 0 && (<>
            <input className="input max-w-xs py-1 text-xs" placeholder="Reason (needed to reject; shown to authors)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            <button disabled={busy} className="btn-positive px-3 py-1 text-xs" onClick={() => go("approve")}>Approve selected</button>
            <button disabled={busy} className="btn-danger px-3 py-1 text-xs" onClick={() => go("reject")}>Reject selected</button>
          </>)}
          {msg && <span role="status" className="text-text-muted">{msg}</span>}
        </div>
      )}
      {children}
    </BulkCtx.Provider>
  );
}

export function BulkCheck({ id, label }: { id: string; label: string }) {
  const c = useContext(BulkCtx);
  if (!c) return null;
  return <input type="checkbox" aria-label={`Select ${label}`} className="mr-2 h-4 w-4 accent-violet-500 align-middle" checked={c.sel.has(id)} onChange={() => c.toggle(id)} />;
}
