import "server-only";
import { discordEnabled } from "@/lib/server/discord";
import { battlenetEnabled } from "@/lib/server/battlenet";

export type VerifyMethod = "steam" | "battlenet" | "discord" | "code";
export interface VerifyOption { method: VerifyMethod; label: string; detail: string; automatic: boolean }

/** Verification routes for a platform, best first. Official sign-in > Discord > profile-code check. */
export function verificationOptions(platformSlug: string, discordType: string | null): VerifyOption[] {
  const out: VerifyOption[] = [];
  if (platformSlug === "steam") out.push({ method: "steam", label: "Sign in with Steam", detail: "Instant. Uses Steam's official sign-in; we never see your password.", automatic: true });
  if (platformSlug === "battle-net" && battlenetEnabled()) out.push({ method: "battlenet", label: "Sign in with Battle.net", detail: "Instant. Uses Blizzard's official sign-in to confirm your BattleTag.", automatic: true });
  if (discordType && discordEnabled()) out.push({ method: "discord", label: "Verify with Discord", detail: platformSlug === "playstation-network"
    ? "Instant if your PlayStation account is connected to Discord. Sony offers no other public sign-in, so this is the only automatic option for PlayStation."
    : "Instant if this account is connected to your Discord (User Settings → Connections).", automatic: true });
  out.push({ method: "code", label: "Profile code check", detail: "Paste a short code into your public gaming profile (bio, about me or status). A moderator confirms it, usually within a day.", automatic: false });
  return out;
}
