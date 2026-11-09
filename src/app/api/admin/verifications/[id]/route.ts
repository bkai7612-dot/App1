import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { audit, moderationAction } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { badRequest, forbidden, notFound } from "@/lib/server/errors";

const Body = z.object({ decision: z.enum(["approve_verified", "approve_possible_match", "reject"]), note: z.string().trim().min(5).max(1000) }).strict();

/** Moderator decision on a manual ownership claim or link verification. Fully audited. */
export const POST = route({ permission: "mod.verifications.review", body: Body }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  return withDb(auth!.db, async (tx) => {
    const v = await tx.one<{ id: string; user_id: string; player_profile_id: string; gaming_account_id: string | null; kind: string; status: string; verified_platform_user_id: string | null }>(
      `SELECT id, user_id, player_profile_id, gaming_account_id, kind, status, verified_platform_user_id FROM account_verifications WHERE id = $1 FOR UPDATE`, [id.data]);
    if (!v) throw notFound();
    if (v.user_id === auth!.user.id) throw forbidden("You cannot review your own claim.");
    if (v.status !== "pending") throw badRequest("Already decided.");
    const approved = body.decision !== "reject";
    const status = body.decision === "approve_verified" ? "verified" : "possible_match";
    if (approved) {
      if (v.kind === "profile_claim") {
        const p = await tx.one<{ owner_user_id: string | null; platform_id: number; display_name: string; platform_user_id: string | null }>(
          `SELECT owner_user_id, platform_id, display_name, platform_user_id FROM player_profiles WHERE id = $1 FOR UPDATE`, [v.player_profile_id]);
        if (!p || p.owner_user_id) throw badRequest("Profile already has an owner.");
        await tx.q(`UPDATE player_profiles SET owner_user_id = $2 WHERE id = $1`, [v.player_profile_id, v.user_id]);
        await tx.q(`INSERT INTO gaming_accounts (player_profile_id, platform_id, platform_user_id, username, username_normalized, verification_status, verification_method, linked_by_user_id, last_verified_at)
                    VALUES ($1, $2, $3, $4, lower($4), $5, 'manual_review', $6, now())`,
          [v.player_profile_id, p.platform_id, status === "verified" ? (v.verified_platform_user_id ?? p.platform_user_id) : null, p.display_name, status, v.user_id]);
      } else if (v.gaming_account_id) {
        const ga = await tx.one<{ verification_status: string }>(`SELECT verification_status FROM gaming_accounts WHERE id = $1`, [v.gaming_account_id]);
        if (!ga || ga.verification_status === "unlinked") throw badRequest("That account has been unlinked by its owner.");
        await tx.q(`UPDATE gaming_accounts SET verification_status = $2, verification_method = 'manual_review', last_verified_at = now() WHERE id = $1`, [v.gaming_account_id, status]);
      }
    }
    await tx.q(`UPDATE account_verifications SET status = $2, reviewer_id = $3, decision_note = $4, decided_at = now() WHERE id = $1`, [v.id, approved ? "approved" : "rejected", auth!.user.id, body.note]);
    await moderationAction(tx, auth!.user.id, { type: "account_verification", id: v.id }, body.decision, "pending", approved ? "approved" : "rejected", body.note);
    await audit(tx, auth!.user.id, `moderation.verification.${body.decision}`, { type: "player_profile", id: v.player_profile_id }, { kind: v.kind, user: v.user_id }, meta.ipHash);
    await notify(tx, v.user_id, "account_verified", approved ? (v.kind === "profile_claim" ? "Your profile claim was approved" : "Your account verification was approved") : "Your verification request was not approved", undefined, "/me/linked-accounts");
    return { ok: true };
  });
});
