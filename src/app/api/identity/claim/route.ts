import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { startSteamVerification, startDiscordVerification, startBattlenetVerification, startCodeChallenge } from "@/lib/server/identity";
import { verificationOptions } from "@/lib/server/verification-options";
import { audit } from "@/lib/server/audit";
import { badRequest, conflict, notFound } from "@/lib/server/errors";

const Body = z.object({ playerProfileId: z.string().uuid(), method: z.enum(["steam", "battlenet", "discord", "code"]).optional(), note: z.string().trim().max(1000).optional() }).strict();

/**
 * Claim an existing (unowned) profile. Ownership is NEVER granted from a matching username alone:
 * official sign-in or Discord-verified connection (automatic), otherwise a profile-code check by a moderator.
 */
export const POST = route({ auth: "mfa", body: Body, rate: { name: "claim", limit: 5, windowSec: 86400 } }, async ({ auth, body, meta }) => {
  return withDb(auth!.db, async (tx) => {
    const p = await tx.one<{ id: string; owner_user_id: string | null; slug: string; discord_connection_type: string | null }>(
      `SELECT p.id, p.owner_user_id, pl.slug, pl.discord_connection_type FROM player_profiles p JOIN platforms pl ON pl.id = p.platform_id WHERE p.id = $1 AND p.deleted_at IS NULL`, [body.playerProfileId]);
    if (!p) throw notFound();
    if (p.owner_user_id) throw conflict("This profile has already been claimed. If you believe this is wrong, use the complaints process.");
    const options = verificationOptions(p.slug, p.discord_connection_type);
    const method = body.method ?? options[0].method;
    if (!options.some((o) => o.method === method)) throw badRequest("That verification method isn't available for this platform.");
    if (method === "steam") return { ok: true, redirect: await startSteamVerification(tx, auth!.user.id, p.id, "profile_claim", null) };
    if (method === "battlenet") return { ok: true, redirect: await startBattlenetVerification(tx, auth!.user.id, p.id, "profile_claim", null) };
    if (method === "discord") return { ok: true, redirect: await startDiscordVerification(tx, auth!.user.id, p.id, "profile_claim", null) };
    const ch = await startCodeChallenge(tx, auth!.user.id, p.id, "profile_claim", null, body.note ?? null);
    await audit(tx, auth!.user.id, "identity.claim_requested", { type: "player_profile", id: p.id }, { method: "profile_code" }, meta.ipHash);
    return { ok: true, pending: true, code: ch.code, verificationId: ch.id };
  });
});
