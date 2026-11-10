import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/forms/AuthShell";
import { withDb, SYSTEM } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

/** P-11: check the link first, so a used or expired link says so straight away, and 2FA fields show on the same screen. */
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const state = token && token.length >= 10 && token.length <= 200
    ? await withDb(SYSTEM, (tx) => tx.one<{ used: boolean; expired: boolean; mfa: boolean }>(
        `SELECT t.used_at IS NOT NULL AS used, t.expires_at <= now() AS expired, u.mfa_enabled AS mfa
         FROM email_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1 AND t.purpose = 'reset_password'`, [sha256(token)]))
    : null;
  if (!state || state.used || state.expired) {
    const why = !state ? "This reset link isn't valid. It may have been copied incompletely." : state.used ? "This reset link has already been used. Each link works once." : "This reset link has expired. Links last 1 hour.";
    return (
      <AuthShell title="Link can't be used" subtitle={why}>
        <div className="space-y-3"><Link href="/forgot-password" className="btn-primary w-full">Send me a new link</Link><Link href="/login" className="btn-ghost w-full">Back to log in</Link></div>
      </AuthShell>
    );
  }
  return <AuthShell title="Choose a new password" subtitle="Resetting your password signs you out everywhere."><ResetForm token={token!} mfa={state.mfa} /></AuthShell>;
}
