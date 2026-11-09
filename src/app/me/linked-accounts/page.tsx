import Link from "next/link";
import type { Metadata } from "next";
import { requirePageAuth } from "@/lib/server/page-auth";
import { withDb } from "@/lib/db";
import { getPlatforms } from "@/lib/server/catalog";
import { PageHeader, Empty, Notice } from "@/components/ui/Card";
import { MeNav } from "@/components/account/MeNav";
import { LinkedAccountsManager } from "./LinkedAccountsManager";

export const metadata: Metadata = { title: "Linked Accounts" };

const STEAM_MSG: Record<string, [string, "ok" | "warn" | "danger"]> = {
  ok: ["Steam account verified through Steam's official sign-in.", "ok"],
  review: ["Steam sign-in succeeded, but this profile has no matching recorded SteamID. A moderator will review your claim.", "warn"],
  taken: ["That Steam account is already verified on another profile. Contact support if you believe this is wrong.", "danger"],
  failed: ["Steam could not confirm the sign-in. Nothing was changed.", "danger"],
  invalid: ["That verification link was invalid or expired. Please try again.", "danger"],
};

export default async function LinkedAccounts({ searchParams }: { searchParams: Promise<{ steam?: string }> }) {
  const auth = await requirePageAuth("/me/linked-accounts");
  const sp = await searchParams;
  const platforms = await getPlatforms();
  const data = await withDb(auth.db, async (tx) => ({
    profiles: await tx.q<{ id: string; public_id: string; display_name: string; game: string; platform: string }>(
      `SELECT p.id, p.public_id, p.display_name, g.name AS game, pl.name AS platform FROM player_profiles p JOIN games g ON g.id = p.game_id JOIN platforms pl ON pl.id = p.platform_id
       WHERE p.owner_user_id = $1 AND p.deleted_at IS NULL ORDER BY p.created_at`, [auth.user.id]),
    accounts: await tx.q<{ id: string; player_profile_id: string; username: string; platform: string; platform_slug: string; integration_status: string; verification_status: string; verification_method: string | null; linked_at: Date; last_verified_at: Date | null }>(
      `SELECT ga.id, ga.player_profile_id, ga.username, pl.name AS platform, pl.slug AS platform_slug, pl.integration_status, ga.verification_status, ga.verification_method, ga.linked_at, ga.last_verified_at
       FROM gaming_accounts ga JOIN player_profiles p ON p.id = ga.player_profile_id JOIN platforms pl ON pl.id = ga.platform_id
       WHERE p.owner_user_id = $1 AND ga.verification_status <> 'unlinked' ORDER BY ga.linked_at`, [auth.user.id]),
    pending: await tx.q<{ id: string; kind: string; method: string; created_at: Date; gaming_account_id: string | null; player_profile_id: string }>(
      `SELECT id, kind, method, created_at, gaming_account_id, player_profile_id FROM account_verifications WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC`, [auth.user.id]),
  }));
  const msg = sp.steam ? STEAM_MSG[sp.steam] : null;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader title="Linked Accounts" subtitle="Connect your gaming accounts to your ServerSentry profiles. Accounts are never linked automatically because a username matches." />
      <MeNav active="/me/linked-accounts" />
      {msg && <div className="mb-6"><Notice tone={msg[1]}>{msg[0]}</Notice></div>}
      <div className="mb-6"><Notice>
        <strong>How verification works.</strong> Steam accounts are verified through Steam&apos;s official OpenID sign-in. Ubisoft Connect, Riot Games, Xbox and PlayStation Network don&apos;t have an integration we&apos;re authorised to use yet, so a moderator reviews a manual ownership proof. We will <strong>never</strong> ask for your platform password.
      </Notice></div>
      {data.profiles.length === 0 ? (
        <Empty title="You don't own a player profile yet"><Link href="/me/profile" className="underline">Create your profile</Link> first.</Empty>
      ) : (
        <LinkedAccountsManager
          profiles={data.profiles}
          platforms={platforms.map((p) => ({ slug: p.slug, name: p.name }))}
          accounts={data.accounts.map((a) => ({ ...a, linked_at: a.linked_at.toISOString(), last_verified_at: a.last_verified_at?.toISOString() ?? null }))}
          pendingAccountIds={data.pending.map((p) => p.gaming_account_id).filter(Boolean) as string[]}
        />
      )}
    </div>
  );
}
