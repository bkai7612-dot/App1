import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { audit, moderationAction } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { badRequest, forbidden, notFound } from "@/lib/server/errors";

const Body = z.object({ decision: z.enum(["remove_comment", "keep_comment"]), note: z.string().trim().min(5).max(1000) }).strict();

/** Decide an owner's "inaccurate comment" report: remove the comment, or keep it with recorded reasons. */
export const POST = route({ permission: "mod.commendations.review", body: Body }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  return withDb(auth!.db, async (tx) => {
    const dsp = await tx.one<{ id: string; status: string; comment_id: string; owner_user_id: string | null; author_user_id: string | null; public_id: string }>(
      `SELECT d.id, d.status, d.comment_id, d.owner_user_id, c.author_user_id, p.public_id FROM comment_disputes d
       JOIN player_comments c ON c.id = d.comment_id JOIN player_profiles p ON p.id = c.player_profile_id WHERE d.id = $1 FOR UPDATE OF d`, [id.data]);
    if (!dsp) throw notFound();
    if (dsp.owner_user_id === auth!.user.id || dsp.author_user_id === auth!.user.id) throw forbidden("Conflict of interest.");
    if (dsp.status !== "open") throw badRequest("Already decided.");
    const upheld = body.decision === "remove_comment";
    await tx.q(`UPDATE comment_disputes SET status = $2, decision_note = $3, decided_by = $4, decided_at = now() WHERE id = $1`, [dsp.id, upheld ? "upheld" : "rejected", body.note, auth!.user.id]);
    if (upheld) await tx.q(`UPDATE player_comments SET status = 'removed', moderated_by = $2, moderated_at = now(), moderation_note = $3 WHERE id = $1`, [dsp.comment_id, auth!.user.id, `Removed after owner dispute: ${body.note}`]);
    await moderationAction(tx, auth!.user.id, { type: "player_comment", id: dsp.comment_id }, upheld ? "dispute_upheld_comment_removed" : "dispute_rejected", "approved", upheld ? "removed" : "approved", body.note);
    await audit(tx, auth!.user.id, `moderation.comment_dispute.${body.decision}`, { type: "comment_dispute", id: dsp.id }, {}, meta.ipHash);
    if (dsp.owner_user_id) await notify(tx, dsp.owner_user_id, "report_disputed", upheld ? "The comment you reported was removed" : "The comment you reported was reviewed and kept", body.note.slice(0, 300), `/players/${dsp.public_id}?tab=comments`);
    return { ok: true };
  });
});
