"use client";
import { useId, useState } from "react";

type Game = { slug: string; name: string };

/** Type-to-search game picker (native datalist: keyboard and screen-reader friendly). Emits the game's slug, or "" if no match. */
export function GameInput({ games, value, onChange, allowAll = false, className = "input", id }: {
  games: Game[]; value: string; onChange: (slug: string) => void; allowAll?: boolean; className?: string; id?: string;
}) {
  const listId = useId();
  const [text, setText] = useState(games.find((g) => g.slug === value)?.name ?? "");
  const match = (t: string) => games.find((g) => g.name.toLowerCase() === t.trim().toLowerCase());
  return (
    <>
      <input id={id} className={className} list={listId} value={text} autoComplete="off" maxLength={80}
        placeholder={allowAll ? `All games (${games.length})` : `Search ${games.length} games`}
        onChange={(e) => { setText(e.target.value); onChange(match(e.target.value)?.slug ?? ""); }}
        onBlur={() => { const m = match(text); if (!m && !allowAll && text) setText(""); }}
        aria-describedby={`${listId}-hint`} />
      <span id={`${listId}-hint`} className="sr-only">Start typing a game name and choose from the suggestions.</span>
      <datalist id={listId}>{games.map((g) => <option key={g.slug} value={g.name} />)}</datalist>
    </>
  );
}
