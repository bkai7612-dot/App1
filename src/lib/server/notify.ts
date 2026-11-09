import "server-only";
import type { Tx } from "@/lib/db";

export const NOTIFICATION_TYPES = {
  commendation_received: "Someone commended you",
  report_published: "A report about your account was published",
  report_disputed: "A report was disputed",
  report_update: "Updates on reports you submitted",
  appeal_reviewed: "Your appeal was reviewed",
  account_verified: "Account verification updates",
  subscription_changed: "Subscription status changes",
  security: "Security alerts (always on)",
} as const;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;

/**
 * Creates an in-app notification, honouring the user's preferences.
 * Titles/bodies must NEVER contain evidence, reporter identity or raw allegation text.
 */
export async function notify(tx: Tx, userId: string, type: NotificationType, title: string, body?: string, link?: string) {
  if (type !== "security") {
    const prefs = await tx.one<{ notification_prefs: Record<string, boolean> }>(
      `SELECT notification_prefs FROM users WHERE id = $1`, [userId]);
    if (prefs?.notification_prefs?.[type] === false) return;
  }
  await tx.q(`INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, title.slice(0, 140), body?.slice(0, 500) ?? null, link ?? null]);
}
