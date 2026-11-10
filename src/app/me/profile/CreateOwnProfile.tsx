"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { GateError } from "@/components/feedback/MfaGateMessage";
import { GameInput } from "@/components/forms/GameInput";

type Opt = { slug: string; name: string };
export function CreateOwnProfile({ games, platforms }: { games: Opt[]; platforms: Opt[] }) {
  const [name, setName] = useState("");
  const [game, setGame] = useState("");
  const [platform, setPlatform] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const router = useRouter();
  return (
    <form className="glass space-y-4 p-6" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { const r = await api<{ publicId: string }>("/api/identity/profiles", { body: { displayName: name, gameSlug: game, platformSlug: platform } }); router.push(`/me/linked-accounts?created=${r.publicId}`); } catch (e) { setErr(e); } }}>
      <h2 className="font-display text-lg font-semibold">Create your own player profile</h2>
      <p className="text-sm text-text-muted">Starts as Unverified. Verify it from Linked Accounts.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <input required maxLength={64} value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Your in-game username" aria-label="Username" />
        <GameInput games={games} value={game} onChange={setGame} id="own-game" />
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} required className="input" aria-label="Platform"><option value="" disabled>Choose a platform…</option>{platforms.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select>
      </div>
      <GateError error={err} />
      <button className="btn-primary" disabled={!game}>Create profile</button>
    </form>
  );
}
