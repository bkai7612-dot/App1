import "server-only";
import type { Tx } from "@/lib/db";

/**
 * Append-only audit log (hash-chained in the database; app role has no UPDATE/DELETE).
 * Never put passwords, codes, tokens, evidence contents or payment details in `detail`.
 */
export async function audit(
  tx: Tx,
  actorUserId: string | null,
  action: string,
  target?: { type: string; id: string },
  detail: Record<string, unknown> = {},
  ipHash?: string,
) {
  await tx.q(
    `INSERT INTO audit_logs (actor_user_id, actor_role, action, target_type, target_id, detail, ip_hash)
     VALUES ($1, 'set-by-trigger', $2, $3, $4, $5, $6)`,
    [actorUserId, action, target?.type ?? null, target?.id ?? null, JSON.stringify(detail), ipHash ?? null],
  );
}

export async function securityEvent(
  tx: Tx,
  userId: string | null,
  eventType: string,
  ctx: { ipHash?: string; userAgent?: string } = {},
  detail: Record<string, unknown> = {},
) {
  await tx.q(
    `INSERT INTO security_events (user_id, event_type, ip_hash, user_agent, detail) VALUES ($1, $2, $3, $4, $5)`,
    [userId, eventType, ctx.ipHash ?? null, ctx.userAgent?.slice(0, 300) ?? null, JSON.stringify(detail)],
  );
}

export async function moderationAction(
  tx: Tx,
  moderatorId: string,
  target: { type: string; id: string },
  action: string,
  fromStatus: string | null,
  toStatus: string | null,
  note?: string | null,
) {
  await tx.q(
    `INSERT INTO moderation_actions (moderator_id, target_type, target_id, action, from_status, to_status, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [moderatorId, target.type, target.id, action, fromStatus, toStatus, note ?? null],
  );
}
