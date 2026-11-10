-- More verification routes: Battle.net official OAuth and the "profile code" challenge (fast manual check).
SET search_path = ss, public;
ALTER TABLE ss.account_verifications ADD COLUMN IF NOT EXISTS challenge_code text CHECK (challenge_code ~ '^SS-[A-Z0-9]{4,8}$');
ALTER TABLE ss.gaming_accounts DROP CONSTRAINT IF EXISTS gaming_accounts_verification_method_check;
ALTER TABLE ss.gaming_accounts ADD CONSTRAINT gaming_accounts_verification_method_check
  CHECK (verification_method IN ('steam_openid','battlenet_oauth','discord_connection','profile_code','manual_review'));
ALTER TABLE ss.account_verifications DROP CONSTRAINT IF EXISTS account_verifications_method_check;
ALTER TABLE ss.account_verifications ADD CONSTRAINT account_verifications_method_check
  CHECK (method IN ('steam_openid','battlenet_oauth','discord_connection','profile_code','manual_review'));
-- Users still cannot insert rows with a pre-proven platform ID (policy from 005 unchanged).
