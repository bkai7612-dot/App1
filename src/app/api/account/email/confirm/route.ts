import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { consumeEmailToken, normalizeEmail, securityNotice } from "@/lib/auth/flows";
import { revokeAllSessions } from "@/lib/auth/session";
import { securityEvent, audit } from "@/lib/server/audit";
import { badRequest, forbidden } from "@/lib/server/errors";

const Body = z.object({ token: z.string().min(10).max(200) }).strict();

export const POST = route({ auth: "auth", body: Body, rate: { name: "email-confirm", limit: 10, windowSec: 3600 } }, async ({ auth, body, meta }) => {
  await withDb(SYSTEM, async (tx) => {
    const t = await consumeEmailToken(tx, body.token, "change_email");
    if (!t || !t.new_email) throw badRequest("This link is invalid or has expired.");
    if (t.user_id !== auth!.user.id) throw forbidden("Sign in to the account that requested this change.");
    const old = auth!.user.email;
    await tx.q(`UPDATE users SET email = $2, email_normalized = $3, email_verified_at = now() WHERE id = $1`, [auth!.user.id, t.new_email, normalizeEmail(t.new_email)]);
    await revokeAllSessions(tx, auth!.user.id, "email_changed", auth!.session.id);
    await securityEvent(tx, auth!.user.id, "email_changed", meta);
    await audit(tx, auth!.user.id, "account.email_changed", { type: "user", id: auth!.user.id }, {}, meta.ipHash);
    await securityNotice(tx, auth!.user.id, old, "Your account email address was changed");
  });
  return { ok: true };
});
