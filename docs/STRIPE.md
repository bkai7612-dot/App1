# Stripe configuration (ServerSentry Plus, £0.99/month)

1. In the Stripe Dashboard (start in **test mode**), create the product **ServerSentry Plus** with a **recurring price of £0.99 GBP, monthly**. Copy the price ID into `STRIPE_PRICE_ID_PLUS_MONTHLY`.
2. Create a **restricted API key** if possible, or use the secret key, as `STRIPE_SECRET_KEY` (server only). The minimum permissions needed are Customers (write), Checkout Sessions (write), Billing Portal Sessions (write), and Subscriptions and Invoices (read).
3. Configure the **Customer Portal** (Settings → Billing → Customer portal): allow cancelling subscriptions (at the end of the period), updating payment methods and viewing invoices.
4. Add a **webhook endpoint** at `https://<domain>/api/stripe/webhook` for these events:
   - `checkout.session.completed`
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`
   - `invoice.paid`, `invoice.payment_failed`
   - `charge.refunded`

   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Configure **tax**: decide whether you're VAT-registered. Stripe Tax can calculate UK VAT; the price shown to consumers must include VAT. **Accountant review required.**
6. Turn on Smart Retries and failed-payment emails in Billing settings.

## How entitlement works

- Checkout is Stripe-hosted. ServerSentry never handles card numbers or CVV codes.
- The Stripe customer is created server-side and stored on the user (`stripe_customer_id`). Webhooks map events to users **only** through that ID, never through client-supplied metadata.
- Each event is signature-verified (5-minute tolerance), stored in `stripe_events` (replays are ignored), and applied only if it's newer than the last processed state (out-of-order safe).
- Plus is granted only while `status ∈ {active, trialing}` **and** `current_period_end > now()`. `past_due`, `unpaid` and `canceled` remove access immediately. Cancelling at period end keeps access until the period ends.
- After Checkout, the success page polls until the **webhook** has recorded the subscription; the redirect alone never grants access. It then returns the user to the profile they came from (`returnTo`, validated as a relative path).

## Local testing

The test suite signs synthetic events with `STRIPE_WEBHOOK_SECRET`. With network access you can also use the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

**Status: not tested against live Stripe.** The sandbox used during development couldn't reach `api.stripe.com`, so Checkout and Portal session creation still need to be verified in Stripe test mode.
