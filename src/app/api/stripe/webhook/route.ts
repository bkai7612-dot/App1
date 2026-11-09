import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { processStripeEvent } from "@/lib/server/billing-webhook";

/**
 * Stripe webhook. The raw body's signature is verified with STRIPE_WEBHOOK_SECRET (includes a timestamp
 * tolerance => replay protection). Events are deduplicated by id. No CSRF header: authenticity comes from the signature.
 */
export async function POST(req: NextRequest) {
  const secret = env.stripeWebhookSecret;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const raw = await req.text();
  if (raw.length > 512 * 1024) return NextResponse.json({ error: "too large" }, { status: 413 });
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(raw, sig, secret, 300);
  } catch {
    console.warn("[stripe] invalid webhook signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  try {
    const processed = await processStripeEvent(event);
    return NextResponse.json({ received: true, duplicate: !processed });
  } catch (e) {
    console.error("[stripe] processing failed", event.id, e);
    return NextResponse.json({ error: "processing failed" }, { status: 500 }); // Stripe retries
  }
}
