import { z } from "zod";
import QRCode from "qrcode";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { startHandoff } from "@/lib/server/identity";
import { verificationOptions } from "@/lib/server/verification-options";
import { audit } from "@/lib/server/audit";
import { env } from "@/lib/env";
import { badRequest, conflict, notFound } from "@/lib/server/errors";

const Body = z.object({
  gamingAccountId: z.string().uuid().optional(),
  playerProfileId: z.string().uuid().optional(),
  method: z.enum(["steam", "battlenet", "discord"]),
}).strict().refine((b) => !!b.gamingAccountId !== !!b.playerProfileId, "Provide exactly one target");

const METHOD = { steam: "steam_openid", battlenet: "battlenet_oauth", discord: "discord_connection" } as const;

/** Start "verify on your phone": returns a one-time QR link (10 minutes) that opens the official sign-in on the phone. */
export const POST = route({ auth: "mfa", body: Body, rate: { name: "handoff", limit: 15, windowSec: 3600 } }, async ({ auth, body, meta }) => {
  const r = await withDb(auth!.db, async (tx) => {
    let profileId: string, gaId: string | null = null, slug: string, dtype: string | null, kind: "link_verification" | "profile_claim";
    if (body.gamingAccountId) {
      const ga = await tx.one<{ id: string; player_profile_id: string; slug: string; discord_connection_type: string | null; verification_status: string }>(
        `SELECT ga.id, ga.player_profile_id, pl.slug, pl.discord_connection_type, ga.verification_status FROM gaming_accounts ga
         JOIN player_profiles p ON p.id = ga.player_profile_id JOIN platforms pl ON pl.id = ga.platform_id WHERE ga.id = $1 AND p.owner_user_id = $2`, [body.gamingAccountId, auth!.user.id]);
      if (!ga || ga.verification_status === "unlinked") throw notFound();
      if (ga.verification_status === "verified") throw badRequest("Already verified.");
      profileId = ga.player_profile_id; gaId = ga.id; slug = ga.slug; dtype = ga.discord_connection_type; kind = "link_verification";
    } else {
      const p = await tx.one<{ id: string; owner_user_id: string | null; slug: string; discord_connection_type: string | null }>(
        `SELECT p.id, p.owner_user_id, pl.slug, pl.discord_connection_type FROM player_profiles p JOIN platforms pl ON pl.id = p.platform_id WHERE p.id = $1 AND p.deleted_at IS NULL`, [body.playerProfileId]);
      if (!p) throw notFound();
      if (p.owner_user_id) throw conflict("This profile has already been claimed.");
      profileId = p.id; slug = p.slug; dtype = p.discord_connection_type; kind = "profile_claim";
    }
    if (!verificationOptions(slug, dtype).some((o) => o.method === body.method)) throw badRequest("That verification method isn't available for this platform.");
    return { profileId, gaId, kind };
  });
  const h = await withDb(SYSTEM, (tx) => startHandoff(tx, auth!.user.id, r.profileId, r.kind, r.gaId, METHOD[body.method]));
  await withDb(auth!.db, (tx) => audit(tx, auth!.user.id, "identity.handoff_started", { type: "account_verification", id: h.id }, { method: body.method }, meta.ipHash));
  const url = `${env.appUrl}/v/${h.token}`;
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  return { id: h.id, url, qrSvg, expiresInSeconds: 600 };
});
