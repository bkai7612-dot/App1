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
  const payments = await withDb(auth.db, (tx) => tx.q<{ amount_pence: number; currency: string; status: string; created_at: Date; invoice_number: string | null; invoice_url: string | null }>(
    `SELECT amount_pence, currency, status, created_at, invoice_number, invoice_url FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 24`, [auth.user.id]));
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader title="Subscription" />
      <MeNav active="/me/subscription" />
      {sp.checkout === "success" && <div className="mb-6"><CheckoutReturn returnTo={safeNext(sp.returnTo, "/me/subscription")} alreadyActive={plus} /></div>}
      <section className={`glass p-6 ${plus ? "iris-border iris-glow" : ""}`}>
        <p className="label">Current plan</p>
        <h2 className="font-display text-2xl font-semibold">{plus ? <span className="iris-text">ServerSentry Plus</span> : "Free"}</h2>
        {sub && (() => {
          // L-06: price, next charge and how payment works, in plain terms.
          const price = `${(sub.currency ?? "gbp").toLowerCase() === "gbp" ? "£" : ""}${((sub.amount_pence ?? 99) / 100).toFixed(2)}${(sub.currency ?? "gbp").toLowerCase() === "gbp" ? "" : ` ${sub.currency?.toUpperCase()}`}`;
          const end = sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("en-GB", { dateStyle: "long" }) : null;
          return (
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="label">Status</dt><dd className="text-text">{sub.status.replace("_", " ")}</dd></div>
              <div><dt className="label">Price</dt><dd>{price} per {sub.billing_interval ?? "month"}, including VAT where applicable</dd></div>
              <div><dt className="label">{sub.cancel_at_period_end || sub.status === "canceled" ? "Plus ends" : "Next charge"}</dt><dd>{end ? (sub.cancel_at_period_end || sub.status === "canceled" ? end : `${price} on ${end}`) : "—"}</dd></div>
              <div><dt className="label">Payment method</dt><dd>Held securely by Stripe. View or change it with <em>Manage billing</em>.</dd></div>
              <div><dt className="label">Member since</dt><dd>{new Date(sub.created_at).toLocaleDateString("en-GB", { dateStyle: "long" })}</dd></div>
            </dl>
          );
        })()}
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
            <li key={i} className="flex flex-wrap justify-between gap-2 py-2"><span>{new Date(p.created_at).toLocaleDateString("en-GB", { dateStyle: "medium" })}{p.invoice_number && <span className="ml-2 text-text-muted">Invoice {p.invoice_number}</span>}</span><span>£{(p.amount_pence / 100).toFixed(2)} · {p.status.replace("_", " ")}{p.invoice_url && <> · <a href={p.invoice_url} target="_blank" rel="noopener noreferrer" className="underline">View invoice</a></>}</span></li>
          ))}</ul>
        </section>
      )}
    </div>
  );
}
