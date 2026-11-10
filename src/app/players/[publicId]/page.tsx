import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarDays, Fingerprint, ThumbsUp, ShieldAlert, Info, Flag, Link2, UserCheck } from "lucide-react";
import { getAuth } from "@/lib/auth/session";
import { hasPlus } from "@/lib/server/entitlements";
import {
  getProfileByPublicId, getStats, getLinkedAccounts, getPublicCommendations, getPublicReports, getReputationHistory,
  getVoteStats, getPublicComments,
} from "@/lib/server/players";
import { withDb, SYSTEM } from "@/lib/db";
import { IdentityBadge, DemoBadge, ReportStatusBadge, IDENTITY_META } from "@/components/ui/Badges";
import { Empty, Notice } from "@/components/ui/Card";
import { PremiumLock } from "@/components/premium/PremiumLock";
import { CommendButton } from "@/components/feedback/CommendButton";
import { ClaimProfileButton } from "@/components/feedback/ClaimProfileButton";
import { OwnerReportActions } from "@/components/feedback/OwnerReportActions";
import { VoteButtons } from "@/components/feedback/VoteButtons";
import { verificationOptions } from "@/lib/server/verification-options";
import { withDb as withDb2, GUEST } from "@/lib/db";
import { CommentButton } from "@/components/feedback/CommentButton";
import { DisputeCommentButton } from "@/components/feedback/DisputeCommentButton";
import { COMMENDATION_LABELS, REPORT_LABELS } from "@/lib/categories";

type Props = { params: Promise<{ publicId: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicId } = await params;
  const p = await getProfileByPublicId(publicId);
  return { title: p ? `${p.display_name} (${p.game_name})` : "Player not found", robots: { index: false } };
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "positive", label: "Positive Feedback" },
  { id: "comments", label: "Comments" },
  { id: "negative", label: "Negative Reports" },
  { id: "linked", label: "Linked Accounts" },
  { id: "history", label: "Reputation History" },
];

