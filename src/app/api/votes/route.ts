import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, GUEST, SYSTEM } from "@/lib/db";
import { notify } from "@/lib/server/notify";

const VOTE_SPIKE_THRESHOLD = Number(process.env.VOTE_SPIKE_THRESHOLD ?? 8);
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
  // D3 spike alert: many votes on one player within an hour -> notify moderators (at most once per 6 hours per player).
  if (body.value !== 0) {
    const spike = await withDb(SYSTEM, (tx) => tx.one<{ n: string; young: string; public_id: string }>(
      `SELECT count(*) AS n, count(*) FILTER (WHERE v.counts_from > now()) AS young, p.public_id FROM player_votes v JOIN player_profiles p ON p.id = v.player_profile_id
       WHERE v.player_profile_id = $1 AND v.updated_at > now() - interval '1 hour' GROUP BY p.public_id`, [body.playerProfileId]));
    if (spike && Number(spike.n) >= VOTE_SPIKE_THRESHOLD) {
      let first = false;
      try { first = (await rateLimit(`vote-spike-alert:${body.playerProfileId}`, 1, 6 * 3600)) === 1; } catch { first = false; }
      if (first) await withDb(SYSTEM, async (tx) => {
        const mods = await tx.q<{ id: string }>(`SELECT id FROM users WHERE role <> 'user' AND deleted_at IS NULL AND suspended_at IS NULL`);
        for (const m of mods) await notify(tx, m.id, "security", `Vote spike on ${spike.public_id}`, `${spike.n} votes in the last hour (${spike.young} from accounts under 72 hours old).`, "/admin");
        await audit(tx, null, "moderation.vote_spike_detected", { type: "player_profile", id: body.playerProfileId }, { votes: Number(spike.n), young: Number(spike.young) });
      });
    }
  }
  const s = await withDb(GUEST, (tx) => tx.one<{ upvotes: string; downvotes: string }>(`SELECT upvotes, downvotes FROM player_vote_stats WHERE player_profile_id = $1`, [body.playerProfileId]));
  // D3: votes from accounts younger than 72 hours are saved but only count once the account is 72 hours old.
  const mine = body.value === 0 ? null : await withDb(auth!.db, (tx) => tx.one<{ counts_from: Date }>(`SELECT counts_from FROM player_votes WHERE voter_user_id = $1 AND player_profile_id = $2`, [auth!.user.id, body.playerProfileId]));
  const heldUntil = mine && mine.counts_from.getTime() > Date.now() + 1000 ? mine.counts_from : null;
  return { ok: true, myVote: body.value, upvotes: Number(s?.upvotes ?? 0), downvotes: Number(s?.downvotes ?? 0), heldUntil };
});
