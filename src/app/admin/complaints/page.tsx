import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { can } from "@/lib/rbac";
import { AdminAction } from "@/components/admin/AdminAction";
import { Empty } from "@/components/ui/Card";
import { COMPLAINT_LABELS } from "@/lib/complaints";
import { ago } from "@/lib/time";

export default async function AdminComplaints() {
  const auth = await requirePageAuth("/admin/complaints");
  if (!can(auth.user.role, "mod.content.remove")) notFound();
  const rows = await withDb(auth.db, (tx) => tx.q<{ id: string; public_ref: string; category: keyof typeof COMPLAINT_LABELS; target_ref: string | null; body: string; status: string; created_at: Date; acknowledge_by: Date; due_at: Date; signed_in: boolean; mine: boolean }>(
    `SELECT id, public_ref, category, target_ref, body, status, created_at, acknowledge_by, due_at, user_id IS NOT NULL AS signed_in, (user_id = $1) AS mine
     FROM complaints WHERE status IN ('open','in_progress') ORDER BY (category = 'illegal_content') DESC, created_at LIMIT 200`, [auth.user.id]));
  const now = Date.now();
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Complaints</h1>
      <p className="mt-1 text-sm text-text-muted">Acknowledge within 2 working days, decide within 14. Illegal-content complaints are listed first. The handler must not be the moderator who made the decision being complained about.</p>
      <div className="mt-6 grid gap-3">{rows.length === 0 ? <Empty title="No open complaints" /> : rows.map((c) => (
        <div key={c.id} className={`glass p-4 text-sm ${c.category === "illegal_content" ? "border-neg/50" : ""}`}>
          <p className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{c.public_ref}</span><span className="chip border-ink-line">{COMPLAINT_LABELS[c.category]}</span><span className="chip border-ink-line">{c.status.replace("_", " ")}</span>
            <span className="text-xs text-text-muted">{ago(c.created_at)} · {c.signed_in ? "member" : "email only"}</span>
            {c.status === "open" && new Date(c.acknowledge_by).getTime() < now && <span className="chip border-neg/50 text-neg">Acknowledgement overdue</span>}
            {new Date(c.due_at).getTime() < now && <span className="chip border-neg/50 text-neg">Decision overdue</span>}</p>
          {c.target_ref && <p className="mt-2 break-all">About: {/^\/[A-Za-z0-9/_?=&%.-]*$/.test(c.target_ref) ? <a className="underline" href={c.target_ref}>{c.target_ref}</a> : c.target_ref}</p>}
          <p className="mt-2 whitespace-pre-wrap break-words rounded bg-ink/50 p-2">{c.body}</p>
          {c.mine ? <p className="mt-2 text-xs text-neg">Your own complaint. Another moderator must handle it.</p> : <div className="mt-3 flex flex-wrap gap-2">
            {c.status === "open" && <AdminAction endpoint={`/api/admin/complaints/${c.id}`} base={{ decision: "in_progress" }} label="Acknowledge and start" />}
            {(["upheld", "not_upheld", "closed"] as const).map((d) => (
              <AdminAction key={d} endpoint={`/api/admin/complaints/${c.id}`} base={{ decision: d }} label={d === "upheld" ? "Uphold" : d === "not_upheld" ? "Not upheld" : "Close (no action)"} tone={d === "upheld" ? "positive" : "ghost"}
                fields={[{ name: "note", label: "Response to the complainant", type: "textarea", required: true, min: 10, max: 4000, audience: "player" }, { name: "internalNote", label: "Internal note (optional)", type: "textarea", max: 2000, audience: "internal" }]} />
            ))}
          </div>}
        </div>))}</div>
    </div>
  );
}
