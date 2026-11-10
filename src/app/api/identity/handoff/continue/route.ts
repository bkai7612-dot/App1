import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { continueHandoff, steamLoginUrl } from "@/lib/server/identity";
import { discordLoginUrl } from "@/lib/server/discord";
import { battlenetLoginUrl } from "@/lib/server/battlenet";
import { badRequest } from "@/lib/server/errors";

const Body = z.object({ token: z.string().min(20).max(100), confirm: z.literal(true) }).strict();

/** Phone side (no ServerSentry sign-in needed): the one-time QR token becomes a provider sign-in state. */
export const POST = route({ auth: "public", body: Body, rate: { name: "handoff-continue", limit: 20, windowSec: 600 } }, async ({ body }) => {
  const r = await withDb(SYSTEM, (tx) => continueHandoff(tx, body.token));
  if (!r) throw badRequest("This code has expired or was already used. Generate a new one on your computer.");
  const redirect = r.method === "steam_openid" ? steamLoginUrl(r.state) : r.method === "battlenet_oauth" ? battlenetLoginUrl(r.state) : discordLoginUrl(r.state);
  return { redirect };
});
