import "server-only";
import { env } from "@/lib/env";

/**
 * Discord OAuth2 (official, documented: https://discord.com/developers/docs/topics/oauth2) with scopes
 * "identify connections". Discord's /users/@me/connections lists the gaming accounts a user has linked
 * to Discord through each platform's own sign-in (PlayStation, Xbox, Steam, Riot, Battle.net, Epic), with a
 * `verified` flag. ServerSentry uses that to confirm ownership automatically without collecting credentials.
 * Fixed Discord hosts only (no user-controlled URLs → no SSRF). Tokens are used once and revoked immediately.
 */
const AUTH = "https://discord.com/oauth2/authorize";
const API = "https://discord.com/api/v10";

export const discordEnabled = () => !!(env.discordClientId && env.discordClientSecret);
const redirectUri = () => `${env.appUrl}/api/identity/discord/callback`;

export function discordLoginUrl(state: string): string {
  const p = new URLSearchParams({ response_type: "code", client_id: env.discordClientId!, scope: "identify connections", state, redirect_uri: redirectUri(), prompt: "consent" });
  return `${AUTH}?${p.toString()}`;
}

export interface DiscordConnection { type: string; id: string; name: string; verified: boolean; revoked?: boolean }

/** Exchanges the code, reads verified connections, then revokes the token. */
export async function discordVerifiedConnections(code: string): Promise<DiscordConnection[]> {
  const form = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), client_id: env.discordClientId!, client_secret: env.discordClientSecret! });
  const tok = await fetch(`${API}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(8000), redirect: "error" });
  if (!tok.ok) throw new Error(`discord token exchange failed ${tok.status}`);
  const { access_token } = (await tok.json()) as { access_token: string };
  try {
    const res = await fetch(`${API}/users/@me/connections`, { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(8000), redirect: "error" });
    if (!res.ok) throw new Error(`discord connections failed ${res.status}`);
    const list = (await res.json()) as DiscordConnection[];
    return list.filter((c) => c.verified === true && !c.revoked && typeof c.id === "string" && typeof c.name === "string")
      .map((c) => ({ type: String(c.type), id: c.id.slice(0, 128), name: c.name.slice(0, 64), verified: true }));
  } finally {
    // Data minimisation: we never keep Discord tokens.
    await fetch(`${API}/oauth2/token/revoke`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: access_token, token_type_hint: "access_token", client_id: env.discordClientId!, client_secret: env.discordClientSecret! }), signal: AbortSignal.timeout(5000) }).catch(() => {});
  }
}

/** Platforms whose public names are globally unique, so a verified exact-name match proves ownership of that name. */
export const UNIQUE_NAME_TYPES = new Set(["xbox", "playstation", "riotgames", "battlenet", "epicgames"]);
export const sameName = (a: string, b: string) => a.normalize("NFKC").trim().toLowerCase() === b.normalize("NFKC").trim().toLowerCase();
