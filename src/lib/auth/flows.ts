import "server-only";
import { withDb, SYSTEM, type Tx } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { securityEvent } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";
import { sendEmail, emailTemplates } from "@/lib/server/email";
import { deviceFamily } from "@/lib/server/request";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function issueEmailToken(tx: Tx, userId: string, purpose: "verify_email" | "reset_password" | "change_email", ttl: string, newEmail?: string) {
  const token = randomToken(32);
  // Invalidate previous outstanding tokens of the same purpose.
  await tx.q(`UPDATE email_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`, [userId, purpose]);
  await tx.q(
    `INSERT INTO email_tokens (user_id, purpose, token_hash, new_email, expires_at) VALUES ($1, $2, $3, $4, now() + $5::interval)`,
    [userId, purpose, sha256(token), newEmail ?? null, ttl],
  );
  return token;
}

export async function consumeEmailToken(tx: Tx, token: string, purpose: string) {
  return tx.one<{ user_id: string; new_email: string | null }>(
    `UPDATE email_tokens SET used_at = now()
     WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id, new_email`,
    [sha256(token), purpose],
  );
}

export async function sendVerificationEmail(tx: Tx, userId: string, email: string) {
  const token = await issueEmailToken(tx, userId, "verify_email", "24 hours");
  const t = emailTemplates.verify(`${env.appUrl}/verify-email?token=${encodeURIComponent(token)}`);
  await sendEmail({ to: email, ...t });
}

/** Security notification (in-app + email). Always sent regardless of preferences. */
export async function securityNotice(tx: Tx, userId: string, email: string, what: string, title?: string) {
  // P-06: say what happened in the title (e.g. a recovery-code sign-in is not a "settings change").
  await notify(tx, userId, "security", title ?? "Security settings changed", what, "/account/security");
  await sendEmail({ to: email, ...emailTemplates.securityChange(what) });
}

/** Detects sign-ins from a device/network not seen in the last 90 days. */
export async function checkNewDevice(userId: string, email: string, meta: { ipHash: string; userAgent: string }) {
  await withDb(SYSTEM, async (tx) => {
    const fam = deviceFamily(meta.userAgent);
    const prior = await tx.q<{ ip_hash: string | null; detail: { device?: string } }>(
      `SELECT ip_hash, detail FROM security_events WHERE user_id = $1 AND event_type = 'login_success'
       AND created_at > now() - interval '90 days' ORDER BY created_at DESC LIMIT 50`, [userId]);
    const known = prior.some((p) => p.ip_hash === meta.ipHash) || prior.some((p) => p.detail?.device === fam);
    await securityEvent(tx, userId, "login_success", meta, { device: fam });
    if (prior.length > 0 && !known) {
      await securityEvent(tx, userId, "new_device_login", meta, { device: fam });
      await securityNotice(tx, userId, email, `New sign-in from ${fam}`);
    }
  });
}
