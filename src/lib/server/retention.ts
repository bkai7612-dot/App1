import "server-only";
import { withDb, SYSTEM } from "@/lib/db";
import { deleteObject } from "@/lib/server/storage";
import { audit } from "@/lib/server/audit";

/**
 * Retention schedule (see docs/COMPLIANCE.md#retention). Idempotent; safe to run hourly/daily.
 */
export async function runRetention() {
  const out: Record<string, number> = {};
  // 1. Evidence past its delete_after date: delete object, then tombstone the row.
  const due = await withDb(SYSTEM, (tx) => tx.q<{ id: string; storage_key: string }>(
    `SELECT id, storage_key FROM report_evidence WHERE deleted_at IS NULL AND delete_after IS NOT NULL AND delete_after < now() LIMIT 500`));
  for (const e of due) {
    await deleteObject(e.storage_key).catch((err) => console.error("[retention] delete failed", e.id, err));
    await withDb(SYSTEM, (tx) => tx.q(`UPDATE report_evidence SET deleted_at = now() WHERE id = $1`, [e.id]));
  }
  out.evidence_deleted = due.length;

  await withDb(SYSTEM, async (tx) => {
    const n = async (sql: string) => (await tx.q(sql + " RETURNING 1")).length;
    out.sessions = await n(`DELETE FROM sessions WHERE expires_at < now() - interval '30 days' OR revoked_at < now() - interval '30 days'`);
    out.rate_limits = await n(`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`);
    out.email_tokens = await n(`DELETE FROM email_tokens WHERE expires_at < now() - interval '7 days'`);
    out.security_events = await n(`DELETE FROM security_events WHERE created_at < now() - interval '12 months'`);
    out.stripe_events = await n(`DELETE FROM stripe_events WHERE received_at < now() - interval '90 days'`);
    out.notifications = await n(`DELETE FROM notifications WHERE read_at < now() - interval '180 days' OR created_at < now() - interval '2 years'`);
    out.verifications_expired = await n(`UPDATE account_verifications SET status = 'expired', decided_at = now() WHERE status = 'pending' AND expires_at < now()`);
    // Account erasure after 30-day cooling-off: personal data removed; row kept as a tombstone so moderation records stay consistent.
    const users = await tx.q<{ id: string }>(`SELECT id FROM users WHERE deletion_requested_at < now() - interval '30 days' AND deleted_at IS NULL`);
    for (const u of users) {
      await tx.q(`DELETE FROM sessions WHERE user_id = $1`, [u.id]);
      await tx.q(`DELETE FROM mfa_totp WHERE user_id = $1`, [u.id]);
      await tx.q(`DELETE FROM webauthn_credentials WHERE user_id = $1`, [u.id]);
      await tx.q(`DELETE FROM recovery_codes WHERE user_id = $1`, [u.id]);
      await tx.q(`DELETE FROM notifications WHERE user_id = $1`, [u.id]);
      await tx.q(`UPDATE commendations SET comment = NULL WHERE submitter_user_id = $1`, [u.id]);
      await tx.q(`UPDATE player_profiles SET owner_user_id = NULL WHERE owner_user_id = $1`, [u.id]);
      await tx.q(`UPDATE users SET email = 'deleted-' || id || '@deleted.invalid', email_normalized = 'deleted-' || id || '@deleted.invalid', password_hash = '!deleted',
                  display_name = 'Deleted user', notification_prefs = '{}', privacy_prefs = '{}', mfa_enabled = false, deleted_at = now() WHERE id = $1`, [u.id]);
      await tx.q(`UPDATE data_subject_requests SET status = 'completed', closed_at = now(), response_note = 'Account erased by retention job' WHERE user_id = $1 AND kind = 'erasure' AND status <> 'completed'`, [u.id]);
    }
    out.accounts_erased = users.length;
    await audit(tx, null, "system.retention_run", { type: "system", id: "retention" }, out);
  });
  return out;
}
