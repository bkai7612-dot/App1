import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth/session";
import { withDb, SYSTEM } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { discordEnabled, discordVerifiedConnections, sameName, UNIQUE_NAME_TYPES, type DiscordConnection } from "@/lib/server/discord";
import { normalizeName } from "@/lib/server/players";
import { audit, securityEvent } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { securityNotice } from "@/lib/auth/flows";
import { ipHash, userAgent } from "@/lib/server/request";
import { consumeVerificationState } from "@/lib/server/identity";

/**
 * Discord OAuth return. The state is single-use, bound to the signed-in user and expires in 15 minutes.
 * Ownership is granted automatically ONLY when Discord reports a VERIFIED connection of the right platform whose
 * account ID matches the profile's recorded ID, or whose (globally unique) name matches exactly. Anything else
 * is sent to a moderator with the proven details. One platform account can be verified on only one profile.
 */
export async function GET(req: NextRequest) {
  let handoff = false;
  const back = (q: string) => NextResponse.redirect(handoff ? `${env.appUrl}/v/done?${q}` : `${env.appUrl}/me/linked-accounts?${q}`, { headers: { "Cache-Control": "no-store" } });
  const auth = await getAuth();
  const authId = auth && !auth.pendingMfa ? auth.user.id : null;
  if (!discordEnabled()) return back("discord=unavailable");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const meta = { ipHash: await ipHash(), userAgent: await userAgent() };
  const v = await withDb(SYSTEM, (tx) => consumeVerificationState(tx, state, "discord_connection", authId));
  if (!v) { if (!authId) return NextResponse.redirect(`${env.appUrl}/login`); return back("discord=invalid"); }
  handoff = v.handoff;
  if (!code || code.length > 200) {
    await withDb(SYSTEM, (tx) => tx.q(`UPDATE account_verifications SET status = 'cancelled', decided_at = now() WHERE id = $1`, [v.id]));
    return back("discord=cancelled");
  }
  let connections: DiscordConnection[] = [];
  try { connections = await discordVerifiedConnections(code); } catch (e) {
    console.error("[discord] verification failed", e);
    await withDb(SYSTEM, (tx) => tx.q(`UPDATE account_verifications SET status = 'rejected', decided_at = now(), decision_note = 'Discord check failed' WHERE id = $1`, [v.id]));
    return back("discord=failed");
  }
  const result = await withDb(SYSTEM, async (tx) => {
    const profile = await tx.one<{ id: string; owner_user_id: string | null; platform_user_id: string | null; platform_id: number; display_name: string; type: string | null }>(
      `SELECT p.id, p.owner_user_id, p.platform_user_id, p.platform_id, p.display_name, pl.discord_connection_type AS type
       FROM player_profiles p JOIN platforms pl ON pl.id = p.platform_id WHERE p.id = $1`, [v.player_profile_id]);
    if (!profile?.type) return "invalid";
    const ga = v.gaming_account_id ? await tx.one<{ id: string; username: string; platform_id: number; type: string | null }>(
      `SELECT ga.id, ga.username, ga.platform_id, pl.discord_connection_type AS type FROM gaming_accounts ga JOIN platforms pl ON pl.id = ga.platform_id WHERE ga.id = $1 AND ga.verification_status <> 'unlinked'`, [v.gaming_account_id]) : null;
    const type = v.kind === "link_verification" ? ga?.type : profile.type;
    if (!type) return "invalid";
    const ofType = connections.filter((c) => c.type === type);
    if (ofType.length === 0) {
      await tx.q(`UPDATE account_verifications SET status = 'rejected', decided_at = now(), decision_note = 'No verified Discord connection for this platform' WHERE id = $1`, [v.id]);
      return "noconnection";
    }
    const platformId = v.kind === "link_verification" ? ga!.platform_id : profile.platform_id;
    const targetName = v.kind === "link_verification" ? ga!.username : profile.display_name;
    const match = ofType.find((c) => (profile.platform_user_id && c.id === profile.platform_user_id) || (UNIQUE_NAME_TYPES.has(type) && sameName(c.name, targetName)) || (v.kind === "link_verification" && type === "steam" && sameName(c.name, targetName)));
    const takenBy = async (id: string) => tx.one<{ id: string }>(`SELECT id FROM gaming_accounts WHERE platform_id = $1 AND platform_user_id = $2 AND verification_status = 'verified'`, [platformId, id]);
    if (!match) {
      // Proven accounts don't match the name: send to a moderator with the proven details instead of guessing.
      await tx.q(`UPDATE account_verifications SET method = 'manual_review', status = 'pending', expires_at = now() + interval '30 days',
                  claim_note = 'Discord verified these ' || $2 || ' accounts for the user: ' || $3 || '. None matched exactly. Moderator review required.' WHERE id = $1`,
        [v.id, type, ofType.map((c) => c.name).join(", ").slice(0, 600)]);
      return "review";
    }
    const existing = await takenBy(match.id);
    if (existing && existing.id !== v.gaming_account_id) {
      await tx.q(`UPDATE account_verifications SET status = 'rejected', decided_at = now(), verified_platform_user_id = $2, decision_note = 'Account already verified on another profile' WHERE id = $1`, [v.id, match.id]);
      await securityEvent(tx, v.user_id, "discord_account_already_verified_elsewhere", meta);
      return "taken";
    }
    if (v.kind === "link_verification") {
      if (profile.owner_user_id !== v.user_id) return "invalid";
      await tx.q(`UPDATE gaming_accounts SET platform_user_id = $2, username = $3, username_normalized = $4, verification_status = 'verified',
                  verification_method = 'discord_connection', last_verified_at = now() WHERE id = $1`, [v.gaming_account_id, match.id, match.name, normalizeName(match.name)]);
    } else {
      if (profile.owner_user_id) return "taken";
      await tx.q(`UPDATE player_profiles SET owner_user_id = $2, platform_user_id = coalesce(platform_user_id, $3) WHERE id = $1`, [profile.id, v.user_id, match.id]);
      await tx.q(`INSERT INTO gaming_accounts (player_profile_id, platform_id, platform_user_id, username, username_normalized, verification_status, verification_method, linked_by_user_id, last_verified_at)
                  VALUES ($1, $2, $3, $4, $5, 'verified', 'discord_connection', $6, now())
                  ON CONFLICT (player_profile_id, platform_id, username_normalized) WHERE verification_status <> 'unlinked'
                  DO UPDATE SET platform_user_id = coalesce(EXCLUDED.platform_user_id, gaming_accounts.platform_user_id), verification_status = EXCLUDED.verification_status,
                    verification_method = EXCLUDED.verification_method, linked_by_user_id = EXCLUDED.linked_by_user_id, last_verified_at = now()`, [profile.id, profile.platform_id, match.id, match.name, normalizeName(match.name), v.user_id]);
      const reps = await tx.one<{ n: string }>(`SELECT count(*) AS n FROM public_reports WHERE player_profile_id = $1`, [profile.id]);
      if (Number(reps?.n ?? 0) > 0) await notify(tx, v.user_id, "report_published", `There are ${reps!.n} published reports on your new profile`, "You can read them, respond and appeal for free.", "/me/reports");
    }
    await tx.q(`UPDATE account_verifications SET status = 'approved', decided_at = now(), verified_platform_user_id = $2 WHERE id = $1`, [v.id, match.id]);
    await securityEvent(tx, v.user_id, "discord_verified", meta, { type });
    await audit(tx, v.user_id, "identity.verified", { type: "player_profile", id: profile.id }, { method: "discord_connection", kind: v.kind, platform: type });
    await notify(tx, v.user_id, "account_verified", "Your gaming account was verified automatically");
    await securityNotice(tx, v.user_id, v.email, "A gaming account was verified on your profile through Discord");
    return "ok";
  });
  return back(`discord=${result}`);
}
