import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, GUEST } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { badRequest, notFound } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

const Body = z.object({ playerProfileId: z.string().uuid(), value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) }).strict();

/** Upvote (+1), downvote (-1) or withdraw (0). Free for every member with two-factor authentication; one vote per player. */
export const POST = route({ auth: "mfa", body: Body, rate: { name: "vote", limit: 60, windowSec: 3600 } }, async ({ auth, body, meta }) => {
  if (auth!.user.suspended) throw notFound();
  await rateLimit(`vote-profile:${auth!.user.id}:${body.playerProfileId}`, 10, 86400); // stops flip-flopping
  const counts = await withDb(auth!.db, async (tx) => {
    const p = await tx.one<{ owner_user_id: string | null }>(`SELECT owner_user_id FROM player_profiles WHERE id = $1 AND deleted_at IS NULL`, [body.playerProfileId]);
    if (!p) throw notFound("Player not found.");
    if (p.owner_user_id === auth!.user.id) throw badRequest("You can't vote on your own profile.");
    if (body.value === 0) await tx.q(`DELETE FROM player_votes WHERE voter_user_id = $1 AND player_profile_id = $2`, [auth!.user.id, body.playerProfileId]);
    else await tx.q(
      `INSERT INTO player_votes (voter_user_id, player_profile_id, value) VALUES ($1, $2, $3)
       ON CONFLICT (voter_user_id, player_profile_id) DO UPDATE SET value = EXCLUDED.value`, [auth!.user.id, body.playerProfileId, body.value]);
    await audit(tx, auth!.user.id, "vote.cast", { type: "player_profile", id: body.playerProfileId }, { value: body.value }, meta.ipHash);
    return null;
  });
  void counts;
  const s = await withDb(GUEST, (tx) => tx.one<{ upvotes: string; downvotes: string }>(`SELECT upvotes, downvotes FROM player_vote_stats WHERE player_profile_id = $1`, [body.playerProfileId]));
  return { ok: true, myVote: body.value, upvotes: Number(s?.upvotes ?? 0), downvotes: Number(s?.downvotes ?? 0) };
});
