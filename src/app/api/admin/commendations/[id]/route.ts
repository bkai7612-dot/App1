import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { audit, moderationAction } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { can } from "@/lib/rbac";
import { badRequest, forbidden, notFound } from "@/lib/server/errors";

const Body = z.object({ decision: z.enum(["approve", "approve_without_comment", "reject", "remove", "undo"]), note: z.string().trim().max(1000).optional() }).strict();

export const POST = route({ permission: "mod.commendations.review", body: Body }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  if (body.decision === "remove" && !can(auth!.user.role, "mod.content.remove")) throw forbidden();
  return withDb(auth!.db, async (tx) => {
    const c = await tx.one<{ id: string; status: string; submitter_user_id: string | null; owner_user_id: string | null; public_id: string; moderated_by: string | null; moderated_at: Date | null }>(
      `SELECT c.id, c.status, c.submitter_user_id, p.owner_user_id, p.public_id, c.moderated_by, c.moderated_at FROM commendations c JOIN player_profiles p ON p.id = c.player_profile_id WHERE c.id = $1 FOR UPDATE OF c`, [id.data]);
    if (!c) throw notFound();
    if (c.submitter_user_id === auth!.user.id || c.owner_user_id === auth!.user.id) throw forbidden("Conflict of interest.");
    // M-08: undo your own decision within 10 minutes (back to the queue).
    if (body.decision === "undo") {
      if (c.status === "pending" || c.moderated_by !== auth!.user.id || !c.moderated_at || Date.now() - c.moderated_at.getTime() > 10 * 60_000) throw badRequest("You can only undo your own decision within 10 minutes.");
      await tx.q(`UPDATE commendations SET status = 'pending', moderated_by = NULL, moderated_at = NULL WHERE id = $1`, [c.id]);
      await moderationAction(tx, auth!.user.id, { type: "commendation", id: c.id }, "undo", c.status, "pending", null);
      await audit(tx, auth!.user.id, "moderation.commendation.undo", { type: "commendation", id: c.id }, {}, meta.ipHash);
      return { ok: true };
    }
    if (body.decision !== "remove" && c.status !== "pending") throw badRequest("Already moderated.");
    if (body.decision === "remove" && c.status !== "approved") throw badRequest("Only approved commendations can be removed.");
    const to = body.decision.startsWith("approve") ? "approved" : body.decision === "reject" ? "rejected" : "removed";
    await tx.q(`UPDATE commendations SET status = $2, comment = CASE WHEN $4 THEN NULL ELSE comment END, moderated_by = $3, moderated_at = now() WHERE id = $1`,
      [c.id, to, auth!.user.id, body.decision === "approve_without_comment"]);
    await moderationAction(tx, auth!.user.id, { type: "commendation", id: c.id }, body.decision, c.status, to, body.note ?? null);
    await audit(tx, auth!.user.id, `moderation.commendation.${body.decision}`, { type: "commendation", id: c.id }, {}, meta.ipHash);
    if (to === "approved" && c.owner_user_id) await notify(tx, c.owner_user_id, "commendation_received", "You received a commendation", undefined, `/players/${c.public_id}?tab=positive`);
    return { ok: true };
  });
});
