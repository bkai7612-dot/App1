import "server-only";
import { env } from "@/lib/env";

/**
 * Battle.net OAuth (Blizzard, official and open to registered developers:
 * https://develop.battle.net/documentation/guides/using-oauth). The userinfo endpoint returns the account id and
 * BattleTag, which proves ownership of that BattleTag. Fixed Blizzard hosts only; tokens are used once and discarded.
 */
const OAUTH = "https://oauth.battle.net";
export const battlenetEnabled = () => !!(env.battlenetClientId && env.battlenetClientSecret);
const redirectUri = () => `${env.appUrl}/api/identity/battlenet/callback`;

export function battlenetLoginUrl(state: string): string {
  const p = new URLSearchParams({ response_type: "code", client_id: env.battlenetClientId!, scope: "openid", state, redirect_uri: redirectUri() });
  return `${OAUTH}/authorize?${p.toString()}`;
}

export async function battlenetIdentity(code: string): Promise<{ id: string; battletag: string }> {
  const basic = Buffer.from(`${env.battlenetClientId}:${env.battlenetClientSecret}`).toString("base64");
  const tok = await fetch(`${OAUTH}/token`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri() }), signal: AbortSignal.timeout(8000), redirect: "error" });
  if (!tok.ok) throw new Error(`battle.net token exchange failed ${tok.status}`);
  const { access_token } = (await tok.json()) as { access_token: string };
  const res = await fetch(`${OAUTH}/userinfo`, { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(8000), redirect: "error" });
  if (!res.ok) throw new Error(`battle.net userinfo failed ${res.status}`);
  const u = (await res.json()) as { id?: number | string; sub?: string; battletag?: string };
  const id = String(u.id ?? u.sub ?? "");
  if (!id || !u.battletag) throw new Error("battle.net userinfo incomplete");
  return { id: id.slice(0, 64), battletag: u.battletag.slice(0, 64) };
}
