import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { consumeEmailToken } from "@/lib/auth/flows";
import { securityEvent, audit } from "@/lib/server/audit";
import { badRequest } from "@/lib/server/errors";

const Body = z.object({ token: z.string().min(10).max(200) });

export const POST = route({ auth: "public", body: Body, rate: { name: "verify-email", limit: 20, windowSec: 3600 } }, async ({ body, meta }) => {
  const ok = await withDb(SYSTEM, async (tx) => {
    const t = await consumeEmailToken(tx, body.token, "verify_email");
    if (!t) return false;
    await tx.q(`UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1`, [t.user_id]);
    await securityEvent(tx, t.user_id, "email_verified", meta);
    await audit(tx, t.user_id, "account.email_verified", { type: "user", id: t.user_id });
    return true;
  });
  if (!ok) throw badRequest("This verification link is invalid or has expired.");
  return { ok: true };
});
