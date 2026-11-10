import Link from "next/link";
import type { Metadata } from "next";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { PageHeader, Empty } from "@/components/ui/Card";
import { MeNav } from "@/components/account/MeNav";
import { COMMENDATION_LABELS } from "@/lib/categories";

export const metadata: Metadata = { title: "My Commendations" };

export default async function MyCommendations() {
  const auth = await requirePageAuth("/me/commendations");
  const rows = await withDb(auth.db, (tx) => tx.q<{ id: string; category: string; comment: string | null; status: string; created_at: Date; player: string; public_id: string }>(
    `SELECT c.id, c.category, c.comment, c.status, c.created_at, p.display_name AS player, p.public_id
     FROM commendations c JOIN player_profiles p ON p.id = c.player_profile_id WHERE c.submitter_user_id = $1 AND c.deleted_at IS NULL ORDER BY c.created_at DESC`, [auth.user.id]));
  const comments = await withDb(auth.db, (tx) => tx.q<{ id: string; body: string; status: string; moderation_note: string | null; created_at: Date; player: string; public_id: string }>(
    `SELECT c.id, c.body, c.status, c.moderation_note, c.created_at, p.display_name AS player, p.public_id
     FROM player_comments c JOIN player_profiles p ON p.id = c.player_profile_id WHERE c.author_user_id = $1 ORDER BY c.created_at DESC`, [auth.user.id]));
  const tone: Record<string, string> = { approved: "border-pos/40 text-pos", pending: "border-sky-400/40 text-sky-300", rejected: "border-ink-line text-text-muted", removed: "border-ink-line text-text-muted" };
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader title="My Commendations &amp; Comments" subtitle="Recognition you've given, and comments you've written." />
      <MeNav active="/me/commendations" />
      {comments.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display text-lg font-semibold">Your comments</h2>
          <div className="mt-3 grid gap-3">{comments.map((c) => (
            <div key={c.id} className="glass p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2"><span className={`chip ${tone[c.status] ?? "border-ink-line text-text-muted"}`}>{c.status === "pending" ? "awaiting moderation" : c.status}</span>
                <span>on <Link className="underline" href={`/players/${c.public_id}?tab=comments`}>{c.player}</Link></span>
                <span className="ml-auto text-xs text-text-muted">{new Date(c.created_at).toLocaleDateString("en-GB", { dateStyle: "medium" })}</span></div>
              <p className="mt-2 whitespace-pre-wrap break-words text-text-muted">{c.body}</p>
              {c.moderation_note && c.status !== "approved" && <p className="mt-2 text-xs text-text-muted">Moderator note: {c.moderation_note}</p>}
            </div>))}</div>
        </section>
      )}
      <div className="grid gap-3">
        {rows.length === 0 ? <Empty title="You haven't commended anyone yet"><Link href="/search" className="underline">Find a great teammate</Link></Empty> : rows.map((c) => (
          <div key={c.id} className="glass p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`chip ${tone[c.status]}`}>{c.status}</span>
              <span>{COMMENDATION_LABELS[c.category]} for <Link className="underline" href={`/players/${c.public_id}`}>{c.player}</Link></span>
              <span className="ml-auto text-xs text-text-muted">{new Date(c.created_at).toLocaleDateString("en-GB", { dateStyle: "medium" })}</span>
            </div>
            {c.comment && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-text-muted">{c.comment}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
