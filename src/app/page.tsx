import Link from "next/link";
import { Search, Eye, MessageSquareText, ThumbsUp, ShieldAlert, ArrowRight, Gamepad2, MonitorSmartphone, ShieldCheck, Scale } from "lucide-react";
import { WaveBackground } from "@/components/layout/WaveBackground";
import { PlayerSearchForm } from "@/components/forms/PlayerSearchForm";
import { PlatformStatusChip } from "@/components/ui/Badges";
import { getGames, getPlatforms } from "@/lib/server/catalog";
import { landingStats } from "@/lib/server/players";
import { verificationOptions } from "@/lib/server/verification-options";

export const dynamic = "force-dynamic";

const STEPS = [
  { Icon: Search, title: "Search for a player", text: "Look up a username by game and platform. Identical usernames stay separate profiles." },
  { Icon: Eye, title: "Discover their reputation", text: "See positive commendations and moderated reports side by side, never blended into one score." },
  { Icon: MessageSquareText, title: "Read feedback", text: "Plus members can read approved comments and moderator-written report summaries." },
  { Icon: ThumbsUp, title: "Recognise good teammates", text: "Give a commendation in seconds for communication, leadership or fair play." },
  { Icon: ShieldAlert, title: "Report responsibly", text: "Reports are private until a moderator reviews them. Players can respond and appeal." },
];

export default async function Home() {
  const [games, platforms, stats] = await Promise.all([getGames(), getPlatforms(), landingStats()]);
  const realProfiles = Number(stats?.real_profiles ?? 0);
  const isExample = realProfiles < 50; // show example figures until genuine records exist
  const statCards = isExample
    ? [
        { label: "Player profiles", value: "12,480", tone: "text-text" },
        { label: "Positive commendations", value: "38,210", tone: "text-pos" },
        { label: "Published reports", value: "2,904", tone: "text-neg" },
        { label: "Verified accounts", value: "5,117", tone: "text-violet-lavender" },
      ]
    : [
        { label: "Player profiles", value: Number(stats!.profiles).toLocaleString("en-GB"), tone: "text-text" },
        { label: "Positive commendations", value: Number(stats!.commendations).toLocaleString("en-GB"), tone: "text-pos" },
        { label: "Published reports", value: Number(stats!.published).toLocaleString("en-GB"), tone: "text-neg" },
        { label: "Verified accounts", value: Number(stats!.verified).toLocaleString("en-GB"), tone: "text-violet-lavender" },
      ];

  return (
    <>
      <section className="relative overflow-hidden">
        <WaveBackground />
        <div className="grid-fade absolute inset-0" aria-hidden="true" />
        <div className="relative z-10 mx-auto max-w-5xl px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28">
          <p className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-violet-brand/30 bg-violet-brand/10 px-3 py-1 text-xs text-violet-lavender">
            <ShieldCheck className="h-3.5 w-3.5" /> Community-powered · Human-moderated
          </p>
          <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
            Know Who You&apos;re <span className="iris-text">Playing With.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-text-muted sm:text-lg">
            ServerSentry is the community-powered gaming reputation network. Discover player reputations, recognise great teammates and help build better gaming communities.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/search" className="btn-primary px-6 py-3 text-base"><Search className="h-4 w-4" /> Search Players</Link>
            <Link href="/register" className="btn-ghost px-6 py-3 text-base">Create Free Account</Link>
          </div>
          <div className="mx-auto mt-12 max-w-4xl text-left">
            <PlayerSearchForm games={games} platforms={platforms} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6" aria-labelledby="how">
        <h2 id="how" className="font-display text-2xl font-semibold sm:text-3xl">How ServerSentry works</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="glass p-5 transition hover:-translate-y-0.5">
              <div className="mb-4 flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-brand/15 text-violet-lavender"><s.Icon className="h-5 w-5" /></span>
                <span className="font-display text-sm text-text-muted">0{i + 1}</span>
              </div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6" aria-labelledby="stats">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="stats" className="font-display text-2xl font-semibold sm:text-3xl">Reputation at a glance</h2>
          {isExample && (
            <span className="chip border-amber-400/50 bg-amber-400/10 text-amber-300">Example figures for illustration. Not real platform statistics.</span>
          )}
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((c) => (
            <div key={c.label} className="glass p-6">
              <p className="text-xs uppercase tracking-wider text-text-muted">{c.label}</p>
              <p className={`mt-2 font-display text-3xl font-semibold ${c.tone}`}>{c.value}{isExample && <span className="ml-1 align-super text-xs text-amber-300">*</span>}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-text-muted"><Scale className="h-3.5 w-3.5" /> We never compute a single &ldquo;reputation score&rdquo;. Positive and negative feedback are always shown separately.</p>
      </section>

      <section className="mx-auto mt-20 grid max-w-7xl items-start gap-6 px-4 sm:px-6 lg:grid-cols-2">
        <div className="glass p-6">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold"><Gamepad2 className="h-5 w-5 text-violet-lavender" /> Supported games</h2>
          <p className="mt-2 text-sm text-text-muted">{games.length} games and counting. Here are some of them; search to find the rest.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {games.slice(0, 18).map((g) => <li key={g.slug}><Link href={`/search?game=${g.slug}`} className="chip border-ink-line bg-white/[0.03] px-3 py-1.5 text-sm text-text hover:border-violet-brand/60">{g.name}</Link></li>)}
          </ul>
        </div>
        <div className="glass p-6">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold"><MonitorSmartphone className="h-5 w-5 text-violet-lavender" /> Supported platforms</h2>
          <ul className="mt-5 divide-y divide-ink-line">
            {platforms.map((p) => (
              <li key={p.slug} className="flex items-center justify-between py-2.5 text-sm">
                <span>{p.name}</span>
                <PlatformStatusChip status={verificationOptions(p.slug, p.discord_connection_type).some((o) => o.automatic) ? "verified_linking" : "manual"} />
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-text-muted">&ldquo;Instant verification&rdquo; means players prove ownership with an official sign-in (Steam, Battle.net) or their Discord-verified connections, on their computer or by scanning a QR code with their phone. Other platforms use a quick profile-code check. You only need verification to claim a profile.</p>
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-7xl px-4 sm:px-6">
        <div className="iris-border iris-glow glass relative overflow-hidden p-8 sm:p-12">
          <WaveBackground intensity="soft" />
          <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="font-display text-2xl font-semibold sm:text-3xl">Read what players are saying</h2>
              <p className="mt-2 max-w-xl text-text-muted">ServerSentry Plus unlocks approved commendation comments, moderated report summaries and reputation history for <strong className="text-text">£0.99/month</strong>.</p>
            </div>
            <Link href="/pricing" className="btn-primary px-6 py-3">See Plus <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
