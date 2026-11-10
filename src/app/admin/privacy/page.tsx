import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { can } from "@/lib/rbac";
import { AdminAction } from "@/components/admin/AdminAction";
import { Empty } from "@/components/ui/Card";

export default async function PrivacyAdmin() {
  const auth = await requirePageAuth("/admin/privacy");
  if (!can(auth.user.role, "privacy.requests.manage")) notFound();
  const d = await withDb(auth.db, async (tx) => ({
    dsr: await tx.q<{ id: string; kind: string; details: string | null; target_type: string | null; target_ref: string | null; status: string; created_at: Date; due_at: Date; email: string | null }>(
      `SELECT d.id, d.kind, d.details, d.target_type, d.target_ref, d.status, d.created_at, d.due_at, u.email FROM data_subject_requests d LEFT JOIN users u ON u.id = d.user_id WHERE d.status IN ('open','in_progress') ORDER BY d.due_at`),
    recovery: await tx.q<{ id: string; email_normalized: string; details: string; created_at: Date; matched: boolean }>(
      `SELECT id, email_normalized, details, created_at, user_id IS NOT NULL AS matched FROM account_recovery_requests WHERE status = 'pending' ORDER BY created_at`),
  }));
  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-semibold">Data subject requests</h1>
        <p className="mt-1 text-sm text-text-muted">Statutory deadline: one month (extendable in limited cases). Verify identity before disclosing data.</p>
        <div className="mt-4 grid gap-2">{d.dsr.length === 0 ? <Empty title="No open requests" /> : d.dsr.map((r) => (
          <div key={r.id} className="glass p-4 text-sm"><p><strong>{r.kind}</strong> · {r.email ?? "deleted user"} · due {new Date(r.due_at).toLocaleDateString("en-GB", { dateStyle: "medium" })} · {r.status}</p>{r.target_type && <p className="mt-1">About: {r.target_type.replace(/_/g, " ")}{r.target_ref ? ` · ${r.target_ref}` : ""}</p>}{r.details && <p className="mt-2 whitespace-pre-wrap text-text-muted">{r.details}</p>}
            <div className="mt-3 flex flex-wrap gap-2">{(["in_progress", "completed", "refused"] as const).map((s) => <AdminAction key={s} endpoint={`/api/admin/privacy/${r.id}`} base={{ status: s }} label={s.replace("_", " ")} fields={[{ name: "note", label: "Response / reasoning (sent to user)", type: "textarea", required: true, min: 5, max: 4000 }]} />)}</div></div>))}</div>
      </section>
      <section>
        <h2 className="font-display text-xl font-semibold">Account recovery requests</h2>
        <p className="mt-1 text-sm text-text-muted">Approve only after out-of-band verification (e.g. confirming control of the account email plus account-specific details). Record the checks performed. Requires re-authentication.</p>
        <div className="mt-4 grid gap-2">{d.recovery.length === 0 ? <Empty title="No pending requests" /> : d.recovery.map((r) => (
          <div key={r.id} className="glass p-4 text-sm"><p>{r.email_normalized} · {r.matched ? "matches an account" : <span className="text-amber-300">no matching account</span>} · {new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p><p className="mt-2 whitespace-pre-wrap text-text-muted">{r.details}</p>
            <div className="mt-3 flex gap-2">{(["approve", "reject"] as const).map((x) => <AdminAction key={x} endpoint={`/api/admin/recovery/${r.id}`} base={{ decision: x }} label={x} tone={x === "approve" ? "danger" : "ghost"} fields={[{ name: "note", label: "Checks performed / reason", type: "textarea", required: true, min: 20, max: 1000 }]} />)}</div></div>))}</div>
      </section>
    </div>
  );
}
