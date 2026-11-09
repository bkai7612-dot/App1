-- ServerSentry core schema
-- All objects live in schema "ss" (NOT "public") so they are never exposed through
-- Supabase's auto-generated PostgREST API. The application connects as the
-- least-privilege role "serversentry_app" (no BYPASSRLS, not table owner).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS ss;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'serversentry_app') THEN
    CREATE ROLE serversentry_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA ss TO serversentry_app;
REVOKE ALL ON SCHEMA ss FROM PUBLIC;

-- Defence in depth for Supabase: make sure API roles can never touch this schema.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA ss FROM %I', r);
    END IF;
  END LOOP;
END $$;

SET search_path = ss, public;

-- ---------------------------------------------------------------------------
-- RLS context helpers. The app sets app.user_id / app.role per transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ss.ctx_user_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION ss.ctx_role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT coalesce(nullif(current_setting('app.role', true), ''), 'guest') $$;

CREATE OR REPLACE FUNCTION ss.ctx_is_system() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT ss.ctx_role() = 'system' $$;

CREATE OR REPLACE FUNCTION ss.ctx_is_staff() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT ss.ctx_role() IN ('moderator','senior_moderator','admin','super_admin') $$;

CREATE OR REPLACE FUNCTION ss.ctx_is_senior() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT ss.ctx_role() IN ('senior_moderator','admin','super_admin') $$;

CREATE OR REPLACE FUNCTION ss.ctx_is_admin() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT ss.ctx_role() IN ('admin','super_admin') $$;

CREATE OR REPLACE FUNCTION ss.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ---------------------------------------------------------------------------
-- Users & authentication
-- ---------------------------------------------------------------------------
CREATE TABLE ss.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (length(email) <= 254),
  email_normalized text NOT NULL,
  email_verified_at timestamptz,
  password_hash text NOT NULL,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 40),
  role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('user','moderator','senior_moderator','admin','super_admin')),
  mfa_enabled boolean NOT NULL DEFAULT false,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  suspended_at timestamptz,
  suspended_until timestamptz,
  suspension_reason text CHECK (length(suspension_reason) <= 500),
  reporting_restricted_until timestamptz,
  notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  privacy_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  stripe_customer_id text,
  is_demo boolean NOT NULL DEFAULT false,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_normalized_uq ON ss.users (email_normalized);
