import Link from "next/link";
import type { Metadata } from "next";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { PageHeader, Empty } from "@/components/ui/Card";
import { MarkAllRead } from "./MarkAllRead";

export const metadata: Metadata = { title: "Notifications" };

export default async function Notifications() {
  const auth = await requirePageAuth("/me/notifications");
  const items = await withDb(auth.db, (tx) => tx.q<{ id: string; title: string; body: string | null; link: string | null; read_at: Date | null; created_at: Date }>(
    `SELECT id, title, body, link, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [auth.user.id]));
  // P-12: say which player (and game/platform) each notification is about, from its link.
  const ids = [...new Set(items.map((n) => n.link?.match(/^\/players\/([A-Za-z0-9_-]+)/)?.[1]).filter(Boolean) as string[])];
  const about = new Map((ids.length ? await withDb(auth.db, (tx) => tx.q<{ public_id: string; name: string; platform: string; game: string | null }>(
    `SELECT p.public_id, p.display_name AS name, pl.name AS platform, g.name AS game FROM player_profiles p JOIN platforms pl ON pl.id = p.platform_id LEFT JOIN games g ON g.id = p.game_id
     WHERE p.public_id = ANY($1::text[])`, [ids])) : []).map((r) => [r.public_id, r]));
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHeader title="Notifications" subtitle={<>Manage preferences in <Link className="underline" href="/account">Account Settings</Link>.</>}><MarkAllRead /></PageHeader>
      {items.length === 0 ? <Empty title="You're all caught up" /> : (
        <ul className="grid gap-2">
          {items.map((n) => {
            const inner = (<><p className={`text-sm ${n.read_at ? "text-text-muted" : "font-semibold"}`}>{!n.read_at && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-violet-electric" aria-label="Unread" />}{n.title}</p>{(() => { const a = about.get(n.link?.match(/^\/players\/([A-Za-z0-9_-]+)/)?.[1] ?? ""); return a ? <p className="mt-1 text-xs text-violet-lavender">About {a.name} · {[a.game, a.platform].filter(Boolean).join(" · ")}</p> : null; })()}{n.body && <p className="mt-1 text-xs text-text-muted">{n.body}</p>}<p className="mt-1 text-[11px] text-text-muted">{new Date(n.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p></>);
            return <li key={n.id}>{n.link ? <Link href={n.link} className="glass block p-4 hover:shadow-glow">{inner}</Link> : <div className="glass p-4">{inner}</div>}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
