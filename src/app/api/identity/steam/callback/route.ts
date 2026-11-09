import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth/session";
import { withDb, SYSTEM } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { verifySteamAssertion, steamPersonaName } from "@/lib/server/steam";
import { audit, securityEvent } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { securityNotice } from "@/lib/auth/flows";
import { ipHash, userAgent } from "@/lib/server/request";

/** Steam OpenID return endpoint. The state is single-use, bound to the signed-in user and expires in 15 minutes. */
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(`${env.appUrl}/me/linked-accounts?${q}`, { headers: { "Cache-Control": "no-store" } });
  const auth = await getAuth();
  if (!auth || auth.pendingMfa) return NextResponse.redirect(`${env.appUrl}/login`);
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const meta = { ipHash: await ipHash(), userAgent: await userAgent() };
  const v = await withDb(SYSTEM, (tx) => tx.one<{ id: string; player_profile_id: string; gaming_account_id: string | null; kind: string }>(
    `UPDATE account_verifications SET nonce_hash = NULL
     WHERE nonce_hash = $1 AND user_id = $2 AND status = 'pending' AND method = 'steam_openid' AND expires_at > now()
     RETURNING id, player_profile_id, gaming_account_id, kind`, [sha256(state), auth.user.id]));
  if (!v) return back("steam=invalid");
  let steamId: string | null = null;
  try { steamId = await verifySteamAssertion(req.nextUrl.searchParams, state); } catch { steamId = null; }
  if (!steamId) {
    await withDb(SYSTEM, async (tx) => {
      await tx.q(`UPDATE account_verifications SET status = 'rejected', decided_at = now(), decision_note = 'Steam assertion invalid' WHERE id = $1`, [v.id]);
      await securityEvent(tx, auth.user.id, "steam_verification_failed", meta);
    });
    return back("steam=failed");
  }
  const persona = await steamPersonaName(steamId);
  const result = await withDb(SYSTEM, async (tx) => {
    const owner = await tx.one<{ id: string }>(`SELECT ga.id FROM gaming_accounts ga JOIN platforms pl ON pl.id = ga.platform_id
      WHERE pl.slug = 'steam' AND ga.platform_user_id = $1 AND ga.verification_status = 'verified'`, [steamId]);
    const profile = await tx.one<{ id: string; owner_user_id: string | null; platform_user_id: string | null; platform_id: number }>(
      `SELECT id, owner_user_id, platform_user_id, platform_id FROM player_profiles WHERE id = $1`, [v.player_profile_id]);
    if (!profile) return "invalid";
    if (owner && owner.id !== v.gaming_account_id) {
      await tx.q(`UPDATE account_verifications SET status = 'rejected', decided_at = now(), verified_platform_user_id = $2, decision_note = 'SteamID already verified on another profile' WHERE id = $1`, [v.id, steamId]);
      await securityEvent(tx, auth.user.id, "steam_already_linked_elsewhere", meta);
      return "taken";
    }
    if (v.kind === "link_verification") {
      if (profile.owner_user_id !== auth.user.id) return "invalid";
      await tx.q(`UPDATE gaming_accounts SET platform_user_id = $2, verification_status = 'verified', verification_method = 'steam_openid', last_verified_at = now(),
                  username = coalesce($3, username) WHERE id = $1`, [v.gaming_account_id, steamId, persona]);
    } else {
      // Profile claim: the proven SteamID must match the profile's recorded SteamID. Otherwise a moderator decides.
      if (profile.owner_user_id) return "taken";
      if (!profile.platform_user_id || profile.platform_user_id !== steamId) {
        await tx.q(`UPDATE account_verifications SET verified_platform_user_id = $2, method = 'manual_review', claim_note = 'Steam OpenID proved SteamID ' || $2 || '; profile has no matching recorded SteamID. Moderator review required.' WHERE id = $1`, [v.id, steamId]);
        return "review";
      }
      await tx.q(`UPDATE player_profiles SET owner_user_id = $2 WHERE id = $1`, [profile.id, auth.user.id]);
      await tx.q(`INSERT INTO gaming_accounts (player_profile_id, platform_id, platform_user_id, username, username_normalized, verification_status, verification_method, linked_by_user_id, last_verified_at)
                  VALUES ($1, $2, $3, $4, lower($4), 'verified', 'steam_openid', $5, now())`, [profile.id, profile.platform_id, steamId, persona ?? `steam:${steamId}`, auth.user.id]);
    }
    await tx.q(`UPDATE account_verifications SET status = 'approved', decided_at = now(), verified_platform_user_id = $2 WHERE id = $1`, [v.id, steamId]);
    await securityEvent(tx, auth.user.id, "steam_verified", meta);
    await audit(tx, auth.user.id, "identity.verified", { type: "player_profile", id: profile.id }, { method: "steam_openid", kind: v.kind });
    await notify(tx, auth.user.id, "account_verified", "Your Steam account was verified");
    await securityNotice(tx, auth.user.id, auth.user.email, "A Steam account was verified on your profile");
    return "ok";
  });
  return back(`steam=${result}`);
}
