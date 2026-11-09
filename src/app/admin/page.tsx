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
    (SELECT count(*) FROM account_verifications WHERE status = 'pending' AND method = 'manual_review') AS pending_ver,
    (SELECT count(*) FROM report_responses WHERE status = 'pending') AS pending_resp`));
  const subs = can(auth.user.role, "billing.view")
    ? await withDb(auth.db, (tx) => tx.one<{ n: string }>(`SELECT count(*) AS n FROM subscriptions WHERE status IN ('active','trialing') AND current_period_end > now()`))
    : null;
  const cards: [string, string | undefined][] = [
    ["Registered users", s?.users], ["Player profiles", s?.profiles], ["Commendations", s?.commendations], ["Report submissions", s?.reports],
    ["Reports awaiting review", s?.awaiting], ["Disputed / appealed", s?.disputed], ["Open appeals", s?.appeals], ["Active subscriptions", subs?.n ?? "—"],
    ["Commendation comments pending", s?.pending_comm], ["Ownership claims pending", s?.pending_ver], ["Player responses pending", s?.pending_resp],
  ];
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Moderation overview</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([l, v]) => <div key={l} className="glass p-5"><p className="text-xs uppercase tracking-wider text-text-muted">{l}</p><p className="mt-1 font-display text-2xl font-semibold">{v ?? "0"}</p></div>)}
      </div>
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
