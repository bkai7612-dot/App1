import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { startSteamVerification, startDiscordVerification, startBattlenetVerification, startCodeChallenge } from "@/lib/server/identity";
import { verificationOptions } from "@/lib/server/verification-options";
import { audit } from "@/lib/server/audit";
import { badRequest, notFound } from "@/lib/server/errors";

const Body = z.object({ method: z.enum(["steam", "battlenet", "discord", "code"]).optional(), note: z.string().trim().max(1000).optional() }).strict();

/**
 * Start ownership verification for one of your linked accounts using the best available route:
 * official platform sign-in (Steam, Battle.net) → Discord connections → profile-code check by a moderator.
 */
export const POST = route({ auth: "mfa", body: Body, rate: { name: "verify-start", limit: 10, windowSec: 86400 } }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  return withDb(auth!.db, async (tx) => {
    const ga = await tx.one<{ id: string; player_profile_id: string; slug: string; verification_status: string; discord_connection_type: string | null }>(
      `SELECT ga.id, ga.player_profile_id, pl.slug, ga.verification_status, pl.discord_connection_type FROM gaming_accounts ga
       JOIN player_profiles p ON p.id = ga.player_profile_id JOIN platforms pl ON pl.id = ga.platform_id
       WHERE ga.id = $1 AND p.owner_user_id = $2`, [id.data, auth!.user.id]);
    if (!ga || ga.verification_status === "unlinked") throw notFound();
    if (ga.verification_status === "verified") throw badRequest("Already verified.");
    const options = verificationOptions(ga.slug, ga.discord_connection_type);
    const method = body.method ?? options[0].method;
    if (!options.some((o) => o.method === method)) throw badRequest("That verification method isn't available for this platform.");
    if (method === "steam") return { ok: true, redirect: await startSteamVerification(tx, auth!.user.id, ga.player_profile_id, "link_verification", ga.id) };
    if (method === "battlenet") return { ok: true, redirect: await startBattlenetVerification(tx, auth!.user.id, ga.player_profile_id, "link_verification", ga.id) };
    if (method === "discord") return { ok: true, redirect: await startDiscordVerification(tx, auth!.user.id, ga.player_profile_id, "link_verification", ga.id) };
    const pending = await tx.one<{ id: string; challenge_code: string | null }>(`SELECT id, challenge_code FROM account_verifications WHERE user_id = $1 AND gaming_account_id = $2 AND status = 'pending' AND method = 'profile_code' AND expires_at > now()`, [auth!.user.id, ga.id]);
    if (pending?.challenge_code) return { ok: true, pending: true, code: pending.challenge_code, verificationId: pending.id };
    const ch = await startCodeChallenge(tx, auth!.user.id, ga.player_profile_id, "link_verification", ga.id, body.note ?? null);
    await audit(tx, auth!.user.id, "identity.verification_requested", { type: "gaming_account", id: ga.id }, { method: "profile_code" }, meta.ipHash);
    return { ok: true, pending: true, code: ch.code, verificationId: ch.id };
  });
});
