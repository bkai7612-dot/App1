import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { assignableRoles, can, ROLE_LABELS, type Role } from "@/lib/rbac";
import Link from "next/link";
import { AdminAction } from "@/components/admin/AdminAction";
import { ago } from "@/lib/time";

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
    const about = await tx.q<{ action: string; note: string | null; created_at: Date; moderator: string | null }>(
      `SELECT m.action, m.note, m.created_at, x.display_name AS moderator FROM moderation_actions m LEFT JOIN users x ON x.id = m.moderator_id
       WHERE m.target_type = 'user' AND m.target_id = $1 ORDER BY m.created_at DESC LIMIT 50`, [id]);
    const reports = await tx.q<{ id: string; public_ref: string; status: string; created_at: Date; player: string }>(
      `SELECT r.id, r.public_ref, r.status, r.created_at, p.display_name AS player FROM reports r JOIN player_profiles p ON p.id = r.player_profile_id WHERE r.reporter_user_id = $1 ORDER BY r.created_at DESC LIMIT 25`, [id]);
    const comms = await tx.q<{ id: string; category: string; status: string; created_at: Date; player: string; public_id: string }>(
      `SELECT c.id, c.category, c.status, c.created_at, p.display_name AS player, p.public_id FROM commendations c JOIN player_profiles p ON p.id = c.player_profile_id WHERE c.submitter_user_id = $1 ORDER BY c.created_at DESC LIMIT 25`, [id]);
    const comments = await tx.q<{ id: string; body: string; status: string; created_at: Date; player: string; public_id: string }>(
      `SELECT c.id, c.body, c.status, c.created_at, p.display_name AS player, p.public_id FROM player_comments c JOIN player_profiles p ON p.id = c.player_profile_id WHERE c.author_user_id = $1 ORDER BY c.created_at DESC LIMIT 25`, [id]);
    return { u, stats, events, modHistory, about, reports, comms, comments };
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
      <section className="glass p-6 text-sm">
        <h2 className="font-display font-semibold">Notes and actions about this user</h2>
        <p className="mt-1 text-xs text-text-muted">Staff only. Never shown to the user.</p>
        {d.about.length === 0 ? <p className="mt-2 text-text-muted">Nothing recorded yet.</p> : <ul className="mt-2 space-y-2">{d.about.map((m, i) => <li key={i} className="border-l-2 border-violet-brand/40 pl-3"><span className="font-medium">{m.action.replace(/_/g, " ")}</span> · {m.moderator ?? "system"} · <span className="text-text-muted" title={dt(m.created_at)}>{ago(m.created_at)}</span>{m.note && <p className="text-text-muted">{m.note}</p>}</li>)}</ul>}
        {!self && <div className="mt-3"><AdminAction endpoint={ep} base={{ action: "add_note" }} label="Add internal note" fields={[{ name: "reason", label: "Note", type: "textarea", required: true, min: 3, max: 2000, audience: "internal" }]} /></div>}
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="glass p-5 text-sm"><h2 className="font-display font-semibold">Reports submitted</h2>
          {d.reports.length === 0 ? <p className="mt-2 text-text-muted">None.</p> : <ul className="mt-2 space-y-1">{d.reports.map((r) => <li key={r.id}><Link className="underline" href={`/admin/reports/${r.id}`}>{r.public_ref}</Link> · {r.player} · <span className="text-text-muted">{r.status.replace("_", " ")} · {ago(r.created_at)}</span></li>)}</ul>}</div>
        <div className="glass p-5 text-sm"><h2 className="font-display font-semibold">Commendations given</h2>
          {d.comms.length === 0 ? <p className="mt-2 text-text-muted">None.</p> : <ul className="mt-2 space-y-1">{d.comms.map((c) => <li key={c.id}><Link className="underline" href={`/players/${c.public_id}?tab=positive`}>{c.player}</Link> · {c.category.replace(/_/g, " ")} · <span className="text-text-muted">{c.status} · {ago(c.created_at)}</span></li>)}</ul>}</div>
        <div className="glass p-5 text-sm"><h2 className="font-display font-semibold">Comments written</h2>
          {d.comments.length === 0 ? <p className="mt-2 text-text-muted">None.</p> : <ul className="mt-2 space-y-1">{d.comments.map((c) => <li key={c.id}><Link className="underline" href={`/players/${c.public_id}?tab=comments`}>{c.player}</Link> · <span className="text-text-muted">{c.status} · {ago(c.created_at)}</span><p className="truncate text-text-muted">{c.body}</p></li>)}</ul>}</div>
      </section>
      {d.modHistory.length > 0 && <section className="glass p-6 text-sm"><h2 className="font-display font-semibold">Moderation actions performed</h2><ul className="mt-2 space-y-1 text-text-muted">{d.modHistory.map((m, i) => <li key={i}>{m.action} on {m.target_type} · {dt(m.created_at)}</li>)}</ul></section>}
      {d.events.length > 0 && <section className="glass p-6 text-sm"><h2 className="font-display font-semibold">Security events</h2><ul className="mt-2 space-y-1 text-text-muted">{d.events.map((e, i) => <li key={i}>{e.event_type.replace(/_/g, " ")} · {dt(e.created_at)}</li>)}</ul></section>}
    </div>
  );
}
