import Link from "next/link";
import type { Metadata } from "next";
import { ArrowBigDown, ArrowBigUp, Eye, Flag, MessageSquare, ShieldAlert, ThumbsUp, Send, Link2 } from "lucide-react";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb, SYSTEM } from "@/lib/db";
import { hasPlus } from "@/lib/server/entitlements";
import { getGames, getPlatforms } from "@/lib/server/catalog";
import { PageHeader, Empty, Notice } from "@/components/ui/Card";
import { MeNav } from "@/components/account/MeNav";
import { IdentityBadge } from "@/components/ui/Badges";
import { CreateOwnProfile } from "./CreateOwnProfile";
import { ROLE_LABELS, type Role } from "@/lib/rbac";

export const metadata: Metadata = { title: "My Profile" };

export default async function MyProfile() {
  const auth = await requirePageAuth("/me/profile");
  const [plus, games, platforms] = await Promise.all([hasPlus(auth.user.id), getGames(), getPlatforms()]);
  const profiles = await withDb(auth.db, (tx) => tx.q<{ public_id: string; display_name: string; game: string; platform: string; verified: boolean; positive: number; negative: number; up: number; down: number; comments: number }>(
    `SELECT p.public_id, p.display_name, g.name AS game, pl.name AS platform,
            EXISTS (SELECT 1 FROM gaming_accounts ga WHERE ga.player_profile_id = p.id AND ga.verification_status = 'verified') AS verified,
            s.positive_total::int AS positive, s.negative_published::int AS negative, vs.upvotes::int AS up, vs.downvotes::int AS down, vs.comments::int AS comments
     FROM player_profiles p JOIN games g ON g.id = p.game_id JOIN platforms pl ON pl.id = p.platform_id
     JOIN player_reputation_stats s ON s.player_profile_id = p.id JOIN player_vote_stats vs ON vs.player_profile_id = p.id
     WHERE p.owner_user_id = $1 AND p.deleted_at IS NULL ORDER BY p.created_at`, [auth.user.id]));
  // What I've given (my own rows, via RLS).
  const given = await withDb(auth.db, (tx) => tx.one<{ commendations: string; reports: string; votes: string; comments: string }>(
    `SELECT (SELECT count(*) FROM commendations WHERE submitter_user_id = $1) AS commendations, (SELECT count(*) FROM reports WHERE reporter_user_id = $1) AS reports,
            (SELECT count(*) FROM player_votes WHERE voter_user_id = $1) AS votes, (SELECT count(*) FROM player_comments WHERE author_user_id = $1) AS comments`, [auth.user.id]));
  const pendingClaims = await withDb(SYSTEM, (tx) => tx.one<{ n: string }>(`SELECT count(*) AS n FROM account_verifications WHERE user_id = $1 AND status = 'pending'`, [auth.user.id]));
  const sum = (k: "positive" | "negative" | "up" | "down" | "comments") => profiles.reduce((n, p) => n + p[k], 0);
  const first = profiles[0];
  const tile = (href: string, Icon: typeof Eye, label: string, value: string | number, hint: string, tone = "") => (
    <Link href={href} className="glass group flex items-start gap-3 p-5 transition hover:-translate-y-0.5 hover:shadow-glow">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone || "text-violet-lavender"}`} aria-hidden="true" />
      <span className="min-w-0"><span className="block text-sm text-text-muted">{label}</span><span className={`block font-display text-2xl font-semibold tabular-nums ${tone}`}>{value}</span><span className="block text-xs text-text-muted">{hint}</span></span>
    </Link>
  );
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader title={`Hi, ${auth.user.displayName}`} subtitle={`${ROLE_LABELS[auth.user.role as Role]} · ${plus ? "ServerSentry Plus" : "Free plan"}`}>
        {!plus && <Link href="/pricing" className="btn-primary">Upgrade to Plus</Link>}
      </PageHeader>
      <MeNav active="/me/profile" />
      {!auth.user.mfaEnabled && <div className="mb-6"><Notice tone="warn">Set up two-factor authentication to vote, give commendations, submit reports and link accounts. <Link className="underline" href="/account/security">Set up now</Link></Notice></div>}

      <section aria-labelledby="about-me">
        <h2 id="about-me" className="font-display text-lg font-semibold">About me (what others see)</h2>
        {profiles.length === 0 ? (
          <div className="mt-3"><Empty title="You haven't claimed a player profile yet">Find your username with <Link href="/search" className="underline">Search</Link> and press &ldquo;Is this you? Claim profile&rdquo;, or create one below.{Number(pendingClaims?.n ?? 0) > 0 && <> You have {pendingClaims!.n} verification{Number(pendingClaims!.n) === 1 ? "" : "s"} in progress: see <Link href="/me/linked-accounts" className="underline">Linked Accounts</Link>.</>}</Empty></div>
        ) : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tile(`/players/${first.public_id}`, Eye, "My public profile", profiles.length === 1 ? first.display_name : `${profiles.length} profiles`, "See exactly what other players see")}
              {tile(`/players/${first.public_id}?tab=positive`, ThumbsUp, "Commendations received", `+${sum("positive")}`, "Recognition from other players", "text-pos")}
              {tile(`/players/${first.public_id}?tab=comments`, MessageSquare, "Comments on my account", sum("comments"), "Free to read; report any that are inaccurate")}
              {tile("/me/reports", ShieldAlert, "Reports about me", `−${sum("negative")}`, "Read, respond and appeal for free", "text-neg")}
              <div className="glass flex items-start gap-3 p-5"><ArrowBigUp className="mt-0.5 h-5 w-5 text-pos" aria-hidden="true" /><span><span className="block text-sm text-text-muted">Community votes</span><span className="block font-display text-2xl font-semibold tabular-nums"><span className="text-pos">{sum("up")}</span> <span className="text-text-muted">/</span> <span className="text-neg">{sum("down")}</span><ArrowBigDown className="ml-1 inline h-5 w-5 text-neg" aria-hidden="true" /></span><span className="block text-xs text-text-muted">Upvotes / downvotes</span></span></div>
              {tile("/me/linked-accounts", Link2, "Linked accounts", profiles.filter((p) => p.verified).length + " verified", "Add or verify gaming accounts")}
            </div>
            {profiles.length > 1 && (
              <ul className="mt-4 grid gap-2">{profiles.map((p) => (
                <li key={p.public_id}><Link href={`/players/${p.public_id}`} className="glass flex flex-wrap items-center gap-3 p-4 hover:shadow-glow">
                  <span className="font-semibold">{p.display_name}</span><IdentityBadge status={p.verified ? "verified" : "unverified"} />
                  <span className="text-sm text-text-muted">{p.game} · {p.platform} · {p.public_id}</span>
                  <span className="ml-auto text-sm"><span className="text-pos">+{p.positive}</span> · <span className="text-neg">−{p.negative}</span> · ▲{p.up} ▼{p.down}</span>
                </Link></li>))}</ul>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="by-me" className="mt-10">
        <h2 id="by-me" className="font-display text-lg font-semibold">What I&apos;ve given</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tile("/me/commendations", ThumbsUp, "Commendations given", given?.commendations ?? 0, "And their status")}
          {tile("/me/commendations", Send, "Comments written", given?.comments ?? 0, plus ? "Awaiting or approved" : "A Plus feature")}
          {tile("/me/reports", Flag, "Reports made", given?.reports ?? 0, "Follow moderation progress")}
          <div className="glass flex items-start gap-3 p-5"><ArrowBigUp className="mt-0.5 h-5 w-5 text-violet-lavender" aria-hidden="true" /><span><span className="block text-sm text-text-muted">Votes cast</span><span className="block font-display text-2xl font-semibold tabular-nums">{given?.votes ?? 0}</span><span className="block text-xs text-text-muted">Who you voted for stays private</span></span></div>
        </div>
      </section>

      <section className="mt-10"><CreateOwnProfile games={games} platforms={platforms} /></section>
    </div>
  );
}
