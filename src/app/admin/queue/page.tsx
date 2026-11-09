import Link from "next/link";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { can } from "@/lib/rbac";
import { AdminAction } from "@/components/admin/AdminAction";
import { Empty } from "@/components/ui/Card";
import { COMMENDATION_LABELS } from "@/lib/categories";

export default async function Queues() {
  const auth = await requirePageAuth("/admin/queue");
  const me = auth.user.id;
  const q = await withDb(auth.db, async (tx) => ({
    commendations: await tx.q<{ id: string; category: string; comment: string | null; created_at: Date; player: string; public_id: string; mine: boolean }>(
      `SELECT c.id, c.category, c.comment, c.created_at, p.display_name AS player, p.public_id, (c.submitter_user_id = $1 OR p.owner_user_id = $1) AS mine
       FROM commendations c JOIN player_profiles p ON p.id = c.player_profile_id WHERE c.status = 'pending' ORDER BY c.created_at LIMIT 100`, [me]),
    verifications: await tx.q<{ id: string; kind: string; method: string; claim_note: string | null; verified_platform_user_id: string | null; created_at: Date; player: string; public_id: string; platform: string; claimant: string; username: string | null; mine: boolean }>(
      `SELECT v.id, v.kind, v.method, v.claim_note, v.verified_platform_user_id, v.created_at, p.display_name AS player, p.public_id, pl.name AS platform, u.display_name AS claimant, ga.username, (v.user_id = $1) AS mine
       FROM account_verifications v JOIN player_profiles p ON p.id = v.player_profile_id JOIN platforms pl ON pl.id = p.platform_id JOIN users u ON u.id = v.user_id
       LEFT JOIN gaming_accounts ga ON ga.id = v.gaming_account_id
       WHERE v.status = 'pending' AND v.method = 'manual_review' ORDER BY v.created_at LIMIT 100`, [me]),
    responses: await tx.q<{ id: string; body: string; report_id: string; public_ref: string }>(
      `SELECT x.id, x.body, x.report_id, r.public_ref FROM report_responses x JOIN reports r ON r.id = x.report_id WHERE x.status = 'pending' ORDER BY x.created_at LIMIT 100`),
    appeals: await tx.q<{ id: string; report_id: string; public_ref: string; status: string; created_at: Date }>(
      `SELECT a.id, a.report_id, r.public_ref, a.status, a.created_at FROM report_appeals a JOIN reports r ON r.id = a.report_id WHERE a.status IN ('submitted','under_review') ORDER BY a.created_at LIMIT 100`),
  }));
  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-display text-2xl font-semibold">Commendation comments</h1>
        <div className="mt-4 grid gap-2">{q.commendations.length === 0 ? <Empty title="Queue empty" /> : q.commendations.map((c) => (
          <div key={c.id} className="glass p-4 text-sm">
            <p><span className="chip border-pos/40 text-pos">{COMMENDATION_LABELS[c.category]}</span> for <Link className="underline" href={`/players/${c.public_id}`}>{c.player}</Link> · {new Date(c.created_at).toLocaleString("en-GB")}</p>
            {c.comment ? <p className="mt-2 whitespace-pre-wrap break-words rounded bg-ink/50 p-2">{c.comment}</p> : <p className="mt-2 text-text-muted">No comment (held because the submitter&apos;s account is new).</p>}
            {c.mine ? <p className="mt-2 text-xs text-neg">Conflict of interest.</p> : <div className="mt-3 flex flex-wrap gap-2">
              <AdminAction endpoint={`/api/admin/commendations/${c.id}`} base={{ decision: "approve" }} label="Approve" tone="positive" />
              {c.comment && <AdminAction endpoint={`/api/admin/commendations/${c.id}`} base={{ decision: "approve_without_comment" }} label="Approve without comment" />}
              <AdminAction endpoint={`/api/admin/commendations/${c.id}`} base={{ decision: "reject" }} label="Reject" tone="danger" />
            </div>}
          </div>))}</div>
      </section>
      {can(auth.user.role, "mod.verifications.review") && (
        <section>
          <h2 className="font-display text-xl font-semibold">Ownership claims & manual verifications</h2>
          <p className="mt-1 text-sm text-text-muted">Never approve on a matching username alone. Approve &ldquo;verified&rdquo; only with strong proof (e.g. a moderator-issued code shown on the player&apos;s platform profile). Use &ldquo;possible match&rdquo; for weaker evidence.</p>
          <div className="mt-4 grid gap-2">{q.verifications.length === 0 ? <Empty title="Queue empty" /> : q.verifications.map((v) => (
            <div key={v.id} className="glass p-4 text-sm">
              <p><strong>{v.kind === "profile_claim" ? "Profile claim" : "Link verification"}</strong> · {v.claimant} → <Link className="underline" href={`/players/${v.public_id}`}>{v.player}</Link> ({v.platform}){v.username ? ` · account "${v.username}"` : ""}</p>
              {v.verified_platform_user_id && <p className="mt-1 text-pos">Steam OpenID proved control of SteamID {v.verified_platform_user_id}.</p>}
              {v.claim_note && <p className="mt-2 whitespace-pre-wrap rounded bg-ink/50 p-2">{v.claim_note}</p>}
              {v.mine ? <p className="mt-2 text-xs text-neg">Your own claim.</p> : <div className="mt-3 flex flex-wrap gap-2">
                {(["approve_verified", "approve_possible_match", "reject"] as const).map((d) => (
                  <AdminAction key={d} endpoint={`/api/admin/verifications/${v.id}`} base={{ decision: d }} label={d.replace(/_/g, " ")} tone={d === "reject" ? "danger" : d === "approve_verified" ? "positive" : "ghost"}
                    fields={[{ name: "note", label: "Evidence checked / reason (recorded)", type: "textarea", required: true, min: 5, max: 1000 }]} />
                ))}
              </div>}
            </div>))}</div>
        </section>
      )}
      <section>
        <h2 className="font-display text-xl font-semibold">Player responses</h2>
        <div className="mt-4 grid gap-2">{q.responses.length === 0 ? <Empty title="Queue empty" /> : q.responses.map((r) => (
          <div key={r.id} className="glass p-4 text-sm"><p>On report <Link className="underline" href={`/admin/reports/${r.report_id}`}>{r.public_ref}</Link></p><p className="mt-2 whitespace-pre-wrap rounded bg-ink/50 p-2">{r.body}</p>
            <div className="mt-3 flex gap-2"><AdminAction endpoint={`/api/admin/responses/${r.id}`} base={{ decision: "publish" }} label="Publish" tone="positive" /><AdminAction endpoint={`/api/admin/responses/${r.id}`} base={{ decision: "reject" }} label="Reject" tone="danger" fields={[{ name: "note", label: "Reason shown to player", type: "textarea", required: true, min: 5, max: 1000 }]} /></div></div>))}</div>
      </section>
      <section>
        <h2 className="font-display text-xl font-semibold">Open appeals</h2>
        <div className="mt-4 grid gap-2">{q.appeals.length === 0 ? <Empty title="No open appeals" /> : q.appeals.map((a) => (
          <Link key={a.id} href={`/admin/reports/${a.report_id}`} className="glass p-4 text-sm hover:shadow-glow">Appeal on {a.public_ref} · {a.status.replace("_", " ")} · {new Date(a.created_at).toLocaleString("en-GB")}</Link>))}</div>
      </section>
    </div>
  );
}
