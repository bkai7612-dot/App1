import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { audit, moderationAction } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { can } from "@/lib/rbac";
import { ApiError, badRequest, forbidden, notFound } from "@/lib/server/errors";
import { featureEnabled } from "@/lib/launch-gates";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start_review") }),
  z.object({ action: z.literal("request_info"), note: z.string().trim().min(10).max(1000) }),
  z.object({ action: z.literal("publish"), publicSummary: z.string().trim().min(20).max(1000), note: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("reject"), note: z.string().trim().min(5).max(2000) }),
  z.object({ action: z.literal("remove"), note: z.string().trim().min(5).max(2000) }),
  z.object({ action: z.literal("resolve"), outcomeType: z.enum(["upheld", "not_upheld"]), outcomeNote: z.string().trim().min(10).max(1000) }),
]);

// Allowed transitions (anything else is refused).
const FROM: Record<string, string[]> = {
  start_review: ["submitted"],
  request_info: ["under_review"],
  publish: ["under_review"],
  reject: ["submitted", "under_review"],
  remove: ["published", "disputed", "appealed", "resolved"],
  resolve: ["published", "disputed"],
};
const TO: Record<string, string> = { start_review: "under_review", request_info: "under_review", publish: "published", reject: "rejected", remove: "removed", resolve: "resolved" };

export const POST = route({ permission: "mod.reports.review", body: Body, rate: { name: "mod-report", limit: 300, windowSec: 3600 } }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  if ((body.action === "remove" || body.action === "resolve") && !can(auth!.user.role, "mod.content.remove")) throw forbidden("Senior moderator permission required.");
  if (body.action === "publish" && !featureEnabled("report_publication")) throw new ApiError(503, "LAUNCH_GATE", "Publishing reports is disabled until all launch gates are approved.");

  return withDb(auth!.db, async (tx) => {
    const r = await tx.one<{ id: string; status: string; reporter_user_id: string | null; owner_user_id: string | null; public_id: string; public_ref: string }>(
      `SELECT r.id, r.status, r.reporter_user_id, p.owner_user_id, p.public_id, r.public_ref FROM reports r JOIN player_profiles p ON p.id = r.player_profile_id
       WHERE r.id = $1 AND r.deleted_at IS NULL FOR UPDATE OF r`, [id.data]);
    if (!r) throw notFound();
    if (r.reporter_user_id === auth!.user.id || r.owner_user_id === auth!.user.id) throw forbidden("Conflict of interest: another moderator must handle this report.");
    if (!FROM[body.action].includes(r.status)) throw badRequest(`Cannot ${body.action.replace("_", " ")} a report that is ${r.status.replace("_", " ")}.`);
    const to = TO[body.action];
    switch (body.action) {
      case "start_review":
        await tx.q(`UPDATE reports SET status = $2, assigned_moderator_id = $3 WHERE id = $1`, [r.id, to, auth!.user.id]); break;
      case "request_info":
        await tx.q(`UPDATE reports SET info_requested_at = now(), info_request_note = $2 WHERE id = $1`, [r.id, body.note]);
        if (r.reporter_user_id) await notify(tx, r.reporter_user_id, "report_update", "A moderator needs more information about your report", undefined, "/me/reports");
        break;
      case "publish":
        await tx.q(`UPDATE reports SET status = 'published', public_summary = $2, published_at = now(), info_requested_at = NULL WHERE id = $1`, [r.id, body.publicSummary]);
        if (r.owner_user_id) await notify(tx, r.owner_user_id, "report_published", "A report about your account was published", "You can read it, respond and appeal for free.", `/players/${r.public_id}?tab=negative`);
        if (r.reporter_user_id) await notify(tx, r.reporter_user_id, "report_update", `Your report ${r.public_ref} was published after review`, undefined, "/me/reports");
        break;
      case "reject":
        await tx.q(`UPDATE reports SET status = 'rejected', closed_at = now(), outcome_note = NULL WHERE id = $1`, [r.id]);
        await tx.q(`UPDATE report_evidence SET delete_after = now() + interval '90 days' WHERE report_id = $1 AND delete_after IS NULL`, [r.id]);
        if (r.reporter_user_id) await notify(tx, r.reporter_user_id, "report_update", `Your report ${r.public_ref} was reviewed and not published`, undefined, "/me/reports");
        break;
      case "remove":
        await tx.q(`UPDATE reports SET status = 'removed', outcome_type = 'removed', closed_at = now() WHERE id = $1`, [r.id]);
        await tx.q(`UPDATE report_evidence SET delete_after = now() + interval '90 days' WHERE report_id = $1 AND delete_after IS NULL`, [r.id]);
        if (r.owner_user_id) await notify(tx, r.owner_user_id, "report_disputed", "A report about your account was removed", undefined, `/players/${r.public_id}?tab=negative`);
        break;
      case "resolve":
        await tx.q(`UPDATE reports SET status = 'resolved', outcome_type = $2, outcome_note = $3, resolved_at = now(), closed_at = now() WHERE id = $1`, [r.id, body.outcomeType, body.outcomeNote]);
        await tx.q(`UPDATE report_evidence SET delete_after = now() + interval '180 days' WHERE report_id = $1 AND delete_after IS NULL`, [r.id]);
        if (r.owner_user_id) await notify(tx, r.owner_user_id, "report_disputed", "A moderation outcome was recorded on a report about you", undefined, `/players/${r.public_id}?tab=negative`);
        break;
    }
    const note = "note" in body ? body.note : "publicSummary" in body ? `Summary: ${body.publicSummary}` : "outcomeNote" in body ? `${body.outcomeType}: ${body.outcomeNote}` : null;
    await moderationAction(tx, auth!.user.id, { type: "report", id: r.id }, body.action, r.status, to, note ?? null);
    await audit(tx, auth!.user.id, `moderation.report.${body.action}`, { type: "report", id: r.id }, { from: r.status, to }, meta.ipHash);
    return { ok: true, status: to };
  });
});
