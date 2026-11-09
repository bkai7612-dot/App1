import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/forms/AuthShell";
import { getAuth } from "@/lib/auth/session";
import { withDb, SYSTEM } from "@/lib/db";
import { safeNext } from "@/lib/safe-next";
import { MfaChallenge } from "./MfaChallenge";

export const metadata: Metadata = { title: "Two-factor authentication" };

export default async function Mfa({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const auth = await getAuth();
  const next = safeNext(sp.next, "/me/profile");
  if (!auth) redirect("/login");
  if (!auth.pendingMfa) redirect(next);
  const m = await withDb(SYSTEM, (tx) => tx.one<{ totp: boolean; passkeys: string }>(
    `SELECT EXISTS (SELECT 1 FROM mfa_totp WHERE user_id = $1 AND confirmed_at IS NOT NULL) AS totp,
            (SELECT count(*) FROM webauthn_credentials WHERE user_id = $1) AS passkeys`, [auth.user.id]));
  return (
    <AuthShell title="Confirm it's you" subtitle="Use your passkey or authenticator app to finish signing in.">
      <MfaChallenge next={next} hasTotp={!!m?.totp} hasPasskey={Number(m?.passkeys ?? 0) > 0} />
    </AuthShell>
  );
}
