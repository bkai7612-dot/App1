import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { checkTotp } from "@/lib/auth/mfa";
import { markReauth } from "@/lib/auth/session";
import { securityEvent } from "@/lib/server/audit";
import { ApiError } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

const Body = z.object({ password: z.string().min(1).max(128), code: z.string().max(12).optional() });

/**
 * Fresh authentication for sensitive changes: password + authenticator code.
 * (Passkey users can re-authenticate with /api/auth/mfa/passkey/auth-verify instead.)
 */
export const POST = route({ auth: "auth", body: Body }, async ({ auth, body, meta }) => {
  await rateLimit(`reauth:${auth!.user.id}`, 8, 900);
  const ok = await withDb(SYSTEM, async (tx) => {
    const u = await tx.one<{ password_hash: string; mfa_enabled: boolean }>(`SELECT password_hash, mfa_enabled FROM users WHERE id = $1`, [auth!.user.id]);
    if (!u || !(await verifyPassword(u.password_hash, body.password))) return false;
    if (u.mfa_enabled) {
      if (!body.code || !(await checkTotp(tx, auth!.user.id, body.code))) return false;
    }
    await markReauth(tx, auth!.session.id, u.mfa_enabled ? "totp" : undefined);
    await securityEvent(tx, auth!.user.id, "reauth_success", meta, { method: "password_totp" });
    return true;
  });
  if (!ok) {
    await withDb(SYSTEM, (tx) => securityEvent(tx, auth!.user.id, "reauth_failure", meta));
    throw new ApiError(401, "REAUTH_FAILED", "Those details didn't match.");
  }
  return { ok: true };
});
