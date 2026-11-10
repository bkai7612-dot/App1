"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { GateError } from "@/components/feedback/MfaGateMessage";
import { GameInput } from "@/components/forms/GameInput";

type Opt = { slug: string; name: string; identifier_label?: string };

export function NewPlayerForm({ games, platforms, initial }: { games: Opt[]; platforms: Opt[]; initial: { name: string; game: string; platform: string } }) {
  const [name, setName] = useState(initial.name);
  const [game, setGame] = useState(initial.game || "");
  const [platform, setPlatform] = useState(initial.platform || platforms[0]?.slug);
  const [pid, setPid] = useState("");
  const [existing, setExisting] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const router = useRouter();
  const submit = async (confirmDistinct = false) => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ publicId?: string; needsConfirmation?: boolean; existing?: string[] }>("/api/players", {
        body: { displayName: name, gameSlug: game, platformSlug: platform, platformUserId: pid || null, confirmDistinct },
      });
      if (r.needsConfirmation) { setExisting(r.existing ?? []); return; }
      router.push(`/players/${r.publicId}`);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const label = platforms.find((p) => p.slug === platform)?.identifier_label ?? "Username";
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(false); }} className="glass space-y-4 p-6">
      <label className="block"><span className="label">{label}</span><input required maxLength={64} value={name} onChange={(e) => setName(e.target.value)} className="input" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="label">Game</span><GameInput games={games} value={game} onChange={setGame} /></label>
        <label className="block"><span className="label">Platform</span><select value={platform} onChange={(e) => setPlatform(e.target.value)} className="input">{platforms.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select></label>
      </div>
      <label className="block"><span className="label">Platform ID (optional)</span><input maxLength={128} value={pid} onChange={(e) => setPid(e.target.value)} className="input" placeholder="e.g. SteamID64 or Riot ID tag" />
        <span className="mt-1 block text-xs text-text-muted">Only enter publicly visible identifiers. Never enter personal information such as real names, addresses or phone numbers.</span></label>
      {existing && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
          <p>Profiles with this exact username already exist for this game and platform:</p>
          <ul className="mt-2 list-inside list-disc">{existing.map((e) => <li key={e}><Link className="underline" href={`/players/${e}`}>{e}</Link></li>)}</ul>
          <p className="mt-2">Only continue if this is a <strong>different player</strong>. Usernames are not merged automatically.</p>
          <button type="button" disabled={busy} onClick={() => submit(true)} className="btn-ghost mt-3">Yes, create a separate profile</button>
        </div>
      )}
      <GateError error={err} />
      <button disabled={busy || !game} className="btn-primary w-full">{busy && <span className="spinner" />}Create profile</button>
    </form>
  );
}