CREATE UNIQUE INDEX users_stripe_customer_uq ON ss.users (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX users_role_idx ON ss.users (role) WHERE role <> 'user';
CREATE TRIGGER users_touch BEFORE UPDATE ON ss.users FOR EACH ROW EXECUTE FUNCTION ss.touch_updated_at();

-- Protect privileged columns: users can never change their own role, MFA flags,
-- credentials, entitlements or moderation restrictions, whatever the API does.
CREATE OR REPLACE FUNCTION ss.users_protect() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r text := ss.ctx_role(); me uuid := ss.ctx_user_id();
BEGIN
  IF ss.ctx_is_system() THEN RETURN NEW; END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF OLD.id = me THEN RAISE EXCEPTION 'cannot change own role' USING ERRCODE = '42501'; END IF;
    IF r = 'super_admin' THEN
      NULL;
    ELSIF r = 'admin' AND OLD.role IN ('user','moderator','senior_moderator')
                      AND NEW.role IN ('user','moderator','senior_moderator') THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'insufficient privilege to change role' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF (NEW.suspended_at, NEW.suspended_until, NEW.suspension_reason, NEW.reporting_restricted_until)
     IS DISTINCT FROM (OLD.suspended_at, OLD.suspended_until, OLD.suspension_reason, OLD.reporting_restricted_until) THEN
    IF NOT ss.ctx_is_senior() OR OLD.id = me THEN
      RAISE EXCEPTION 'insufficient privilege to restrict account' USING ERRCODE = '42501';
    END IF;
    IF OLD.role <> 'user' AND NOT ss.ctx_is_admin() THEN
      RAISE EXCEPTION 'only administrators can restrict staff accounts' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF (NEW.email, NEW.email_normalized, NEW.email_verified_at, NEW.password_hash, NEW.mfa_enabled,
      NEW.failed_login_count, NEW.locked_until, NEW.stripe_customer_id, NEW.is_demo,
      NEW.deletion_requested_at, NEW.deleted_at, NEW.created_at, NEW.id)
     IS DISTINCT FROM
     (OLD.email, OLD.email_normalized, OLD.email_verified_at, OLD.password_hash, OLD.mfa_enabled,
      OLD.failed_login_count, OLD.locked_until, OLD.stripe_customer_id, OLD.is_demo,
      OLD.deletion_requested_at, OLD.deleted_at, OLD.created_at, OLD.id) THEN
    RAISE EXCEPTION 'protected account fields can only be changed by the authentication service' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER users_protect BEFORE UPDATE ON ss.users FOR EACH ROW EXECUTE FUNCTION ss.users_protect();

CREATE TABLE ss.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ss.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  mfa_verified_at timestamptz,
  mfa_method text CHECK (mfa_method IN ('totp','webauthn','recovery_code')),
  reauth_at timestamptz,
  mfa_attempts integer NOT NULL DEFAULT 0,
  webauthn_challenge text,
  challenge_expires_at timestamptz,
  ip_hash text,
  user_agent text CHECK (length(user_agent) <= 300),
  revoked_at timestamptz,
  revoked_reason text
);
CREATE INDEX sessions_user_idx ON ss.sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE ss.mfa_totp (
  user_id uuid PRIMARY KEY REFERENCES ss.users(id) ON DELETE CASCADE,
  secret_enc text NOT NULL,
  confirmed_at timestamptz,
  last_used_step bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ss.webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ss.users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT '{}',
  device_type text,
  backed_up boolean NOT NULL DEFAULT false,
  nickname text CHECK (length(nickname) <= 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX webauthn_user_idx ON ss.webauthn_credentials (user_id);

CREATE TABLE ss.recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ss.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);

CREATE TABLE ss.email_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ss.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email','reset_password','change_email')),
  token_hash text NOT NULL UNIQUE,
  new_email text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_tokens_user_idx ON ss.email_tokens (user_id, purpose);

CREATE TABLE ss.account_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES ss.users(id) ON DELETE CASCADE,
  email_normalized text NOT NULL,
  details text NOT NULL CHECK (length(details) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES ss.users(id),
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE TABLE ss.rate_limits (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE TABLE ss.security_events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES ss.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  ip_hash text,
  user_agent text CHECK (length(user_agent) <= 300),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_events_user_idx ON ss.security_events (user_id, created_at DESC);
CREATE INDEX security_events_type_idx ON ss.security_events (event_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- Games & platforms
-- ---------------------------------------------------------------------------
CREATE TABLE ss.games (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100
);

CREATE TABLE ss.platforms (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  name text NOT NULL,
  -- verified_linking: official ownership verification implemented
  -- manual: manual identification / moderator-reviewed claims only
  -- future: integration point reserved, not operational
  integration_status text NOT NULL DEFAULT 'manual' CHECK (integration_status IN ('verified_linking','manual','future')),
  identifier_label text NOT NULL DEFAULT 'Username',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100
);

-- ---------------------------------------------------------------------------
-- Player identities
-- ---------------------------------------------------------------------------
CREATE TABLE ss.player_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 64),
  display_name_normalized text NOT NULL,
  game_id integer NOT NULL REFERENCES ss.games(id),
  platform_id integer NOT NULL REFERENCES ss.platforms(id),
  platform_user_id text CHECK (length(platform_user_id) <= 128),
  owner_user_id uuid REFERENCES ss.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES ss.users(id) ON DELETE SET NULL,
  is_demo boolean NOT NULL DEFAULT false,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
-- Same username is ALLOWED (no automatic merging). A platform-native ID, when known, is unique.
CREATE UNIQUE INDEX player_profiles_platform_uid_uq ON ss.player_profiles (platform_id, game_id, platform_user_id)
  WHERE platform_user_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX player_profiles_name_trgm ON ss.player_profiles USING gin (display_name_normalized gin_trgm_ops);
CREATE INDEX player_profiles_lookup ON ss.player_profiles (game_id, platform_id, display_name_normalized);
CREATE INDEX player_profiles_owner_idx ON ss.player_profiles (owner_user_id);
CREATE TRIGGER player_profiles_touch BEFORE UPDATE ON ss.player_profiles FOR EACH ROW EXECUTE FUNCTION ss.touch_updated_at();

CREATE OR REPLACE FUNCTION ss.player_profiles_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ss.ctx_is_system() OR ss.ctx_is_staff() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM ss.ctx_user_id() OR NEW.is_demo THEN
      RAISE EXCEPTION 'invalid profile creator' USING ERRCODE = '42501';
    END IF;
    IF NEW.owner_user_id IS NOT NULL AND NEW.owner_user_id <> ss.ctx_user_id() THEN
      RAISE EXCEPTION 'cannot assign profile to another user' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'profiles can only be modified by moderators or the identity service' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER player_profiles_protect BEFORE INSERT OR UPDATE ON ss.player_profiles FOR EACH ROW EXECUTE FUNCTION ss.player_profiles_protect();

CREATE TABLE ss.gaming_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_profile_id uuid NOT NULL REFERENCES ss.player_profiles(id) ON DELETE CASCADE,
  platform_id integer NOT NULL REFERENCES ss.platforms(id),
  platform_user_id text CHECK (length(platform_user_id) <= 128),
  username text NOT NULL CHECK (length(username) BETWEEN 1 AND 64),
  username_normalized text NOT NULL,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('verified','possible_match','unverified','unlinked')),
  verification_method text CHECK (verification_method IN ('steam_openid','manual_review')),
  linked_by_user_id uuid REFERENCES ss.users(id) ON DELETE SET NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  unlinked_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- A platform account can be VERIFIED for at most one profile anywhere.
CREATE UNIQUE INDEX gaming_accounts_verified_uq ON ss.gaming_accounts (platform_id, platform_user_id)
  WHERE verification_status = 'verified' AND platform_user_id IS NOT NULL;
CREATE UNIQUE INDEX gaming_accounts_profile_uq ON ss.gaming_accounts (player_profile_id, platform_id, username_normalized)
  WHERE verification_status <> 'unlinked';
CREATE INDEX gaming_accounts_profile_idx ON ss.gaming_accounts (player_profile_id);
CREATE TRIGGER gaming_accounts_touch BEFORE UPDATE ON ss.gaming_accounts FOR EACH ROW EXECUTE FUNCTION ss.touch_updated_at();

CREATE OR REPLACE FUNCTION ss.gaming_accounts_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ss.ctx_is_system() OR ss.ctx_is_staff() THEN RETURN NEW; END IF;
  -- Ordinary users may only add UNVERIFIED links to profiles they own, and may only unlink.
  IF TG_OP = 'INSERT' THEN
    IF NEW.verification_status <> 'unverified' OR NEW.verification_method IS NOT NULL OR NEW.is_demo
       OR NEW.linked_by_user_id IS DISTINCT FROM ss.ctx_user_id() THEN
      RAISE EXCEPTION 'users cannot self-verify gaming accounts' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ss.player_profiles p WHERE p.id = NEW.player_profile_id AND p.owner_user_id = ss.ctx_user_id()) THEN
      RAISE EXCEPTION 'can only link accounts to your own profile' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.verification_status <> 'unlinked'
     OR (NEW.platform_user_id, NEW.username, NEW.player_profile_id, NEW.platform_id)
        IS DISTINCT FROM (OLD.platform_user_id, OLD.username, OLD.player_profile_id, OLD.platform_id) THEN
    RAISE EXCEPTION 'users may only unlink accounts' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER gaming_accounts_protect BEFORE INSERT OR UPDATE ON ss.gaming_accounts FOR EACH ROW EXECUTE FUNCTION ss.gaming_accounts_protect();

CREATE TABLE ss.account_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ss.users(id) ON DELETE CASCADE,
  player_profile_id uuid NOT NULL REFERENCES ss.player_profiles(id) ON DELETE CASCADE,
  gaming_account_id uuid REFERENCES ss.gaming_accounts(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('link_verification','profile_claim')),
  method text NOT NULL CHECK (method IN ('steam_openid','manual_review')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','cancelled')),
  nonce_hash text,
  claim_note text CHECK (length(claim_note) <= 1000),
  verified_platform_user_id text,
  reviewer_id uuid REFERENCES ss.users(id),
  decision_note text CHECK (length(decision_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  decided_at timestamptz
);
CREATE INDEX account_verifications_status_idx ON ss.account_verifications (status, created_at);
CREATE UNIQUE INDEX account_verifications_one_pending ON ss.account_verifications (user_id, player_profile_id, kind)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Commendations
-- ---------------------------------------------------------------------------
CREATE TABLE ss.commendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_profile_id uuid NOT NULL REFERENCES ss.player_profiles(id) ON DELETE CASCADE,
  game_id integer NOT NULL REFERENCES ss.games(id),
  platform_id integer NOT NULL REFERENCES ss.platforms(id),
  category text NOT NULL CHECK (category IN ('excellent_teammate','helpful_player','great_communication',
    'good_sportsmanship','friendly_opponent','team_leadership','fair_play')),
  comment text CHECK (length(comment) <= 500),
  submitter_user_id uuid REFERENCES ss.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','removed')),
  moderated_by uuid REFERENCES ss.users(id),
  moderated_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
-- Duplicate prevention: one commendation per submitter, per profile, per category.
CREATE UNIQUE INDEX commendations_dedupe_uq ON ss.commendations (submitter_user_id, player_profile_id, category)
  WHERE submitter_user_id IS NOT NULL;
CREATE INDEX commendations_profile_idx ON ss.commendations (player_profile_id, status, created_at DESC);
CREATE INDEX commendations_pending_idx ON ss.commendations (created_at) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION ss.commendations_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ss.ctx_is_system() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.submitter_user_id IS DISTINCT FROM ss.ctx_user_id() OR NEW.is_demo THEN
      RAISE EXCEPTION 'invalid submitter' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM ss.player_profiles p WHERE p.id = NEW.player_profile_id AND p.owner_user_id = NEW.submitter_user_id) THEN
      RAISE EXCEPTION 'cannot commend your own profile' USING ERRCODE = '42501';
    END IF;
    -- Status is never client-controlled: plain commendations publish, comments await moderation.
    NEW.status := CASE WHEN NEW.comment IS NULL OR btrim(NEW.comment) = '' THEN 'approved' ELSE 'pending' END;
    NEW.moderated_by := NULL; NEW.moderated_at := NULL; NEW.created_at := now();
    RETURN NEW;
  END IF;
  IF NOT ss.ctx_is_staff() THEN
    RAISE EXCEPTION 'only moderators can change commendations' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER commendations_protect BEFORE INSERT OR UPDATE ON ss.commendations FOR EACH ROW EXECUTE FUNCTION ss.commendations_protect();

-- ---------------------------------------------------------------------------
-- Reports (allegations) — private by default, published only by moderators
-- ---------------------------------------------------------------------------
CREATE TABLE ss.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_ref text NOT NULL UNIQUE,
  player_profile_id uuid NOT NULL REFERENCES ss.player_profiles(id) ON DELETE CASCADE,
  game_id integer NOT NULL REFERENCES ss.games(id),
  platform_id integer NOT NULL REFERENCES ss.platforms(id),
  category text NOT NULL CHECK (category IN ('harassment','abusive_behaviour','threats_intimidation','griefing',
    'unsportsmanlike_conduct','suspected_cheating','other')),
  description text NOT NULL CHECK (length(description) BETWEEN 20 AND 4000),
  incident_date date NOT NULL,
  reporter_user_id uuid REFERENCES ss.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','published','disputed',
    'appealed','resolved','rejected','removed')),
  public_summary text CHECK (length(public_summary) <= 1000),
  outcome_type text CHECK (outcome_type IN ('upheld','not_upheld','removed')),
  outcome_note text CHECK (length(outcome_note) <= 1000),
  flags text[] NOT NULL DEFAULT '{}',
  info_requested_at timestamptz,
  info_request_note text CHECK (length(info_request_note) <= 1000),
  assigned_moderator_id uuid REFERENCES ss.users(id),
  published_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (incident_date <= (created_at AT TIME ZONE 'UTC')::date + 1),
  -- A report can never be public without a moderator-written summary.
  CHECK (status NOT IN ('published','disputed','appealed','resolved') OR public_summary IS NOT NULL)
);
CREATE UNIQUE INDEX reports_one_open_per_reporter ON ss.reports (reporter_user_id, player_profile_id)
  WHERE status IN ('submitted','under_review') AND deleted_at IS NULL AND reporter_user_id IS NOT NULL;
