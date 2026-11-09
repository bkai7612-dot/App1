import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { getProfileByPublicId } from "@/lib/server/players";
import { PageHeader, Notice } from "@/components/ui/Card";
import { ReportForm } from "./ReportForm";

export const metadata: Metadata = { title: "Report behaviour", robots: { index: false } };

export default async function ReportPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const auth = await getAuth();
  if (!auth || auth.pendingMfa) redirect(`/login?next=/players/${publicId}/report`);
  const p = await getProfileByPublicId(publicId);
  if (!p) notFound();
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
