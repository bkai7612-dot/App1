import { NextResponse } from "next/server";
import { route } from "@/lib/server/api";
import { withDb, SYSTEM } from "@/lib/db";
import { audit } from "@/lib/server/audit";

/**
 * Subject access / portability export of the user's own data (UK GDPR Art. 15 and 20).
 * L-02: complete and readable: player, game and platform names instead of internal IDs; sessions, sign-in methods,
 * verifications, complaints, and reports ABOUT the user's own profiles.
 * Excluded (documented in the export itself): other people's identities (e.g. who reported you), the private wording of
 * reports about you and others' evidence (third-party data; release is decided case by case on request), evidence files,
 * password hashes and MFA secrets.
 */
const P = `(SELECT p.display_name || ' (' || pl.name || coalesce(', ' || g.name, '') || ')' FROM player_profiles p JOIN platforms pl ON pl.id = p.platform_id LEFT JOIN games g ON g.id = p.game_id WHERE p.id = x.player_profile_id) AS player`;

export const GET = route({ auth: "mfa", rate: { name: "export", limit: 3, windowSec: 86400 } }, async ({ auth, meta }) => {
  const uid = auth!.user.id;
  const sys = await withDb(SYSTEM, async (tx) => ({
    authenticator_app: await tx.one(`SELECT confirmed_at AS added_at FROM mfa_totp WHERE user_id = $1 AND confirmed_at IS NOT NULL`, [uid]),
    recovery_codes: await tx.one(`SELECT count(*) FILTER (WHERE used_at IS NULL)::int AS unused, count(*) FILTER (WHERE used_at IS NOT NULL)::int AS used FROM recovery_codes WHERE user_id = $1`, [uid]),
    reports_about_my_profiles: await tx.q(
      `SELECT x.public_ref AS reference, ${P}, x.category, x.status, x.incident_date, x.created_at AS submitted_at, x.published_at, x.public_summary, x.outcome_type, x.outcome_note, x.closed_at
       FROM reports x JOIN player_profiles o ON o.id = x.player_profile_id WHERE o.owner_user_id = $1 AND x.deleted_at IS NULL ORDER BY x.created_at`, [uid]),
  }));
  const data = await withDb(auth!.db, async (tx) => {
    const out = {
      generated_at: new Date().toISOString(),
      about_this_export: "Your ServerSentry data. Names are shown instead of internal IDs where possible. Not included: who reported you, the private wording of reports about you, other people's evidence, password hashes and security secrets. To ask for any of these, use Account Settings > Privacy & data.",
      account: await tx.one(`SELECT email, display_name, role, email_verified_at, mfa_enabled, notification_prefs, privacy_prefs, created_at, suspended_at, suspended_until, suspension_reason, reporting_restricted_until FROM users WHERE id = $1`, [uid]),
      sign_in_methods: {
        passkeys: await tx.q(`SELECT nickname, device_type, backed_up, created_at FROM webauthn_credentials WHERE user_id = $1`, [uid]),
        authenticator_app: sys.authenticator_app ?? null,
        recovery_codes: sys.recovery_codes,
      },
      sessions: await tx.q(`SELECT created_at, last_seen_at, expires_at, mfa_method, user_agent, revoked_at, revoked_reason FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`, [uid]),
      owned_player_profiles: await tx.q(`SELECT x.public_id, ${P.replace("x.player_profile_id", "x.id")}, x.created_at FROM player_profiles x WHERE x.owner_user_id = $1`, [uid]),
      gaming_account_links: await tx.q(`SELECT ${P}, (SELECT name FROM platforms WHERE id = x.platform_id) AS platform, x.username, x.verification_status, x.linked_at, x.last_verified_at, x.unlinked_at FROM gaming_accounts x WHERE x.linked_by_user_id = $1`, [uid]),
      verifications: await tx.q(`SELECT ${P}, x.kind, x.method, x.status, x.profile_url, x.created_at, x.decided_at FROM account_verifications x WHERE x.user_id = $1 ORDER BY x.created_at`, [uid]),
      commendations_given: await tx.q(`SELECT ${P}, x.category, x.comment, x.status, x.created_at FROM commendations x WHERE x.submitter_user_id = $1`, [uid]),
      votes_cast: await tx.q(`SELECT ${P}, x.value, x.created_at, x.updated_at FROM player_votes x WHERE x.voter_user_id = $1`, [uid]),
      comments_written: await tx.q(`SELECT ${P}, x.tone, x.body, x.status, x.moderation_note, x.created_at FROM player_comments x WHERE x.author_user_id = $1`, [uid]),
      comments_you_reported_as_inaccurate: await tx.q(`SELECT x.reason, x.status, x.decision_note, x.created_at FROM comment_disputes x WHERE x.owner_user_id = $1`, [uid]),
      reports_submitted: await tx.q(`SELECT x.public_ref AS reference, ${P}, x.category, x.description, x.incident_date, x.status, x.outcome_note, x.created_at FROM reports x WHERE x.reporter_user_id = $1`, [uid]),
      evidence_uploaded: await tx.q(`SELECT r.public_ref AS report, e.stored_mime AS type, e.size_bytes, e.created_at FROM report_evidence e JOIN reports r ON r.id = e.report_id WHERE e.uploaded_by = $1`, [uid]),
      reports_about_my_profiles: sys.reports_about_my_profiles,
      responses: await tx.q(`SELECT r.public_ref AS report, x.body, x.status, x.created_at FROM report_responses x JOIN reports r ON r.id = x.report_id WHERE x.author_user_id = $1`, [uid]),
      appeals: await tx.q(`SELECT r.public_ref AS report, x.grounds, x.status, x.decision_note, x.info_request_note, x.info_reply, x.created_at, x.decided_at FROM report_appeals x JOIN reports r ON r.id = x.report_id WHERE x.appellant_user_id = $1`, [uid]),
      complaints: await tx.q(`SELECT public_ref AS reference, category, target_ref, body, status, response_note, created_at, closed_at FROM complaints WHERE user_id = $1`, [uid]),
      subscriptions: await tx.q(`SELECT status, current_period_end, cancel_at_period_end, created_at FROM subscriptions WHERE user_id = $1`, [uid]),
      payments: await tx.q(`SELECT amount_pence, currency, status, created_at FROM payments WHERE user_id = $1`, [uid]),
      notifications: await tx.q(`SELECT type, title, body, created_at, read_at FROM notifications WHERE user_id = $1`, [uid]),
      security_events: await tx.q(`SELECT event_type, created_at, user_agent FROM security_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000`, [uid]),
      privacy_requests: await tx.q(`SELECT kind, target_type, target_ref, details, status, response_note, created_at, closed_at FROM data_subject_requests WHERE user_id = $1`, [uid]),
    };
    await audit(tx, uid, "account.data_exported", { type: "user", id: uid }, {}, meta.ipHash);
    return out;
  });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="serversentry-export-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
});
