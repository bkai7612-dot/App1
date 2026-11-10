import Link from "next/link";
import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import { getAuth } from "@/lib/auth/session";
import { hasPlus } from "@/lib/server/entitlements";
import { WaveBackground } from "@/components/layout/WaveBackground";
import { CheckoutButton } from "@/components/premium/CheckoutButton";

export const metadata: Metadata = { title: "Pricing" };

const FREE = ["Search players and view profiles", "Upvote and downvote players", "See vote, commendation and report totals", "Give commendations", "Report misconduct (always free)", "Read comments on your own account and report inaccurate ones", "See, respond to and appeal reports about you"];
const PLUS = ["Everything in Free", "Leave written comments on players", "Read approved player comments", "Read moderated report summaries", "See feedback dates and report categories", "See dispute and resolution status", "Month-by-month reputation history"];
const NEVER = ["Access to private evidence", "Access to unmoderated reports", "Reporter identities", "Paying to remove reports or improve reputation"];

export default async function Pricing() {
  const auth = await getAuth();
  const signedIn = !!auth && !auth.pendingMfa;
  const plus = signedIn ? await hasPlus(auth!.user.id) : false;
  return (
    <div className="relative overflow-hidden">
      <WaveBackground intensity="soft" />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h1 className="text-center font-display text-4xl font-semibold tracking-tight">Simple, fair pricing</h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-text-muted">Reputation totals are free for everyone. Plus lets you read what the community has said.</p>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <section className="glass p-8" aria-labelledby="free-h">
            <h2 id="free-h" className="font-display text-xl font-semibold">Free</h2>
            <p className="mt-2 font-display text-4xl font-semibold">£0<span className="text-base font-normal text-text-muted">/month</span></p>
            <ul className="mt-6 space-y-2.5 text-sm">{FREE.map((f) => <li key={f} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-pos" />{f}</li>)}</ul>
            {!signedIn && <Link href="/register" className="btn-ghost mt-8 w-full">Create free account</Link>}
          </section>
          <section className="iris-border iris-glow glass p-8" aria-labelledby="plus-h">
            <h2 id="plus-h" className="font-display text-xl font-semibold"><span className="iris-text">ServerSentry Plus</span></h2>
            <p className="mt-2 font-display text-4xl font-semibold">£0.99<span className="text-base font-normal text-text-muted">/month</span></p>
            <ul className="mt-6 space-y-2.5 text-sm">{PLUS.map((f) => <li key={f} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-pos" />{f}</li>)}</ul>
            <div className="mt-8">
              {plus ? <Link href="/me/subscription" className="btn-ghost w-full">You&apos;re on Plus · manage</Link>
                : signedIn ? <CheckoutButton returnTo="/pricing" label="Upgrade to Plus" />
                : <Link href="/login?next=/pricing" className="btn-primary w-full">Sign in to upgrade</Link>}
            </div>
            <p className="mt-3 text-xs text-text-muted">Price includes VAT where applicable. Monthly rolling subscription; cancel any time. Billed securely by Stripe.</p>
          </section>
        </div>
        <section className="glass mx-auto mt-8 max-w-3xl p-6">
          <h2 className="font-display font-semibold">What money can never buy</h2>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{NEVER.map((f) => <li key={f} className="flex gap-2"><X className="h-4 w-4 shrink-0 text-neg" />{f}</li>)}</ul>
        </section>
      </div>
    </div>
  );
}
