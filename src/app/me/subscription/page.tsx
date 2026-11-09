import Link from "next/link";
import type { Metadata } from "next";
import { requirePageAuth } from "@/lib/server/page-auth";
import { hasPlus, subscriptionSummary } from "@/lib/server/entitlements";
import { withDb } from "@/lib/db";
import { safeNext } from "@/lib/safe-next";
import { PageHeader, Notice } from "@/components/ui/Card";
import { MeNav } from "@/components/account/MeNav";
import { CheckoutButton } from "@/components/premium/CheckoutButton";
import { PortalButton, CheckoutReturn } from "./SubscriptionClient";

export const metadata: Metadata = { title: "Subscription" };

export default async function Subscription({ searchParams }: { searchParams: Promise<{ checkout?: string; returnTo?: string }> }) {
  const auth = await requirePageAuth("/me/subscription");
  const sp = await searchParams;
  const [plus, sub] = await Promise.all([hasPlus(auth.user.id), subscriptionSummary(auth.user.id)]);
  const payments = await withDb(auth.db, (tx) => tx.q<{ amount_pence: number; currency: string; status: string; created_at: Date }>(
    `SELECT amount_pence, currency, status, created_at FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 24`, [auth.user.id]));
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader title="Subscription" />
      <MeNav active="/me/subscription" />
      {sp.checkout === "success" && <div className="mb-6"><CheckoutReturn returnTo={safeNext(sp.returnTo, "/me/subscription")} alreadyActive={plus} /></div>}
      <section className={`glass p-6 ${plus ? "iris-border iris-glow" : ""}`}>
        <p className="label">Current plan</p>
        <h2 className="font-display text-2xl font-semibold">{plus ? <span className="iris-text">ServerSentry Plus</span> : "Free"}</h2>
        {sub && <p className="mt-2 text-sm text-text-muted">Status: <strong className="text-text">{sub.status.replace("_", " ")}</strong>
          {sub.current_period_end && <> · {sub.cancel_at_period_end ? "ends" : "renews"} {new Date(sub.current_period_end).toLocaleDateString("en-GB")}</>}</p>}
        {sub?.status === "past_due" && <div className="mt-4"><Notice tone="danger">Your last payment failed, so Plus features are paused. Update your payment method to restore access.</Notice></div>}
        <div className="mt-5 flex flex-wrap gap-3">
          {!plus && <CheckoutButton returnTo="/me/subscription" label="Upgrade to Plus · £0.99/month" />}
          {sub && <PortalButton />}
          <Link href="/pricing" className="btn-ghost">Compare plans</Link>
        </div>
        <p className="mt-4 text-xs text-text-muted">Cancel any time in the billing portal; Plus continues until the end of the paid period. Payments are processed by Stripe. ServerSentry never sees or stores your card number. You have a 14-day right to cancel under UK consumer law; see the Terms of Use.</p>
      </section>
      {payments.length > 0 && (
        <section className="glass mt-6 p-6">
          <h2 className="font-display text-lg font-semibold">Payment history</h2>
          <ul className="mt-3 divide-y divide-ink-line text-sm">{payments.map((p, i) => (
            <li key={i} className="flex justify-between py-2"><span>{new Date(p.created_at).toLocaleDateString("en-GB")}</span><span>£{(p.amount_pence / 100).toFixed(2)} · {p.status.replace("_", " ")}</span></li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}