CREATE INDEX reports_profile_idx ON ss.reports (player_profile_id, status);
CREATE INDEX reports_queue_idx ON ss.reports (status, created_at);
CREATE INDEX reports_reporter_idx ON ss.reports (reporter_user_id, created_at DESC);
CREATE TRIGGER reports_touch BEFORE UPDATE ON ss.reports FOR EACH ROW EXECUTE FUNCTION ss.touch_updated_at();

CREATE OR REPLACE FUNCTION ss.reports_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ss.ctx_is_system() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.reporter_user_id IS DISTINCT FROM ss.ctx_user_id() OR NEW.is_demo THEN
      RAISE EXCEPTION 'invalid reporter' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM ss.player_profiles p WHERE p.id = NEW.player_profile_id AND p.owner_user_id = NEW.reporter_user_id) THEN
      RAISE EXCEPTION 'cannot report your own profile' USING ERRCODE = '42501';
    END IF;
    -- New allegations are NEVER published automatically.
    NEW.status := 'submitted'; NEW.public_summary := NULL; NEW.outcome_type := NULL; NEW.outcome_note := NULL;
    NEW.published_at := NULL; NEW.resolved_at := NULL; NEW.created_at := now();
    RETURN NEW;
  END IF;
  IF NOT ss.ctx_is_staff() THEN
    RAISE EXCEPTION 'only moderators can change reports' USING ERRCODE = '42501';
  END IF;
  -- Moderators cannot act on reports they submitted, or reports about profiles they own.
  IF OLD.reporter_user_id = ss.ctx_user_id()
     OR EXISTS (SELECT 1 FROM ss.player_profiles p WHERE p.id = OLD.player_profile_id AND p.owner_user_id = ss.ctx_user_id()) THEN
    RAISE EXCEPTION 'conflict of interest: cannot moderate this report' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reports_protect BEFORE INSERT OR UPDATE ON ss.reports FOR EACH ROW EXECUTE FUNCTION ss.reports_protect();

