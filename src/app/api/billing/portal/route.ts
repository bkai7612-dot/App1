import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { stripe } from "@/lib/server/stripe";
import { env } from "@/lib/env";
import { badRequest } from "@/lib/server/errors";

/** Stripe-hosted billing portal: cancel, update card, view invoices. Only for the signed-in user's own customer record. */
export const POST = route({ auth: "auth", rate: { name: "portal", limit: 10, windowSec: 3600 } }, async ({ auth }) => {
  const u = await withDb(SYSTEM, (tx) => tx.one<{ stripe_customer_id: string | null }>(`SELECT stripe_customer_id FROM users WHERE id = $1`, [auth!.user.id]));
  if (!u?.stripe_customer_id) throw badRequest("No billing account found.");
  const session = await stripe().billingPortal.sessions.create({ customer: u.stripe_customer_id, return_url: `${env.appUrl}/me/subscription` });
  return { url: session.url };
});
