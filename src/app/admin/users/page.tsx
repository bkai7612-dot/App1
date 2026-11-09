import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { can, ROLE_LABELS, type Role } from "@/lib/rbac";

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const auth = await requirePageAuth("/admin/users");
  if (!can(auth.user.role, "users.view")) notFound();
  const q = ((await searchParams).q ?? "").slice(0, 100).trim().toLowerCase();
  const rows = await withDb(auth.db, (tx) => tx.q<{ id: string; display_name: string; email: string; role: Role; created_at: Date; suspended_at: Date | null; reporting_restricted_until: Date | null; mfa_enabled: boolean }>(
    `SELECT id, display_name, email, role, created_at, suspended_at, reporting_restricted_until, mfa_enabled FROM users
     WHERE deleted_at IS NULL AND ($1 = '' OR email_normalized LIKE '%' || $1 || '%' OR lower(display_name) LIKE '%' || $1 || '%' OR id::text = $1)
     ORDER BY created_at DESC LIMIT 100`, [q.replace(/[%_\\]/g, "")]));
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Users</h1>
      <form className="mt-4 flex gap-2"><input name="q" defaultValue={q} className="input max-w-md" placeholder="Search email, name or ID" aria-label="Search users" /><button className="btn-ghost">Search</button></form>
      <div className="glass mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-text-muted"><tr><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">MFA</th><th className="p-3">Status</th><th className="p-3">Joined</th></tr></thead>
          <tbody className="divide-y divide-ink-line">{rows.map((u) => (
            <tr key={u.id}><td className="p-3"><Link className="underline" href={`/admin/users/${u.id}`}>{u.display_name}</Link><div className="text-xs text-text-muted">{u.email}</div></td>
              <td className="p-3">{ROLE_LABELS[u.role]}</td><td className="p-3">{u.mfa_enabled ? "Yes" : "No"}</td>
              <td className="p-3">{u.suspended_at ? <span className="text-neg">Suspended</span> : u.reporting_restricted_until && u.reporting_restricted_until > new Date() ? <span className="text-amber-300">Reporting restricted</span> : "Active"}</td>
              <td className="p-3 text-text-muted">{new Date(u.created_at).toLocaleDateString("en-GB")}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