CREATE TABLE ss.report_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES ss.reports(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES ss.users(id) ON DELETE SET NULL,
  storage_key text NOT NULL UNIQUE,
  stored_mime text NOT NULL CHECK (stored_mime IN ('image/png','image/jpeg','image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  sha256 text NOT NULL,
  scan_status text NOT NULL DEFAULT 'clean' CHECK (scan_status IN ('pending','clean','quarantined')),
  delete_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX report_evidence_report_idx ON ss.report_evidence (report_id);

CREATE TABLE ss.report_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES ss.reports(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES ss.users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','rejected')),
  moderated_by uuid REFERENCES ss.users(id),
  moderated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX report_responses_one_active ON ss.report_responses (report_id) WHERE status IN ('pending','published');

CREATE TABLE ss.report_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES ss.reports(id) ON DELETE CASCADE,
  appellant_user_id uuid REFERENCES ss.users(id) ON DELETE SET NULL,
  grounds text NOT NULL CHECK (length(grounds) BETWEEN 20 AND 4000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','upheld','rejected')),
  decision_note text CHECK (length(decision_note) <= 2000),
  decided_by uuid REFERENCES ss.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE UNIQUE INDEX report_appeals_one_open ON ss.report_appeals (report_id) WHERE status IN ('submitted','under_review');

-- Right of reply / appeals must come from the verified owner of the reported profile.
CREATE OR REPLACE FUNCTION ss.owner_submission_protect() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ss, pg_catalog AS $$
DECLARE author uuid;
BEGIN
  IF ss.ctx_is_system() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    author := CASE TG_TABLE_NAME WHEN 'report_responses' THEN NEW.author_user_id ELSE NEW.appellant_user_id END;
    IF author IS DISTINCT FROM ss.ctx_user_id() OR NOT EXISTS (
      SELECT 1 FROM ss.reports r JOIN ss.player_profiles p ON p.id = r.player_profile_id
      WHERE r.id = NEW.report_id AND p.owner_user_id = author) THEN
      RAISE EXCEPTION 'only the verified profile owner can respond or appeal' USING ERRCODE = '42501';
    END IF;
    NEW.status := CASE TG_TABLE_NAME WHEN 'report_responses' THEN 'pending' ELSE 'submitted' END;
    RETURN NEW;
  END IF;
  IF NOT ss.ctx_is_staff() THEN RAISE EXCEPTION 'only moderators can change this record' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER report_responses_protect BEFORE INSERT OR UPDATE ON ss.report_responses FOR EACH ROW EXECUTE FUNCTION ss.owner_submission_protect();
CREATE TRIGGER report_appeals_protect BEFORE INSERT OR UPDATE ON ss.report_appeals FOR EACH ROW EXECUTE FUNCTION ss.owner_submission_protect();

CREATE TABLE ss.moderation_actions (
  id bigserial PRIMARY KEY,
  moderator_id uuid REFERENCES ss.users(id) ON DELETE SET NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  note text CHECK (length(note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_actions_target_idx ON ss.moderation_actions (target_type, target_id, created_at);

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------
CREATE TABLE ss.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ss.users(id) ON DELETE CASCADE,
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_customer_id text NOT NULL,
  status text NOT NULL,
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  last_event_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_user_idx ON ss.subscriptions (user_id);
CREATE TRIGGER subscriptions_touch BEFORE UPDATE ON ss.subscriptions FOR EACH ROW EXECUTE FUNCTION ss.touch_updated_at();

CREATE TABLE ss.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES ss.users(id) ON DELETE SET NULL,
  stripe_invoice_id text UNIQUE,
  stripe_charge_id text,
  amount_pence integer NOT NULL,
  currency text NOT NULL,
  status text NOT NULL CHECK (status IN ('paid','failed','refunded','partially_refunded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ss.stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Notifications, privacy requests, audit
-- ---------------------------------------------------------------------------
CREATE TABLE ss.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ss.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL CHECK (length(title) <= 140),
  body text CHECK (length(body) <= 500),
  link text CHECK (link ~ '^/[A-Za-z0-9/_?=&%.-]*$'),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON ss.notifications (user_id, created_at DESC);

CREATE TABLE ss.data_subject_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES ss.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('access','rectification','erasure','restriction','objection','portability','complaint')),
  details text CHECK (length(details) <= 4000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','refused')),
  response_note text CHECK (length(response_note) <= 4000),
  handled_by uuid REFERENCES ss.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT (now() + interval '1 month'),
  closed_at timestamptz
);

CREATE TABLE ss.audit_logs (
  id bigserial PRIMARY KEY,
  actor_user_id uuid,
  actor_role text NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  prev_hash text,
  hash text
);
CREATE INDEX audit_logs_actor_idx ON ss.audit_logs (actor_user_id, created_at DESC);
CREATE INDEX audit_logs_target_idx ON ss.audit_logs (target_type, target_id);

-- Tamper evidence: every row is chained to the previous row's hash.
CREATE OR REPLACE FUNCTION ss.audit_chain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ss, pg_catalog AS $$
DECLARE prev text;
BEGIN
  PERFORM pg_advisory_xact_lock(727274);
  SELECT hash INTO prev FROM ss.audit_logs ORDER BY id DESC LIMIT 1;
  NEW.created_at := now();
  NEW.actor_role := ss.ctx_role();
  NEW.prev_hash := coalesce(prev, 'genesis');
  NEW.hash := encode(sha256(convert_to(NEW.prev_hash || '|' || NEW.id::text || '|' || coalesce(NEW.actor_user_id::text,'') || '|' ||
              NEW.actor_role || '|' || NEW.action || '|' || coalesce(NEW.target_type,'') || '|' || coalesce(NEW.target_id,'') || '|' ||
              NEW.detail::text || '|' || NEW.created_at::text, 'UTF8')), 'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER audit_logs_chain BEFORE INSERT ON ss.audit_logs FOR EACH ROW EXECUTE FUNCTION ss.audit_chain();

CREATE OR REPLACE FUNCTION ss.append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END $$;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON ss.audit_logs FOR EACH ROW EXECUTE FUNCTION ss.append_only();
CREATE TRIGGER moderation_actions_append_only BEFORE UPDATE OR DELETE ON ss.moderation_actions FOR EACH ROW EXECUTE FUNCTION ss.append_only();
-- Note: retention of audit logs is performed by the database owner with the trigger
-- temporarily disabled inside a documented, audited maintenance procedure.

-- ---------------------------------------------------------------------------
-- Public, column-safe views (owned by migration role; app role reads these
-- instead of the private base tables). Never expose reporter identity,
-- raw descriptions, or evidence.
-- ---------------------------------------------------------------------------
CREATE VIEW ss.public_reports AS
SELECT r.id, r.public_ref, r.player_profile_id, r.game_id, r.platform_id, r.category, r.status,
       r.public_summary, r.outcome_type, r.outcome_note, r.published_at, r.resolved_at, r.created_at, r.is_demo
FROM ss.reports r
WHERE r.deleted_at IS NULL AND r.status IN ('published','disputed','appealed','resolved')
  AND (r.status <> 'resolved' OR r.outcome_type = 'upheld');

CREATE VIEW ss.public_report_responses AS
SELECT rr.id, rr.report_id, rr.body, rr.created_at
FROM ss.report_responses rr JOIN ss.public_reports pr ON pr.id = rr.report_id
WHERE rr.status = 'published';

CREATE VIEW ss.public_commendations AS
SELECT c.id, c.player_profile_id, c.game_id, c.platform_id, c.category, c.comment, c.created_at, c.is_demo
FROM ss.commendations c
WHERE c.status = 'approved' AND c.deleted_at IS NULL;

CREATE VIEW ss.player_reputation_stats AS
SELECT p.id AS player_profile_id,
  (SELECT count(*) FROM ss.commendations c WHERE c.player_profile_id = p.id AND c.status = 'approved' AND c.deleted_at IS NULL) AS positive_total,
  (SELECT count(*) FROM ss.commendations c WHERE c.player_profile_id = p.id AND c.status = 'pending' AND c.deleted_at IS NULL) AS positive_pending,
  (SELECT count(*) FROM ss.public_reports r WHERE r.player_profile_id = p.id) AS negative_published,
  (SELECT count(*) FROM ss.reports r WHERE r.player_profile_id = p.id AND r.deleted_at IS NULL) AS reports_total,
  (SELECT count(*) FROM ss.reports r WHERE r.player_profile_id = p.id AND r.deleted_at IS NULL AND r.status IN ('submitted','under_review')) AS reports_pending,
  (SELECT count(*) FROM ss.reports r WHERE r.player_profile_id = p.id AND r.deleted_at IS NULL AND r.status IN ('disputed','appealed')) AS reports_disputed,
  (SELECT count(*) FROM ss.reports r WHERE r.player_profile_id = p.id AND r.deleted_at IS NULL AND (r.status IN ('rejected','removed') OR (r.status = 'resolved' AND r.outcome_type <> 'upheld'))) AS reports_rejected_removed,
  (SELECT count(*) FROM ss.public_reports r WHERE r.player_profile_id = p.id AND r.status = 'resolved') AS reports_resolved
FROM ss.player_profiles p
WHERE p.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Grants (least privilege) and Row Level Security
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ss TO serversentry_app;
REVOKE UPDATE, DELETE ON ss.audit_logs, ss.moderation_actions FROM serversentry_app;
REVOKE DELETE ON ss.users, ss.reports, ss.report_evidence, ss.commendations, ss.subscriptions, ss.payments,
  ss.player_profiles, ss.account_verifications, ss.report_appeals, ss.report_responses FROM serversentry_app;
REVOKE ALL ON ss.public_reports, ss.public_report_responses, ss.public_commendations, ss.player_reputation_stats FROM serversentry_app;
GRANT SELECT ON ss.public_reports, ss.public_report_responses, ss.public_commendations, ss.player_reputation_stats TO serversentry_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA ss TO serversentry_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ss TO serversentry_app;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'ss' LOOP
    EXECUTE format('ALTER TABLE ss.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- users
CREATE POLICY users_select ON ss.users FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR id = ss.ctx_user_id() OR ss.ctx_is_staff());
CREATE POLICY users_insert ON ss.users FOR INSERT TO serversentry_app WITH CHECK (ss.ctx_is_system());
CREATE POLICY users_update ON ss.users FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR id = ss.ctx_user_id() OR ss.ctx_is_senior())
  WITH CHECK (ss.ctx_is_system() OR id = ss.ctx_user_id() OR ss.ctx_is_senior());

-- authentication internals: system context only (sessions readable by owner for session management)
CREATE POLICY sessions_select ON ss.sessions FOR SELECT TO serversentry_app USING (ss.ctx_is_system() OR user_id = ss.ctx_user_id());
CREATE POLICY sessions_write ON ss.sessions FOR ALL TO serversentry_app USING (ss.ctx_is_system()) WITH CHECK (ss.ctx_is_system());
CREATE POLICY sessions_revoke_own ON ss.sessions FOR UPDATE TO serversentry_app USING (user_id = ss.ctx_user_id()) WITH CHECK (user_id = ss.ctx_user_id());
CREATE POLICY mfa_totp_sys ON ss.mfa_totp FOR ALL TO serversentry_app USING (ss.ctx_is_system()) WITH CHECK (ss.ctx_is_system());
CREATE POLICY webauthn_select_own ON ss.webauthn_credentials FOR SELECT TO serversentry_app USING (ss.ctx_is_system() OR user_id = ss.ctx_user_id());
CREATE POLICY webauthn_sys ON ss.webauthn_credentials FOR ALL TO serversentry_app USING (ss.ctx_is_system()) WITH CHECK (ss.ctx_is_system());
CREATE POLICY recovery_codes_sys ON ss.recovery_codes FOR ALL TO serversentry_app USING (ss.ctx_is_system()) WITH CHECK (ss.ctx_is_system());
CREATE POLICY email_tokens_sys ON ss.email_tokens FOR ALL TO serversentry_app USING (ss.ctx_is_system()) WITH CHECK (ss.ctx_is_system());
CREATE POLICY rate_limits_sys ON ss.rate_limits FOR ALL TO serversentry_app USING (ss.ctx_is_system()) WITH CHECK (ss.ctx_is_system());
CREATE POLICY recovery_requests_sys ON ss.account_recovery_requests FOR ALL TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_admin()) WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_admin());
CREATE POLICY security_events_select ON ss.security_events FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR user_id = ss.ctx_user_id() OR ss.ctx_is_admin());
CREATE POLICY security_events_insert ON ss.security_events FOR INSERT TO serversentry_app
  WITH CHECK (ss.ctx_is_system() OR user_id = ss.ctx_user_id() OR ss.ctx_is_staff());

-- reference data
CREATE POLICY games_read ON ss.games FOR SELECT TO serversentry_app USING (true);
CREATE POLICY games_write ON ss.games FOR ALL TO serversentry_app USING (ss.ctx_is_system() OR ss.ctx_is_admin()) WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_admin());
CREATE POLICY platforms_read ON ss.platforms FOR SELECT TO serversentry_app USING (true);
CREATE POLICY platforms_write ON ss.platforms FOR ALL TO serversentry_app USING (ss.ctx_is_system() OR ss.ctx_is_admin()) WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_admin());

-- player identities
CREATE POLICY player_profiles_read ON ss.player_profiles FOR SELECT TO serversentry_app
  USING (deleted_at IS NULL OR ss.ctx_is_staff() OR ss.ctx_is_system());
CREATE POLICY player_profiles_insert ON ss.player_profiles FOR INSERT TO serversentry_app
  WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_staff() OR (ss.ctx_user_id() IS NOT NULL AND created_by = ss.ctx_user_id()));
CREATE POLICY player_profiles_update ON ss.player_profiles FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff()) WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_staff());

CREATE POLICY gaming_accounts_read ON ss.gaming_accounts FOR SELECT TO serversentry_app
  USING (verification_status <> 'unlinked' OR linked_by_user_id = ss.ctx_user_id() OR ss.ctx_is_staff() OR ss.ctx_is_system());
CREATE POLICY gaming_accounts_insert ON ss.gaming_accounts FOR INSERT TO serversentry_app
  WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_staff() OR linked_by_user_id = ss.ctx_user_id());
