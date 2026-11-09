import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { dummyVerify, verifyPassword } from "@/lib/auth/password";
import { normalizeEmail, checkNewDevice } from "@/lib/auth/flows";
import { createSession } from "@/lib/auth/session";
import { securityEvent } from "@/lib/server/audit";
import { ApiError } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

const Body = z.object({ email: z.string().trim().max(254), password: z.string().min(1).max(128) });
const GENERIC = "Incorrect email or password, or the account is temporarily locked. Try again later or reset your password.";

export const POST = route({ auth: "public", body: Body, rate: { name: "login-ip", limit: 20, windowSec: 900 } }, async ({ body, meta }) => {
  const emailNorm = normalizeEmail(body.email);
  await rateLimit(`login-email:${emailNorm}`, 10, 900);

  const user = await withDb(SYSTEM, (tx) =>
    tx.one<{ id: string; email: string; role: string; password_hash: string; mfa_enabled: boolean; locked_until: Date | null;
             failed_login_count: number; suspended_at: Date | null; suspended_until: Date | null; deleted_at: Date | null; deletion_requested_at: Date | null }>(
      `SELECT id, email, role, password_hash, mfa_enabled, locked_until, failed_login_count, suspended_at, suspended_until, deleted_at, deletion_requested_at
       FROM users WHERE email_normalized = $1`, [emailNorm]));

  if (!user || user.deleted_at) {
    await dummyVerify(body.password);
    throw new ApiError(401, "INVALID_CREDENTIALS", GENERIC);
  }
  if (user.locked_until && user.locked_until.getTime() > Date.now()) {
    await dummyVerify(body.password);
    await withDb(SYSTEM, (tx) => securityEvent(tx, user.id, "login_while_locked", meta));
    throw new ApiError(401, "INVALID_CREDENTIALS", GENERIC);
  }
  const ok = await verifyPassword(user.password_hash, body.password);
  if (!ok) {
    await withDb(SYSTEM, async (tx) => {
      const n = user.failed_login_count + 1;
      // Escalating lockout: from the 5th consecutive failure, 15 min doubling up to 24h.
      const lockMinutes = n >= 5 ? Math.min(15 * 2 ** (n - 5), 1440) : 0;
      await tx.q(
        `UPDATE users SET failed_login_count = $2, locked_until = CASE WHEN $3::int > 0 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END WHERE id = $1`,
        [user.id, n, lockMinutes]);
      await securityEvent(tx, user.id, "login_failure", meta, { consecutive: n, locked_minutes: lockMinutes });
    });
    throw new ApiError(401, "INVALID_CREDENTIALS", GENERIC);
  }
  const suspended = !!user.suspended_at && (!user.suspended_until || user.suspended_until.getTime() > Date.now());
  if (suspended) {
    await withDb(SYSTEM, (tx) => securityEvent(tx, user.id, "login_suspended", meta));
    throw new ApiError(403, "SUSPENDED", "This account is suspended. Contact support if you believe this is a mistake.");
  }
  if (user.deletion_requested_at) throw new ApiError(403, "DELETION_PENDING", "This account is scheduled for deletion. Contact support to cancel.");

  await withDb(SYSTEM, async (tx) => {
    await tx.q(`UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = $1`, [user.id]);
    await createSession(tx, user, meta);
    if (user.mfa_enabled) await securityEvent(tx, user.id, "password_ok_mfa_pending", meta);
  });
  if (!user.mfa_enabled) await checkNewDevice(user.id, user.email, meta);
  return { ok: true, mfaRequired: user.mfa_enabled };
});
