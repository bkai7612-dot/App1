-- Package B (trust & fairness).
SET search_path = ss, public;

-- T-02 / D3: votes from accounts younger than 72 hours are held and only count once the account is 72 hours old.
ALTER TABLE ss.player_votes ADD COLUMN IF NOT EXISTS counts_from timestamptz NOT NULL DEFAULT now();
CREATE OR REPLACE FUNCTION ss.player_votes_protect() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE acct timestamptz;
BEGIN
  IF NOT ss.ctx_is_system() THEN
    IF NEW.voter_user_id IS DISTINCT FROM ss.ctx_user_id() OR NEW.is_demo THEN RAISE EXCEPTION 'invalid voter' USING ERRCODE = '42501'; END IF;
    IF TG_OP = 'UPDATE' AND NEW.player_profile_id <> OLD.player_profile_id THEN RAISE EXCEPTION 'immutable' USING ERRCODE = '42501'; END IF;
    IF EXISTS (SELECT 1 FROM ss.player_profiles p WHERE p.id = NEW.player_profile_id AND p.owner_user_id = NEW.voter_user_id) THEN
      RAISE EXCEPTION 'cannot vote on your own profile' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- The hold is computed by the database, never by the client.
  SELECT created_at INTO acct FROM ss.users WHERE id = NEW.voter_user_id;
  NEW.counts_from := greatest(now(), coalesce(acct, now()) + interval '72 hours');
  IF TG_OP = 'UPDATE' AND OLD.counts_from < now() AND NEW.counts_from <= now() THEN NEW.counts_from := OLD.counts_from; END IF;
  RETURN NEW;
END $$;
CREATE INDEX IF NOT EXISTS player_votes_recent_idx ON ss.player_votes (player_profile_id, updated_at DESC);

CREATE OR REPLACE VIEW ss.player_vote_stats AS
SELECT p.id AS player_profile_id,
  (SELECT count(*) FROM ss.player_votes v WHERE v.player_profile_id = p.id AND v.value = 1 AND v.counts_from <= now()) AS upvotes,
  (SELECT count(*) FROM ss.player_votes v WHERE v.player_profile_id = p.id AND v.value = -1 AND v.counts_from <= now()) AS downvotes,
  (SELECT count(*) FROM ss.player_comments c WHERE c.player_profile_id = p.id AND c.status = 'approved') AS comments
FROM ss.player_profiles p WHERE p.deleted_at IS NULL;

-- T-07: owners can withdraw a pending response or an appeal that hasn't been decided.
ALTER TABLE ss.report_responses DROP CONSTRAINT IF EXISTS report_responses_status_check;
ALTER TABLE ss.report_responses ADD CONSTRAINT report_responses_status_check CHECK (status IN ('pending','published','rejected','withdrawn'));
ALTER TABLE ss.report_appeals DROP CONSTRAINT IF EXISTS report_appeals_status_check;
ALTER TABLE ss.report_appeals ADD CONSTRAINT report_appeals_status_check CHECK (status IN ('submitted','under_review','upheld','rejected','withdrawn'));

-- T-13: better profile-code checks (where to look, optional private screenshot, "I've placed the code").
ALTER TABLE ss.account_verifications ADD COLUMN IF NOT EXISTS profile_url text CHECK (profile_url ~ '^https://[^\s]{4,300}$');
ALTER TABLE ss.account_verifications ADD COLUMN IF NOT EXISTS evidence_key text;
ALTER TABLE ss.account_verifications ADD COLUMN IF NOT EXISTS evidence_mime text CHECK (evidence_mime IN ('image/png','image/jpeg','image/webp'));
ALTER TABLE ss.account_verifications ADD COLUMN IF NOT EXISTS code_placed_at timestamptz;
