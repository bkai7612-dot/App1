import { z } from "zod";
import QRCode from "qrcode";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { beginTotpSetup, checkTotp, hasConfirmedTotp, replaceRecoveryCodes } from "@/lib/auth/mfa";
import { otpauthUri } from "@/lib/totp";
import { hasFreshReauth, upgradeSessionAfterMfa, markReauth } from "@/lib/auth/session";
import { securityEvent, audit } from "@/lib/server/audit";
import { securityNotice } from "@/lib/auth/flows";
import { ApiError, badRequest } from "@/lib/server/errors";

/** Begin authenticator-app enrolment. If MFA is already enabled, fresh re-authentication is required. */
export const GET = route({ auth: "auth", rate: { name: "totp-setup", limit: 10, windowSec: 3600 } }, async ({ auth }) => {
  if (auth!.user.mfaEnabled && !hasFreshReauth(auth!)) throw new ApiError(403, "REAUTH_REQUIRED", "Please confirm it's you to continue.");
  const secret = await withDb(SYSTEM, async (tx) => {
    if (await hasConfirmedTotp(tx, auth!.user.id)) throw badRequest("An authenticator app is already set up. Remove it first to replace it.");
    return beginTotpSetup(tx, auth!.user.id);
  });
  const uri = otpauthUri(secret, auth!.user.email);
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
  return { secret, uri, qrSvg };
});

const Confirm = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") });

/** Confirm enrolment with a first valid code. Returns recovery codes ONCE if this is the first MFA method. */
export const POST = route({ auth: "auth", body: Confirm, rate: { name: "totp-confirm", limit: 10, windowSec: 900 } }, async ({ auth, body, meta }) => {
  const out = await withDb(SYSTEM, async (tx) => {
    if (auth!.user.mfaEnabled && !hasFreshReauth(auth!)) throw new ApiError(403, "REAUTH_REQUIRED", "Please confirm it's you to continue.");
    const ok = await checkTotp(tx, auth!.user.id, body.code, false);
    if (!ok) { await securityEvent(tx, auth!.user.id, "mfa_enrol_failure", meta); return null; }
    await tx.q(`UPDATE mfa_totp SET confirmed_at = now() WHERE user_id = $1`, [auth!.user.id]);
    const first = !auth!.user.mfaEnabled;
    let codes: string[] | null = null;
    if (first) {
      await tx.q(`UPDATE users SET mfa_enabled = true WHERE id = $1`, [auth!.user.id]);
      codes = await replaceRecoveryCodes(tx, auth!.user.id);
      await upgradeSessionAfterMfa(tx, auth!, "totp", meta);
    } else {
      await markReauth(tx, auth!.session.id);
    }
    await securityEvent(tx, auth!.user.id, "mfa_totp_enrolled", meta);
    await audit(tx, auth!.user.id, "security.mfa_totp_enrolled", { type: "user", id: auth!.user.id });
    await securityNotice(tx, auth!.user.id, auth!.user.email, "An authenticator app was added to your account");
    return { codes };
  });
  if (!out) throw new ApiError(400, "MFA_INVALID", "That code didn't match. Check the time on your device and try again.");
  return { ok: true, recoveryCodes: out.codes };
});

/** Remove authenticator app (requires fresh reauth and another remaining method). */
export const DELETE = route({ auth: "mfa", reauth: true }, async ({ auth, meta }) => {
  await withDb(SYSTEM, async (tx) => {
    const pk = await tx.one<{ n: string }>(`SELECT count(*) AS n FROM webauthn_credentials WHERE user_id = $1`, [auth!.user.id]);
    if (Number(pk?.n ?? 0) === 0) throw badRequest("Two-factor authentication is mandatory. Add a passkey before removing your authenticator app.");
    await tx.q(`DELETE FROM mfa_totp WHERE user_id = $1`, [auth!.user.id]);
    await securityEvent(tx, auth!.user.id, "mfa_totp_removed", meta);
    await audit(tx, auth!.user.id, "security.mfa_totp_removed", { type: "user", id: auth!.user.id });
    await securityNotice(tx, auth!.user.id, auth!.user.email, "Your authenticator app was removed");
  });
  return { ok: true };
});
