"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { GameInput } from "./GameInput";

type Opt = { slug: string; name: string };

export function PlayerSearchForm({ games, platforms, initial, variant = "hero" }: {
  games: Opt[]; platforms: Opt[]; initial?: { q?: string; game?: string; platform?: string }; variant?: "hero" | "compact";
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial?.q ?? "");
  const [game, setGame] = useState(initial?.game ?? "");
  const [platform, setPlatform] = useState(initial?.platform ?? "");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (game) p.set("game", game);
    if (platform) p.set("platform", platform);
    router.push(`/search?${p.toString()}`);
  };
  const hero = variant === "hero";
  return (
    <form onSubmit={submit} role="search" aria-label="Search players"
      className={`${hero ? "iris-border iris-glow" : ""} glass grid gap-2 p-2 sm:grid-cols-[1.6fr_1fr_1fr_auto]`}>
      <label className="relative block">
        <span className="sr-only">Username or player identifier</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={64} placeholder="Username or player ID" className="input border-transparent bg-ink/60 pl-10" />
      </label>
      <label className="block">
        <span className="sr-only">Game</span>
        <GameInput games={games} value={game} onChange={setGame} allowAll className="input border-transparent bg-ink/60" />
      </label>
      <label className="block">
        <span className="sr-only">Platform</span>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="input border-transparent bg-ink/60">
          <option value="">All platforms</option>
          {platforms.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </select>
      </label>
      <button type="submit" className="btn-primary px-6">Search</button>
    </form>
  );
}
