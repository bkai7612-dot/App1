-- Votes (free members), Plus-only comments with moderation, and owner disputes of inaccurate comments.
SET search_path = ss, public;

CREATE OR REPLACE FUNCTION ss.user_has_plus(uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ss, pg_catalog AS
$$ SELECT EXISTS (SELECT 1 FROM ss.subscriptions s WHERE s.user_id = uid AND s.status IN ('active','trialing')
                  AND s.current_period_end IS NOT NULL AND s.current_period_end > now()) $$;
GRANT EXECUTE ON FUNCTION ss.user_has_plus(uuid) TO serversentry_app;

-- ---------------------------------------------------------------------------
-- Votes: one per member per player profile; can be changed or withdrawn.
-- ---------------------------------------------------------------------------
CREATE TABLE ss.player_votes (
  voter_user_id uuid NOT NULL REFERENCES ss.users(id) ON DELETE CASCADE,
  player_profile_id uuid NOT NULL REFERENCES ss.player_profiles(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (voter_user_id, player_profile_id)
);
CREATE INDEX player_votes_profile_idx ON ss.player_votes (player_profile_id);
CREATE TRIGGER player_votes_touch BEFORE UPDATE ON ss.player_votes FOR EACH ROW EXECUTE FUNCTION ss.touch_updated_at();

CREATE OR REPLACE FUNCTION ss.player_votes_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ss.ctx_is_system() THEN RETURN NEW; END IF;
  IF NEW.voter_user_id IS DISTINCT FROM ss.ctx_user_id() OR NEW.is_demo THEN
    RAISE EXCEPTION 'invalid voter' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.player_profile_id <> OLD.player_profile_id THEN RAISE EXCEPTION 'immutable' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM ss.player_profiles p WHERE p.id = NEW.player_profile_id AND p.owner_user_id = NEW.voter_user_id) THEN
    RAISE EXCEPTION 'cannot vote on your own profile' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER player_votes_protect BEFORE INSERT OR UPDATE ON ss.player_votes FOR EACH ROW EXECUTE FUNCTION ss.player_votes_protect();

-- ---------------------------------------------------------------------------
-- Comments: written only by ServerSentry Plus members; always moderated before display.
-- ---------------------------------------------------------------------------
CREATE TABLE ss.player_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_profile_id uuid NOT NULL REFERENCES ss.player_profiles(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES ss.users(id) ON DELETE SET NULL,
  tone text NOT NULL CHECK (tone IN ('positive','neutral','negative')),
  body text NOT NULL CHECK (length(body) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','removed')),
  moderated_by uuid REFERENCES ss.users(id),
  moderated_at timestamptz,
  moderation_note text CHECK (length(moderation_note) <= 1000),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX player_comments_profile_idx ON ss.player_comments (player_profile_id, status, created_at DESC);
CREATE INDEX player_comments_pending_idx ON ss.player_comments (created_at) WHERE status = 'pending';
CREATE INDEX player_comments_author_idx ON ss.player_comments (author_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION ss.player_comments_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ss.ctx_is_system() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.author_user_id IS DISTINCT FROM ss.ctx_user_id() OR NEW.is_demo THEN RAISE EXCEPTION 'invalid author' USING ERRCODE = '42501'; END IF;
    IF NOT ss.user_has_plus(NEW.author_user_id) THEN RAISE EXCEPTION 'ServerSentry Plus is required to comment' USING ERRCODE = '42501'; END IF;
    IF EXISTS (SELECT 1 FROM ss.player_profiles p WHERE p.id = NEW.player_profile_id AND p.owner_user_id = NEW.author_user_id) THEN
      RAISE EXCEPTION 'cannot comment on your own profile' USING ERRCODE = '42501';
    END IF;
    NEW.status := 'pending'; NEW.moderated_by := NULL; NEW.moderated_at := NULL; NEW.moderation_note := NULL; NEW.created_at := now();
    RETURN NEW;
  END IF;
  IF NOT ss.ctx_is_staff() THEN RAISE EXCEPTION 'only moderators can change comments' USING ERRCODE = '42501'; END IF;
  IF OLD.author_user_id = ss.ctx_user_id()
     OR EXISTS (SELECT 1 FROM ss.player_profiles p WHERE p.id = OLD.player_profile_id AND p.owner_user_id = ss.ctx_user_id()) THEN
    RAISE EXCEPTION 'conflict of interest' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER player_comments_protect BEFORE INSERT OR UPDATE ON ss.player_comments FOR EACH ROW EXECUTE FUNCTION ss.player_comments_protect();

-- ---------------------------------------------------------------------------
-- Disputes: the verified owner reports an approved comment on their account as inaccurate.
-- ---------------------------------------------------------------------------
CREATE TABLE ss.comment_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES ss.player_comments(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES ss.users(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','upheld','rejected')),
  decision_note text CHECK (length(decision_note) <= 1000),
  decided_by uuid REFERENCES ss.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE UNIQUE INDEX comment_disputes_one_open ON ss.comment_disputes (comment_id) WHERE status = 'open';

CREATE OR REPLACE FUNCTION ss.comment_disputes_protect() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ss, pg_catalog AS $$
BEGIN
  IF ss.ctx_is_system() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.owner_user_id IS DISTINCT FROM ss.ctx_user_id() OR NOT EXISTS (
      SELECT 1 FROM ss.player_comments c JOIN ss.player_profiles p ON p.id = c.player_profile_id
      WHERE c.id = NEW.comment_id AND c.status = 'approved' AND p.owner_user_id = NEW.owner_user_id) THEN
      RAISE EXCEPTION 'only the verified owner can dispute a comment on their account' USING ERRCODE = '42501';
    END IF;
    NEW.status := 'open'; NEW.decided_by := NULL; NEW.decided_at := NULL; NEW.decision_note := NULL;
    RETURN NEW;
  END IF;
  IF NOT ss.ctx_is_staff() THEN RAISE EXCEPTION 'only moderators can decide disputes' USING ERRCODE = '42501'; END IF;
  IF OLD.owner_user_id = ss.ctx_user_id() OR EXISTS (SELECT 1 FROM ss.player_comments c WHERE c.id = OLD.comment_id AND c.author_user_id = ss.ctx_user_id()) THEN
    RAISE EXCEPTION 'conflict of interest' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER comment_disputes_protect BEFORE INSERT OR UPDATE ON ss.comment_disputes FOR EACH ROW EXECUTE FUNCTION ss.comment_disputes_protect();

-- Written comments are a Plus feature: commendation comments now also require Plus (defence in depth for the API rule).
CREATE OR REPLACE FUNCTION ss.commendations_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ss.ctx_is_system() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.submitter_user_id IS DISTINCT FROM ss.ctx_user_id() OR NEW.is_demo THEN RAISE EXCEPTION 'invalid submitter' USING ERRCODE = '42501'; END IF;
    IF EXISTS (SELECT 1 FROM ss.player_profiles p WHERE p.id = NEW.player_profile_id AND p.owner_user_id = NEW.submitter_user_id) THEN
      RAISE EXCEPTION 'cannot commend your own profile' USING ERRCODE = '42501';
    END IF;
    IF NEW.comment IS NOT NULL AND btrim(NEW.comment) <> '' AND NOT ss.user_has_plus(NEW.submitter_user_id) THEN
      RAISE EXCEPTION 'ServerSentry Plus is required to write comments' USING ERRCODE = '42501';
    END IF;
    NEW.status := CASE
      WHEN NEW.comment IS NOT NULL AND btrim(NEW.comment) <> '' THEN 'pending'
      WHEN EXISTS (SELECT 1 FROM ss.users u WHERE u.id = NEW.submitter_user_id AND u.created_at > now() - interval '72 hours') THEN 'pending'
      ELSE 'approved' END;
    NEW.moderated_by := NULL; NEW.moderated_at := NULL; NEW.created_at := now();
    RETURN NEW;
  END IF;
  IF NOT ss.ctx_is_staff() THEN RAISE EXCEPTION 'only moderators can change commendations' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END $$;

-- Public, column-safe view: approved comments only, never the author identity.
CREATE VIEW ss.public_player_comments AS
SELECT c.id, c.player_profile_id, c.tone, c.body, c.created_at, c.is_demo
FROM ss.player_comments c WHERE c.status = 'approved';

CREATE VIEW ss.player_vote_stats AS
SELECT p.id AS player_profile_id,
  (SELECT count(*) FROM ss.player_votes v WHERE v.player_profile_id = p.id AND v.value = 1) AS upvotes,
  (SELECT count(*) FROM ss.player_votes v WHERE v.player_profile_id = p.id AND v.value = -1) AS downvotes,
  (SELECT count(*) FROM ss.player_comments c WHERE c.player_profile_id = p.id AND c.status = 'approved') AS comments
FROM ss.player_profiles p WHERE p.deleted_at IS NULL;

-- Grants and RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON ss.player_votes TO serversentry_app;
GRANT SELECT, INSERT, UPDATE ON ss.player_comments, ss.comment_disputes TO serversentry_app;
GRANT SELECT ON ss.public_player_comments, ss.player_vote_stats TO serversentry_app;
ALTER TABLE ss.player_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ss.player_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ss.comment_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY votes_read ON ss.player_votes FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff() OR voter_user_id = ss.ctx_user_id());
CREATE POLICY votes_write ON ss.player_votes FOR INSERT TO serversentry_app WITH CHECK (ss.ctx_is_system() OR voter_user_id = ss.ctx_user_id());
CREATE POLICY votes_update ON ss.player_votes FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR voter_user_id = ss.ctx_user_id()) WITH CHECK (ss.ctx_is_system() OR voter_user_id = ss.ctx_user_id());
CREATE POLICY votes_delete ON ss.player_votes FOR DELETE TO serversentry_app USING (ss.ctx_is_system() OR voter_user_id = ss.ctx_user_id());

CREATE POLICY comments_read ON ss.player_comments FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff() OR author_user_id = ss.ctx_user_id());
CREATE POLICY comments_insert ON ss.player_comments FOR INSERT TO serversentry_app WITH CHECK (ss.ctx_is_system() OR author_user_id = ss.ctx_user_id());
CREATE POLICY comments_update ON ss.player_comments FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff()) WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_staff());

CREATE POLICY disputes_read ON ss.comment_disputes FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff() OR owner_user_id = ss.ctx_user_id());
CREATE POLICY disputes_insert ON ss.comment_disputes FOR INSERT TO serversentry_app WITH CHECK (ss.ctx_is_system() OR owner_user_id = ss.ctx_user_id());
CREATE POLICY disputes_update ON ss.comment_disputes FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff()) WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_staff());
