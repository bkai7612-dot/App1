"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { GateError } from "@/components/feedback/MfaGateMessage";

type Opt = { slug: string; name: string };
export function CreateOwnProfile({ games, platforms }: { games: Opt[]; platforms: Opt[] }) {
  const [name, setName] = useState("");
  const [game, setGame] = useState(games[0]?.slug);
  const [platform, setPlatform] = useState(platforms[0]?.slug);
  const [err, setErr] = useState<unknown>(null);
  const router = useRouter();
  return (
    <form className="glass space-y-4 p-6" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { const r = await api<{ publicId: string }>("/api/identity/profiles", { body: { displayName: name, gameSlug: game, platformSlug: platform } }); router.push(`/me/linked-accounts?created=${r.publicId}`); } catch (e) { setErr(e); } }}>
      <h2 className="font-display text-lg font-semibold">Create your own player profile</h2>
      <p className="text-sm text-text-muted">Starts as Unverified. Verify it from Linked Accounts.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <input required maxLength={64} value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Your in-game username" aria-label="Username" />
        <select value={game} onChange={(e) => setGame(e.target.value)} className="input" aria-label="Game">{games.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}</select>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="input" aria-label="Platform">{platforms.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select>
      </div>
      <GateError error={err} />
      <button className="btn-primary">Create profile</button>
    </form>
  );
}
