import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { revokeAllSessions, clearSessionCookie } from "@/lib/auth/session";
import { securityEvent, audit } from "@/lib/server/audit";
import { sendEmail } from "@/lib/server/email";

const Body = z.object({ confirm: z.literal("DELETE") }).strict();

/**
 * Account deletion request (UK GDPR erasure). The account is disabled immediately and personal data
 * is purged by the retention job after 30 days (cooling-off + fraud/abuse checks). Submitted reports are
 * retained in pseudonymised form where needed for moderation integrity; see the retention schedule.
 */
export const POST = route({ auth: "auth", reauth: true, body: Body }, async ({ auth, meta }) => {
  await withDb(SYSTEM, async (tx) => {
    await tx.q(`UPDATE users SET deletion_requested_at = now() WHERE id = $1`, [auth!.user.id]);
    await tx.q(`INSERT INTO data_subject_requests (user_id, kind, details, status) VALUES ($1, 'erasure', 'Self-service account deletion', 'in_progress')`, [auth!.user.id]);
    await revokeAllSessions(tx, auth!.user.id, "account_deletion_requested");
    await securityEvent(tx, auth!.user.id, "account_deletion_requested", meta);
    await audit(tx, auth!.user.id, "account.deletion_requested", { type: "user", id: auth!.user.id }, {}, meta.ipHash);
  });
  await sendEmail({ to: auth!.user.email, subject: "Your ServerSentry account is scheduled for deletion", text: "Your account has been disabled and will be permanently deleted in 30 days. If you did not request this, contact support immediately." });
  await clearSessionCookie();
  return { ok: true };
});
