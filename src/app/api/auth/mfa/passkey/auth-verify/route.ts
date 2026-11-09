import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { passkeyAuthVerify } from "@/lib/auth/mfa";
import { upgradeSessionAfterMfa, markReauth, revokeSession, clearSessionCookie } from "@/lib/auth/session";
import { securityEvent } from "@/lib/server/audit";
import { checkNewDevice } from "@/lib/auth/flows";
import { ApiError } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

const Body = z.object({ response: z.record(z.string(), z.unknown()) });

/**
 * Verifies a passkey assertion.
 * - Pending-MFA session: completes sign-in (session token rotated).
 * - Fully signed-in session: counts as fresh re-authentication (phishing-resistant).
 */
export const POST = route({ auth: "pendingMfa", body: Body, maxBodyBytes: 32_000 }, async ({ auth, body, meta }) => {
  await rateLimit(`mfa-user:${auth!.user.id}`, 10, 900);
  const res = await withDb(SYSTEM, async (tx) => {
    const ok = await passkeyAuthVerify(tx, auth!.session.id, auth!.user.id, body.response as unknown as AuthenticationResponseJSON);
    if (!ok) {
      await securityEvent(tx, auth!.user.id, "mfa_failure", meta, { method: "webauthn" });
      if (auth!.pendingMfa) {
        const s = await tx.one<{ mfa_attempts: number }>(`UPDATE sessions SET mfa_attempts = mfa_attempts + 1 WHERE id = $1 RETURNING mfa_attempts`, [auth!.session.id]);
        if ((s?.mfa_attempts ?? 0) >= 5) { await revokeSession(tx, auth!.session.id, "too_many_mfa_failures"); return "locked" as const; }
      }
      return "bad" as const;
    }
    if (auth!.pendingMfa) {
      await upgradeSessionAfterMfa(tx, auth!, "webauthn", meta);
      await securityEvent(tx, auth!.user.id, "mfa_success", meta, { method: "webauthn" });
      return "signed_in" as const;
    }
    await markReauth(tx, auth!.session.id, "webauthn");
    await securityEvent(tx, auth!.user.id, "reauth_success", meta, { method: "webauthn" });
    return "reauth" as const;
  });
  if (res === "locked") { await clearSessionCookie(); throw new ApiError(401, "MFA_LOCKED", "Too many failed attempts. Please sign in again."); }
  if (res === "bad") throw new ApiError(401, "PASSKEY_FAILED", "Passkey verification failed.");
  if (res === "signed_in") await checkNewDevice(auth!.user.id, auth!.user.email, meta);
  return { ok: true, result: res };
});
