-- Package C: moderator tooling.
SET search_path = ss, public;
-- M-05: keyed hash of the reporter's network at submission (staff-only signal for linked accounts). Never shown to players.
ALTER TABLE ss.reports ADD COLUMN IF NOT EXISTS reporter_ip_hash text;
-- M-07: when the reporter answered a "more information" request.
ALTER TABLE ss.reports ADD COLUMN IF NOT EXISTS info_replied_at timestamptz;
-- M-03: claim/lock so two moderators don't work the same item.
ALTER TABLE ss.reports ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
-- M-11: moderators can ask an appellant for more information.
ALTER TABLE ss.report_appeals ADD COLUMN IF NOT EXISTS info_request_note text CHECK (length(info_request_note) <= 1000);
ALTER TABLE ss.report_appeals ADD COLUMN IF NOT EXISTS info_requested_at timestamptz;
ALTER TABLE ss.report_appeals ADD COLUMN IF NOT EXISTS info_reply text CHECK (length(info_reply) <= 2000);
ALTER TABLE ss.report_appeals ADD COLUMN IF NOT EXISTS info_replied_at timestamptz;
CREATE INDEX IF NOT EXISTS reports_reporter_ip_idx ON ss.reports (player_profile_id, reporter_ip_hash) WHERE reporter_ip_hash IS NOT NULL;
