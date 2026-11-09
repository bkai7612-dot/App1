import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { NOTIFICATION_TYPES } from "@/lib/server/notify";

const prefKeys = Object.keys(NOTIFICATION_TYPES).filter((k) => k !== "security") as [string, ...string[]];
// Strict schemas: unknown keys (e.g. "role", "plus") are rejected — no mass assignment.
const Body = z.object({
  displayName: z.string().trim().min(2).max(40).regex(/^[\p{L}\p{N} _.-]+$/u).optional(),
  notificationPrefs: z.record(z.enum(prefKeys), z.boolean()).optional(),
  privacyPrefs: z.object({ showOwnerNameOnClaimedProfiles: z.boolean().optional(), emailSecurityAlerts: z.literal(true).optional() }).strict().optional(),
}).strict();

export const PATCH = route({ auth: "auth", body: Body, rate: { name: "profile-edit", limit: 30, windowSec: 3600 } }, async ({ auth, body }) => {
  await withDb(auth!.db, async (tx) => {
    if (body.displayName) await tx.q(`UPDATE users SET display_name = $2 WHERE id = $1`, [auth!.user.id, body.displayName]);
    if (body.notificationPrefs) await tx.q(`UPDATE users SET notification_prefs = notification_prefs || $2::jsonb WHERE id = $1`, [auth!.user.id, JSON.stringify(body.notificationPrefs)]);
    if (body.privacyPrefs) await tx.q(`UPDATE users SET privacy_prefs = privacy_prefs || $2::jsonb WHERE id = $1`, [auth!.user.id, JSON.stringify(body.privacyPrefs)]);
  });
  return { ok: true };
});
