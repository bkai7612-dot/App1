import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { revokeAllSessions } from "@/lib/auth/session";
import { securityEvent, audit } from "@/lib/server/audit";
import { securityNotice } from "@/lib/auth/flows";

/** "I think my account is compromised": revoke every other session immediately and alert administrators. */
export const POST = route({ auth: "auth", rate: { name: "compromise", limit: 5, windowSec: 3600 } }, async ({ auth, meta }) => {
  await withDb(SYSTEM, async (tx) => {
    await revokeAllSessions(tx, auth!.user.id, "user_reported_compromise", auth!.session.id);
    await securityEvent(tx, auth!.user.id, "compromise_reported", meta);
    await audit(tx, auth!.user.id, "security.compromise_reported", { type: "user", id: auth!.user.id }, {}, meta.ipHash);
    await securityNotice(tx, auth!.user.id, auth!.user.email, "You reported a possible compromise. All other sessions were signed out. Change your password and review your two-factor methods");
    const admins = await tx.q<{ id: string }>(`SELECT id FROM users WHERE role IN ('admin','super_admin') AND deleted_at IS NULL`);
    for (const a of admins) await tx.q(`INSERT INTO notifications (user_id, type, title, link) VALUES ($1, 'security', 'User reported a possible account compromise', '/admin/users/' || $2)`, [a.id, auth!.user.id]);
  });
  return { ok: true };
});
