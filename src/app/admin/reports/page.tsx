import Link from "next/link";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { ReportStatusBadge } from "@/components/ui/Badges";
import { Empty } from "@/components/ui/Card";
import { REPORT_LABELS } from "@/lib/categories";
import { ago } from "@/lib/time";

const FILTERS = [["queue", "Awaiting review"], ["published", "Published"], ["disputed", "Disputed / appealed"], ["closed", "Closed"], ["all", "All"]] as const;
const WHERE: Record<string, string> = {
  queue: "r.status IN ('submitted','under_review')",
  published: "r.status = 'published'",
  disputed: "r.status IN ('disputed','appealed')",
  closed: "r.status IN ('resolved','rejected','removed')",
  all: "true",
};

export default async function AdminReports({ searchParams }: { searchParams: Promise<{ f?: string; profile?: string }> }) {
  const auth = await requirePageAuth("/admin/reports");
  const sp = await searchParams;
  const f = sp.f && WHERE[sp.f] ? sp.f : "queue";
  const profile = sp.profile && /^[A-Za-z0-9_-]{4,40}$/.test(sp.profile) ? sp.profile : null;
  const rows = await withDb(auth.db, (tx) => tx.q<{ id: string; public_ref: string; category: string; status: string; flags: string[]; created_at: Date; player: string; evidence: string; info_requested_at: Date | null; info_replied_at: Date | null; assignee: string | null; assigned_at: Date | null }>(
    `SELECT r.id, r.public_ref, r.category, r.status, r.flags, r.created_at, r.info_requested_at, r.info_replied_at, p.display_name AS player,
            a.display_name AS assignee, r.assigned_at,
            (SELECT count(*) FROM report_evidence e WHERE e.report_id = r.id AND e.deleted_at IS NULL) AS evidence
     FROM reports r JOIN player_profiles p ON p.id = r.player_profile_id LEFT JOIN users a ON a.id = r.assigned_moderator_id
     WHERE r.deleted_at IS NULL AND ${WHERE[f]} AND ($1::text IS NULL OR p.public_id = $1) ORDER BY r.created_at ASC LIMIT 200`, [profile]));
  const q = (k: string) => `/admin/reports?f=${k}${profile ? `&profile=${profile}` : ""}`;
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Reports</h1>
      {profile && <p className="mt-2 text-sm text-text-muted">Showing reports about one player. <Link className="underline" href={`/admin/reports?f=${f}`}>Clear filter</Link></p>}
      <div className="mt-4 flex flex-wrap gap-2">{FILTERS.map(([k, l]) => <Link key={k} href={q(k)} className={`chip px-3 py-1 ${f === k ? "border-violet-brand/60 bg-violet-brand/10 text-violet-lavender" : "border-ink-line text-text-muted"}`}>{l}</Link>)}</div>
      <div className="mt-6 grid gap-2">
        {rows.length === 0 ? <Empty title="Nothing here" /> : rows.map((r) => (
          <Link key={r.id} href={`/admin/reports/${r.id}`} className="glass flex flex-wrap items-center gap-3 p-4 hover:shadow-glow">
            <ReportStatusBadge status={r.status} audience="internal" />
            <span className="font-mono text-xs">{r.public_ref}</span>
            <span className="text-sm">{REPORT_LABELS[r.category]} · {r.player}</span>
            {r.info_replied_at ? <span className="chip border-emerald-400/40 text-emerald-300">Reply received</span> : r.info_requested_at && <span className="chip border-sky-400/40 text-sky-300">Info requested</span>}
            {r.assignee && <span className="chip border-violet-brand/40 text-violet-lavender">{r.assignee}{r.assigned_at ? ` · ${ago(r.assigned_at)}` : ""}</span>}
            {r.flags.map((fl) => <span key={fl} className="chip border-amber-400/40 text-amber-300">{fl.replace(/_/g, " ")}</span>)}
            <span className="ml-auto text-xs text-text-muted">{r.evidence} file(s) · <span title={new Date(r.created_at).toLocaleString("en-GB")}>{ago(r.created_at)}</span></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
