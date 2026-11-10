import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { getProfileByPublicId } from "@/lib/server/players";
import { PageHeader, Notice } from "@/components/ui/Card";
import { ReportForm } from "./ReportForm";
import { withDb } from "@/lib/db";
import Link from "next/link";

export const metadata: Metadata = { title: "Report behaviour", robots: { index: false } };

export default async function ReportPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const auth = await getAuth();
  if (!auth || auth.pendingMfa) redirect(`/login?next=/players/${publicId}/report`);
  const p = await getProfileByPublicId(publicId);
  if (!p) notFound();
  // T-12: explain a reporting restriction BEFORE the user fills in the form.
  const r = await withDb(auth.db, (tx) => tx.one<{ until: Date | null }>(`SELECT reporting_restricted_until AS until FROM users WHERE id = $1`, [auth.user.id]));
  if (r?.until && r.until.getTime() > Date.now()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <PageHeader title="Reporting is paused on your account" />
        <Notice tone="warn">A moderator has paused your ability to submit reports until <strong>{r.until.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</strong>. This usually happens after reports that broke the Community Guidelines (for example duplicates, reports from linked accounts, or reports without a genuine first-hand incident). You can still vote, commend and use everything else.</Notice>
        <p className="mt-4 text-sm text-text-muted">If you think this is a mistake, <Link className="underline" href="/complaints">make a complaint</Link> and a moderator who wasn&apos;t involved will review it. If someone is in immediate danger, contact the emergency services.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <PageHeader title={`Report ${p.display_name}`} subtitle={`${p.game_name} · ${p.platform_name} · ${p.public_id}`} />
      <div className="mb-6 space-y-3">
        <Notice>Reports are <strong>private</strong>. Nothing is published unless a moderator reviews it and writes a neutral summary. Your identity is never shown to the reported player or the public.</Notice>
        <Notice tone="warn">Only report genuine first-hand experiences. Don&apos;t include personal information such as real names, addresses, phone numbers or private messages from other people. False or malicious reports breach our guidelines and can lead to restrictions. If someone is in immediate danger, contact the emergency services.</Notice>
      </div>
      <ReportForm profileId={p.id} publicId={p.public_id} />
    </div>
  );
}
