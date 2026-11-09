import { z } from "zod";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { passkeyRegistrationVerify, replaceRecoveryCodes } from "@/lib/auth/mfa";
import { hasFreshReauth, upgradeSessionAfterMfa, markReauth } from "@/lib/auth/session";
import { securityEvent, audit } from "@/lib/server/audit";
import { securityNotice } from "@/lib/auth/flows";
import { ApiError } from "@/lib/server/errors";

const Body = z.object({ response: z.record(z.string(), z.unknown()), nickname: z.string().trim().max(60).optional() });

export const POST = route({ auth: "auth", body: Body, maxBodyBytes: 32_000 }, async ({ auth, body, meta }) => {
  if (auth!.user.mfaEnabled && !hasFreshReauth(auth!)) throw new ApiError(403, "REAUTH_REQUIRED", "Please confirm it's you to continue.");
  const out = await withDb(SYSTEM, async (tx) => {
    const ok = await passkeyRegistrationVerify(tx, auth!.session.id, auth!.user.id, body.response as unknown as RegistrationResponseJSON, body.nickname || null);
    if (!ok) return null;
    let codes: string[] | null = null;
    if (!auth!.user.mfaEnabled) {
      await tx.q(`UPDATE users SET mfa_enabled = true WHERE id = $1`, [auth!.user.id]);
      codes = await replaceRecoveryCodes(tx, auth!.user.id);
      await upgradeSessionAfterMfa(tx, auth!, "webauthn", meta);
    } else {
      await markReauth(tx, auth!.session.id);
    }
    await securityEvent(tx, auth!.user.id, "passkey_added", meta);
    await audit(tx, auth!.user.id, "security.passkey_added", { type: "user", id: auth!.user.id });
    await securityNotice(tx, auth!.user.id, auth!.user.email, "A passkey was added to your account");
    return { codes };
  });
  if (!out) throw new ApiError(400, "PASSKEY_FAILED", "Passkey registration could not be verified.");
  return { ok: true, recoveryCodes: out.codes };
});