const fmtDate = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default async function PlayerPage({ params, searchParams }: Props) {
  const { publicId } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab! : "overview";
  const profile = await getProfileByPublicId(publicId);
  if (!profile) notFound();
  const auth = await getAuth();
  const viewer = auth && !auth.pendingMfa ? auth : null;
  const [stats, linked, plus, votes] = await Promise.all([
    getStats(profile.id), getLinkedAccounts(profile.id), viewer ? hasPlus(viewer.user.id) : Promise.resolve(false),
    getVoteStats(profile.id, viewer?.user.id),
  ]);
  const isOwner = !!viewer && profile.owner_user_id === viewer.user.id;
  const returnTo = `/players/${profile.public_id}?tab=${tab}`;
  const dType = await withDb2(GUEST, (tx) => tx.one<{ t: string | null }>(`SELECT discord_connection_type AS t FROM platforms WHERE slug = $1`, [profile.platform_slug]));
  const claimOptions = verificationOptions(profile.platform_slug, dType?.t ?? null);
  const canVote = !!viewer && !isOwner && viewer.user.mfaEnabled && viewer.session.mfaVerified && viewer.user.emailVerified;
  const voteReason = !viewer ? "Sign in to vote (free)." : isOwner ? "You can't vote on your own profile." : "Set up two-factor authentication in Account Settings to vote.";

  const STAT_ROWS = [
    { label: "Total submissions", value: stats.reports_total, help: "All negative reports ever submitted about this profile, in any state." },
    { label: "Published entries", value: stats.negative_published, help: "Reports a moderator reviewed and published as allegations (including disputed, under appeal, or upheld)." },
    { label: "Pending moderation", value: stats.reports_pending + stats.positive_pending, help: "Reports and commendation comments awaiting moderator review. Not visible publicly." },
    { label: "Disputed entries", value: stats.reports_disputed, help: "Published reports the profile owner has responded to or appealed." },
    { label: "Rejected or removed", value: stats.reports_rejected_removed, help: "Reports that did not meet our guidelines or were removed after review or appeal." },
  ];

  return (
    <div className="ambient">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {profile.is_demo && (
          <div className="mb-5"><Notice tone="warn"><strong>Demonstration profile.</strong> This player, their feedback and their reports are fictional and exist only to demonstrate ServerSentry.</Notice></div>
        )}

        {/* Header */}
        <section className="iris-border glass relative overflow-hidden p-6 sm:p-8" aria-labelledby="player-name">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <IdentityBadge status={profile.identity_status} />
                {profile.claimed && <span className="chip border-violet-brand/40 bg-violet-brand/10 text-violet-lavender"><UserCheck className="h-3.5 w-3.5" /> Claimed by owner</span>}
                {profile.is_demo && <DemoBadge />}
              </div>
              <h1 id="player-name" className="mt-3 break-words font-display text-3xl font-semibold tracking-tight sm:text-4xl">{profile.display_name}</h1>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm text-text-muted sm:grid-cols-2">
                <div><dt className="inline">Game: </dt><dd className="inline text-text">{profile.game_name}</dd></div>
                <div><dt className="inline">Platform: </dt><dd className="inline text-text">{profile.platform_name}</dd></div>
                <div className="flex items-center gap-1.5"><Fingerprint className="h-3.5 w-3.5" /><dt className="sr-only">ServerSentry ID</dt><dd className="font-mono text-xs text-text">{profile.public_id}</dd></div>
                <div className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /><dt className="inline">Profile created </dt><dd className="inline text-text">{fmtDate(profile.created_at)}</dd></div>
              </dl>
              <p className="mt-3 max-w-xl text-xs text-text-muted">{IDENTITY_META[profile.identity_status]?.desc}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col lg:items-stretch">
              {!isOwner && <CommendButton profileId={profile.id} signedIn={!!viewer} plus={plus} />}
              {!isOwner && <CommentButton profileId={profile.id} plus={plus} signedIn={!!viewer} />}
              {!isOwner && (
                <Link href={viewer ? `/players/${profile.public_id}/report` : `/login?next=/players/${profile.public_id}/report`} className="btn-ghost"><Flag className="h-4 w-4" /> Report behaviour</Link>
              )}
              {!profile.claimed && <ClaimProfileButton profileId={profile.id} signedIn={!!viewer} platformName={profile.platform_name} options={claimOptions} />}
            </div>
          </div>
          <div className="mt-6">
            <p className="label">Community votes</p>
            <VoteButtons profileId={profile.id} initial={{ upvotes: votes.upvotes, downvotes: votes.downvotes, myVote: votes.myVote }} canVote={canVote} reason={canVote ? undefined : voteReason} />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="rounded-xl border border-pos/25 bg-pos/[0.07] p-4">
              <p className="flex items-center gap-1.5 font-display text-3xl font-semibold text-pos"><ThumbsUp className="h-6 w-6" />+{stats.positive_total}</p>
              <p className="mt-1 text-xs text-text-muted">Positive commendations</p>
            </div>
            <div className="rounded-xl border border-neg/25 bg-neg/[0.07] p-4">
              <p className="flex items-center gap-1.5 font-display text-3xl font-semibold text-neg"><ShieldAlert className="h-6 w-6" />−{stats.negative_published}</p>
              <p className="mt-1 text-xs text-text-muted">Published negative reports</p>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <nav className="mt-8 flex gap-1 overflow-x-auto border-b border-ink-line" aria-label="Profile sections">
          {TABS.map((t) => (
            <Link key={t.id} href={`/players/${profile.public_id}?tab=${t.id}`} aria-current={tab === t.id ? "page" : undefined} scroll={false}
              className={`whitespace-nowrap px-4 py-3 text-sm transition ${tab === t.id ? "nav-active" : "text-text-muted hover:text-text"}`}>{t.label}</Link>
          ))}
        </nav>

        <div className="mt-6">
          {tab === "overview" && (
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <section className="glass p-6" aria-labelledby="stats-h">
                <h2 id="stats-h" className="font-display text-lg font-semibold">Community reputation statistics</h2>
                <p className="mt-1 text-sm text-text-muted">Positive and negative feedback are shown separately. ServerSentry does not calculate an overall score.</p>
                <dl className="mt-5 divide-y divide-ink-line">
                  <div className="flex items-start justify-between gap-4 py-3">
                    <dt><span className="text-sm">Positive commendations</span><p className="text-xs text-text-muted">Approved recognitions from other members.</p></dt>
                    <dd className="font-display text-lg font-semibold text-pos">+{stats.positive_total}</dd>
                  </div>
                  {STAT_ROWS.map((r) => (
                    <div key={r.label} className="flex items-start justify-between gap-4 py-3">
                      <dt><span className="text-sm">{r.label}</span><p className="text-xs text-text-muted">{r.help}</p></dt>
                      <dd className="font-display text-lg font-semibold">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <aside className="glass h-fit p-6">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Info className="h-5 w-5 text-violet-lavender" /> Reading this profile</h2>
                <ul className="mt-3 space-y-2.5 text-sm text-text-muted">
                  <li>Published reports are <strong className="text-text">community allegations</strong> reviewed by a moderator. They are not proof of misconduct.</li>
                  <li>A <strong className="text-text">disputed</strong> report means the player has responded or appealed.</li>
                  <li>A <strong className="text-text">resolved moderation outcome</strong> is a moderator decision after review. It is not a legal finding.</li>
                  <li>Reporter identities are never shown. Evidence is only ever seen by moderators.</li>
                  <li>Nobody can pay to remove reports or to improve their reputation.</li>
                </ul>
              </aside>
            </div>
          )}

          {tab === "positive" && (
            plus ? <PositiveList profileId={profile.id} /> :
            <PremiumLock title="Unlock Player Feedback" text="See what other players have said about this account." returnTo={returnTo} signedIn={!!viewer} />
          )}

          {tab === "comments" && (
            plus || isOwner ? <CommentsList profileId={profile.id} isOwner={isOwner} plus={plus} /> :
            <PremiumLock title="Unlock Player Comments" text="Read moderated comments from other players, and write your own." returnTo={returnTo} signedIn={!!viewer} />
          )}

          {tab === "negative" && (
            plus || isOwner ? <NegativeList profileId={profile.id} ownerUserId={isOwner ? viewer!.user.id : null} plus={plus} identity={profile.identity_status} /> :
            <PremiumLock title="Unlock Report Summaries" text="Read moderated report summaries, categories, dates and dispute or resolution status." returnTo={returnTo} signedIn={!!viewer} />
          )}

          {tab === "linked" && (
            <section className="glass p-6" aria-labelledby="linked-h">
              <h2 id="linked-h" className="flex items-center gap-2 font-display text-lg font-semibold"><Link2 className="h-5 w-5 text-violet-lavender" /> Linked accounts</h2>
              <p className="mt-1 text-sm text-text-muted">Accounts are never linked just because usernames match. Only the profile owner can add or remove links. Verification happens through official sign-in or moderator review.</p>
              {linked.length === 0 ? <div className="mt-5"><Empty title="No linked accounts">This profile was identified manually by username.</Empty></div> : (
                <ul className="mt-5 divide-y divide-ink-line">
                  {linked.map((a) => (
                    <li key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="font-medium">{a.username}</p><p className="text-xs text-text-muted">{a.platform_name} · linked {fmtDate(a.linked_at)}{a.last_verified_at ? ` · verified ${fmtDate(a.last_verified_at)}` : ""}</p></div>
                      <IdentityBadge status={a.verification_status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "history" && (
            plus ? <History profileId={profile.id} /> :
            <PremiumLock title="Unlock Reputation History" text="See how this player's feedback has changed month by month." returnTo={returnTo} signedIn={!!viewer} />
          )}
        </div>
      </div>
    </div>
  );
}

async function PositiveList({ profileId }: { profileId: string }) {
  const items = await getPublicCommendations(profileId);
  if (items.length === 0) return <Empty title="No commendations yet">Be the first to recognise this player.</Empty>;
  return (
    <ul className="grid gap-3">
      {items.map((c) => (
        <li key={c.id} className="glass p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="chip border-pos/40 bg-pos/10 text-pos"><ThumbsUp className="h-3.5 w-3.5" />{COMMENDATION_LABELS[c.category]}</span>
            <span className="text-xs text-text-muted">{fmtDate(c.created_at)}{c.is_demo ? " · demo" : ""}</span>
          </div>
          {c.comment ? <p className="mt-3 whitespace-pre-wrap break-words text-sm">{c.comment}</p> : <p className="mt-3 text-sm italic text-text-muted">No written comment.</p>}
        </li>
      ))}
    </ul>
  );
}

async function CommentsList({ profileId, isOwner, plus }: { profileId: string; isOwner: boolean; plus: boolean }) {
  const items = await getPublicComments(profileId);
  const toneCls: Record<string, string> = { positive: "border-pos/40 bg-pos/10 text-pos", neutral: "border-ink-line text-text-muted", negative: "border-neg/40 bg-neg/10 text-neg" };
  return (
    <div className="space-y-4">
      {isOwner && !plus && <Notice>These comments are on your account, so you can read them for free. If one is inaccurate, report it and a moderator will review it.</Notice>}
      {items.length === 0 ? <Empty title="No comments yet">Plus members can leave a comment. Every comment is checked by a moderator before it appears.</Empty> : (
        <ul className="grid gap-3">
          {items.map((c) => (
            <li key={c.id} className="glass p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`chip ${toneCls[c.tone]}`}>{c.tone[0].toUpperCase() + c.tone.slice(1)}</span>
                <span className="chip border-ink-line text-text-muted">Moderator approved</span>
                {c.dispute_status === "open" && <span className="chip border-amber-400/40 text-amber-300">Reported as inaccurate · under review</span>}
                {c.dispute_status === "rejected" && <span className="chip border-ink-line text-text-muted">Accuracy reviewed and kept</span>}
                <span className="ml-auto text-xs text-text-muted">{fmtDate(c.created_at)}{c.is_demo ? " · demo" : ""}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm">{c.body}</p>
              {isOwner && c.dispute_status !== "open" && c.dispute_status !== "rejected" && <div className="mt-3 border-t border-ink-line pt-3"><DisputeCommentButton commentId={c.id} /></div>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-text-muted">Comments are written by ServerSentry Plus members and checked by moderators. They are personal opinions, not findings by ServerSentry. Authors are never shown.</p>
    </div>
  );
}

async function NegativeList({ profileId, ownerUserId, plus, identity }: { profileId: string; ownerUserId: string | null; plus: boolean; identity: string }) {
  const items = await getPublicReports(profileId);
  let ownerState: Record<string, { response: string | null; appeal: string | null }> = {};
  if (ownerUserId) {
    const rows = await withDb(SYSTEM, (tx) => tx.q<{ report_id: string; response: string | null; appeal: string | null }>(
      `SELECT r.id AS report_id,
         (SELECT status FROM report_responses x WHERE x.report_id = r.id AND x.author_user_id = $2 ORDER BY created_at DESC LIMIT 1) AS response,
         (SELECT status FROM report_appeals a WHERE a.report_id = r.id AND a.appellant_user_id = $2 ORDER BY created_at DESC LIMIT 1) AS appeal
       FROM public_reports r WHERE r.player_profile_id = $1`, [profileId, ownerUserId]));
    ownerState = Object.fromEntries(rows.map((r) => [r.report_id, r]));
  }
  return (
    <div className="space-y-4">
      {identity !== "verified" && !ownerUserId && <Notice tone="warn"><strong>Identity unverified.</strong> Nobody has proven they own this {"account"} yet. These reports are about whoever uses this username on this game and platform, which may not be the person you have in mind. If the owner verifies later, they can respond and appeal.</Notice>}
      {ownerUserId && !plus && <Notice>You are the verified owner of this profile, so you can see published reports about you and respond or appeal for free.</Notice>}
      {items.length === 0 ? <Empty title="No published reports">No reports about this profile have been published by moderators.</Empty> : (
        <ul className="grid gap-3">
          {items.map((r) => (
            <li key={r.id} className="glass p-5">
              <div className="flex flex-wrap items-center gap-2">
                <ReportStatusBadge status={r.status} />
                {identity !== "verified" && <span className="chip border-amber-400/40 text-amber-300">Identity unverified</span>}
                <span className="chip border-ink-line text-text-muted">{REPORT_LABELS[r.category]}</span>
                <span className="ml-auto text-xs text-text-muted">Ref {r.public_ref} · published {fmtDate(r.published_at)}{r.is_demo ? " · demo" : ""}</span>
              </div>
              <p className="mt-3 text-xs uppercase tracking-wider text-text-muted">Moderator summary of the allegation</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{r.public_summary}</p>
              {r.status === "resolved" && r.outcome_note && (
                <div className="mt-3 rounded-lg border border-violet-brand/30 bg-violet-brand/10 p-3 text-sm"><p className="text-xs uppercase tracking-wider text-violet-lavender">Moderation outcome · {fmtDate(r.resolved_at)}</p><p className="mt-1">{r.outcome_note}</p></div>
              )}
              {r.response && (
                <div className="mt-3 rounded-lg border border-ink-line bg-white/[0.02] p-3 text-sm"><p className="text-xs uppercase tracking-wider text-text-muted">Player&apos;s response</p><p className="mt-1 whitespace-pre-wrap break-words">{r.response}</p></div>
              )}
              {ownerUserId && <OwnerReportActions reportId={r.id} status={r.status} responseStatus={ownerState[r.id]?.response ?? null} appealStatus={ownerState[r.id]?.appeal ?? null} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function History({ profileId }: { profileId: string }) {
  const rows = await getReputationHistory(profileId);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.positive, r.negative)));
  return (
    <section className="glass p-6" aria-labelledby="hist-h">
      <h2 id="hist-h" className="font-display text-lg font-semibold">Reputation history (last 12 months)</h2>
      <p className="mt-1 text-sm text-text-muted">Approved commendations and published reports by month.</p>
      <div className="mt-6 flex h-48 items-end gap-2" role="img" aria-label="Monthly bar chart of positive and negative feedback">
        {rows.map((r) => (
          <div key={r.month} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-40 w-full items-end justify-center gap-0.5">
              <div className="w-1/2 max-w-3 rounded-t bg-pos/80" style={{ height: `${(r.positive / max) * 100}%` }} title={`${r.positive} positive`} />
              <div className="w-1/2 max-w-3 rounded-t bg-neg/80" style={{ height: `${(r.negative / max) * 100}%` }} title={`${r.negative} published reports`} />
            </div>
            <span className="text-[10px] text-text-muted">{r.month.slice(5)}</span>
          </div>
        ))}
      </div>
      <table className="sr-only"><caption>Monthly feedback</caption><thead><tr><th>Month</th><th>Positive</th><th>Published reports</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.month}><td>{r.month}</td><td>{r.positive}</td><td>{r.negative}</td></tr>)}</tbody></table>
      <div className="mt-4 flex gap-4 text-xs text-text-muted"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-pos/80" /> Positive</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-neg/80" /> Published reports</span></div>
    </section>
  );
}
