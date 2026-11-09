import "server-only";
import { env } from "@/lib/env";

export interface Email { to: string; subject: string; text: string }

/**
 * Sends transactional email via the Resend HTTP API.
 * Development fallback: prints to the server console (NEVER in production — tokens would leak to logs).
 */
export async function sendEmail(mail: Email): Promise<void> {
  const key = env.resendApiKey;
  if (!key) {
    if (env.isProduction && env.launchMode === "production") {
      console.error("[email] RESEND_API_KEY not configured; email not sent:", mail.subject);
      return;
    }
    if (process.env.DEV_EMAIL_OUTBOX && !env.isProduction) {
      const fs = await import("node:fs/promises");
      await fs.appendFile(process.env.DEV_EMAIL_OUTBOX, JSON.stringify({ ...mail, at: new Date().toISOString() }) + "\n");
    }
    console.log(`\n[dev-email] to=${mail.to}\nsubject: ${mail.subject}\n${mail.text}\n[/dev-email]\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.emailFrom, to: [mail.to], subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) console.error("[email] send failed", res.status);
}

export const emailTemplates = {
  verify: (link: string) => ({
    subject: "Verify your ServerSentry email",
    text: `Welcome to ServerSentry.\n\nConfirm your email address within 24 hours:\n${link}\n\nIf you did not create an account, ignore this message.`,
  }),
  existingAccount: (link: string) => ({
    subject: "ServerSentry sign-up attempt",
    text: `Someone tried to register a ServerSentry account with this email address, which already has an account.\n\nIf this was you, sign in or reset your password: ${link}\n\nIf not, you can ignore this email.`,
  }),
  reset: (link: string) => ({
    subject: "Reset your ServerSentry password",
    text: `A password reset was requested for your account. This link expires in 1 hour and can be used once:\n${link}\n\nIf you did not request this, ignore this email and consider reviewing your security settings.`,
  }),
  securityChange: (what: string) => ({
    subject: "ServerSentry security alert",
    text: `A security setting on your ServerSentry account changed: ${what}.\n\nIf this was not you, reset your password immediately and use "Report suspected compromise" in Account Settings > Security.`,
  }),
  changeEmail: (link: string) => ({
    subject: "Confirm your new ServerSentry email",
    text: `Confirm this address for your ServerSentry account (expires in 1 hour):\n${link}`,
  }),
};
