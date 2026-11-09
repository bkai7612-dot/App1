import "server-only";
import { cache } from "react";
import { withDb, SYSTEM } from "@/lib/db";

/**
 * ServerSentry Plus entitlement — derived ONLY from Stripe subscription state written by
 * verified webhooks. Active/trialing with an unexpired period. past_due/unpaid/canceled => no access.
 */
export const hasPlus = cache(async (userId: string): Promise<boolean> => {
  const row = await withDb(SYSTEM, (tx) =>
    tx.one(
      `SELECT 1 FROM subscriptions WHERE user_id = $1 AND status IN ('active','trialing')
       AND current_period_end IS NOT NULL AND current_period_end > now() LIMIT 1`, [userId]));
  return !!row;
});

export async function subscriptionSummary(userId: string) {
  return withDb(SYSTEM, (tx) =>
    tx.one<{ status: string; current_period_end: Date | null; cancel_at_period_end: boolean; canceled_at: Date | null }>(
      `SELECT status, current_period_end, cancel_at_period_end, canceled_at FROM subscriptions WHERE user_id = $1
       ORDER BY (status IN ('active','trialing')) DESC, updated_at DESC LIMIT 1`, [userId]));
}
