import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { normalizeEmail } from "@/lib/auth/flows";
import { securityEvent } from "@/lib/server/audit";

const Body = z.object({ email: z.string().trim().email().max(254), details: z.string().trim().min(10).max(2000) });

/** Lost all second factors: request manual recovery (reviewed by an administrator; fully audited). */
export const POST = route({ auth: "public", body: Body, rate: { name: "recovery-req", limit: 3, windowSec: 86400 } }, async ({ body, meta }) => {
  await withDb(SYSTEM, async (tx) => {
    const emailNorm = normalizeEmail(body.email);
    const u = await tx.one<{ id: string }>(`SELECT id FROM users WHERE email_normalized = $1 AND deleted_at IS NULL`, [emailNorm]);
    await tx.q(`INSERT INTO account_recovery_requests (user_id, email_normalized, details) VALUES ($1, $2, $3)`, [u?.id ?? null, emailNorm, body.details]);
    if (u) await securityEvent(tx, u.id, "account_recovery_requested", meta);
  });
  return { ok: true, message: "Your request has been received. For your protection, recovery requires additional verification and can take several days. We'll email you." };
});