CREATE POLICY gaming_accounts_update ON ss.gaming_accounts FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff() OR EXISTS (SELECT 1 FROM ss.player_profiles p WHERE p.id = player_profile_id AND p.owner_user_id = ss.ctx_user_id()))
  WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_staff() OR EXISTS (SELECT 1 FROM ss.player_profiles p WHERE p.id = player_profile_id AND p.owner_user_id = ss.ctx_user_id()));

CREATE POLICY account_verifications_read ON ss.account_verifications FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff() OR user_id = ss.ctx_user_id());
CREATE POLICY account_verifications_insert ON ss.account_verifications FOR INSERT TO serversentry_app
  WITH CHECK (ss.ctx_is_system() OR (user_id = ss.ctx_user_id() AND status = 'pending' AND reviewer_id IS NULL));
CREATE POLICY account_verifications_update ON ss.account_verifications FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR (ss.ctx_is_staff() AND user_id <> ss.ctx_user_id()))
  WITH CHECK (ss.ctx_is_system() OR (ss.ctx_is_staff() AND user_id <> ss.ctx_user_id()));

-- commendations (base table private; public reads go through ss.public_commendations)
CREATE POLICY commendations_read ON ss.commendations FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff() OR submitter_user_id = ss.ctx_user_id());
CREATE POLICY commendations_insert ON ss.commendations FOR INSERT TO serversentry_app
  WITH CHECK (ss.ctx_is_system() OR submitter_user_id = ss.ctx_user_id());
