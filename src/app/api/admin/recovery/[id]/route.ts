import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { audit, securityEvent } from "@/lib/server/audit";
import { revokeAllSessions } from "@/lib/auth/session";
import { sendEmail } from "@/lib/server/email";
import { badRequest, forbidden, notFound } from "@/lib/server/errors";

const Body = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().trim().min(20).max(1000) }).strict();

/**
 * Account recovery (lost all second factors). Administrators only, with fresh re-authentication.
 * Approval removes MFA methods and signs out every session; the user must sign in with their password and
 * enrol MFA again. The note must record which out-of-band checks were performed. Staff accounts cannot be recovered this way.
 */
export const POST = route({ permission: "recovery.manage", reauth: true, body: Body }, async ({ auth, params, body, meta }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw notFound();
  const req = await withDb(auth!.db, (tx) => tx.one<{ id: string; user_id: string | null; status: string }>(`SELECT id, user_id, status FROM account_recovery_requests WHERE id = $1`, [id.data]));
  if (!req) throw notFound();
  if (req.status !== "pending") throw badRequest("Already decided.");
  if (req.user_id === auth!.user.id) throw forbidden();
  await withDb(SYSTEM, async (tx) => {
    const u = req.user_id ? await tx.one<{ id: string; email: string; role: string }>(`SELECT id, email, role FROM users WHERE id = $1`, [req.user_id]) : null;
    if (body.decision === "approve") {
      if (!u) throw badRequest("No matching account.");
      if (u.role !== "user") throw forbidden("Staff accounts require the documented break-glass procedure.");
      await tx.q(`DELETE FROM mfa_totp WHERE user_id = $1`, [u.id]);
      await tx.q(`DELETE FROM webauthn_credentials WHERE user_id = $1`, [u.id]);
      await tx.q(`DELETE FROM recovery_codes WHERE user_id = $1`, [u.id]);
      await tx.q(`UPDATE users SET mfa_enabled = false WHERE id = $1`, [u.id]);
      await revokeAllSessions(tx, u.id, "account_recovery");
      await securityEvent(tx, u.id, "account_recovery_approved", meta, { by: auth!.user.id });
      await sendEmail({ to: u.email, subject: "ServerSentry account recovery approved", text: "Your two-factor methods were reset after an account recovery review. Sign in and set up two-factor authentication again immediately. If you did not request this, contact support now." });
    }
    await tx.q(`UPDATE account_recovery_requests SET status = $2, reviewed_by = $3, decision_note = $4, decided_at = now() WHERE id = $1`, [req.id, body.decision === "approve" ? "approved" : "rejected", auth!.user.id, body.note]);
    await audit(tx, auth!.user.id, `admin.recovery.${body.decision}`, { type: "user", id: req.user_id ?? "unknown" }, { request: req.id }, meta.ipHash);
  });
  return { ok: true };
});
