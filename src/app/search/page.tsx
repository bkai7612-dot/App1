import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, ThumbsUp, ShieldAlert, UserPlus, Users, ArrowBigUp, ArrowBigDown } from "lucide-react";
import { PlayerSearchForm } from "@/components/forms/PlayerSearchForm";
import { IdentityBadge, DemoBadge } from "@/components/ui/Badges";
import { Empty, Notice } from "@/components/ui/Card";
import { getGames, getPlatforms } from "@/lib/server/catalog";
import { searchPlayers } from "@/lib/server/players";
import { rateLimit } from "@/lib/server/ratelimit";
import { clientIp } from "@/lib/server/request";
import { getAuth } from "@/lib/auth/session";
import { ApiError } from "@/lib/server/errors";

export const metadata: Metadata = { title: "Search Players" };

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = str(sp.q)?.slice(0, 64) ?? "";
  const game = str(sp.game) ?? "";
  const platform = str(sp.platform) ?? "";
  const verified = str(sp.verified) === "1";
  const positive = str(sp.positive) === "1";
  const sort = str(sp.sort) === "recent" ? "recent" : "relevance";
  const page = Number(str(sp.page) ?? "1") || 1;

  const [games, platforms, auth] = await Promise.all([getGames(), getPlatforms(), getAuth()]);
  let limited = false;
  let data: Awaited<ReturnType<typeof searchPlayers>> | null = null;
  try {
    await rateLimit(`search:${auth ? `u:${auth.user.id}` : `ip:${await clientIp()}`}`, 60, 60);
    data = await searchPlayers({ q, game: game || undefined, platform: platform || undefined, verified, positive, sort, page });
  } catch (e) {
    if (e instanceof ApiError && e.status === 429) limited = true; else throw e;
  }

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, game, platform, verified: verified ? "1" : "", positive: positive ? "1" : "", sort: sort === "recent" ? "recent" : "", page: "", ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/search?${p.toString()}`;
  };
  const sameNames = new Map<string, number>();
  data?.results.forEach((r) => sameNames.set(r.display_name.toLowerCase(), (sameNames.get(r.display_name.toLowerCase()) ?? 0) + 1));

  return (
    <div className="ambient">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Search players</h1>
        <p className="mt-2 text-sm text-text-muted">Find a player by username, game and platform. Players with the same username are kept as separate profiles and are never merged automatically.</p>
        <div className="mt-6"><PlayerSearchForm games={games} platforms={platforms} initial={{ q, game, platform }} variant="compact" /></div>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm" aria-label="Filters">
          <span className="text-text-muted">Filter:</span>
          <Link href={qs({ verified: verified ? "" : "1" })} aria-pressed={verified} className={`chip px-3 py-1 ${verified ? "border-pos/50 bg-pos/10 text-pos" : "border-ink-line text-text-muted hover:text-text"}`}>Verified accounts</Link>
          <Link href={qs({ positive: positive ? "" : "1" })} aria-pressed={positive} className={`chip px-3 py-1 ${positive ? "border-pos/50 bg-pos/10 text-pos" : "border-ink-line text-text-muted hover:text-text"}`}>Has positive feedback</Link>
          <span className="ml-2 text-text-muted">Sort:</span>
          <Link href={qs({ sort: "" })} className={`chip px-3 py-1 ${sort === "relevance" ? "border-violet-brand/60 bg-violet-brand/10 text-violet-lavender" : "border-ink-line text-text-muted"}`}>Best match</Link>
          <Link href={qs({ sort: "recent" })} className={`chip px-3 py-1 ${sort === "recent" ? "border-violet-brand/60 bg-violet-brand/10 text-violet-lavender" : "border-ink-line text-text-muted"}`}>Recently active</Link>
        </div>

        <div className="mt-8">
          {limited && <Notice tone="warn">You&apos;re searching very quickly. Please wait a minute and try again.</Notice>}
          {data && (
            <>
              <p className="mb-4 text-sm text-text-muted" aria-live="polite">{data.total.toLocaleString("en-GB")} profile{data.total === 1 ? "" : "s"} found</p>
              {data.results.length === 0 ? (
                <Empty title="No matching player profiles">
                  <p>Try a different spelling or remove filters.</p>
                  <Link href={`/players/new?${new URLSearchParams({ name: q, game, platform }).toString()}`} className="btn-ghost mt-4"><UserPlus className="h-4 w-4" /> Add this player</Link>
                </Empty>
              ) : (
                <ul className="grid gap-3">
                  {data.results.map((r) => (
                    <li key={r.id}>
                      <Link href={`/players/${r.public_id}`} className="glass group flex flex-col gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-glow sm:flex-row sm:items-center sm:p-5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-display text-lg font-semibold group-hover:text-violet-lavender">{r.display_name}</span>
                            <IdentityBadge status={r.identity_status} />
                            {r.is_demo && <DemoBadge />}
                          </div>
                          <p className="mt-1 text-sm text-text-muted">{r.game_name} · {r.platform_name} · <span className="font-mono text-xs">{r.public_id}</span></p>
                          {(sameNames.get(r.display_name.toLowerCase()) ?? 0) > 1 && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-amber-300"><Users className="h-3.5 w-3.5" /> Shares a username with another profile. Check game, platform and ID.</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="flex items-center gap-1 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-sm text-text-muted" title="Community votes: up / down"><ArrowBigUp className="h-4 w-4 text-pos" />{r.upvotes}<ArrowBigDown className="ml-1 h-4 w-4 text-neg" />{r.downvotes}</span>
                          <span className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-1.5 text-sm font-semibold" title="Commendations"><ThumbsUp className="h-4 w-4 text-pos" aria-hidden="true" />{r.positive_total}<span className="sr-only"> commendations</span></span>
                          <span className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-1.5 text-sm font-semibold" title="Published reports (moderated allegations)"><ShieldAlert className="h-4 w-4 text-amber-300" aria-hidden="true" />{r.negative_published}<span className="sr-only"> published reports</span></span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {data.pages > 1 && (
                <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
                  {data.page > 1 ? <Link className="btn-ghost" href={qs({ page: String(data.page - 1) })}><ChevronLeft className="h-4 w-4" /> Previous</Link> : <span className="btn-ghost opacity-40"><ChevronLeft className="h-4 w-4" /> Previous</span>}
                  <span className="text-sm text-text-muted">Page {data.page} of {data.pages}</span>
                  {data.page < data.pages ? <Link className="btn-ghost" href={qs({ page: String(data.page + 1) })}>Next <ChevronRight className="h-4 w-4" /></Link> : <span className="btn-ghost opacity-40">Next <ChevronRight className="h-4 w-4" /></span>}
                </nav>
              )}
            </>
          )}
          <p className="mt-8 text-xs text-text-muted">Icons show community votes (up/down), commendations, and published reports. Published reports are moderated community allegations, not proven misconduct. Votes from accounts under three days old don&apos;t count yet.</p>
        </div>
      </div>
    </div>
  );
}
