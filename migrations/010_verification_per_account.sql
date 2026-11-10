-- I-01: one pending verification per gaming account (not per profile), so verifying a second account isn't blocked.
SET search_path = ss, public;
DROP INDEX IF EXISTS ss.account_verifications_one_pending;
CREATE UNIQUE INDEX account_verifications_one_pending ON ss.account_verifications
  (user_id, player_profile_id, kind, coalesce(gaming_account_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'pending';
-- Expire anything already stale.
UPDATE ss.account_verifications SET status = 'expired', decided_at = now() WHERE status = 'pending' AND expires_at < now();
