import { z } from "zod";
import { route, zOptionalText } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { ApiError, badRequest, conflict, forbidden, notFound } from "@/lib/server/errors";
import { hasPlus } from "@/lib/server/entitlements";
import { rateLimit } from "@/lib/server/ratelimit";
import { COMMENDATION_LABELS } from "@/lib/categories";

const Body = z.object({
  playerProfileId: z.string().uuid(),
  category: z.enum(Object.keys(COMMENDATION_LABELS) as [string, ...string[]]),
  comment: zOptionalText(500),
});

export const POST = route({ auth: "mfa", body: Body, rate: { name: "commend-day", limit: 15, windowSec: 86400 } }, async ({ auth, body, meta }) => {
  if (auth!.user.suspended) throw forbidden();
  await rateLimit(`commend-hour:${auth!.user.id}`, 6, 3600);
  if (body.comment && !(await hasPlus(auth!.user.id))) throw new ApiError(402, "PLUS_REQUIRED", "Written comments are a ServerSentry Plus feature. Your commendation can still be sent without one.");
  return withDb(auth!.db, async (tx) => {
    // Serialise per (submitter, profile) to prevent race-condition duplicates.
    await tx.q(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`commend:${auth!.user.id}:${body.playerProfileId}`]);
    const p = await tx.one<{ id: string; game_id: number; platform_id: number; owner_user_id: string | null; public_id: string }>(
      `SELECT id, game_id, platform_id, owner_user_id, public_id FROM player_profiles WHERE id = $1 AND deleted_at IS NULL`, [body.playerProfileId]);
    if (!p) throw notFound("Player not found.");
    if (p.owner_user_id === auth!.user.id) throw badRequest("You can't commend your own profile.");
    const recent = await tx.one(`SELECT 1 FROM commendations WHERE submitter_user_id = $1 AND player_profile_id = $2 AND created_at > now() - interval '24 hours'`, [auth!.user.id, p.id]);
    if (recent) throw conflict("You've already commended this player today.");
    const dupe = await tx.one(`SELECT 1 FROM commendations WHERE submitter_user_id = $1 AND player_profile_id = $2 AND category = $3`, [auth!.user.id, p.id, body.category]);
    if (dupe) throw conflict("You've already given this player that commendation.");
    const row = await tx.one<{ id: string; status: string }>(
      `INSERT INTO commendations (player_profile_id, game_id, platform_id, category, comment, submitter_user_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, status`,
      [p.id, p.game_id, p.platform_id, body.category, body.comment, auth!.user.id]);
    await audit(tx, auth!.user.id, "commendation.submitted", { type: "commendation", id: row!.id }, { category: body.category, with_comment: !!body.comment }, meta.ipHash);
    return { ok: true, id: row!.id, status: row!.status, owner: p.owner_user_id, publicId: p.public_id };
  }).then(async (r) => {
    // Anti-sockpuppet: commendations from accounts younger than 72h are held for moderation (enforced atomically in the DB trigger).
    if (r.status === "approved" && r.owner) {
      await withDb(SYSTEM, (tx) => notify(tx, r.owner!, "commendation_received", "You received a commendation", undefined, `/players/${r.publicId}?tab=positive`));
    }
    return { ok: true, id: r.id, status: r.status };
  });
});
