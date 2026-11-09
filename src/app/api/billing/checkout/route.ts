import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { stripe } from "@/lib/server/stripe";
import { env } from "@/lib/env";
import { hasPlus } from "@/lib/server/entitlements";
import { safeNext } from "@/lib/safe-next";
import { audit } from "@/lib/server/audit";
import { ApiError, badRequest } from "@/lib/server/errors";
import { featureEnabled } from "@/lib/launch-gates";

const Body = z.object({ returnTo: z.string().max(300).optional() }).strict();

/** Starts Stripe-hosted Checkout for ServerSentry Plus (£0.99/month). Card data never touches our servers. */
export const POST = route({ auth: "auth", body: Body, rate: { name: "checkout", limit: 10, windowSec: 3600 } }, async ({ auth, body, meta }) => {
  if (!featureEnabled("payments")) throw new ApiError(503, "LAUNCH_GATE", "Subscriptions are not available yet.");
  if (!env.stripePricePlusMonthly) throw new ApiError(503, "PAYMENTS_UNCONFIGURED", "Payments are not configured yet.");
  if (await hasPlus(auth!.user.id)) throw badRequest("You already have ServerSentry Plus.");
  if (!auth!.user.emailVerified) throw new ApiError(403, "EMAIL_UNVERIFIED", "Verify your email before subscribing.");
  const s = stripe();
  const returnTo = safeNext(body.returnTo, "/me/subscription");
  const customerId = await withDb(SYSTEM, async (tx) => {
    const u = await tx.one<{ stripe_customer_id: string | null }>(`SELECT stripe_customer_id FROM users WHERE id = $1 FOR UPDATE`, [auth!.user.id]);
    if (u?.stripe_customer_id) return u.stripe_customer_id;
    const c = await s.customers.create({ email: auth!.user.email, metadata: { serversentry_user_id: auth!.user.id } }, { idempotencyKey: `cust-${auth!.user.id}` });
    await tx.q(`UPDATE users SET stripe_customer_id = $2 WHERE id = $1`, [auth!.user.id, c.id]);
    return c.id;
  });
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: auth!.user.id,
    line_items: [{ price: env.stripePricePlusMonthly, quantity: 1 }],
    subscription_data: { metadata: { serversentry_user_id: auth!.user.id } },
    metadata: { serversentry_user_id: auth!.user.id },
    success_url: `${env.appUrl}/me/subscription?checkout=success&returnTo=${encodeURIComponent(returnTo)}`,
    cancel_url: `${env.appUrl}${returnTo}`,
    allow_promotion_codes: false,
  });
  await withDb(SYSTEM, (tx) => audit(tx, auth!.user.id, "billing.checkout_started", { type: "user", id: auth!.user.id }, { session: session.id }, meta.ipHash));
  return { url: session.url };
});
