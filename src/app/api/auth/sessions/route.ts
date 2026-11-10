import { z } from "zod";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { revokeAllSessions } from "@/lib/auth/session";
import { securityEvent } from "@/lib/server/audit";
import { deviceFamily } from "@/lib/server/request";
import { notFound } from "@/lib/server/errors";

export const GET = route({ auth: "auth" }, async ({ auth }) => {
  const rows = await withDb(auth!.db, (tx) =>
    tx.q<{ id: string; created_at: Date; last_seen_at: Date; user_agent: string | null; mfa_method: string | null }>(
      `SELECT id, created_at, last_seen_at, user_agent, mfa_method FROM sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
         AND (mfa_verified_at IS NOT NULL OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = sessions.user_id AND u.mfa_enabled))
       ORDER BY last_seen_at DESC`, [auth!.user.id]));
  return {
    sessions: rows.map((r) => ({ id: r.id, createdAt: r.created_at, lastSeenAt: r.last_seen_at, device: deviceFamily(r.user_agent ?? ""), mfaMethod: r.mfa_method, current: r.id === auth!.session.id })),
  };
});

const Body = z.object({ id: z.string().uuid().optional(), allOthers: z.boolean().optional() });

export const POST = route({ auth: "auth", body: Body }, async ({ auth, body, meta }) => {
  await withDb(SYSTEM, async (tx) => {
    if (body.allOthers) {
      await revokeAllSessions(tx, auth!.user.id, "user_revoked_others", auth!.session.id);
    } else if (body.id) {
      // RLS + explicit owner check: users can only revoke their own sessions.
      const r = await tx.one(`UPDATE sessions SET revoked_at = now(), revoked_reason = 'user_revoked' WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`, [body.id, auth!.user.id]);
      if (!r) throw notFound();
    }
    await securityEvent(tx, auth!.user.id, "sessions_revoked", meta, { all: !!body.allOthers });
  });
  return { ok: true };
});
