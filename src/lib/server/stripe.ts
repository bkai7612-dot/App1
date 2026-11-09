import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/server/errors";

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = env.stripeSecretKey;
  if (!key) throw new ApiError(503, "PAYMENTS_UNCONFIGURED", "Payments are not configured yet.");
  client ??= new Stripe(key, { typescript: true, maxNetworkRetries: 2 });
  return client;
}
