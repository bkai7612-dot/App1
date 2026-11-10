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
    const v = await tx.one<{ id: string; user_id: string; player_profile_id: string; gaming_account_id: string | null; kind: string; status: string; verified_platform_user_id: string | null; method: string }>(
      `SELECT id, user_id, player_profile_id, gaming_account_id, kind, status, verified_platform_user_id, method FROM account_verifications WHERE id = $1 FOR UPDATE`, [id.data]);
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
                    VALUES ($1, $2, $3, $4, lower($4), $5, $7, $6, now())
                  ON CONFLICT (player_profile_id, platform_id, username_normalized) WHERE verification_status <> 'unlinked'
                  DO UPDATE SET platform_user_id = coalesce(EXCLUDED.platform_user_id, gaming_accounts.platform_user_id), verification_status = EXCLUDED.verification_status,
                    verification_method = EXCLUDED.verification_method, linked_by_user_id = EXCLUDED.linked_by_user_id, last_verified_at = now()`,
          [v.player_profile_id, p.platform_id, status === "verified" ? (v.verified_platform_user_id ?? p.platform_user_id) : null, p.display_name, status, v.user_id, v.method === "profile_code" ? "profile_code" : "manual_review"]);
      } else if (v.gaming_account_id) {
        const ga = await tx.one<{ verification_status: string }>(`SELECT verification_status FROM gaming_accounts WHERE id = $1`, [v.gaming_account_id]);
        if (!ga || ga.verification_status === "unlinked") throw badRequest("That account has been unlinked by its owner.");
        await tx.q(`UPDATE gaming_accounts SET verification_status = $2, verification_method = $3, last_verified_at = now() WHERE id = $1`, [v.gaming_account_id, status, v.method === "profile_code" ? "profile_code" : "manual_review"]);
      }
    }
    await tx.q(`UPDATE account_verifications SET status = $2, reviewer_id = $3, decision_note = $4, decided_at = now() WHERE id = $1`, [v.id, approved ? "approved" : "rejected", auth!.user.id, body.note]);
    await moderationAction(tx, auth!.user.id, { type: "account_verification", id: v.id }, body.decision, "pending", approved ? "approved" : "rejected", body.note);
    await audit(tx, auth!.user.id, `moderation.verification.${body.decision}`, { type: "player_profile", id: v.player_profile_id }, { kind: v.kind, user: v.user_id }, meta.ipHash);
    if (approved && v.kind === "profile_claim") {
      const reps = await tx.one<{ n: string }>(`SELECT count(*) AS n FROM public_reports WHERE player_profile_id = $1`, [v.player_profile_id]);
      if (Number(reps?.n ?? 0) > 0) await notify(tx, v.user_id, "report_published", `There are ${reps!.n} published reports on your new profile`, "You can read them, respond and appeal for free.", "/me/reports");
    }
    await notify(tx, v.user_id, "account_verified", approved ? (v.kind === "profile_claim" ? "Your profile claim was approved" : "Your account verification was approved") : "Your verification request was not approved", undefined, "/me/linked-accounts");
    return { ok: true };
  });
});
