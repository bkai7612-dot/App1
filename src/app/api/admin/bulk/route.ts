import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { audit, moderationAction } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { badRequest } from "@/lib/server/errors";

const Body = z.object({
  kind: z.enum(["commendation", "comment"]),
  ids: z.array(z.string().uuid()).min(1).max(50),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(1000).optional(),
}).strict();

/**
 * M-04: bulk approve/reject for commendation comments and player comments. Each item is checked individually
 * (still pending, no conflict of interest); items that fail are skipped and reported back.
 */
export const POST = route({ permission: "mod.commendations.review", body: Body, rate: { name: "mod-bulk", limit: 60, windowSec: 3600 } }, async ({ auth, body, meta }) => {
  if (body.decision === "reject" && (!body.note || body.note.length < 5)) throw badRequest("Record a reason for rejecting (at least 5 characters).");
  const me = auth!.user.id;
  return withDb(auth!.db, async (tx) => {
    const done: string[] = [], skipped: string[] = [];
    for (const id of body.ids) {
      if (body.kind === "commendation") {
        const c = await tx.one<{ id: string; submitter_user_id: string | null; owner_user_id: string | null; public_id: string }>(
          `SELECT c.id, c.submitter_user_id, p.owner_user_id, p.public_id FROM commendations c JOIN player_profiles p ON p.id = c.player_profile_id WHERE c.id = $1 AND c.status = 'pending' FOR UPDATE OF c`, [id]);
        if (!c || c.submitter_user_id === me || c.owner_user_id === me) { skipped.push(id); continue; }
        const to = body.decision === "approve" ? "approved" : "rejected";
        await tx.q(`UPDATE commendations SET status = $2, moderated_by = $3, moderated_at = now() WHERE id = $1`, [id, to, me]);
        await moderationAction(tx, me, { type: "commendation", id }, `bulk_${body.decision}`, "pending", to, body.note ?? null);
        if (to === "approved" && c.owner_user_id) await notify(tx, c.owner_user_id, "commendation_received", "You received a commendation", undefined, `/players/${c.public_id}?tab=positive`);
      } else {
        const c = await tx.one<{ id: string; author_user_id: string | null; owner_user_id: string | null; public_id: string }>(
          `SELECT c.id, c.author_user_id, p.owner_user_id, p.public_id FROM player_comments c JOIN player_profiles p ON p.id = c.player_profile_id WHERE c.id = $1 AND c.status = 'pending' FOR UPDATE OF c`, [id]);
        if (!c || c.author_user_id === me || c.owner_user_id === me) { skipped.push(id); continue; }
        const to = body.decision === "approve" ? "approved" : "rejected";
        await tx.q(`UPDATE player_comments SET status = $2, moderated_by = $3, moderated_at = now(), moderation_note = $4 WHERE id = $1`, [id, to, me, body.decision === "reject" ? body.note : null]);
        await moderationAction(tx, me, { type: "player_comment", id }, `bulk_${body.decision}`, "pending", to, body.note ?? null);
        if (c.author_user_id) await notify(tx, c.author_user_id, "report_update", to === "approved" ? "Your comment was approved and is now on the player's account" : "Your comment was not approved", body.decision === "reject" ? `Reason: ${body.note}` : undefined, `/players/${c.public_id}?tab=comments`);
        if (to === "approved" && c.owner_user_id) await notify(tx, c.owner_user_id, "commendation_received", "A new comment was added to your account", "You can read it for free and report it if it is inaccurate.", `/players/${c.public_id}?tab=comments`);
      }
      done.push(id);
    }
    await audit(tx, me, `moderation.bulk.${body.kind}.${body.decision}`, { type: body.kind, id: "bulk" }, { done: done.length, skipped: skipped.length }, meta.ipHash);
    return { ok: true, done: done.length, skipped: skipped.length };
  });
});
