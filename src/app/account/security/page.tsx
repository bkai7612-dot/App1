import type { Metadata } from "next";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb, SYSTEM } from "@/lib/db";
import { PageHeader, Notice } from "@/components/ui/Card";
import { AccountNav } from "@/components/account/AccountNav";
import { SecuritySettings } from "./SecuritySettings";
import { isAdminRole, isStaff } from "@/lib/rbac";

export const metadata: Metadata = { title: "Security" };

export default async function Security({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const auth = await requirePageAuth("/account/security");
  const sp = await searchParams;
  const data = await withDb(auth.db, async (tx) => ({
    passkeys: await tx.q<{ id: string; nickname: string | null; created_at: Date; last_used_at: Date | null; backed_up: boolean }>(
      `SELECT id, nickname, created_at, last_used_at, backed_up FROM webauthn_credentials WHERE user_id = $1 ORDER BY created_at`, [auth.user.id]),
    events: await tx.q<{ event_type: string; created_at: Date; user_agent: string | null }>(
      `SELECT event_type, created_at, user_agent FROM security_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 25`, [auth.user.id]),
  }));
  const totp = await withDb(SYSTEM, (tx) => tx.one(`SELECT 1 FROM mfa_totp WHERE user_id = $1 AND confirmed_at IS NOT NULL`, [auth.user.id]));
  const codesLeft = await withDb(SYSTEM, (tx) => tx.one<{ n: string }>(`SELECT count(*) AS n FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL`, [auth.user.id]));
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHeader title="Security" subtitle="Two-factor authentication, passkeys, sessions and recent security activity." />
      <AccountNav active="/account/security" />
      {sp.welcome && !auth.user.mfaEnabled && <div className="mb-6"><Notice>Welcome! Check your inbox to verify your email, then set up two-factor authentication. It&apos;s required before you can submit commendations, reports or link gaming accounts.</Notice></div>}
      {isStaff(auth.user.role) && !auth.staffActive && (
        <div className="mb-6"><Notice tone="warn">Your staff permissions are inactive in this session. {isAdminRole(auth.user.role) ? "Administrators must sign in with a passkey." : "Sign in with two-factor authentication."}</Notice></div>
      )}
      <SecuritySettings
        mfaEnabled={auth.user.mfaEnabled}
        hasTotp={!!totp}
        codesLeft={Number(codesLeft?.n ?? 0)}
        passkeys={data.passkeys.map((p) => ({ ...p, created_at: p.created_at.toISOString(), last_used_at: p.last_used_at?.toISOString() ?? null }))}
        events={data.events.map((e) => ({ type: e.event_type, at: e.created_at.toISOString() }))}
      />
    </div>
  );
}
