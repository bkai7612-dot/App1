import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { getGames, getPlatforms } from "@/lib/server/catalog";
import { PageHeader } from "@/components/ui/Card";
import { NewPlayerForm } from "./NewPlayerForm";

export const metadata: Metadata = { title: "Add a player" };

export default async function NewPlayer({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const auth = await getAuth();
  const sp = await searchParams;
  if (!auth || auth.pendingMfa) redirect(`/login?next=/players/new`);
  const [games, platforms] = await Promise.all([getGames(), getPlatforms()]);
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <PageHeader title="Add a player" subtitle="Create a profile for a player who isn't on ServerSentry yet. New profiles are marked Unverified and are never merged with other profiles that share the username." />
      <NewPlayerForm games={games} platforms={platforms} initial={{ name: sp.name ?? "", game: sp.game ?? "", platform: sp.platform ?? "" }} />
    </div>
  );
}
