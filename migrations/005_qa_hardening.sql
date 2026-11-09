-- Hardening from independent QA round 1 (see docs/TESTING_REPORT.md, QA-02, QA-03, QA-05, L-items).
SET search_path = ss, public;

-- QA-05: users may no longer UPDATE their own session rows directly (they could have forged mfa_method/expiry).
-- Session revocation now runs through the authentication service (system context) with an explicit owner check.
DROP POLICY IF EXISTS sessions_revoke_own ON ss.sessions;

-- QA-02: moderators can never moderate their own response/appeal or one about a profile they own.
CREATE OR REPLACE FUNCTION ss.owner_submission_protect() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ss, pg_catalog AS $$
DECLARE author uuid; rec jsonb := to_jsonb(NEW);
BEGIN
  IF ss.ctx_is_system() THEN RETURN NEW; END IF;
  author := (CASE TG_TABLE_NAME WHEN 'report_responses' THEN rec->>'author_user_id' ELSE rec->>'appellant_user_id' END)::uuid;
  IF TG_OP = 'INSERT' THEN
    IF author IS DISTINCT FROM ss.ctx_user_id() OR NOT EXISTS (
      SELECT 1 FROM ss.reports r JOIN ss.player_profiles p ON p.id = r.player_profile_id
      WHERE r.id = NEW.report_id AND p.owner_user_id = author
        AND r.status IN ('published','disputed','appealed','resolved') AND r.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'only the verified profile owner can respond or appeal' USING ERRCODE = '42501';
    END IF;
    NEW.status := CASE TG_TABLE_NAME WHEN 'report_responses' THEN 'pending' ELSE 'submitted' END;
    RETURN NEW;
  END IF;
  IF NOT ss.ctx_is_staff() THEN RAISE EXCEPTION 'only moderators can change this record' USING ERRCODE = '42501'; END IF;
  IF author = ss.ctx_user_id() OR EXISTS (SELECT 1 FROM ss.reports r JOIN ss.player_profiles p ON p.id = r.player_profile_id
       WHERE r.id = NEW.report_id AND (p.owner_user_id = ss.ctx_user_id() OR r.reporter_user_id = ss.ctx_user_id())) THEN
    RAISE EXCEPTION 'conflict of interest' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- QA-03: only super_admins can restrict admin/super_admin accounts; display names only changed by the user or admins.
CREATE OR REPLACE FUNCTION ss.users_protect() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r text := ss.ctx_role(); me uuid := ss.ctx_user_id();
BEGIN
  IF ss.ctx_is_system() THEN RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF OLD.id = me THEN RAISE EXCEPTION 'cannot change own role' USING ERRCODE = '42501'; END IF;
    IF r = 'super_admin' THEN NULL;
    ELSIF r = 'admin' AND OLD.role IN ('user','moderator','senior_moderator') AND NEW.role IN ('user','moderator','senior_moderator') THEN NULL;
    ELSE RAISE EXCEPTION 'insufficient privilege to change role' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF (NEW.suspended_at, NEW.suspended_until, NEW.suspension_reason, NEW.reporting_restricted_until)
     IS DISTINCT FROM (OLD.suspended_at, OLD.suspended_until, OLD.suspension_reason, OLD.reporting_restricted_until) THEN
    IF NOT ss.ctx_is_senior() OR OLD.id = me THEN RAISE EXCEPTION 'insufficient privilege to restrict account' USING ERRCODE = '42501'; END IF;
    IF OLD.role IN ('moderator','senior_moderator') AND NOT ss.ctx_is_admin() THEN RAISE EXCEPTION 'only administrators can restrict staff accounts' USING ERRCODE = '42501'; END IF;
    IF OLD.role IN ('admin','super_admin') AND r <> 'super_admin' THEN RAISE EXCEPTION 'only super administrators can restrict administrators' USING ERRCODE = '42501'; END IF;
  END IF;
  IF NEW.display_name IS DISTINCT FROM OLD.display_name AND OLD.id <> me AND NOT ss.ctx_is_admin() THEN
    RAISE EXCEPTION 'cannot rename another user' USING ERRCODE = '42501';
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

-- L: the new-account commendation hold is enforced atomically in the insert trigger (it previously failed open).
CREATE OR REPLACE FUNCTION ss.commendations_protect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ss.ctx_is_system() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.submitter_user_id IS DISTINCT FROM ss.ctx_user_id() OR NEW.is_demo THEN RAISE EXCEPTION 'invalid submitter' USING ERRCODE = '42501'; END IF;
    IF EXISTS (SELECT 1 FROM ss.player_profiles p WHERE p.id = NEW.player_profile_id AND p.owner_user_id = NEW.submitter_user_id) THEN
      RAISE EXCEPTION 'cannot commend your own profile' USING ERRCODE = '42501';
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

-- L: users can't insert verification rows carrying a "proven" platform ID or a pre-approved state.
DROP POLICY IF EXISTS account_verifications_insert ON ss.account_verifications;
CREATE POLICY account_verifications_insert ON ss.account_verifications FOR INSERT TO serversentry_app
  WITH CHECK (ss.ctx_is_system() OR (user_id = ss.ctx_user_id() AND status = 'pending' AND reviewer_id IS NULL
    AND verified_platform_user_id IS NULL AND decided_at IS NULL));
