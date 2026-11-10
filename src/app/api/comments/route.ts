import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { hasPlus } from "@/lib/server/entitlements";
import { audit } from "@/lib/server/audit";
import { ApiError, badRequest, conflict, notFound } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

const Body = z.object({
  playerProfileId: z.string().uuid(),
  tone: z.enum(["positive", "neutral", "negative"]),
  body: z.string().trim().min(10).max(1000).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]+$/, "Invalid characters"),
}).strict();

/** Leave a written comment on a player. ServerSentry Plus only. Always held for moderation before it appears. */
export const POST = route({ auth: "mfa", body: Body, rate: { name: "comment-day", limit: 10, windowSec: 86400 } }, async ({ auth, body, meta }) => {
  if (!(await hasPlus(auth!.user.id))) throw new ApiError(402, "PLUS_REQUIRED", "Writing comments is a ServerSentry Plus feature.");
  await rateLimit(`comment-hour:${auth!.user.id}`, 4, 3600);
  return withDb(auth!.db, async (tx) => {
    await tx.q(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`comment:${auth!.user.id}:${body.playerProfileId}`]);
    const p = await tx.one<{ owner_user_id: string | null }>(`SELECT owner_user_id FROM player_profiles WHERE id = $1 AND deleted_at IS NULL`, [body.playerProfileId]);
    if (!p) throw notFound("Player not found.");
    if (p.owner_user_id === auth!.user.id) throw badRequest("You can't comment on your own profile.");
    const open = await tx.one(`SELECT 1 FROM player_comments WHERE author_user_id = $1 AND player_profile_id = $2 AND (status = 'pending' OR created_at > now() - interval '7 days')`, [auth!.user.id, body.playerProfileId]);
    if (open) throw conflict("You've commented on this player recently. You can comment again after 7 days.");
    const c = await tx.one<{ id: string }>(`INSERT INTO player_comments (player_profile_id, author_user_id, tone, body) VALUES ($1, $2, $3, $4) RETURNING id`,
      [body.playerProfileId, auth!.user.id, body.tone, body.body]);
    await audit(tx, auth!.user.id, "comment.submitted", { type: "player_comment", id: c!.id }, { tone: body.tone }, meta.ipHash);
    return { ok: true, id: c!.id, status: "pending" };
  });
});
