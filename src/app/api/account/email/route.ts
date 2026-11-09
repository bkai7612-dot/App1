import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { issueEmailToken, normalizeEmail, securityNotice } from "@/lib/auth/flows";
import { sendEmail, emailTemplates } from "@/lib/server/email";
import { securityEvent } from "@/lib/server/audit";
import { env } from "@/lib/env";

const Body = z.object({ newEmail: z.string().trim().email().max(254) }).strict();

/** Start email change (re-auth required). Confirmation link goes to the NEW address; old address is alerted. */
export const POST = route({ auth: "auth", reauth: true, body: Body, rate: { name: "email-change", limit: 3, windowSec: 86400 } }, async ({ auth, body, meta }) => {
  await withDb(SYSTEM, async (tx) => {
    const taken = await tx.one(`SELECT 1 FROM users WHERE email_normalized = $1`, [normalizeEmail(body.newEmail)]);
    if (taken) return; // no enumeration: silently do nothing
    const token = await issueEmailToken(tx, auth!.user.id, "change_email", "1 hour", body.newEmail);
    await sendEmail({ to: body.newEmail, ...emailTemplates.changeEmail(`${env.appUrl}/account/confirm-email?token=${encodeURIComponent(token)}`) });
    await securityEvent(tx, auth!.user.id, "email_change_requested", meta);
    await securityNotice(tx, auth!.user.id, auth!.user.email, "An email address change was requested");
  });
  return { ok: true, message: "If that address can be used, we've sent a confirmation link to it." };
});
