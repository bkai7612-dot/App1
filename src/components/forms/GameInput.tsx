"use client";
import { useId, useMemo, useState } from "react";
import { suggestGames } from "@/lib/game-aliases";

type Game = { slug: string; name: string };

/**
 * Type-to-search game picker (native datalist: keyboard and screen-reader friendly). Emits the game's slug, or "" if no match.
 * P-04: understands nicknames ("cod", "fifa", "bo6", "cs2") and offers "Did you mean…" for near misses.
 */
export function GameInput({ games, value, onChange, allowAll = false, className = "input", id }: {
  games: Game[]; value: string; onChange: (slug: string) => void; allowAll?: boolean; className?: string; id?: string;
}) {
  const listId = useId();
  const [text, setText] = useState(games.find((g) => g.slug === value)?.name ?? "");
  const match = (t: string) => games.find((g) => g.name.toLowerCase() === t.trim().toLowerCase());
  const exact = match(text);
  const suggestions = useMemo(() => (exact || !text.trim() ? [] : suggestGames(text, games)), [text, exact, games]);
  const pick = (g: Game) => { setText(g.name); onChange(g.slug); };
  return (
    <>
      <input id={id} className={className} list={listId} value={text} autoComplete="off" maxLength={80}
        placeholder={allowAll ? `All games (${games.length})` : `Search ${games.length} games`}
        onChange={(e) => { setText(e.target.value); onChange(match(e.target.value)?.slug ?? ""); }}
        onKeyDown={(e) => { if (e.key === "Enter" && !exact && suggestions[0]) { e.preventDefault(); pick(suggestions[0]); } }}
        aria-describedby={`${listId}-hint`} />
      <span id={`${listId}-hint`} className="sr-only">Start typing a game name or nickname and choose from the suggestions.</span>
      {suggestions.length > 0 && (
        <span role="status" className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
          Did you mean
          {suggestions.map((g) => <button type="button" key={g.slug} onClick={() => pick(g)} className="chip border-violet-brand/40 px-2 py-0.5 text-violet-lavender hover:bg-violet-brand/10">{g.name}</button>)}
        </span>
      )}
      <datalist id={listId}>{games.map((g) => <option key={g.slug} value={g.name} />)}</datalist>
    </>
  );
}