CREATE POLICY commendations_update ON ss.commendations FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff()) WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_staff());

-- reports (base table private; public reads go through ss.public_reports)
CREATE POLICY reports_read ON ss.reports FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff() OR reporter_user_id = ss.ctx_user_id());
CREATE POLICY reports_insert ON ss.reports FOR INSERT TO serversentry_app
  WITH CHECK (ss.ctx_is_system() OR reporter_user_id = ss.ctx_user_id());
CREATE POLICY reports_update ON ss.reports FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff()) WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_staff());

CREATE POLICY report_evidence_read ON ss.report_evidence FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff() OR uploaded_by = ss.ctx_user_id());
CREATE POLICY report_evidence_insert ON ss.report_evidence FOR INSERT TO serversentry_app
  WITH CHECK (ss.ctx_is_system() OR (uploaded_by = ss.ctx_user_id()
    AND EXISTS (SELECT 1 FROM ss.reports r WHERE r.id = report_id AND r.reporter_user_id = ss.ctx_user_id())));
CREATE POLICY report_evidence_update ON ss.report_evidence FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_senior()) WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_senior());

CREATE POLICY report_responses_read ON ss.report_responses FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff() OR author_user_id = ss.ctx_user_id());
CREATE POLICY report_responses_insert ON ss.report_responses FOR INSERT TO serversentry_app
  WITH CHECK (ss.ctx_is_system() OR author_user_id = ss.ctx_user_id());
