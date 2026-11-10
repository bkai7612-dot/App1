import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { can } from "@/lib/rbac";

export default async function Audit({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const auth = await requirePageAuth("/admin/audit");
  if (!can(auth.user.role, "audit.view")) notFound();
  const action = ((await searchParams).action ?? "").slice(0, 80);
  const rows = await withDb(auth.db, (tx) => tx.q<{ id: string; actor: string | null; actor_role: string; action: string; target_type: string | null; target_id: string | null; detail: unknown; created_at: Date; hash: string }>(
    `SELECT a.id, u.display_name AS actor, a.actor_role, a.action, a.target_type, a.target_id, a.detail, a.created_at, a.hash
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id WHERE ($1 = '' OR a.action LIKE $1 || '%') ORDER BY a.id DESC LIMIT 200`, [action.replace(/[%_\\]/g, "")]));
  const chain = await withDb(auth.db, (tx) => tx.one<{ broken: string }>(
    `SELECT count(*) AS broken FROM (SELECT hash, prev_hash, lag(hash) OVER (ORDER BY id) AS expected FROM audit_logs) t WHERE expected IS NOT NULL AND prev_hash <> expected`));
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Audit log</h1>
      <p className="mt-1 text-sm text-text-muted">Append-only and hash-chained. Chain integrity: {Number(chain?.broken ?? 0) === 0 ? <span className="text-pos">intact</span> : <span className="text-neg">{chain?.broken} break(s) detected. Investigate.</span>}</p>
      <form className="mt-4 flex gap-2"><input name="action" defaultValue={action} className="input max-w-sm" placeholder="Filter by action prefix e.g. moderation." aria-label="Filter" /><button className="btn-ghost">Filter</button></form>
      <div className="glass mt-6 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="uppercase tracking-wider text-text-muted"><tr><th className="p-3">#</th><th className="p-3">Time</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Target</th><th className="p-3">Detail</th></tr></thead>
          <tbody className="divide-y divide-ink-line">{rows.map((r) => (
            <tr key={r.id}><td className="p-3 font-mono">{r.id}</td><td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td><td className="p-3">{r.actor ?? "system"} <span className="text-text-muted">({r.actor_role})</span></td>
              <td className="p-3 font-mono">{r.action}</td><td className="p-3 font-mono">{r.target_type}:{r.target_id?.slice(0, 8)}</td><td className="max-w-xs truncate p-3 font-mono text-text-muted">{JSON.stringify(r.detail)}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
