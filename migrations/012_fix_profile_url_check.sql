-- PostgreSQL regex repetition counts max out at 255; express the length limit separately.
SET search_path = ss, public;
ALTER TABLE ss.account_verifications DROP CONSTRAINT IF EXISTS account_verifications_profile_url_check;
ALTER TABLE ss.account_verifications ADD CONSTRAINT account_verifications_profile_url_check
  CHECK (profile_url ~ '^https://[^[:space:]]{4,}$' AND length(profile_url) <= 308);
