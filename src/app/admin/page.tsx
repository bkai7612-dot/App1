import Link from "next/link";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { can } from "@/lib/rbac";
import { gateStatus } from "@/lib/launch-gates";
import { env } from "@/lib/env";
import { CheckCircle2, XCircle } from "lucide-react";

export default async function AdminHome() {
  const auth = await requirePageAuth("/admin");
  const s = await withDb(auth.db, (tx) => tx.one<Record<string, string>>(`SELECT
    (SELECT count(*) FROM users WHERE deleted_at IS NULL) AS users,
    (SELECT count(*) FROM player_profiles WHERE deleted_at IS NULL) AS profiles,
    (SELECT count(*) FROM commendations WHERE deleted_at IS NULL) AS commendations,
    (SELECT count(*) FROM reports WHERE deleted_at IS NULL) AS reports,
    (SELECT count(*) FROM reports WHERE status IN ('submitted','under_review') AND deleted_at IS NULL) AS awaiting,
    (SELECT count(*) FROM reports WHERE status IN ('disputed','appealed') AND deleted_at IS NULL) AS disputed,
    (SELECT count(*) FROM report_appeals WHERE status IN ('submitted','under_review')) AS appeals,
    (SELECT count(*) FROM commendations WHERE status = 'pending') AS pending_comm,
    (SELECT count(*) FROM account_verifications WHERE status = 'pending' AND method IN ('manual_review','profile_code') AND (expires_at IS NULL OR expires_at > now())) AS pending_ver,
    (SELECT count(*) FROM report_responses WHERE status = 'pending') AS pending_resp,
    (SELECT count(*) FROM player_comments WHERE status = 'pending') AS pending_comments,
    (SELECT count(*) FROM comment_disputes WHERE status = 'open') AS open_disputes,
    (SELECT count(*) FROM player_votes) AS votes,
    (SELECT count(*) FROM complaints WHERE status IN ('open','in_progress')) AS complaints`));
  const spikes = await withDb(auth.db, (tx) => tx.q<{ public_id: string; display_name: string; n: string; down: string; young: string }>(
    `SELECT p.public_id, p.display_name, count(*) AS n, count(*) FILTER (WHERE v.value = -1) AS down, count(*) FILTER (WHERE v.counts_from > now()) AS young
     FROM player_votes v JOIN player_profiles p ON p.id = v.player_profile_id
     WHERE v.updated_at > now() - interval '24 hours' GROUP BY p.public_id, p.display_name HAVING count(*) >= 5 ORDER BY count(*) DESC LIMIT 10`));
  const subs = can(auth.user.role, "billing.view")
    ? await withDb(auth.db, (tx) => tx.one<{ n: string }>(`SELECT count(*) AS n FROM subscriptions WHERE status IN ('active','trialing') AND current_period_end > now()`))
    : null;
  const users = can(auth.user.role, "users.view") ? "/admin/users" : undefined;
  const ver = can(auth.user.role, "mod.verifications.review") ? "/admin/queue?tab=verifications" : undefined;
  // M-10: each counter links to the list behind it.
  const cards: [string, string | undefined, string | undefined][] = [
    ["Reports awaiting review", s?.awaiting, "/admin/reports?f=queue"], ["Disputed / appealed", s?.disputed, "/admin/reports?f=disputed"], ["Open appeals", s?.appeals, "/admin/queue?tab=appeals"], ["Comments awaiting approval", s?.pending_comments, "/admin/queue?tab=comments"],
    ["Comments reported inaccurate", s?.open_disputes, "/admin/queue?tab=disputes"], ["Commendation comments pending", s?.pending_comm, "/admin/queue?tab=commendations"], ["Ownership claims pending", s?.pending_ver, ver], ["Player responses pending", s?.pending_resp, "/admin/queue?tab=responses"], ["Open complaints", s?.complaints, can(auth.user.role, "mod.content.remove") ? "/admin/complaints" : undefined],
    ["Registered users", s?.users, users], ["Player profiles", s?.profiles, undefined], ["Commendations", s?.commendations, undefined], ["Report submissions", s?.reports, "/admin/reports?f=all"],
    ["Active subscriptions", subs?.n ?? "—", undefined], ["Community votes", s?.votes, undefined],
  ];
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Moderation overview</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([l, v, href]) => {
          const inner = <><p className="text-xs uppercase tracking-wider text-text-muted">{l}</p><p className="mt-1 font-display text-2xl font-semibold">{v ?? "0"}</p></>;
          return href ? <Link key={l} href={href} className="glass block p-5 hover:shadow-glow">{inner}</Link> : <div key={l} className="glass p-5">{inner}</div>;
        })}
      </div>
      <section className="glass mt-8 p-6">
        <h2 className="font-display text-lg font-semibold">Vote activity alerts <span className="text-sm font-normal text-text-muted">· last 24 hours, 5+ votes on one player</span></h2>
        <p className="mt-1 text-sm text-text-muted">Sudden pile-ons may be brigading. Votes from accounts under 72 hours old are held and don&apos;t count yet.</p>
        {spikes.length === 0 ? <p className="mt-3 text-sm text-text-muted">No unusual vote activity.</p> : (
          <ul className="mt-3 divide-y divide-ink-line text-sm">{spikes.map((v) => (
            <li key={v.public_id} className="flex flex-wrap items-center gap-3 py-2"><a className="underline" href={`/players/${v.public_id}`}>{v.display_name}</a><span className="text-text-muted">{v.public_id}</span>
              <span className="ml-auto">{v.n} votes · {v.down} down · <span className={Number(v.young) > 0 ? "text-amber-300" : "text-text-muted"}>{v.young} held (new accounts)</span></span></li>))}</ul>
        )}
      </section>
      {can(auth.user.role, "system.launch_gates.view") && (
        <section className="glass mt-8 p-6">
          <h2 className="font-display text-lg font-semibold">Production launch gates <span className="text-sm font-normal text-text-muted">· mode: {env.launchMode}</span></h2>
          <p className="mt-1 text-sm text-text-muted">In production mode, registration, payments, report submission and publication remain disabled until every required gate is approved in SS_LAUNCH_GATES_APPROVED, with written sign-off recorded in docs/COMPLIANCE.md.</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {gateStatus().map((g) => <li key={g.id} className="flex items-center gap-2 text-sm">{g.approved ? <CheckCircle2 className="h-4 w-4 text-pos" /> : <XCircle className="h-4 w-4 text-neg" />}{g.label}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
