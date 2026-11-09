import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { can } from "@/lib/rbac";
import { ReportStatusBadge } from "@/components/ui/Badges";
import { Notice } from "@/components/ui/Card";
import { AdminAction } from "@/components/admin/AdminAction";
import { REPORT_LABELS } from "@/lib/categories";

const dt = (d: Date | null) => (d ? new Date(d).toLocaleString("en-GB") : "—");

export default async function AdminReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const auth = await requirePageAuth(`/admin/reports/${id}`);
  const data = await withDb(auth.db, async (tx) => {
    const r = await tx.one<{ id: string; public_ref: string; category: string; status: string; description: string; incident_date: Date; flags: string[]; public_summary: string | null; outcome_type: string | null; outcome_note: string | null; info_request_note: string | null; info_requested_at: Date | null; created_at: Date; is_demo: boolean;
      reporter_user_id: string | null; reporter_name: string | null; reporter_created: Date | null; player: string; public_id: string; owner_user_id: string | null; game: string; platform: string }>(
      `SELECT r.*, u.display_name AS reporter_name, u.created_at AS reporter_created, p.display_name AS player, p.public_id, p.owner_user_id, g.name AS game, pl.name AS platform
       FROM reports r JOIN player_profiles p ON p.id = r.player_profile_id JOIN games g ON g.id = r.game_id JOIN platforms pl ON pl.id = r.platform_id
       LEFT JOIN users u ON u.id = r.reporter_user_id WHERE r.id = $1`, [id]);
    if (!r) return null;
    const evidence = await tx.q<{ id: string; stored_mime: string; size_bytes: number }>(`SELECT id, stored_mime, size_bytes FROM report_evidence WHERE report_id = $1 AND deleted_at IS NULL AND scan_status = 'clean'`, [id]);
    const history = await tx.q<{ action: string; from_status: string | null; to_status: string | null; note: string | null; created_at: Date; moderator: string | null }>(
      `SELECT m.action, m.from_status, m.to_status, m.note, m.created_at, u.display_name AS moderator FROM moderation_actions m LEFT JOIN users u ON u.id = m.moderator_id
       WHERE m.target_type = 'report' AND m.target_id = $1 ORDER BY m.created_at`, [id]);
    const reporterStats = r.reporter_user_id ? await tx.one<Record<string, string>>(
      `SELECT count(*) AS total, count(*) FILTER (WHERE status IN ('published','disputed','appealed','resolved')) AS published,
              count(*) FILTER (WHERE status IN ('rejected','removed')) AS rejected, count(DISTINCT player_profile_id) AS distinct_targets,
              count(*) FILTER (WHERE created_at > now() - interval '7 days') AS last7
       FROM reports WHERE reporter_user_id = $1`, [r.reporter_user_id]) : null;
    const responses = await tx.q<{ id: string; body: string; status: string; created_at: Date }>(`SELECT id, body, status, created_at FROM report_responses WHERE report_id = $1 ORDER BY created_at`, [id]);
    const appeals = await tx.q<{ id: string; grounds: string; status: string; decision_note: string | null; created_at: Date }>(`SELECT id, grounds, status, decision_note, created_at FROM report_appeals WHERE report_id = $1 ORDER BY created_at`, [id]);
    const others = await tx.one<{ n: string }>(`SELECT count(*) AS n FROM reports WHERE player_profile_id = (SELECT player_profile_id FROM reports WHERE id = $1) AND id <> $1`, [id]);
    return { r, evidence, history, reporterStats, responses, appeals, others: Number(others?.n ?? 0) };
  });
  if (!data) notFound();
  const { r } = data;
  const conflict = r.reporter_user_id === auth.user.id || r.owner_user_id === auth.user.id;
  const ep = `/api/admin/reports/${r.id}`;
  const senior = can(auth.user.role, "mod.content.remove");
  return (
    <div className="space-y-6">
      <Link href="/admin/reports" className="text-sm text-text-muted hover:text-text">← Reports</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold">Report {r.public_ref}</h1>
        <ReportStatusBadge status={r.status} audience="internal" />
        {r.is_demo && <span className="chip border-amber-400/50 text-amber-300">Demo data</span>}
      </div>
      {conflict && <Notice tone="danger">Conflict of interest: you submitted this report or own the reported profile. Another moderator must handle it.</Notice>}
      {r.flags.length > 0 && <Notice tone="warn">Automated abuse signals: {r.flags.map((f) => f.replace(/_/g, " ")).join(", ")}. Treat as context, not proof.</Notice>}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="glass p-6">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="label">Reported player</dt><dd><Link className="underline" href={`/players/${r.public_id}`}>{r.player}</Link> · {r.game} · {r.platform}</dd></div>
            <div><dt className="label">Category</dt><dd>{REPORT_LABELS[r.category]}</dd></div>
            <div><dt className="label">Incident date</dt><dd>{new Date(r.incident_date).toLocaleDateString("en-GB")}</dd></div>
            <div><dt className="label">Submitted</dt><dd>{dt(r.created_at)}</dd></div>
          </dl>
          <p className="label mt-5">Reporter&apos;s private description (never published)</p>
          <p className="whitespace-pre-wrap break-words rounded-xl border border-ink-line bg-ink/50 p-4 text-sm">{r.description}</p>
          <p className="label mt-5">Private evidence ({data.evidence.length})</p>
          {data.evidence.length === 0 ? <p className="text-sm text-text-muted">None supplied.</p> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.evidence.map((e) => (
                <a key={e.id} href={`/api/evidence/${e.id}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-ink-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/evidence/${e.id}`} alt="Evidence screenshot (private)" className="h-32 w-full object-cover" referrerPolicy="no-referrer" />
                </a>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-text-muted">Viewing evidence is logged in the audit trail.</p>
          {r.public_summary && (<><p className="label mt-5">Published summary</p><p className="text-sm">{r.public_summary}</p></>)}
          {r.outcome_note && (<><p className="label mt-5">Outcome ({r.outcome_type})</p><p className="text-sm">{r.outcome_note}</p></>)}
          {r.info_requested_at && <p className="mt-4 text-sm text-sky-300">Information requested {dt(r.info_requested_at)}: {r.info_request_note}</p>}
        </section>

        <aside className="space-y-6">
          <section className="glass p-6">
            <h2 className="font-display font-semibold">Actions</h2>
            {conflict ? <p className="mt-2 text-sm text-text-muted">Unavailable (conflict of interest).</p> : (
              <div className="mt-3 flex flex-col items-start gap-2">
                {r.status === "submitted" && <AdminAction endpoint={ep} base={{ action: "start_review" }} label="Start review" tone="primary" />}
                {r.status === "under_review" && (<>
                  <AdminAction endpoint={ep} base={{ action: "publish" }} label="Publish as allegation" tone="primary"
                    fields={[{ name: "publicSummary", label: "Neutral public summary (no personal data, no evidence, framed as an allegation)", type: "textarea", required: true, min: 20, max: 1000, placeholder: "A community member alleges that this player repeatedly used abusive language in voice chat during a ranked match." }, { name: "note", label: "Internal reasoning", type: "textarea", max: 2000 }]} />
                  <AdminAction endpoint={ep} base={{ action: "request_info" }} label="Request more information" fields={[{ name: "note", label: "Question for the reporter", type: "textarea", required: true, min: 10, max: 1000 }]} />
                </>)}
                {["submitted", "under_review"].includes(r.status) && <AdminAction endpoint={ep} base={{ action: "reject" }} label="Reject" tone="danger" fields={[{ name: "note", label: "Reason (recorded)", type: "textarea", required: true, min: 5, max: 2000 }]} />}
                {senior && ["published", "disputed"].includes(r.status) && <AdminAction endpoint={ep} base={{ action: "resolve" }} label="Record moderation outcome" fields={[{ name: "outcomeType", label: "Outcome", type: "select", required: true, options: [{ value: "upheld", label: "Upheld (stays public as resolved outcome)" }, { value: "not_upheld", label: "Not upheld (hidden from public)" }] }, { name: "outcomeNote", label: "Outcome statement (public if upheld)", type: "textarea", required: true, min: 10, max: 1000 }]} />}
                {senior && ["published", "disputed", "appealed", "resolved"].includes(r.status) && <AdminAction endpoint={ep} base={{ action: "remove" }} label="Remove from public" tone="danger" fields={[{ name: "note", label: "Reason (recorded)", type: "textarea", required: true, min: 5, max: 2000 }]} />}
              </div>
            )}
          </section>
          <section className="glass p-6 text-sm">
            <h2 className="font-display font-semibold">Reporter history</h2>
            <p className="mt-1 text-xs text-text-muted">Confidential. Never disclosed to the reported player or the public.</p>
            {r.reporter_user_id ? (<>
              <p className="mt-3">{can(auth.user.role, "users.view") ? <Link className="underline" href={`/admin/users/${r.reporter_user_id}`}>{r.reporter_name}</Link> : r.reporter_name} · account since {r.reporter_created ? new Date(r.reporter_created).toLocaleDateString("en-GB") : "?"}</p>
              <ul className="mt-2 space-y-1 text-text-muted">
                <li>Total reports: {data.reporterStats?.total} (last 7 days: {data.reporterStats?.last7})</li>
                <li>Published: {data.reporterStats?.published} · Rejected/removed: {data.reporterStats?.rejected}</li>
                <li>Distinct players reported: {data.reporterStats?.distinct_targets}</li>
              </ul>
            </>) : <p className="mt-2 text-text-muted">Reporter account deleted.</p>}
            <p className="mt-3 text-text-muted">Other reports about this player: {data.others}</p>
          </section>
        </aside>
      </div>

      {(data.responses.length > 0 || data.appeals.length > 0) && (
        <section className="glass p-6">
          <h2 className="font-display font-semibold">Player responses and appeals</h2>
          {data.responses.map((x) => <div key={x.id} className="mt-3 rounded-lg border border-ink-line p-3 text-sm"><span className="chip border-ink-line">Response · {x.status}</span><p className="mt-2 whitespace-pre-wrap">{x.body}</p>
            {x.status === "pending" && <div className="mt-2 flex gap-2"><AdminAction endpoint={`/api/admin/responses/${x.id}`} base={{ decision: "publish" }} label="Publish response" tone="positive" /><AdminAction endpoint={`/api/admin/responses/${x.id}`} base={{ decision: "reject" }} label="Reject" tone="danger" fields={[{ name: "note", label: "Reason shown to player", type: "textarea", min: 5, max: 1000, required: true }]} /></div>}</div>)}
          {data.appeals.map((a) => <div key={a.id} className="mt-3 rounded-lg border border-ink-line p-3 text-sm"><span className="chip border-ink-line">Appeal · {a.status.replace("_", " ")}</span><p className="mt-2 whitespace-pre-wrap">{a.grounds}</p>{a.decision_note && <p className="mt-2 text-text-muted">Decision: {a.decision_note}</p>}
            {can(auth.user.role, "mod.appeals.decide") && ["submitted", "under_review"].includes(a.status) && <div className="mt-2 flex flex-wrap gap-2">
              {a.status === "submitted" && <AdminAction endpoint={`/api/admin/appeals/${a.id}`} base={{ decision: "start_review" }} label="Start appeal review" />}
              <AdminAction endpoint={`/api/admin/appeals/${a.id}`} base={{ decision: "upheld" }} label="Uphold appeal (remove report)" tone="positive" fields={[{ name: "note", label: "Reasons", type: "textarea", required: true, min: 10, max: 2000 }]} />
              <AdminAction endpoint={`/api/admin/appeals/${a.id}`} base={{ decision: "rejected" }} label="Reject appeal (report stands)" tone="danger" fields={[{ name: "note", label: "Reasons", type: "textarea", required: true, min: 10, max: 2000 }]} />
            </div>}</div>)}
        </section>
      )}

      <section className="glass p-6">
        <h2 className="font-display font-semibold">Moderation history</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {data.history.length === 0 ? <li className="text-text-muted">No actions yet.</li> : data.history.map((h, i) => (
            <li key={i} className="border-l-2 border-violet-brand/40 pl-3"><span className="font-medium">{h.action.replace(/_/g, " ")}</span> {h.from_status && <span className="text-text-muted">({h.from_status} → {h.to_status})</span>} · {h.moderator ?? "reporter"} · <span className="text-text-muted">{dt(h.created_at)}</span>{h.note && <p className="text-text-muted">{h.note}</p>}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
