import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { checkTotp, consumeRecoveryCode } from "@/lib/auth/mfa";
import { upgradeSessionAfterMfa, revokeSession, clearSessionCookie } from "@/lib/auth/session";
import { securityEvent } from "@/lib/server/audit";
import { checkNewDevice, securityNotice } from "@/lib/auth/flows";
import { ApiError, badRequest } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

const Body = z.object({ code: z.string().max(12).optional(), recoveryCode: z.string().max(20).optional() })
  .refine((b) => !!b.code || !!b.recoveryCode, "Enter a code");

const MAX_ATTEMPTS_PER_SESSION = 5;

/** Second step of sign-in with TOTP or a recovery code. (Passkeys: /api/auth/mfa/passkey/auth-verify) */
export const POST = route({ auth: "pendingMfa", body: Body }, async ({ auth, body, meta }) => {
  if (!auth!.pendingMfa) throw badRequest("Two-factor authentication is already complete for this session.");
  await rateLimit(`mfa-user:${auth!.user.id}`, 10, 900);
  const result = await withDb(SYSTEM, async (tx) => {
    const s = await tx.one<{ mfa_attempts: number }>(`UPDATE sessions SET mfa_attempts = mfa_attempts + 1 WHERE id = $1 RETURNING mfa_attempts`, [auth!.session.id]);
    let method: "totp" | "recovery_code" | null = null;
    if (body.code && (await checkTotp(tx, auth!.user.id, body.code))) method = "totp";
    else if (body.recoveryCode && (await consumeRecoveryCode(tx, auth!.user.id, body.recoveryCode))) method = "recovery_code";
    if (!method) {
      await securityEvent(tx, auth!.user.id, "mfa_failure", meta, { attempt: s?.mfa_attempts });
      if ((s?.mfa_attempts ?? 0) >= MAX_ATTEMPTS_PER_SESSION) {
        await revokeSession(tx, auth!.session.id, "too_many_mfa_failures");
        return "locked" as const;
      }
      return "bad" as const;
    }
    await upgradeSessionAfterMfa(tx, auth!, method, meta);
    await securityEvent(tx, auth!.user.id, "mfa_success", meta, { method });
    if (method === "recovery_code") {
      const left = await tx.one<{ n: string }>(`SELECT count(*) AS n FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL`, [auth!.user.id]);
      await securityNotice(tx, auth!.user.id, auth!.user.email, `A recovery code was used to sign in (${left?.n ?? 0} remaining)`);
    }
    return "ok" as const;
  });
  if (result === "locked") {
    await clearSessionCookie();
    throw new ApiError(401, "MFA_LOCKED", "Too many incorrect codes. Please sign in again.");
  }
  if (result === "bad") throw new ApiError(401, "MFA_INVALID", "That code is not valid. Check your authenticator and try again.");
  await checkNewDevice(auth!.user.id, auth!.user.email, meta);
  return { ok: true };
});
