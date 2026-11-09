import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { issueEmailToken, normalizeEmail } from "@/lib/auth/flows";
import { sendEmail, emailTemplates } from "@/lib/server/email";
import { securityEvent } from "@/lib/server/audit";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/server/ratelimit";

const Body = z.object({ email: z.string().trim().max(254) });

export const POST = route({ auth: "public", body: Body, rate: { name: "forgot-ip", limit: 10, windowSec: 3600 } }, async ({ body, meta }) => {
  const emailNorm = normalizeEmail(body.email);
  // Per-account limit prevents reset-email flooding (abuse) without revealing existence.
  try { await rateLimit(`forgot-email:${emailNorm}`, 3, 3600); } catch { return { ok: true }; }
  await withDb(SYSTEM, async (tx) => {
    const u = await tx.one<{ id: string; email: string }>(`SELECT id, email FROM users WHERE email_normalized = $1 AND deleted_at IS NULL`, [emailNorm]);
    if (!u) return;
    const token = await issueEmailToken(tx, u.id, "reset_password", "1 hour");
    await sendEmail({ to: u.email, ...emailTemplates.reset(`${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`) });
    await securityEvent(tx, u.id, "password_reset_requested", meta);
  });
  return { ok: true, message: "If an account exists for that email, a reset link has been sent." };
});
