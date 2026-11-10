import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { audit, moderationAction } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { badRequest, forbidden, notFound } from "@/lib/server/errors";

const Body = z.object({ decision: z.enum(["approve", "reject", "remove", "undo"]), note: z.string().trim().max(1000).optional(), internalNote: z.string().trim().max(1000).optional() }).strict();

/** Moderators approve a pending comment (it then appears on the player's account), reject it, or remove an approved one. */
export const POST = route({ permission: "mod.commendations.review", body: Body }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  if (body.decision !== "approve" && body.decision !== "undo" && (!body.note || body.note.length < 5)) throw badRequest("Record a reason (at least 5 characters).");
  return withDb(auth!.db, async (tx) => {
    const c = await tx.one<{ id: string; status: string; author_user_id: string | null; owner_user_id: string | null; public_id: string; moderated_by: string | null; moderated_at: Date | null }>(
      `SELECT c.id, c.status, c.author_user_id, p.owner_user_id, p.public_id, c.moderated_by, c.moderated_at FROM player_comments c JOIN player_profiles p ON p.id = c.player_profile_id WHERE c.id = $1 FOR UPDATE OF c`, [id.data]);
    if (!c) throw notFound();
    if (c.author_user_id === auth!.user.id || c.owner_user_id === auth!.user.id) throw forbidden("Conflict of interest: another moderator must handle this.");
    if (body.decision === "undo") {
      if (c.status === "pending" || c.moderated_by !== auth!.user.id || !c.moderated_at || Date.now() - c.moderated_at.getTime() > 10 * 60_000) throw badRequest("You can only undo your own decision within 10 minutes.");
      await tx.q(`UPDATE player_comments SET status = 'pending', moderated_by = NULL, moderated_at = NULL, moderation_note = NULL WHERE id = $1`, [c.id]);
      await moderationAction(tx, auth!.user.id, { type: "player_comment", id: c.id }, "undo", c.status, "pending", null);
      await audit(tx, auth!.user.id, "moderation.comment.undo", { type: "player_comment", id: c.id }, {}, meta.ipHash);
      return { ok: true, status: "pending" };
    }
    if (body.decision === "remove" ? c.status !== "approved" : c.status !== "pending") throw badRequest("This comment is not in a state that allows that action.");
    const to = body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : "removed";
    await tx.q(`UPDATE player_comments SET status = $2, moderated_by = $3, moderated_at = now(), moderation_note = $4 WHERE id = $1`, [c.id, to, auth!.user.id, body.note ?? null]);
    await moderationAction(tx, auth!.user.id, { type: "player_comment", id: c.id }, `comment_${body.decision}`, c.status, to, [body.note ? `Told author: ${body.note}` : null, body.internalNote ? `Internal: ${body.internalNote}` : null].filter(Boolean).join(" | ") || null);
    await audit(tx, auth!.user.id, `moderation.comment.${body.decision}`, { type: "player_comment", id: c.id }, {}, meta.ipHash);
    if (c.author_user_id) await notify(tx, c.author_user_id, "report_update", to === "approved" ? "Your comment was approved and is now on the player's account" : `Your comment was ${to}`, undefined, `/players/${c.public_id}?tab=comments`);
    if (to === "approved" && c.owner_user_id) await notify(tx, c.owner_user_id, "commendation_received", "A new comment was added to your account", "You can read it for free and report it if it is inaccurate.", `/players/${c.public_id}?tab=comments`);
    return { ok: true, status: to };
  });
});
