import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { publicId } from "@/lib/crypto";
import { normalizeName } from "@/lib/server/players";
import { audit } from "@/lib/server/audit";
import { badRequest } from "@/lib/server/errors";

const Body = z.object({
  displayName: z.string().trim().min(1).max(64).regex(/^[^\u0000-\u001f\u007f<>\u202a-\u202e\u2066-\u2069]+$/),
  gameSlug: z.string().max(40),
  platformSlug: z.string().max(40),
}).strict();

/** Create your OWN player profile (owned, unverified until a linked account is verified). */
export const POST = route({ auth: "mfa", body: Body, rate: { name: "own-profile", limit: 5, windowSec: 86400 } }, async ({ auth, body, meta }) => {
  return withDb(auth!.db, async (tx) => {
    const n = await tx.one<{ n: string }>(`SELECT count(*) AS n FROM player_profiles WHERE owner_user_id = $1 AND deleted_at IS NULL`, [auth!.user.id]);
    if (Number(n?.n ?? 0) >= 10) throw badRequest("You can own at most 10 player profiles.");
    const g = await tx.one<{ id: number }>(`SELECT id FROM games WHERE slug = $1 AND active`, [body.gameSlug]);
    const p = await tx.one<{ id: number }>(`SELECT id FROM platforms WHERE slug = $1 AND active`, [body.platformSlug]);
    if (!g || !p) throw badRequest("Choose a supported game and platform.");
    const pid = publicId("SS");
    const row = await tx.one<{ id: string }>(
      `INSERT INTO player_profiles (public_id, display_name, display_name_normalized, game_id, platform_id, owner_user_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id`, [pid, body.displayName, normalizeName(body.displayName), g.id, p.id, auth!.user.id]);
    await tx.q(`INSERT INTO gaming_accounts (player_profile_id, platform_id, username, username_normalized, linked_by_user_id) VALUES ($1, $2, $3, $4, $5)`,
      [row!.id, p.id, body.displayName, normalizeName(body.displayName), auth!.user.id]);
    await audit(tx, auth!.user.id, "identity.own_profile_created", { type: "player_profile", id: row!.id }, { public_id: pid }, meta.ipHash);
    return { ok: true, publicId: pid };
  });
});
