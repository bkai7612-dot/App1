import Link from "next/link";
import type { Metadata } from "next";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb, SYSTEM } from "@/lib/db";
import { PageHeader, Empty } from "@/components/ui/Card";
import { MeNav } from "@/components/account/MeNav";
import { ReportStatusBadge } from "@/components/ui/Badges";
import { REPORT_LABELS } from "@/lib/categories";
import { InfoReply } from "./InfoReply";

export const metadata: Metadata = { title: "My Reports" };
const d = (x: Date | null) => (x ? new Date(x).toLocaleDateString("en-GB") : "—");

export default async function MyReports() {
  const auth = await requirePageAuth("/me/reports");
  const submitted = await withDb(auth.db, (tx) => tx.q<{ id: string; public_ref: string; category: string; status: string; created_at: Date; info_request_note: string | null; info_requested_at: Date | null; player: string; public_id: string; evidence: string }>(
    `SELECT r.id, r.public_ref, r.category, r.status, r.created_at, r.info_request_note, r.info_requested_at, p.display_name AS player, p.public_id,
            (SELECT count(*) FROM report_evidence e WHERE e.report_id = r.id AND e.deleted_at IS NULL) AS evidence
     FROM reports r JOIN player_profiles p ON p.id = r.player_profile_id WHERE r.reporter_user_id = $1 AND r.deleted_at IS NULL ORDER BY r.created_at DESC`, [auth.user.id]));
  // Reports ABOUT profiles I own: only published (public) ones, and never the reporter identity.
  const aboutMe = await withDb(SYSTEM, (tx) => tx.q<{ id: string; public_ref: string; category: string; status: string; published_at: Date | null; player: string; public_id: string }>(
    `SELECT r.id, r.public_ref, r.category, r.status, r.published_at, p.display_name AS player, p.public_id
     FROM public_reports r JOIN player_profiles p ON p.id = r.player_profile_id WHERE p.owner_user_id = $1 ORDER BY r.published_at DESC`, [auth.user.id]));
  const appeals = await withDb(auth.db, (tx) => tx.q<{ id: string; status: string; created_at: Date; decision_note: string | null; public_ref: string }>(
    `SELECT a.id, a.status, a.created_at, a.decision_note, r.public_ref FROM report_appeals a JOIN public_reports r ON r.id = a.report_id WHERE a.appellant_user_id = $1 ORDER BY a.created_at DESC`, [auth.user.id]));
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader title="My Reports" subtitle="Reports you've submitted, reports about your profiles, and your appeals." />
      <MeNav active="/me/reports" />
      <section>
        <h2 className="font-display text-lg font-semibold">Reports you submitted</h2>
        <div className="mt-4 grid gap-3">
          {submitted.length === 0 ? <Empty title="No reports submitted" /> : submitted.map((r) => (
            <div key={r.id} className="glass p-4">
              <div className="flex flex-wrap items-center gap-2">
                <ReportStatusBadge status={r.status} audience="internal" />
                <span className="text-sm">{REPORT_LABELS[r.category]} · <Link className="underline" href={`/players/${r.public_id}`}>{r.player}</Link></span>
                <span className="ml-auto text-xs text-text-muted">{r.public_ref} · {d(r.created_at)} · {r.evidence} file(s)</span>
              </div>
              {r.info_requested_at && r.status === "under_review" && (
                <div className="mt-3 rounded-lg border border-sky-400/30 bg-sky-400/10 p-3 text-sm">
                  <p className="text-xs uppercase tracking-wider text-sky-300">A moderator asked for more information</p>
                  <p className="mt-1">{r.info_request_note}</p>
                  <InfoReply reportId={r.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Published reports about your profiles</h2>
        <p className="mt-1 text-sm text-text-muted">You can respond to or appeal these from the profile&apos;s Negative Reports tab. Reporter identities are never disclosed.</p>
        <div className="mt-4 grid gap-3">
          {aboutMe.length === 0 ? <Empty title="No published reports about you" /> : aboutMe.map((r) => (
            <Link key={r.id} href={`/players/${r.public_id}?tab=negative`} className="glass flex flex-wrap items-center gap-2 p-4 hover:shadow-glow">
              <ReportStatusBadge status={r.status} /><span className="text-sm">{REPORT_LABELS[r.category]} · {r.player}</span>
              <span className="ml-auto text-xs text-text-muted">{r.public_ref} · {d(r.published_at)}</span>
            </Link>
          ))}
        </div>
      </section>
      {appeals.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold">Your appeals</h2>
          <ul className="mt-4 grid gap-3">{appeals.map((a) => (
            <li key={a.id} className="glass p-4 text-sm"><span className="chip border-ink-line">{a.status.replace("_", " ")}</span> <span className="ml-2">Report {a.public_ref} · {d(a.created_at)}</span>{a.decision_note && <p className="mt-2 text-text-muted">{a.decision_note}</p>}</li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}
