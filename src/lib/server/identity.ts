import "server-only";
import type { Tx } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { steamLoginUrl } from "@/lib/server/steam";
export { steamLoginUrl };
import { discordLoginUrl } from "@/lib/server/discord";
import { battlenetLoginUrl } from "@/lib/server/battlenet";
import { publicId } from "@/lib/crypto";
import { withDb, SYSTEM } from "@/lib/db";

/** Creates a pending Steam OpenID verification and returns the redirect URL. */
export async function startSteamVerification(tx: Tx, userId: string, profileId: string, kind: "link_verification" | "profile_claim", gamingAccountId: string | null) {
  await cancelPendingVerifications(userId, profileId, kind, gamingAccountId);
  const state = randomToken(24);
  await tx.q(
    `INSERT INTO account_verifications (user_id, player_profile_id, gaming_account_id, kind, method, nonce_hash, expires_at)
     VALUES ($1, $2, $3, $4, 'steam_openid', $5, now() + interval '15 minutes')`,
    [userId, profileId, gamingAccountId, kind, sha256(state)]);
  return steamLoginUrl(state);
}

type Kind = "link_verification" | "profile_claim";

async function startOAuth(tx: Tx, method: "discord_connection" | "battlenet_oauth", userId: string, profileId: string, kind: Kind, gamingAccountId: string | null) {
  await cancelPendingVerifications(userId, profileId, kind, gamingAccountId);
  const state = randomToken(24);
  await tx.q(
    `INSERT INTO account_verifications (user_id, player_profile_id, gaming_account_id, kind, method, nonce_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + interval '15 minutes')`,
    [userId, profileId, gamingAccountId, kind, method, sha256(state)]);
  return state;
}

/** Discord connections: automatic verification for PlayStation and other platforms Discord verifies. */
export async function startDiscordVerification(tx: Tx, userId: string, profileId: string, kind: Kind, gamingAccountId: string | null) {
  return discordLoginUrl(await startOAuth(tx, "discord_connection", userId, profileId, kind, gamingAccountId));
}

/** Battle.net official sign-in. */
export async function startBattlenetVerification(tx: Tx, userId: string, profileId: string, kind: Kind, gamingAccountId: string | null) {
  return battlenetLoginUrl(await startOAuth(tx, "battlenet_oauth", userId, profileId, kind, gamingAccountId));
}

/**
 * Profile-code challenge: the player puts a one-time code in a public field of their gaming profile (bio / about me /
 * status). A moderator only has to look for the code and click Approve. Returns the code to show the player.
 */
export async function startCodeChallenge(tx: Tx, userId: string, profileId: string, kind: Kind, gamingAccountId: string | null, note: string | null) {
  await cancelPendingVerifications(userId, profileId, kind, gamingAccountId);
  const code = publicId("SS", 6);
  await tx.q(
    `INSERT INTO account_verifications (user_id, player_profile_id, gaming_account_id, kind, method, challenge_code, claim_note, expires_at)
     VALUES ($1, $2, $3, $4, 'profile_code', $5, $6, now() + interval '14 days')`,
    [userId, profileId, gamingAccountId, kind, code, note]);
  return code;
}

export type VerifyRow = { id: string; user_id: string; player_profile_id: string; gaming_account_id: string | null; kind: string; handoff: boolean; email: string; display_name: string };

/**
 * Consumes a single-use OAuth/OpenID state. Normal flows must come back to the same signed-in user;
 * QR handoff flows (phone) are bound to the user by the state itself, which only the phone that opened the
 * one-time QR link received.
 */
export async function consumeVerificationState(tx: Tx, state: string, method: string, authUserId: string | null): Promise<VerifyRow | null> {
  if (!state || state.length > 200) return null;
  const v = await tx.one<Omit<VerifyRow, "email" | "display_name">>(
    `UPDATE account_verifications SET nonce_hash = NULL
     WHERE nonce_hash = $1 AND method = $2 AND status = 'pending' AND expires_at > now() AND (handoff OR user_id = $3::uuid)
     RETURNING id, user_id, player_profile_id, gaming_account_id, kind, handoff`, [sha256(state), method, authUserId]);
  if (!v) return null;
  const u = await tx.one<{ email: string; display_name: string }>(`SELECT email, display_name FROM users WHERE id = $1`, [v.user_id]);
  return u ? { ...v, ...u } : null;
}

/** Creates a QR handoff: returns the one-time token to put in the QR link (state is minted when the phone continues). */
export async function startHandoff(tx: Tx, userId: string, profileId: string, kind: Kind, gamingAccountId: string | null, method: "steam_openid" | "battlenet_oauth" | "discord_connection") {
  await cancelPendingVerifications(userId, profileId, kind, gamingAccountId);
  const token = randomToken(24);
  const row = await tx.one<{ id: string }>(
    `INSERT INTO account_verifications (user_id, player_profile_id, gaming_account_id, kind, method, handoff, handoff_token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, true, $6, now() + interval '10 minutes') RETURNING id`, [userId, profileId, gamingAccountId, kind, method, sha256(token)]);
  return { id: row!.id, token };
}

/** Phone side: exchanges the one-time QR token for a provider state (single use). */
export async function continueHandoff(tx: Tx, token: string) {
  const v = await tx.one<{ id: string; method: string }>(
    `UPDATE account_verifications SET handoff_token_hash = NULL WHERE handoff_token_hash = $1 AND handoff AND status = 'pending' AND expires_at > now() RETURNING id, method`, [sha256(token)]);
  if (!v) return null;
  const state = randomToken(24);
  await tx.q(`UPDATE account_verifications SET nonce_hash = $2, expires_at = now() + interval '15 minutes' WHERE id = $1`, [v.id, sha256(state)]);
  return { method: v.method, state };
}

/**
 * Cancels the user's earlier pending attempt for the same target before starting a new one (I-01).
 * Runs in system context: users may not update verification rows directly (RLS), which previously
 * made this a silent no-op and locked people out of every other verification method.
 */
export async function cancelPendingVerifications(userId: string, profileId: string, kind: string, gamingAccountId: string | null) {
  await withDb(SYSTEM, (tx) => tx.q(
    `UPDATE account_verifications SET status = 'cancelled', decided_at = now(), nonce_hash = NULL, handoff_token_hash = NULL
     WHERE user_id = $1 AND player_profile_id = $2 AND kind = $3 AND status = 'pending' AND gaming_account_id IS NOT DISTINCT FROM $4`,
    [userId, profileId, kind, gamingAccountId]));
}
