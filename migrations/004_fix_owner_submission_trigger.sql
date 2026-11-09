SET search_path = ss, public;
-- Fix: PL/pgSQL cannot reference a column that only exists on one of the two tables sharing this trigger.
CREATE OR REPLACE FUNCTION ss.owner_submission_protect() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ss, pg_catalog AS $$
DECLARE author uuid; rec jsonb := to_jsonb(NEW);
BEGIN
  IF ss.ctx_is_system() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    author := (CASE TG_TABLE_NAME WHEN 'report_responses' THEN rec->>'author_user_id' ELSE rec->>'appellant_user_id' END)::uuid;
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
  RETURN NEW;
END $$;