CREATE POLICY report_responses_update ON ss.report_responses FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff()) WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_staff());

CREATE POLICY report_appeals_read ON ss.report_appeals FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff() OR appellant_user_id = ss.ctx_user_id());
CREATE POLICY report_appeals_insert ON ss.report_appeals FOR INSERT TO serversentry_app
  WITH CHECK (ss.ctx_is_system() OR appellant_user_id = ss.ctx_user_id());
CREATE POLICY report_appeals_update ON ss.report_appeals FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_senior()) WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_senior());

CREATE POLICY moderation_actions_read ON ss.moderation_actions FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff());
CREATE POLICY moderation_actions_insert ON ss.moderation_actions FOR INSERT TO serversentry_app
  WITH CHECK (ss.ctx_is_system() OR (ss.ctx_is_staff() AND moderator_id = ss.ctx_user_id()));

-- billing: users may READ their own records, never write them.
CREATE POLICY subscriptions_read ON ss.subscriptions FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR user_id = ss.ctx_user_id() OR ss.ctx_is_admin());
CREATE POLICY subscriptions_write ON ss.subscriptions FOR ALL TO serversentry_app
  USING (ss.ctx_is_system()) WITH CHECK (ss.ctx_is_system());
CREATE POLICY payments_read ON ss.payments FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR user_id = ss.ctx_user_id() OR ss.ctx_is_admin());
CREATE POLICY payments_write ON ss.payments FOR ALL TO serversentry_app
  USING (ss.ctx_is_system()) WITH CHECK (ss.ctx_is_system());
