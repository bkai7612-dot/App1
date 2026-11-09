import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { startSteamVerification } from "@/lib/server/identity";
import { audit } from "@/lib/server/audit";
import { badRequest, conflict, notFound } from "@/lib/server/errors";

const Body = z.object({ playerProfileId: z.string().uuid(), note: z.string().trim().max(1000).optional() }).strict();

/**
 * Claim an existing (unowned) profile. Ownership is NEVER granted from a matching username:
 * Steam => official OpenID proof; other platforms => moderator-reviewed claim.
 */
export const POST = route({ auth: "mfa", body: Body, rate: { name: "claim", limit: 5, windowSec: 86400 } }, async ({ auth, body, meta }) => {
  return withDb(auth!.db, async (tx) => {
    const p = await tx.one<{ id: string; owner_user_id: string | null; slug: string; integration_status: string }>(
      `SELECT p.id, p.owner_user_id, pl.slug, pl.integration_status FROM player_profiles p JOIN platforms pl ON pl.id = p.platform_id WHERE p.id = $1 AND p.deleted_at IS NULL`, [body.playerProfileId]);
    if (!p) throw notFound();
    if (p.owner_user_id) throw conflict("This profile has already been claimed. If you believe this is wrong, use the complaints process.");
    if (p.slug === "steam" && p.integration_status === "verified_linking") {
      return { ok: true, redirect: await startSteamVerification(tx, auth!.user.id, p.id, "profile_claim", null) };
    }
    if (!body.note || body.note.length < 20) throw badRequest("Explain how a moderator can confirm ownership (at least 20 characters).");
    const v = await tx.one<{ id: string }>(
      `INSERT INTO account_verifications (user_id, player_profile_id, kind, method, claim_note, expires_at)
       VALUES ($1, $2, 'profile_claim', 'manual_review', $3, now() + interval '30 days') RETURNING id`, [auth!.user.id, p.id, body.note]);
    await audit(tx, auth!.user.id, "identity.claim_requested", { type: "account_verification", id: v!.id }, {}, meta.ipHash);
    return { ok: true, pending: true };
  });
});
