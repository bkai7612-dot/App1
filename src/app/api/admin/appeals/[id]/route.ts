import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { audit, moderationAction } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { badRequest, forbidden, notFound } from "@/lib/server/errors";

const Body = z.object({
  decision: z.enum(["start_review", "request_info", "upheld", "rejected"]),
  note: z.string().trim().max(2000).optional(),          // shown to the appellant (decisions) or the question (request_info)
  internalNote: z.string().trim().max(2000).optional(),  // moderators only
}).strict();

/**
 * Appeal decisions (senior moderators). "upheld" = the appeal succeeds -> report removed.
 * "rejected" = report stands -> recorded as a resolved moderation outcome. Decider must not be the original publisher.
 * Moderators can also ask the appellant a question (M-11).
 */
export const POST = route({ permission: "mod.appeals.decide", body: Body }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  return withDb(auth!.db, async (tx) => {
    const a = await tx.one<{ id: string; status: string; report_id: string; appellant_user_id: string | null; report_status: string; public_id: string; public_ref: string }>(
      `SELECT a.id, a.status, a.report_id, a.appellant_user_id, r.status AS report_status, p.public_id, r.public_ref
       FROM report_appeals a JOIN reports r ON r.id = a.report_id JOIN player_profiles p ON p.id = r.player_profile_id WHERE a.id = $1 FOR UPDATE OF a`, [id.data]);
    if (!a) throw notFound();
    if (a.appellant_user_id === auth!.user.id) throw forbidden("Conflict of interest.");
    const publishedBySelf = await tx.one(`SELECT 1 FROM moderation_actions WHERE target_type = 'report' AND target_id = $1 AND action = 'publish' AND moderator_id = $2`, [a.report_id, auth!.user.id]);
    if (publishedBySelf && body.decision !== "start_review") throw forbidden("Appeals must be decided by a different moderator from the one who published the report.");
    if (body.decision === "start_review") {
      if (a.status !== "submitted") throw badRequest("Appeal is not awaiting review.");
      await tx.q(`UPDATE report_appeals SET status = 'under_review' WHERE id = $1`, [a.id]);
      await moderationAction(tx, auth!.user.id, { type: "report", id: a.report_id }, "appeal_review_started", a.report_status, a.report_status, body.internalNote ? `Internal: ${body.internalNote}` : null);
    } else if (body.decision === "request_info") {
      if (!["submitted", "under_review"].includes(a.status)) throw badRequest("Appeal already decided.");
      if (!body.note || body.note.length < 10) throw badRequest("Write the question for the player (at least 10 characters).");
      await tx.q(`UPDATE report_appeals SET status = 'under_review', info_request_note = $2, info_requested_at = now(), info_reply = NULL, info_replied_at = NULL WHERE id = $1`, [a.id, body.note]);
      if (a.appellant_user_id) await notify(tx, a.appellant_user_id, "appeal_reviewed", `A moderator has a question about your appeal on ${a.public_ref}`, undefined, `/players/${a.public_id}?tab=negative`);
      await moderationAction(tx, auth!.user.id, { type: "report", id: a.report_id }, "appeal_info_requested", a.report_status, a.report_status, `Asked appellant: ${body.note}${body.internalNote ? ` | Internal: ${body.internalNote}` : ""}`);
    } else {
      if (!["submitted", "under_review"].includes(a.status)) throw badRequest("Appeal already decided.");
      if (!body.note || body.note.length < 10) throw badRequest("Write the reason the player will see (at least 10 characters).");
      await tx.q(`UPDATE report_appeals SET status = $2, decision_note = $3, decided_by = $4, decided_at = now() WHERE id = $1`, [a.id, body.decision, body.note, auth!.user.id]);
      if (body.decision === "upheld") {
        await tx.q(`UPDATE reports SET status = 'removed', outcome_type = 'removed', outcome_note = $2, closed_at = now() WHERE id = $1`, [a.report_id, `Removed after a successful appeal: ${body.note}`.slice(0, 1000)]);
      } else {
        await tx.q(`UPDATE reports SET status = 'resolved', outcome_type = 'upheld', outcome_note = coalesce(outcome_note, 'Appeal reviewed by a senior moderator; the report was upheld.'), resolved_at = now(), closed_at = now() WHERE id = $1`, [a.report_id]);
      }
      if (a.appellant_user_id) await notify(tx, a.appellant_user_id, "appeal_reviewed", body.decision === "upheld" ? "Your appeal was successful: the report was removed" : "Your appeal was reviewed: the report stands", `Reason: ${body.note}`.slice(0, 480), `/players/${a.public_id}?tab=negative`);
      await moderationAction(tx, auth!.user.id, { type: "report", id: a.report_id }, `appeal_${body.decision}`, a.report_status, body.decision === "upheld" ? "removed" : "resolved", `Told player: ${body.note}${body.internalNote ? ` | Internal: ${body.internalNote}` : ""}`);
    }
    await audit(tx, auth!.user.id, `moderation.appeal.${body.decision}`, { type: "report_appeal", id: a.id }, { report: a.report_id }, meta.ipHash);
    return { ok: true };
  });
});