CREATE POLICY stripe_events_sys ON ss.stripe_events FOR ALL TO serversentry_app
  USING (ss.ctx_is_system()) WITH CHECK (ss.ctx_is_system());

CREATE POLICY notifications_own ON ss.notifications FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR user_id = ss.ctx_user_id());
CREATE POLICY notifications_insert ON ss.notifications FOR INSERT TO serversentry_app
  WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_staff());
CREATE POLICY notifications_update_own ON ss.notifications FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR user_id = ss.ctx_user_id()) WITH CHECK (ss.ctx_is_system() OR user_id = ss.ctx_user_id());
CREATE POLICY notifications_delete_own ON ss.notifications FOR DELETE TO serversentry_app
  USING (ss.ctx_is_system() OR user_id = ss.ctx_user_id());

CREATE POLICY dsr_read ON ss.data_subject_requests FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR user_id = ss.ctx_user_id() OR ss.ctx_is_admin());
CREATE POLICY dsr_insert ON ss.data_subject_requests FOR INSERT TO serversentry_app
  WITH CHECK (ss.ctx_is_system() OR (user_id = ss.ctx_user_id() AND status = 'open'));
CREATE POLICY dsr_update ON ss.data_subject_requests FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_admin()) WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_admin());

CREATE POLICY audit_read ON ss.audit_logs FOR SELECT TO serversentry_app USING (ss.ctx_is_system() OR ss.ctx_is_admin());
CREATE POLICY audit_insert ON ss.audit_logs FOR INSERT TO serversentry_app
  WITH CHECK (ss.ctx_is_system() OR actor_user_id = ss.ctx_user_id());
