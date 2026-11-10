-- QR "continue on your phone" handoff for official sign-in / Discord verification.
SET search_path = ss, public;
ALTER TABLE ss.account_verifications ADD COLUMN IF NOT EXISTS handoff boolean NOT NULL DEFAULT false;
ALTER TABLE ss.account_verifications ADD COLUMN IF NOT EXISTS handoff_token_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS account_verifications_handoff_uq ON ss.account_verifications (handoff_token_hash) WHERE handoff_token_hash IS NOT NULL;
-- Users can't create handoff rows themselves (system context only, via the API).
DROP POLICY IF EXISTS account_verifications_insert ON ss.account_verifications;
CREATE POLICY account_verifications_insert ON ss.account_verifications FOR INSERT TO serversentry_app
  WITH CHECK (ss.ctx_is_system() OR (user_id = ss.ctx_user_id() AND status = 'pending' AND reviewer_id IS NULL
    AND verified_platform_user_id IS NULL AND decided_at IS NULL AND handoff = false AND handoff_token_hash IS NULL));
