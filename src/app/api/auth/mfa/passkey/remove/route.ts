import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { hasConfirmedTotp } from "@/lib/auth/mfa";
import { securityEvent, audit } from "@/lib/server/audit";
import { securityNotice } from "@/lib/auth/flows";
import { badRequest, notFound } from "@/lib/server/errors";
import { isAdminRole } from "@/lib/rbac";

const Body = z.object({ id: z.string().uuid() });

export const POST = route({ auth: "mfa", reauth: true, body: Body }, async ({ auth, body, meta }) => {
  await withDb(SYSTEM, async (tx) => {
    const cred = await tx.one(`SELECT id FROM webauthn_credentials WHERE id = $1 AND user_id = $2`, [body.id, auth!.user.id]);
    if (!cred) throw notFound();
    const others = await tx.one<{ n: string }>(`SELECT count(*) AS n FROM webauthn_credentials WHERE user_id = $1 AND id <> $2`, [auth!.user.id, body.id]);
    const totp = await hasConfirmedTotp(tx, auth!.user.id);
    if (Number(others?.n ?? 0) === 0 && !totp) throw badRequest("Two-factor authentication is mandatory. Add another method first.");
    if (Number(others?.n ?? 0) === 0 && isAdminRole(auth!.user.role)) throw badRequest("Administrators must keep at least one passkey.");
    await tx.q(`DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2`, [body.id, auth!.user.id]);
    await securityEvent(tx, auth!.user.id, "passkey_removed", meta);
    await audit(tx, auth!.user.id, "security.passkey_removed", { type: "user", id: auth!.user.id });
    await securityNotice(tx, auth!.user.id, auth!.user.email, "A passkey was removed from your account");
  });
  return { ok: true };
});
