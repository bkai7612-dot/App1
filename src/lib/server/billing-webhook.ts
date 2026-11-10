import "server-only";
import type Stripe from "stripe";
import { withDb, SYSTEM, type Tx } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { notify } from "@/lib/server/notify";

type Sub = Stripe.Subscription & { current_period_end?: number };

function periodEnd(sub: Sub): Date | null {
  // Newer Stripe API versions expose the period on subscription items.
  const ts = sub.current_period_end ?? (sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
  return ts ? new Date(ts * 1000) : null;
}

async function userByCustomer(tx: Tx, customerId: string | null | undefined): Promise<string | null> {
  if (!customerId) return null;
  // Trust only the customer->user mapping we created server-side, never client-supplied metadata.
  const u = await tx.one<{ id: string }>(`SELECT id FROM users WHERE stripe_customer_id = $1`, [customerId]);
  return u?.id ?? null;
}

const custId = (c: string | { id: string } | null | undefined) => (typeof c === "string" ? c : c?.id ?? null);

async function upsertSubscription(tx: Tx, sub: Sub, eventCreated: number) {
  const customerId = custId(sub.customer as string | { id: string });
  const userId = await userByCustomer(tx, customerId);
  if (!userId) return;
  const at = new Date(eventCreated * 1000);
  const prev = await tx.one<{ status: string; last_event_at: Date }>(`SELECT status, last_event_at FROM subscriptions WHERE stripe_subscription_id = $1 FOR UPDATE`, [sub.id]);
  if (prev && prev.last_event_at > at) return; // out-of-order event: ignore older state
  // Same-second events: Stripe timestamps have 1s resolution. A terminal state is never overwritten by a same-second non-terminal one.
  if (prev && prev.last_event_at.getTime() === at.getTime() && ["canceled", "incomplete_expired"].includes(prev.status) && !["canceled", "incomplete_expired"].includes(sub.status)) return;
  await tx.q(
    `INSERT INTO subscriptions (user_id, stripe_subscription_id, stripe_customer_id, status, price_id, current_period_end, cancel_at_period_end, canceled_at, last_event_at, amount_pence, currency, billing_interval)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (stripe_subscription_id) DO UPDATE SET status = EXCLUDED.status, price_id = EXCLUDED.price_id,
       current_period_end = EXCLUDED.current_period_end, cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       canceled_at = EXCLUDED.canceled_at, last_event_at = EXCLUDED.last_event_at,
       amount_pence = coalesce(EXCLUDED.amount_pence, subscriptions.amount_pence), currency = coalesce(EXCLUDED.currency, subscriptions.currency),
       billing_interval = coalesce(EXCLUDED.billing_interval, subscriptions.billing_interval)`,
    [userId, sub.id, customerId, sub.status, sub.items?.data?.[0]?.price?.id ?? null, periodEnd(sub), !!sub.cancel_at_period_end,
     sub.canceled_at ? new Date(sub.canceled_at * 1000) : null, at,
     sub.items?.data?.[0]?.price?.unit_amount ?? null, sub.items?.data?.[0]?.price?.currency ?? null, sub.items?.data?.[0]?.price?.recurring?.interval ?? null]);
  if (!prev || prev.status !== sub.status) {
    await audit(tx, null, "billing.subscription_status", { type: "user", id: userId }, { from: prev?.status ?? null, to: sub.status, subscription: sub.id });
    const label: Record<string, string> = { active: "ServerSentry Plus is active", past_due: "Payment failed — Plus paused until payment succeeds", canceled: "Your Plus subscription has ended", unpaid: "Plus paused due to unpaid invoice", trialing: "Your Plus trial started" };
    if (label[sub.status]) await notify(tx, userId, "subscription_changed", label[sub.status], undefined, "/me/subscription");
  }
}

/** Idempotent processing of a VERIFIED Stripe event. Returns false if already processed. */
export async function processStripeEvent(event: Stripe.Event): Promise<boolean> {
  return withDb(SYSTEM, async (tx) => {
    const ins = await tx.one(`INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id`, [event.id, event.type]);
    if (!ins) return false; // replay / duplicate delivery
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await upsertSubscription(tx, event.data.object as Sub, event.created);
        break;
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = await userByCustomer(tx, custId(s.customer as string));
        if (userId && s.client_reference_id === userId) await audit(tx, null, "billing.checkout_completed", { type: "user", id: userId }, { session: s.id });
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const userId = await userByCustomer(tx, custId(inv.customer as string));
        if (!userId) break;
        const status = event.type === "invoice.paid" ? "paid" : "failed";
        const url = typeof inv.hosted_invoice_url === "string" && /^https:\/\/(invoice|pay)\.stripe\.com\/[A-Za-z0-9/_?=&%.-]+$/.test(inv.hosted_invoice_url) ? inv.hosted_invoice_url : null;
        await tx.q(`INSERT INTO payments (user_id, stripe_invoice_id, amount_pence, currency, status, invoice_number, invoice_url, period_end) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (stripe_invoice_id) DO UPDATE SET status = CASE WHEN payments.status IN ('refunded','partially_refunded') THEN payments.status ELSE EXCLUDED.status END,
                      invoice_number = coalesce(EXCLUDED.invoice_number, payments.invoice_number), invoice_url = coalesce(EXCLUDED.invoice_url, payments.invoice_url)`,
          [userId, inv.id, status === "paid" ? inv.amount_paid : inv.amount_due, inv.currency, status, (inv.number ?? "").slice(0, 64) || null, url, inv.period_end ? new Date(inv.period_end * 1000) : null]);
        if (status === "failed") await notify(tx, userId, "subscription_changed", "Your Plus payment failed", "Update your payment method to keep Plus.", "/me/subscription");
        break;
      }
      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge & { invoice?: string | { id: string } | null };
        const userId = await userByCustomer(tx, custId(ch.customer as string));
        if (!userId) break;
        const invId = custId(ch.invoice ?? null);
        const full = ch.amount_refunded >= ch.amount;
        if (invId) await tx.q(`UPDATE payments SET status = $2, stripe_charge_id = $3 WHERE stripe_invoice_id = $1`, [invId, full ? "refunded" : "partially_refunded", ch.id]);
        await audit(tx, null, "billing.refund", { type: "user", id: userId }, { charge: ch.id, full });
        break;
      }
      default:
        break;
    }
    await tx.q(`UPDATE stripe_events SET processed_at = now() WHERE id = $1`, [event.id]);
    return true;
  });
}
