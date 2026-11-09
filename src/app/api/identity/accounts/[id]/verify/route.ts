import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { startSteamVerification } from "@/lib/server/identity";
import { audit } from "@/lib/server/audit";
import { badRequest, conflict, notFound } from "@/lib/server/errors";

const Body = z.object({ note: z.string().trim().max(1000).optional() }).strict();

/**
 * Start ownership verification for one of your linked accounts.
 * Steam: official OpenID sign-in. Other platforms: no official integration available yet —
 * a moderator reviews a manual ownership proof (never credentials).
 */
export const POST = route({ auth: "mfa", body: Body, rate: { name: "verify-start", limit: 10, windowSec: 86400 } }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  return withDb(auth!.db, async (tx) => {
    const ga = await tx.one<{ id: string; player_profile_id: string; slug: string; integration_status: string; verification_status: string }>(
      `SELECT ga.id, ga.player_profile_id, pl.slug, pl.integration_status, ga.verification_status FROM gaming_accounts ga
       JOIN player_profiles p ON p.id = ga.player_profile_id JOIN platforms pl ON pl.id = ga.platform_id
       WHERE ga.id = $1 AND p.owner_user_id = $2`, [id.data, auth!.user.id]);
    if (!ga) throw notFound();
    if (ga.verification_status === "verified") throw badRequest("Already verified.");
    if (ga.verification_status === "unlinked") throw notFound();
    if (ga.slug === "steam" && ga.integration_status === "verified_linking") {
      return { ok: true, redirect: await startSteamVerification(tx, auth!.user.id, ga.player_profile_id, "link_verification", ga.id) };
    }
    if (!body.note || body.note.length < 20) throw badRequest("Explain how a moderator can confirm you own this account (at least 20 characters).");
    const pending = await tx.one(`SELECT 1 FROM account_verifications WHERE user_id = $1 AND gaming_account_id = $2 AND status = 'pending'`, [auth!.user.id, ga.id]);
    if (pending) throw conflict("A verification request is already pending.");
    const v = await tx.one<{ id: string }>(
      `INSERT INTO account_verifications (user_id, player_profile_id, gaming_account_id, kind, method, claim_note, expires_at)
       VALUES ($1, $2, $3, 'link_verification', 'manual_review', $4, now() + interval '30 days') RETURNING id`,
      [auth!.user.id, ga.player_profile_id, ga.id, body.note]);
    await audit(tx, auth!.user.id, "identity.verification_requested", { type: "account_verification", id: v!.id }, { method: "manual_review" }, meta.ipHash);
    return { ok: true, pending: true };
  });
});
