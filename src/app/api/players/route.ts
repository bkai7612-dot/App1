import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { publicId } from "@/lib/crypto";
import { normalizeName } from "@/lib/server/players";
import { audit } from "@/lib/server/audit";
import { badRequest, conflict } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

const Body = z.object({
  displayName: z.string().trim().min(1).max(64).regex(/^[^\u0000-\u001f\u007f<>\u202a-\u202e\u2066-\u2069\u200b-\u200f\u061c\ufeff\u00ad]+$/, "Invalid characters"),
  gameSlug: z.string().max(40),
  platformSlug: z.string().max(40),
  platformUserId: z.string().trim().max(128).regex(/^[A-Za-z0-9#_.:\-]*$/).optional().nullable(),
  confirmDistinct: z.boolean().optional(),
});

/**
 * Manually identify a player not yet on ServerSentry. Creates an UNVERIFIED, unowned profile.
 * Never merges with existing profiles; if same-named profiles exist, the user must confirm it is a different player.
 */
export const POST = route({ auth: "mfa", body: Body, rate: { name: "player-create", limit: 10, windowSec: 86400 } }, async ({ auth, body, meta }) => {
  await rateLimit(`player-create-h:${auth!.user.id}`, 4, 3600);
  return withDb(auth!.db, async (tx) => {
    const g = await tx.one<{ id: number }>(`SELECT id FROM games WHERE slug = $1 AND active`, [body.gameSlug]);
    const p = await tx.one<{ id: number }>(`SELECT id FROM platforms WHERE slug = $1 AND active`, [body.platformSlug]);
    if (!g || !p) throw badRequest("Choose a supported game and platform.");
    const norm = normalizeName(body.displayName);
    const same = await tx.q<{ public_id: string }>(
      `SELECT public_id FROM player_profiles WHERE game_id = $1 AND platform_id = $2 AND display_name_normalized = $3 AND deleted_at IS NULL LIMIT 5`, [g.id, p.id, norm]);
    if (same.length && !body.confirmDistinct) {
      return { needsConfirmation: true, existing: same.map((s) => s.public_id) };
    }
    if (body.platformUserId) {
      const dup = await tx.one<{ public_id: string }>(`SELECT public_id FROM player_profiles WHERE platform_id = $1 AND game_id = $2 AND platform_user_id = $3 AND deleted_at IS NULL`, [p.id, g.id, body.platformUserId]);
      if (dup) throw conflict(`A profile with that platform ID already exists (${dup.public_id}).`);
    }
    const pid = publicId("SS");
    const row = await tx.one<{ id: string }>(
      `INSERT INTO player_profiles (public_id, display_name, display_name_normalized, game_id, platform_id, platform_user_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [pid, body.displayName, norm, g.id, p.id, body.platformUserId || null, auth!.user.id]);
    await audit(tx, auth!.user.id, "player_profile.created", { type: "player_profile", id: row!.id }, { public_id: pid }, meta.ipHash);
    return { ok: true, publicId: pid };
  });
});
