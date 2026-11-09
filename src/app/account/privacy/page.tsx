import type { Metadata } from "next";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { PageHeader } from "@/components/ui/Card";
import { AccountNav } from "@/components/account/AccountNav";
import { PrivacySettings } from "./PrivacySettings";

export const metadata: Metadata = { title: "Privacy & data" };

export default async function Privacy() {
  const auth = await requirePageAuth("/account/privacy");
  const reqs = await withDb(auth.db, (tx) => tx.q<{ id: string; kind: string; status: string; created_at: Date; due_at: Date }>(
    `SELECT id, kind, status, created_at, due_at FROM data_subject_requests WHERE user_id = $1 ORDER BY created_at DESC`, [auth.user.id]));
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHeader title="Privacy & data" subtitle="Your UK GDPR rights. We aim to respond within one month." />
      <AccountNav active="/account/privacy" />
      <PrivacySettings requests={reqs.map((r) => ({ ...r, created_at: r.created_at.toISOString(), due_at: r.due_at.toISOString() }))} />
    </div>
  );
}
