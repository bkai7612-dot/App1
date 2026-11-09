import "server-only";
import { env } from "@/lib/env";

/**
 * Steam OpenID 2.0 (official, documented: https://partner.steamgames.com/doc/features/auth#website).
 * Proves the user controls a SteamID64. ServerSentry never sees Steam credentials.
 * The OP endpoint is a fixed constant (no user-controlled URLs => no SSRF).
 */
const OP = "https://steamcommunity.com/openid/login";

export function steamLoginUrl(state: string): string {
  const returnTo = `${env.appUrl}/api/identity/steam/callback?state=${encodeURIComponent(state)}`;
  const p = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": env.appUrl,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${OP}?${p.toString()}`;
}

/** Validates the assertion directly with Steam. Returns the SteamID64 or null. */
export async function verifySteamAssertion(params: URLSearchParams, expectedState: string): Promise<string | null> {
  if (params.get("openid.mode") !== "id_res") return null;
  if (params.get("openid.op_endpoint") !== OP) return null;
  const returnTo = params.get("openid.return_to") ?? "";
  if (returnTo !== `${env.appUrl}/api/identity/steam/callback?state=${encodeURIComponent(expectedState)}`) return null;
  const claimed = params.get("openid.claimed_id") ?? "";
  const m = claimed.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
  if (!m || params.get("openid.identity") !== claimed) return null;
  const body = new URLSearchParams();
  for (const [k, v] of params) if (k.startsWith("openid.")) body.set(k, v);
  body.set("openid.mode", "check_authentication");
  const res = await fetch(OP, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, redirect: "error", signal: AbortSignal.timeout(8000) });
  const text = await res.text();
  if (!/^is_valid\s*:\s*true\s*$/m.test(text)) return null;
  return m[1];
}

/** Optional: public persona name via Steam Web API (requires STEAM_WEB_API_KEY). */
export async function steamPersonaName(steamId: string): Promise<string | null> {
  if (!env.steamWebApiKey || !/^\d{17}$/.test(steamId)) return null;
  try {
    const r = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${env.steamWebApiKey}&steamids=${steamId}`, { signal: AbortSignal.timeout(5000) });
    const j = (await r.json()) as { response?: { players?: { personaname?: string }[] } };
    return j.response?.players?.[0]?.personaname?.slice(0, 64) ?? null;
  } catch { return null; }
}
