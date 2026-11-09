import "server-only";
import type { Tx } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { steamLoginUrl } from "@/lib/server/steam";

/** Creates a pending Steam OpenID verification and returns the redirect URL. */
export async function startSteamVerification(tx: Tx, userId: string, profileId: string, kind: "link_verification" | "profile_claim", gamingAccountId: string | null) {
  await tx.q(`UPDATE account_verifications SET status = 'cancelled', decided_at = now() WHERE user_id = $1 AND player_profile_id = $2 AND kind = $3 AND status = 'pending'`, [userId, profileId, kind]);
  const state = randomToken(24);
  await tx.q(
    `INSERT INTO account_verifications (user_id, player_profile_id, gaming_account_id, kind, method, nonce_hash, expires_at)
     VALUES ($1, $2, $3, $4, 'steam_openid', $5, now() + interval '15 minutes')`,
    [userId, profileId, gamingAccountId, kind, sha256(state)]);
  return steamLoginUrl(state);
}
