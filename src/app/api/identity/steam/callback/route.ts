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
import { consumeVerificationState } from "@/lib/server/identity";

/** Steam OpenID return endpoint. The state is single-use, bound to the signed-in user and expires in 15 minutes. */
export async function GET(req: NextRequest) {
  let handoff = false;
  const back = (q: string) => NextResponse.redirect(handoff ? `${env.appUrl}/v/done?${q}` : `${env.appUrl}/me/linked-accounts?${q}`, { headers: { "Cache-Control": "no-store" } });
  const auth = await getAuth();
  const authId = auth && !auth.pendingMfa ? auth.user.id : null;
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const meta = { ipHash: await ipHash(), userAgent: await userAgent() };
  const v = await withDb(SYSTEM, (tx) => consumeVerificationState(tx, state, "steam_openid", authId));
  if (!v) { if (!authId) return NextResponse.redirect(`${env.appUrl}/login`); return back("steam=invalid"); }
  handoff = v.handoff;
  let steamId: string | null = null;
  try { steamId = await verifySteamAssertion(req.nextUrl.searchParams, state); } catch { steamId = null; }
  if (!steamId) {
    await withDb(SYSTEM, async (tx) => {
      await tx.q(`UPDATE account_verifications SET status = 'rejected', decided_at = now(), decision_note = 'Steam assertion invalid' WHERE id = $1`, [v.id]);
      await securityEvent(tx, v.user_id, "steam_verification_failed", meta);
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
      await securityEvent(tx, v.user_id, "steam_already_linked_elsewhere", meta);
      return "taken";
    }
    if (v.kind === "link_verification") {
      if (profile.owner_user_id !== v.user_id) return "invalid";
      await tx.q(`UPDATE gaming_accounts SET platform_user_id = $2, verification_status = 'verified', verification_method = 'steam_openid', last_verified_at = now(),
                  username = coalesce($3, username) WHERE id = $1`, [v.gaming_account_id, steamId, persona]);
    } else {
      // Profile claim: the proven SteamID must match the profile's recorded SteamID. Otherwise a moderator decides.
      if (profile.owner_user_id) return "taken";
      if (!profile.platform_user_id || profile.platform_user_id !== steamId) {
        await tx.q(`UPDATE account_verifications SET verified_platform_user_id = $2, method = 'manual_review', claim_note = 'Steam OpenID proved SteamID ' || $2 || '; profile has no matching recorded SteamID. Moderator review required.' WHERE id = $1`, [v.id, steamId]);
        return "review";
      }
      await tx.q(`UPDATE player_profiles SET owner_user_id = $2 WHERE id = $1`, [profile.id, v.user_id]);
      await tx.q(`INSERT INTO gaming_accounts (player_profile_id, platform_id, platform_user_id, username, username_normalized, verification_status, verification_method, linked_by_user_id, last_verified_at)
                  VALUES ($1, $2, $3, $4, lower($4), 'verified', 'steam_openid', $5, now())
                  ON CONFLICT (player_profile_id, platform_id, username_normalized) WHERE verification_status <> 'unlinked'
                  DO UPDATE SET platform_user_id = coalesce(EXCLUDED.platform_user_id, gaming_accounts.platform_user_id), verification_status = EXCLUDED.verification_status,
                    verification_method = EXCLUDED.verification_method, linked_by_user_id = EXCLUDED.linked_by_user_id, last_verified_at = now()`, [profile.id, profile.platform_id, steamId, persona ?? `steam:${steamId}`, v.user_id]);
    }
    await tx.q(`UPDATE account_verifications SET status = 'approved', decided_at = now(), verified_platform_user_id = $2 WHERE id = $1`, [v.id, steamId]);
    await securityEvent(tx, v.user_id, "steam_verified", meta);
    await audit(tx, v.user_id, "identity.verified", { type: "player_profile", id: profile.id }, { method: "steam_openid", kind: v.kind });
    await notify(tx, v.user_id, "account_verified", "Your Steam account was verified");
    await securityNotice(tx, v.user_id, v.email, "A Steam account was verified on your profile");
    return "ok";
  });
  return back(`steam=${result}`);
}
