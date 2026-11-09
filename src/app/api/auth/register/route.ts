import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { normalizeEmail, sendVerificationEmail } from "@/lib/auth/flows";
import { securityEvent, audit } from "@/lib/server/audit";
import { sendEmail, emailTemplates } from "@/lib/server/email";
import { env } from "@/lib/env";
import { badRequest, ApiError } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";
import { clientIp } from "@/lib/server/request";
import { featureEnabled } from "@/lib/launch-gates";

const Body = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
  displayName: z.string().trim().min(2).max(40).regex(/^[\p{L}\p{N} _.-]+$/u, "Use letters, numbers, spaces, _ . -"),
  acceptTerms: z.literal(true),
  confirmAge: z.literal(true),
});

export const POST = route({ auth: "public", body: Body, rate: { name: "register", limit: 5, windowSec: 3600 } }, async ({ body, meta }) => {
  if (!featureEnabled("registration")) throw new ApiError(503, "LAUNCH_GATE", "Registration is not open yet.");
  await rateLimit(`register-ip-day:${await clientIp()}`, 20, 86400);
  const emailNorm = normalizeEmail(body.email);
  const problem = passwordProblems(body.password, [emailNorm.split("@")[0], body.displayName]);
  if (problem) throw badRequest(problem);
  const passwordHash = await hashPassword(body.password);

  const result = await withDb(SYSTEM, async (tx) => {
    const existing = await tx.one<{ id: string }>(`SELECT id FROM users WHERE email_normalized = $1`, [emailNorm]);
    if (existing) {
      // Anti-enumeration: same response; notify the real owner instead.
      await sendEmail({ to: body.email, ...emailTemplates.existingAccount(`${env.appUrl}/login`) });
      await securityEvent(tx, existing.id, "register_existing_email", meta);
      return { created: false as const };
    }
    const user = await tx.one<{ id: string; role: string }>(
      `INSERT INTO users (email, email_normalized, password_hash, display_name) VALUES ($1, $2, $3, $4) RETURNING id, role`,
      [body.email.trim(), emailNorm, passwordHash, body.displayName],
    );
    await sendVerificationEmail(tx, user!.id, body.email.trim());
    await securityEvent(tx, user!.id, "account_created", meta);
    await audit(tx, user!.id, "account.created", { type: "user", id: user!.id }, {}, meta.ipHash);
    return { created: true as const };
  });
  void result;
  // Identical response for new and existing emails (no session issued): prevents account enumeration.
  return { ok: true, message: "Check your email to verify your address, then log in." };
});
