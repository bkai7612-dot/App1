import Link from "next/link";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { can } from "@/lib/rbac";
import { AdminAction } from "@/components/admin/AdminAction";
import { Empty } from "@/components/ui/Card";
import { COMMENDATION_LABELS } from "@/lib/categories";
import { BulkProvider, BulkCheck } from "@/components/admin/Bulk";
import { ago } from "@/lib/time";
import { TabStrip } from "@/components/ui/ScrollActiveIntoView";

const TABS = [["comments", "Comments"], ["disputes", "Inaccurate-comment reports"], ["commendations", "Commendations"], ["verifications", "Verifications"], ["responses", "Responses"], ["appeals", "Appeals"], ["recent", "My recent decisions"]] as const;
type Tab = (typeof TABS)[number][0];

export default async function Queues({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const auth = await requirePageAuth("/admin/queue");
  const raw = (await searchParams).tab;
  const canVerify = can(auth.user.role, "mod.verifications.review");
  const tab: Tab = TABS.some(([k]) => k === raw) && (raw !== "verifications" || canVerify) ? (raw as Tab) : "comments";
  const me = auth.user.id;
  const q = await withDb(auth.db, async (tx) => ({
    comments: await tx.q<{ id: string; tone: string; body: string; created_at: Date; player: string; public_id: string; author: string | null; author_rejected: string; mine: boolean }>(
      `SELECT c.id, c.tone, c.body, c.created_at, p.display_name AS player, p.public_id, u.display_name AS author,
              (SELECT count(*) FROM player_comments x WHERE x.author_user_id = c.author_user_id AND x.status IN ('rejected','removed')) AS author_rejected,
              (c.author_user_id = $1 OR p.owner_user_id = $1) AS mine
       FROM player_comments c JOIN player_profiles p ON p.id = c.player_profile_id LEFT JOIN users u ON u.id = c.author_user_id
       WHERE c.status = 'pending' ORDER BY c.created_at LIMIT 100`, [me]),
    disputes: await tx.q<{ id: string; reason: string; created_at: Date; body: string; tone: string; comment_id: string; player: string; public_id: string; mine: boolean }>(
      `SELECT d.id, d.reason, d.created_at, c.body, c.tone, c.id AS comment_id, p.display_name AS player, p.public_id,
              (d.owner_user_id = $1 OR c.author_user_id = $1) AS mine
       FROM comment_disputes d JOIN player_comments c ON c.id = d.comment_id JOIN player_profiles p ON p.id = c.player_profile_id
       WHERE d.status = 'open' ORDER BY d.created_at LIMIT 100`, [me]),
    approvedComments: await tx.q<{ id: string; body: string; tone: string; player: string; public_id: string; created_at: Date; mine: boolean }>(
      `SELECT c.id, c.body, c.tone, p.display_name AS player, p.public_id, c.created_at, (c.author_user_id = $1 OR p.owner_user_id = $1) AS mine
       FROM player_comments c JOIN player_profiles p ON p.id = c.player_profile_id WHERE c.status = 'approved' ORDER BY c.created_at DESC LIMIT 30`, [me]),
    commendations: await tx.q<{ id: string; category: string; comment: string | null; created_at: Date; player: string; public_id: string; mine: boolean; submitter: string | null; submitter_since: Date | null; submitter_week: string; submitter_rejected: string }>(
      `SELECT c.id, c.category, c.comment, c.created_at, p.display_name AS player, p.public_id, (c.submitter_user_id = $1 OR p.owner_user_id = $1) AS mine,
              u.display_name AS submitter, u.created_at AS submitter_since,
              (SELECT count(*) FROM commendations x WHERE x.submitter_user_id = c.submitter_user_id AND x.created_at > now() - interval '7 days') AS submitter_week,
              (SELECT count(*) FROM commendations x WHERE x.submitter_user_id = c.submitter_user_id AND x.status IN ('rejected','removed')) AS submitter_rejected
       FROM commendations c JOIN player_profiles p ON p.id = c.player_profile_id LEFT JOIN users u ON u.id = c.submitter_user_id WHERE c.status = 'pending' ORDER BY c.created_at LIMIT 100`, [me]),
    recent: await tx.q<{ target_type: string; target_id: string; action: string; to_status: string | null; created_at: Date; summary: string | null }>(
      `SELECT m.target_type, m.target_id, m.action, m.to_status, m.created_at,
              CASE WHEN m.target_type = 'commendation' THEN (SELECT coalesce(c.comment, c.category::text) FROM commendations c WHERE c.id = m.target_id AND c.moderated_by = $1 AND c.status <> 'pending')
                   ELSE (SELECT c.body FROM player_comments c WHERE c.id = m.target_id AND c.moderated_by = $1 AND c.status <> 'pending') END AS summary
       FROM moderation_actions m WHERE m.moderator_id = $1 AND m.target_type IN ('commendation','player_comment') AND m.action <> 'undo'
         AND m.created_at > now() - interval '10 minutes' ORDER BY m.created_at DESC LIMIT 50`, [me]),
    verifications: await tx.q<{ id: string; kind: string; method: string; claim_note: string | null; verified_platform_user_id: string | null; created_at: Date; player: string; public_id: string; platform: string; claimant: string; username: string | null; mine: boolean; challenge_code: string | null; profile_url: string | null; has_shot: boolean; code_placed_at: Date | null }>(
      `SELECT v.id, v.kind, v.method, v.claim_note, v.verified_platform_user_id, v.created_at, v.challenge_code, v.profile_url, (v.evidence_key IS NOT NULL) AS has_shot, v.code_placed_at, p.display_name AS player, p.public_id, pl.name AS platform, u.display_name AS claimant, ga.username, (v.user_id = $1) AS mine
       FROM account_verifications v JOIN player_profiles p ON p.id = v.player_profile_id JOIN platforms pl ON pl.id = p.platform_id JOIN users u ON u.id = v.user_id
       LEFT JOIN gaming_accounts ga ON ga.id = v.gaming_account_id
       WHERE v.status = 'pending' AND v.method IN ('manual_review','profile_code') AND (v.expires_at IS NULL OR v.expires_at > now())
       ORDER BY (v.method = 'profile_code' AND v.code_placed_at IS NULL), v.code_placed_at NULLS LAST, v.created_at LIMIT 100`, [me]),
    responses: await tx.q<{ id: string; body: string; report_id: string; public_ref: string }>(
      `SELECT x.id, x.body, x.report_id, r.public_ref FROM report_responses x JOIN reports r ON r.id = x.report_id WHERE x.status = 'pending' ORDER BY x.created_at LIMIT 100`),
    appeals: await tx.q<{ id: string; report_id: string; public_ref: string; status: string; created_at: Date }>(
      `SELECT a.id, a.report_id, r.public_ref, a.status, a.created_at FROM report_appeals a JOIN reports r ON r.id = a.report_id WHERE a.status IN ('submitted','under_review') ORDER BY a.created_at LIMIT 100`),
  }));
const counts: Record<Tab, number> = { comments: q.comments.length, disputes: q.disputes.length, commendations: q.commendations.length, verifications: q.verifications.length, responses: q.responses.length, appeals: q.appeals.length, recent: q.recent.filter((r) => r.summary !== null).length };
  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl font-semibold">Moderation queues</h1>
      <TabStrip label="Queues" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" active={tab}>
        {TABS.filter(([k]) => k !== "verifications" || canVerify).map(([k, l]) => (
          <Link key={k} href={`/admin/queue?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`chip shrink-0 px-3 py-1 ${tab === k ? "border-violet-brand/60 bg-violet-brand/10 text-violet-lavender" : "border-ink-line text-text-muted"}`}>{l} <span className="ml-1 rounded-full bg-ink-line px-1.5 text-[11px]">{counts[k]}</span></Link>
        ))}
      </TabStrip>
      {tab === "comments" && (<>
      <section>
        <h2 className="font-display text-xl font-semibold">Player comments awaiting approval</h2>
        <p className="mt-1 text-sm text-text-muted">Written by Plus members. Approve only comments about in-game behaviour, with no personal information, slurs, threats or accusations of crimes. Approved comments appear on the player&apos;s account.</p>
        <BulkProvider kind="comment" ids={q.comments.filter((c) => !c.mine).map((c) => c.id)}><div className="mt-4 grid gap-2">{q.comments.length === 0 ? <Empty title="Queue empty" /> : q.comments.map((c) => (
          <div key={c.id} className="glass p-4 text-sm">
            <p>{!c.mine && <BulkCheck id={c.id} label={`comment on ${c.player}`} />}<span className="chip border-ink-line">{c.tone}</span> on <Link className="underline" href={`/players/${c.public_id}`}>{c.player}</Link> · by {c.author ?? "deleted user"}{Number(c.author_rejected) > 0 && <span className="ml-2 text-amber-300">({c.author_rejected} previous comments rejected/removed)</span>} · {ago(c.created_at)}</p>
            <p className="mt-2 whitespace-pre-wrap break-words rounded bg-ink/50 p-2">{c.body}</p>
            {c.mine ? <p className="mt-2 text-xs text-neg">Conflict of interest.</p> : <div className="mt-3 flex flex-wrap gap-2">
              <AdminAction endpoint={`/api/admin/comments/${c.id}`} base={{ decision: "approve" }} label="Approve and add to account" tone="positive" />
              <AdminAction endpoint={`/api/admin/comments/${c.id}`} base={{ decision: "reject" }} label="Reject" tone="danger" fields={[{ name: "note", label: "Reason", type: "textarea", required: true, min: 5, max: 1000, audience: "player", templates: ["Comments must be about in-game behaviour only.", "Comments can't include personal information.", "Comments can't accuse someone of a crime.", "Please keep comments civil and specific."] }, { name: "internalNote", label: "Internal note (optional)", type: "textarea", max: 2000, audience: "internal" }]} />
            </div>}
          </div>))}</div></BulkProvider>
      </section>
      <section>
        <h2 className="font-display text-xl font-semibold">Recently approved comments</h2>
        <div className="mt-4 grid gap-2">{q.approvedComments.length === 0 ? <Empty title="None yet" /> : q.approvedComments.map((c) => (
          <div key={c.id} className="glass p-4 text-sm"><p><Link className="underline" href={`/players/${c.public_id}?tab=comments`}>{c.player}</Link> · {c.tone} · {new Date(c.created_at).toLocaleDateString("en-GB", { dateStyle: "medium" })}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-text-muted">{c.body}</p>
            {!c.mine && <div className="mt-2"><AdminAction endpoint={`/api/admin/comments/${c.id}`} base={{ decision: "remove" }} label="Remove from account" tone="danger" fields={[{ name: "note", label: "Reason (recorded)", type: "textarea", required: true, min: 5, max: 1000 }]} /></div>}
          </div>))}</div>
      </section>
      </>)}
      {tab === "disputes" && <section>
        <h2 className="font-display text-xl font-semibold">Comments reported as inaccurate</h2>
        <p className="mt-1 text-sm text-text-muted">Reported by the verified owner of the account. Remove the comment if it&apos;s inaccurate, unfair or breaks the guidelines; otherwise keep it and record why.</p>
        <div className="mt-4 grid gap-2">{q.disputes.length === 0 ? <Empty title="No open reports" /> : q.disputes.map((d) => (
          <div key={d.id} className="glass p-4 text-sm">
            <p>Comment on <Link className="underline" href={`/players/${d.public_id}?tab=comments`}>{d.player}</Link> · reported {new Date(d.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
            <p className="label mt-3">Comment</p><p className="whitespace-pre-wrap break-words rounded bg-ink/50 p-2">{d.body}</p>
            <p className="label mt-3">Owner&apos;s reason</p><p className="whitespace-pre-wrap break-words rounded bg-ink/50 p-2">{d.reason}</p>
            {d.mine ? <p className="mt-2 text-xs text-neg">Conflict of interest.</p> : <div className="mt-3 flex flex-wrap gap-2">
              <AdminAction endpoint={`/api/admin/disputes/${d.id}`} base={{ decision: "remove_comment" }} label="Remove comment" tone="danger" fields={[{ name: "note", label: "Reason (shown to the owner)", type: "textarea", required: true, min: 5, max: 1000 }]} />
              <AdminAction endpoint={`/api/admin/disputes/${d.id}`} base={{ decision: "keep_comment" }} label="Keep comment" fields={[{ name: "note", label: "Reason (shown to the owner)", type: "textarea", required: true, min: 5, max: 1000 }]} />
            </div>}
          </div>))}</div>
      </section>}
      {tab === "commendations" && <section>
        <h2 className="font-display text-xl font-semibold">Commendation comments</h2>
        <BulkProvider kind="commendation" ids={q.commendations.filter((c) => !c.mine).map((c) => c.id)}><div className="mt-4 grid gap-2">{q.commendations.length === 0 ? <Empty title="Queue empty" /> : q.commendations.map((c) => (
          <div key={c.id} className="glass p-4 text-sm">
            <p>{!c.mine && <BulkCheck id={c.id} label={`commendation for ${c.player}`} />}<span className="chip border-pos/40 text-pos">{COMMENDATION_LABELS[c.category]}</span> for <Link className="underline" href={`/players/${c.public_id}`}>{c.player}</Link> · {ago(c.created_at)}</p>
            <p className="mt-1 text-xs text-text-muted">From {c.submitter ?? "deleted user"}{c.submitter_since ? ` · account ${ago(c.submitter_since).replace(" ago", " old")}` : ""} · {c.submitter_week} commendation(s) this week{Number(c.submitter_rejected) > 0 ? ` · ${c.submitter_rejected} previously rejected` : ""}</p>
            {c.comment ? <p className="mt-2 whitespace-pre-wrap break-words rounded bg-ink/50 p-2">{c.comment}</p> : <p className="mt-2 text-text-muted">No comment (held because the submitter&apos;s account is new).</p>}
            {c.mine ? <p className="mt-2 text-xs text-neg">Conflict of interest.</p> : <div className="mt-3 flex flex-wrap gap-2">
              <AdminAction endpoint={`/api/admin/commendations/${c.id}`} base={{ decision: "approve" }} label="Approve" tone="positive" />
              {c.comment && <AdminAction endpoint={`/api/admin/commendations/${c.id}`} base={{ decision: "approve_without_comment" }} label="Approve without comment" />}
              <AdminAction endpoint={`/api/admin/commendations/${c.id}`} base={{ decision: "reject" }} label="Reject" tone="danger" />
            </div>}
          </div>))}</div></BulkProvider>
      </section>}
      {tab === "verifications" && canVerify && <section>
          <h2 className="font-display text-xl font-semibold">Ownership claims & manual verifications</h2>
          <p className="mt-1 text-sm text-text-muted">Never approve on a matching username alone. Approve &ldquo;verified&rdquo; only with strong proof (e.g. a moderator-issued code shown on the player&apos;s platform profile). Use &ldquo;possible match&rdquo; for weaker evidence.</p>
          <div className="mt-4 grid gap-2">{q.verifications.length === 0 ? <Empty title="Queue empty" /> : q.verifications.map((v) => (
            <div key={v.id} className="glass p-4 text-sm">
              <p><strong>{v.kind === "profile_claim" ? "Profile claim" : "Link verification"}</strong> · {v.claimant} → <Link className="underline" href={`/players/${v.public_id}`}>{v.player}</Link> ({v.platform}){v.username ? ` · account "${v.username}"` : ""}</p>
              {v.method === "profile_code" && (v.code_placed_at
                ? <p className="mt-2 chip border-pos/40 text-pos">Player says the code is in place · {new Date(v.code_placed_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
                : <p className="mt-2 chip border-ink-line text-text-muted">Waiting for the player to place the code</p>)}
              {v.profile_url && <p className="mt-2">Profile link: <a href={v.profile_url} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">{v.profile_url}</a> <span className="text-xs text-text-muted">(external site: opens in a new tab)</span></p>}
              {v.has_shot && <p className="mt-1"><a href={`/api/admin/verifications/${v.id}/evidence`} target="_blank" rel="noopener noreferrer" className="underline">View private screenshot</a> <span className="text-xs text-text-muted">(access is logged)</span></p>}
              {v.challenge_code && <p className="mt-2 rounded-lg border border-violet-brand/40 bg-violet-brand/10 p-2">Code check: open the public {v.platform} profile of <b>{v.username ?? v.player}</b> and look for <span className="font-mono text-violet-lavender">{v.challenge_code}</span> in the bio, about me or status. Approve as verified only if you see it.</p>}
              {v.verified_platform_user_id && <p className="mt-1 text-pos">An official sign-in proved control of platform account ID {v.verified_platform_user_id}.</p>}
              {v.claim_note && <p className="mt-2 whitespace-pre-wrap rounded bg-ink/50 p-2">{v.claim_note}</p>}
              {v.mine ? <p className="mt-2 text-xs text-neg">Your own claim.</p> : <div className="mt-3 flex flex-wrap gap-2">
                {(["approve_verified", "approve_possible_match", "reject"] as const).map((d) => (
                  <AdminAction key={d} endpoint={`/api/admin/verifications/${v.id}`} base={{ decision: d }} label={d.replace(/_/g, " ")} tone={d === "reject" ? "danger" : d === "approve_verified" ? "positive" : "ghost"}
                    fields={[{ name: "note", label: "Evidence checked / reason (recorded)", type: "textarea", required: true, min: 5, max: 1000 }]} />
                ))}
              </div>}
            </div>))}</div>
        </section>}
      {tab === "responses" && <section>
        <h2 className="font-display text-xl font-semibold">Player responses</h2>
        <div className="mt-4 grid gap-2">{q.responses.length === 0 ? <Empty title="Queue empty" /> : q.responses.map((r) => (
          <div key={r.id} className="glass p-4 text-sm"><p>On report <Link className="underline" href={`/admin/reports/${r.report_id}`}>{r.public_ref}</Link></p><p className="mt-2 whitespace-pre-wrap rounded bg-ink/50 p-2">{r.body}</p>
            <div className="mt-3 flex gap-2"><AdminAction endpoint={`/api/admin/responses/${r.id}`} base={{ decision: "publish" }} label="Publish" tone="positive" /><AdminAction endpoint={`/api/admin/responses/${r.id}`} base={{ decision: "reject" }} label="Reject" tone="danger" fields={[{ name: "note", label: "Reason shown to player", type: "textarea", required: true, min: 5, max: 1000 }]} /></div></div>))}</div>
      </section>}
      {tab === "appeals" && <section>
        <h2 className="font-display text-xl font-semibold">Open appeals</h2>
        <div className="mt-4 grid gap-2">{q.appeals.length === 0 ? <Empty title="No open appeals" /> : q.appeals.map((a) => (
          <Link key={a.id} href={`/admin/reports/${a.report_id}`} className="glass p-4 text-sm hover:shadow-glow">Appeal on {a.public_ref} · {a.status.replace("_", " ")} · {new Date(a.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</Link>))}</div>
      </section>}
      {tab === "recent" && <section>
        <h2 className="font-display text-xl font-semibold">My recent decisions</h2>
        <p className="mt-1 text-sm text-text-muted">Made a mistake? You can undo your own comment and commendation decisions for 10 minutes. The item goes back to the queue.</p>
        <div className="mt-4 grid gap-2">{q.recent.filter((r) => r.summary !== null).length === 0 ? <Empty title="No decisions in the last 10 minutes" /> : q.recent.filter((r) => r.summary !== null).map((r) => (
          <div key={r.target_id + r.created_at.toString()} className="glass flex flex-wrap items-center gap-3 p-4 text-sm">
            <span className="chip border-ink-line">{r.target_type === "commendation" ? "Commendation" : "Comment"} · {r.to_status}</span>
            <span className="min-w-0 flex-1 truncate text-text-muted">{r.summary}</span>
            <span className="text-xs text-text-muted">{ago(r.created_at)}</span>
            <AdminAction endpoint={`/api/admin/${r.target_type === "commendation" ? "commendations" : "comments"}/${r.target_id}`} base={{ decision: "undo" }} label="Undo" />
          </div>))}</div>
      </section>}
    </div>
  );
}
