/** P-07: plain-English names for security events shown to account holders. */
export const SECURITY_EVENT_LABELS: Record<string, string> = {
  account_created: "Account created", account_deletion_requested: "Account deletion requested", account_recovery_approved: "Account recovery approved",
  account_recovery_requested: "Account recovery requested", battlenet_verified: "Battle.net account verified", compromise_reported: "You reported a suspected compromise",
  discord_account_already_verified_elsewhere: "Discord account already used by another member", discord_verified: "Discord connection verified",
  email_change_requested: "Email change requested", email_changed: "Email address changed", email_verified: "Email address confirmed",
  evidence_access_denied: "Blocked attempt to open private evidence", gaming_account_linked: "Gaming account linked", gaming_account_unlinked: "Gaming account removed",
  link_attempt_unowned_profile: "Blocked attempt to link a profile you don't own", login_failure: "Failed sign-in (wrong password)", login_success: "Signed in",
  login_suspended: "Sign-in blocked (account suspended)", login_while_locked: "Sign-in attempt while temporarily locked", mfa_enrol_failure: "Authenticator setup code rejected",
  mfa_failure: "Wrong two-step code", mfa_success: "Two-step check passed", mfa_totp_enrolled: "Authenticator app added", mfa_totp_removed: "Authenticator app removed",
  new_device_login: "Sign-in from a new device or network", passkey_added: "Passkey added", passkey_removed: "Passkey removed", password_changed: "Password changed",
  password_ok_mfa_pending: "Password accepted, waiting for two-step check", password_reset_completed: "Password reset", password_reset_mfa_failure: "Password reset blocked (wrong two-step code)",
  password_reset_requested: "Password reset requested", reauth_failure: "Identity re-check failed", reauth_success: "Identity re-checked",
  recovery_codes_regenerated: "New recovery codes created", recovery_code_used: "Signed in with a recovery code", register_existing_email: "Someone tried to register with your email",
  sessions_revoked: "Signed out of other sessions", steam_already_linked_elsewhere: "Steam account already used by another member", steam_verification_failed: "Steam verification failed",
  steam_verified: "Steam account verified", unauthorised_access_attempt: "Blocked access attempt",
  admin_suspend: "Account suspended by staff", admin_unsuspend: "Suspension lifted", admin_set_role: "Role changed by staff", admin_revoke_sessions: "Signed out by staff",
  admin_restrict_reporting: "Reporting restricted by staff", admin_unrestrict_reporting: "Reporting restored",
};
export const securityEventLabel = (t: string) => SECURITY_EVENT_LABELS[t] ?? t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
