import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { securityEvent, audit } from "@/lib/server/audit";
import { securityNotice } from "@/lib/auth/flows";
import { badRequest } from "@/lib/server/errors";

const Body = z.object({ newPassword: z.string().min(1).max(128) }).strict();

/** Change password: requires fresh re-auth (password + MFA). Signs out all OTHER sessions. */
export const POST = route({ auth: "auth", reauth: true, body: Body }, async ({ auth, body, meta }) => {
  const problem = passwordProblems(body.newPassword, [auth!.user.email.split("@")[0], auth!.user.displayName]);
  if (problem) throw badRequest(problem);
  const hash = await hashPassword(body.newPassword);
  await withDb(SYSTEM, async (tx) => {
    await tx.q(`UPDATE users SET password_hash = $2 WHERE id = $1`, [auth!.user.id, hash]);
    await revokeAllSessions(tx, auth!.user.id, "password_changed", auth!.session.id);
    await securityEvent(tx, auth!.user.id, "password_changed", meta);
    await audit(tx, auth!.user.id, "account.password_changed", { type: "user", id: auth!.user.id }, {}, meta.ipHash);
    await securityNotice(tx, auth!.user.id, auth!.user.email, "Your password was changed and other sessions were signed out");
  });
  return { ok: true };
});
