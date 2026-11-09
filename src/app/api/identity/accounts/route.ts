import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { normalizeName } from "@/lib/server/players";
import { audit, securityEvent } from "@/lib/server/audit";
import { badRequest, forbidden } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

const Body = z.object({
  playerProfileId: z.string().uuid(),
  platformSlug: z.string().max(40),
  username: z.string().trim().min(1).max(64).regex(/^[^\u0000-\u001f<>]+$/),
}).strict();

/** Add an UNVERIFIED gaming account link to a profile you own. Verification is a separate step. */
export const POST = route({ auth: "mfa", body: Body, rate: { name: "link-add", limit: 20, windowSec: 86400 } }, async ({ auth, body, meta }) => {
  await rateLimit(`link-add-h:${auth!.user.id}`, 6, 3600);
  return withDb(auth!.db, async (tx) => {
    const prof = await tx.one(`SELECT 1 FROM player_profiles WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL`, [body.playerProfileId, auth!.user.id]);
    if (!prof) {
      await securityEvent(tx, auth!.user.id, "link_attempt_unowned_profile", meta, { profile: body.playerProfileId });
      throw forbidden("You can only link accounts to profiles you own.");
    }
    const p = await tx.one<{ id: number }>(`SELECT id FROM platforms WHERE slug = $1 AND active`, [body.platformSlug]);
    if (!p) throw badRequest("Unknown platform.");
    const row = await tx.one<{ id: string }>(
      `INSERT INTO gaming_accounts (player_profile_id, platform_id, username, username_normalized, linked_by_user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [body.playerProfileId, p.id, body.username, normalizeName(body.username), auth!.user.id]);
    await securityEvent(tx, auth!.user.id, "gaming_account_linked", meta, { platform: body.platformSlug });
    await audit(tx, auth!.user.id, "identity.account_linked", { type: "gaming_account", id: row!.id }, { platform: body.platformSlug, status: "unverified" }, meta.ipHash);
    return { ok: true, id: row!.id };
  });
});
