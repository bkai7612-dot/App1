import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { assignableRoles, can, ROLE_LABELS, type Role } from "@/lib/rbac";
import { AdminAction } from "@/components/admin/AdminAction";

const dt = (d: Date | null) => (d ? new Date(d).toLocaleString("en-GB") : "—");

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const auth = await requirePageAuth(`/admin/users/${id}`);
  if (!can(auth.user.role, "users.view")) notFound();
  const d = await withDb(auth.db, async (tx) => {
    const u = await tx.one<{ id: string; display_name: string; email: string; role: Role; created_at: Date; suspended_at: Date | null; suspended_until: Date | null; suspension_reason: string | null; reporting_restricted_until: Date | null; mfa_enabled: boolean; email_verified_at: Date | null }>(
      `SELECT id, display_name, email, role, created_at, suspended_at, suspended_until, suspension_reason, reporting_restricted_until, mfa_enabled, email_verified_at FROM users WHERE id = $1`, [id]);
    if (!u) return null;
    const stats = await tx.one<Record<string, string>>(`SELECT
      (SELECT count(*) FROM reports WHERE reporter_user_id = $1) AS reports, (SELECT count(*) FROM reports WHERE reporter_user_id = $1 AND status IN ('rejected','removed')) AS rejected,
      (SELECT count(*) FROM commendations WHERE submitter_user_id = $1) AS commendations, (SELECT count(*) FROM player_profiles WHERE owner_user_id = $1) AS owned`, [id]);
    const events = can(auth.user.role, "audit.view") ? await tx.q<{ event_type: string; created_at: Date }>(`SELECT event_type, created_at FROM security_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`, [id]) : [];
    const modHistory = await tx.q<{ action: string; created_at: Date; target_type: string }>(
      `SELECT action, created_at, target_type FROM moderation_actions WHERE moderator_id = $1 ORDER BY created_at DESC LIMIT 30`, [id]);
    return { u, stats, events, modHistory };
  });
  if (!d) notFound();
  const { u } = d;
  const ep = `/api/admin/users/${u.id}`;
  const self = u.id === auth.user.id;
  const reason = { name: "reason", label: "Reason (recorded in audit log)", type: "textarea" as const, required: true, min: 5, max: 500 };
  const roles = assignableRoles(auth.user.role);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">{u.display_name}</h1>
      <section className="glass grid gap-3 p-6 text-sm sm:grid-cols-2">
        <p><span className="label">Email</span>{u.email} ({u.email_verified_at ? "verified" : "unverified"})</p>
        <p><span className="label">Role</span>{ROLE_LABELS[u.role]}</p>
        <p><span className="label">Joined</span>{dt(u.created_at)}</p>
        <p><span className="label">MFA</span>{u.mfa_enabled ? "Enabled" : "Not enabled"}</p>
        <p><span className="label">Suspension</span>{u.suspended_at ? `Since ${dt(u.suspended_at)} until ${u.suspended_until ? dt(u.suspended_until) : "indefinite"}: ${u.suspension_reason}` : "None"}</p>
        <p><span className="label">Reporting restricted until</span>{dt(u.reporting_restricted_until)}</p>
        <p><span className="label">Activity</span>{d.stats?.reports} reports ({d.stats?.rejected} rejected/removed) · {d.stats?.commendations} commendations · {d.stats?.owned} owned profiles</p>
      </section>
      {!self && (
        <section className="glass flex flex-col items-start gap-3 p-6">
          <h2 className="font-display font-semibold">Actions</h2>
          {can(auth.user.role, "users.suspend") && (u.suspended_at
            ? <AdminAction endpoint={ep} base={{ action: "unsuspend" }} label="Lift suspension" fields={[reason]} />
            : <AdminAction endpoint={ep} base={{ action: "suspend" }} label="Suspend account" tone="danger" fields={[{ name: "days", label: "Days (blank = indefinite)", type: "number", min: 1, max: 3650 }, reason]} />)}
          {can(auth.user.role, "users.restrict_reporting") && (u.reporting_restricted_until && u.reporting_restricted_until > new Date()
            ? <AdminAction endpoint={ep} base={{ action: "unrestrict_reporting" }} label="Restore reporting" fields={[reason]} />
            : <AdminAction endpoint={ep} base={{ action: "restrict_reporting" }} label="Restrict reporting" tone="danger" fields={[{ name: "days", label: "Days", type: "number", required: true, min: 1, max: 3650 }, reason]} />)}
          {can(auth.user.role, "users.suspend") && <AdminAction endpoint={ep} base={{ action: "revoke_sessions" }} label="Sign out all sessions" fields={[reason]} />}
          {can(auth.user.role, "users.roles.manage") && roles.includes(u.role) && (
            <AdminAction endpoint={ep} base={{ action: "set_role" }} label="Change role (requires re-auth)" fields={[{ name: "role", label: "New role", type: "select", required: true, options: roles.map((r) => ({ value: r, label: ROLE_LABELS[r] })) }, reason]} />
          )}
        </section>
      )}
      {d.modHistory.length > 0 && <section className="glass p-6 text-sm"><h2 className="font-display font-semibold">Moderation actions performed</h2><ul className="mt-2 space-y-1 text-text-muted">{d.modHistory.map((m, i) => <li key={i}>{m.action} on {m.target_type} · {dt(m.created_at)}</li>)}</ul></section>}
      {d.events.length > 0 && <section className="glass p-6 text-sm"><h2 className="font-display font-semibold">Security events</h2><ul className="mt-2 space-y-1 text-text-muted">{d.events.map((e, i) => <li key={i}>{e.event_type.replace(/_/g, " ")} · {dt(e.created_at)}</li>)}</ul></section>}
    </div>
  );
}
