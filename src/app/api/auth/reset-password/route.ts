import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { checkTotp, consumeRecoveryCode, hasConfirmedTotp } from "@/lib/auth/mfa";
import { securityEvent, audit } from "@/lib/server/audit";
import { securityNotice } from "@/lib/auth/flows";
import { ApiError, badRequest } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

const Body = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(1).max(128),
  code: z.string().max(20).optional(),
  recoveryCode: z.string().max(20).optional(),
});

export const POST = route({ auth: "public", body: Body, rate: { name: "reset-pw", limit: 10, windowSec: 900 } }, async ({ body, meta }) => {
  const res = await withDb(SYSTEM, async (tx) => {
    const t = await tx.one<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM email_tokens WHERE token_hash = $1 AND purpose = 'reset_password' AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
      [sha256(body.token)]);
    if (!t) throw badRequest("This reset link is invalid or has expired.");
    const u = await tx.one<{ id: string; email: string; display_name: string; mfa_enabled: boolean }>(
      `SELECT id, email, display_name, mfa_enabled FROM users WHERE id = $1`, [t.user_id]);
    if (!u) throw badRequest("This reset link is invalid or has expired.");

    // Resetting a password must not bypass MFA: require a second factor if enrolled.
    if (u.mfa_enabled) {
      await rateLimit(`mfa-user:${u.id}`, 10, 900);
      let ok = false;
      if (body.code && (await hasConfirmedTotp(tx, u.id))) ok = await checkTotp(tx, u.id, body.code);
      if (!ok && body.recoveryCode) ok = await consumeRecoveryCode(tx, u.id, body.recoveryCode);
      if (!ok) {
        await securityEvent(tx, u.id, "password_reset_mfa_failure", meta);
        return { needMfa: true as const };
      }
    }
    const problem = passwordProblems(body.password, [u.email.split("@")[0], u.display_name]);
    if (problem) throw badRequest(problem);
    await tx.q(`UPDATE email_tokens SET used_at = now() WHERE id = $1`, [t.id]);
    await tx.q(`UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL WHERE id = $1`, [u.id, await hashPassword(body.password)]);
    await revokeAllSessions(tx, u.id, "password_reset");
    await securityEvent(tx, u.id, "password_reset_completed", meta);
    await audit(tx, u.id, "account.password_reset", { type: "user", id: u.id });
    await securityNotice(tx, u.id, u.email, "Your password was reset and all sessions were signed out");
    return { needMfa: false as const };
  });
  if (res.needMfa) throw new ApiError(401, "MFA_REQUIRED", "Enter a code from your authenticator app or a recovery code.");
  return { ok: true };
});
