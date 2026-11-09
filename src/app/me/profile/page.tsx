import Link from "next/link";
import type { Metadata } from "next";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
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
  const profiles = await withDb(auth.db, (tx) => tx.q<{ public_id: string; display_name: string; game: string; platform: string; verified: boolean; positive: number; negative: number }>(
    `SELECT p.public_id, p.display_name, g.name AS game, pl.name AS platform,
            EXISTS (SELECT 1 FROM gaming_accounts ga WHERE ga.player_profile_id = p.id AND ga.verification_status = 'verified') AS verified,
            s.positive_total::int AS positive, s.negative_published::int AS negative
     FROM player_profiles p JOIN games g ON g.id = p.game_id JOIN platforms pl ON pl.id = p.platform_id
     JOIN player_reputation_stats s ON s.player_profile_id = p.id
     WHERE p.owner_user_id = $1 AND p.deleted_at IS NULL ORDER BY p.created_at`, [auth.user.id]));
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader title={`Hi, ${auth.user.displayName}`} subtitle={`${ROLE_LABELS[auth.user.role as Role]} · ${plus ? "ServerSentry Plus" : "Free plan"}`}>
        {!plus && <Link href="/pricing" className="btn-primary">Upgrade to Plus</Link>}
      </PageHeader>
      <MeNav active="/me/profile" />
      {!auth.user.mfaEnabled && <div className="mb-6"><Notice tone="warn">Set up two-factor authentication to give commendations, submit reports and link accounts. <Link className="underline" href="/account/security">Set up now</Link></Notice></div>}
      <section>
        <h2 className="font-display text-lg font-semibold">Your player profiles</h2>
        <p className="mt-1 text-sm text-text-muted">Profiles you own. As the owner you can see reports about you, respond and appeal, free of charge.</p>
        <div className="mt-4 grid gap-3">
          {profiles.length === 0 ? <Empty title="You don't own any player profiles yet">Create one below, or find your existing profile and choose &ldquo;Claim profile&rdquo;.</Empty> :
            profiles.map((p) => (
              <Link key={p.public_id} href={`/players/${p.public_id}`} className="glass flex flex-wrap items-center gap-3 p-4 hover:shadow-glow">
                <span className="font-semibold">{p.display_name}</span>
                <IdentityBadge status={p.verified ? "verified" : "unverified"} />
                <span className="text-sm text-text-muted">{p.game} · {p.platform} · {p.public_id}</span>
                <span className="ml-auto text-sm"><span className="text-pos">+{p.positive}</span> · <span className="text-neg">−{p.negative}</span></span>
              </Link>
            ))}
        </div>
      </section>
      <section className="mt-8"><CreateOwnProfile games={games} platforms={platforms} /></section>
    </div>
  );
}
