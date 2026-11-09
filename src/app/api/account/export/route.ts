import { NextResponse } from "next/server";
import { route } from "@/lib/server/api";
import { withDb } from "@/lib/db";
import { audit } from "@/lib/server/audit";

/**
 * Subject access / portability export of the user's own data. Runs entirely under the user's RLS context.
 * Excludes: other people's identities (e.g. who reported you), evidence files, password/MFA secrets.
 */
export const GET = route({ auth: "mfa", rate: { name: "export", limit: 3, windowSec: 86400 } }, async ({ auth, meta }) => {
  const data = await withDb(auth!.db, async (tx) => {
    const uid = auth!.user.id;
    const out = {
      generated_at: new Date().toISOString(),
      account: await tx.one(`SELECT id, email, display_name, role, email_verified_at, mfa_enabled, notification_prefs, privacy_prefs, created_at FROM users WHERE id = $1`, [uid]),
      owned_player_profiles: await tx.q(`SELECT public_id, display_name, created_at FROM player_profiles WHERE owner_user_id = $1`, [uid]),
      gaming_account_links: await tx.q(`SELECT platform_id, username, verification_status, linked_at, last_verified_at, unlinked_at FROM gaming_accounts WHERE linked_by_user_id = $1`, [uid]),
      commendations_given: await tx.q(`SELECT player_profile_id, category, comment, status, created_at FROM commendations WHERE submitter_user_id = $1`, [uid]),
      reports_submitted: await tx.q(`SELECT public_ref, player_profile_id, category, description, incident_date, status, created_at FROM reports WHERE reporter_user_id = $1`, [uid]),
      evidence_uploaded: await tx.q(`SELECT id, report_id, stored_mime, size_bytes, created_at FROM report_evidence WHERE uploaded_by = $1`, [uid]),
      responses: await tx.q(`SELECT report_id, body, status, created_at FROM report_responses WHERE author_user_id = $1`, [uid]),
      appeals: await tx.q(`SELECT report_id, grounds, status, decision_note, created_at, decided_at FROM report_appeals WHERE appellant_user_id = $1`, [uid]),
      subscriptions: await tx.q(`SELECT status, current_period_end, cancel_at_period_end, created_at FROM subscriptions WHERE user_id = $1`, [uid]),
      payments: await tx.q(`SELECT amount_pence, currency, status, created_at FROM payments WHERE user_id = $1`, [uid]),
      notifications: await tx.q(`SELECT type, title, created_at, read_at FROM notifications WHERE user_id = $1`, [uid]),
      security_events: await tx.q(`SELECT event_type, created_at FROM security_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`, [uid]),
      privacy_requests: await tx.q(`SELECT kind, status, created_at, closed_at FROM data_subject_requests WHERE user_id = $1`, [uid]),
    };
    await audit(tx, uid, "account.data_exported", { type: "user", id: uid }, {}, meta.ipHash);
    return out;
  });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="serversentry-export.json"`, "Cache-Control": "no-store" },
  });
});
