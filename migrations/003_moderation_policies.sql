SET search_path = ss, public;
-- Moderators (not only seniors) set evidence retention dates when closing reports.
DROP POLICY IF EXISTS report_evidence_update ON ss.report_evidence;
CREATE POLICY report_evidence_update ON ss.report_evidence FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff()) WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_staff());
