import type { Metadata } from "next";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { PageHeader, Notice } from "@/components/ui/Card";
import { AccountNav } from "@/components/account/AccountNav";
import { GeneralSettings } from "./GeneralSettings";
import { NOTIFICATION_TYPES } from "@/lib/server/notify";

export const metadata: Metadata = { title: "Account Settings" };

export default async function Account() {
  const auth = await requirePageAuth("/account");
  const u = await withDb(auth.db, (tx) => tx.one<{ notification_prefs: Record<string, boolean>; created_at: Date }>(`SELECT notification_prefs, created_at FROM users WHERE id = $1`, [auth.user.id]));
  const types = Object.entries(NOTIFICATION_TYPES).map(([k, v]) => ({ key: k, label: v, locked: k === "security", on: k === "security" ? true : u?.notification_prefs?.[k] !== false }));
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHeader title="Account Settings" subtitle={`Member since ${u?.created_at ? new Date(u.created_at).toLocaleDateString("en-GB") : ""}`} />
      <AccountNav active="/account" />
      {!auth.user.emailVerified && <div className="mb-6"><Notice tone="warn">Your email address isn&apos;t verified yet.</Notice></div>}
      {!auth.user.mfaEnabled && <div className="mb-6"><Notice tone="warn">Two-factor authentication is required before you can submit feedback or link accounts. <a className="underline" href="/account/security">Set it up</a>.</Notice></div>}
      <GeneralSettings displayName={auth.user.displayName} email={auth.user.email} emailVerified={auth.user.emailVerified} notifications={types} />
    </div>
  );
}
