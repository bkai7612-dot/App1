import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth/session";
import { withDb, SYSTEM } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { battlenetEnabled, battlenetIdentity } from "@/lib/server/battlenet";
import { sameName } from "@/lib/server/discord";
import { normalizeName } from "@/lib/server/players";
import { audit, securityEvent } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { securityNotice } from "@/lib/auth/flows";
import { ipHash, userAgent } from "@/lib/server/request";
import { consumeVerificationState } from "@/lib/server/identity";

/** Battle.net OAuth return: single-use state bound to the signed-in user; BattleTags are globally unique. */
export async function GET(req: NextRequest) {
  let handoff = false;
  const back = (q: string) => NextResponse.redirect(handoff ? `${env.appUrl}/v/done?${q}` : `${env.appUrl}/me/linked-accounts?${q}`, { headers: { "Cache-Control": "no-store" } });
  const auth = await getAuth();
  const authId = auth && !auth.pendingMfa ? auth.user.id : null;
  if (!battlenetEnabled()) return back("battlenet=unavailable");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const meta = { ipHash: await ipHash(), userAgent: await userAgent() };
  const v = await withDb(SYSTEM, (tx) => consumeVerificationState(tx, state, "battlenet_oauth", authId));
  if (!v) { if (!authId) return NextResponse.redirect(`${env.appUrl}/login`); return back("battlenet=invalid"); }
  handoff = v.handoff;
  if (!code || code.length > 300) {
    await withDb(SYSTEM, (tx) => tx.q(`UPDATE account_verifications SET status = 'cancelled', decided_at = now() WHERE id = $1`, [v.id]));
    return back("battlenet=cancelled");
  }
  let who: { id: string; battletag: string };
  try { who = await battlenetIdentity(code); } catch (e) {
    console.error("[battlenet] verification failed", e);
    await withDb(SYSTEM, (tx) => tx.q(`UPDATE account_verifications SET status = 'rejected', decided_at = now(), decision_note = 'Battle.net check failed' WHERE id = $1`, [v.id]));
    return back("battlenet=failed");
  }
  const result = await withDb(SYSTEM, async (tx) => {
    const profile = await tx.one<{ id: string; owner_user_id: string | null; platform_user_id: string | null; platform_id: number; display_name: string }>(
      `SELECT id, owner_user_id, platform_user_id, platform_id, display_name FROM player_profiles WHERE id = $1`, [v.player_profile_id]);
    if (!profile) return "invalid";
    const ga = v.gaming_account_id ? await tx.one<{ id: string; username: string; platform_id: number }>(`SELECT id, username, platform_id FROM gaming_accounts WHERE id = $1 AND verification_status <> 'unlinked'`, [v.gaming_account_id]) : null;
    const target = v.kind === "link_verification" ? ga?.username : profile.display_name;
    const platformId = v.kind === "link_verification" ? ga?.platform_id : profile.platform_id;
    if (!target || !platformId) return "invalid";
    const matches = (profile.platform_user_id && profile.platform_user_id === who.id) || sameName(target, who.battletag);
    if (!matches) {
      await tx.q(`UPDATE account_verifications SET method = 'manual_review', expires_at = now() + interval '30 days', verified_platform_user_id = $2,
                  claim_note = 'Battle.net sign-in proved BattleTag ' || $3 || ', which does not match ' || $4 || '. Moderator review required.' WHERE id = $1`, [v.id, who.id, who.battletag, target]);
      return "review";
    }
    const taken = await tx.one<{ id: string }>(`SELECT id FROM gaming_accounts WHERE platform_id = $1 AND platform_user_id = $2 AND verification_status = 'verified'`, [platformId, who.id]);
    if (taken && taken.id !== v.gaming_account_id) {
      await tx.q(`UPDATE account_verifications SET status = 'rejected', decided_at = now(), decision_note = 'Account already verified on another profile' WHERE id = $1`, [v.id]);
      return "taken";
    }
    if (v.kind === "link_verification") {
      if (profile.owner_user_id !== v.user_id) return "invalid";
      await tx.q(`UPDATE gaming_accounts SET platform_user_id = $2, username = $3, username_normalized = $4, verification_status = 'verified', verification_method = 'battlenet_oauth', last_verified_at = now() WHERE id = $1`,
        [v.gaming_account_id, who.id, who.battletag, normalizeName(who.battletag)]);
    } else {
      if (profile.owner_user_id) return "taken";
      await tx.q(`UPDATE player_profiles SET owner_user_id = $2, platform_user_id = coalesce(platform_user_id, $3) WHERE id = $1`, [profile.id, v.user_id, who.id]);
      await tx.q(`INSERT INTO gaming_accounts (player_profile_id, platform_id, platform_user_id, username, username_normalized, verification_status, verification_method, linked_by_user_id, last_verified_at)
                  VALUES ($1, $2, $3, $4, $5, 'verified', 'battlenet_oauth', $6, now())
                  ON CONFLICT (player_profile_id, platform_id, username_normalized) WHERE verification_status <> 'unlinked'
                  DO UPDATE SET platform_user_id = coalesce(EXCLUDED.platform_user_id, gaming_accounts.platform_user_id), verification_status = EXCLUDED.verification_status,
                    verification_method = EXCLUDED.verification_method, linked_by_user_id = EXCLUDED.linked_by_user_id, last_verified_at = now()`, [profile.id, profile.platform_id, who.id, who.battletag, normalizeName(who.battletag), v.user_id]);
    }
    await tx.q(`UPDATE account_verifications SET status = 'approved', decided_at = now(), verified_platform_user_id = $2 WHERE id = $1`, [v.id, who.id]);
    await securityEvent(tx, v.user_id, "battlenet_verified", meta);
    await audit(tx, v.user_id, "identity.verified", { type: "player_profile", id: profile.id }, { method: "battlenet_oauth", kind: v.kind });
    await notify(tx, v.user_id, "account_verified", "Your Battle.net account was verified");
    await securityNotice(tx, v.user_id, v.email, "A Battle.net account was verified on your profile");
    return "ok";
  });
  return back(`battlenet=${result}`);
}
