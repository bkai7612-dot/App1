-- L-01: web complaint form (Online Safety Act complaints procedure, defamation notices, decision complaints).
CREATE TABLE ss.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_ref text NOT NULL UNIQUE DEFAULT ('C-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  user_id uuid REFERENCES ss.users(id) ON DELETE SET NULL,
  contact_email text CHECK (contact_email IS NULL OR (length(contact_email) <= 254 AND contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+$')),
  category text NOT NULL CHECK (category IN ('illegal_content','inaccurate_or_defamatory','moderation_decision','account_restriction','data_protection','other')),
  target_ref text CHECK (length(target_ref) <= 300),
  body text NOT NULL CHECK (length(body) BETWEEN 20 AND 5000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','upheld','not_upheld','closed')),
  response_note text CHECK (length(response_note) <= 4000),
  handled_by uuid REFERENCES ss.users(id),
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledge_by timestamptz NOT NULL DEFAULT (now() + interval '2 days'),
  due_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  closed_at timestamptz,
  CHECK (user_id IS NOT NULL OR contact_email IS NOT NULL)
);
CREATE INDEX complaints_open_idx ON ss.complaints (status, created_at);
ALTER TABLE ss.complaints ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON ss.complaints TO serversentry_app;
CREATE POLICY complaints_read ON ss.complaints FOR SELECT TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff() OR (user_id IS NOT NULL AND user_id = ss.ctx_user_id()));
CREATE POLICY complaints_insert ON ss.complaints FOR INSERT TO serversentry_app WITH CHECK (ss.ctx_is_system());
CREATE POLICY complaints_update ON ss.complaints FOR UPDATE TO serversentry_app
  USING (ss.ctx_is_system() OR ss.ctx_is_staff()) WITH CHECK (ss.ctx_is_system() OR ss.ctx_is_staff());

-- L-04: privacy requests can point at a specific item (a report, comment, commendation, profile or linked account).
ALTER TABLE ss.data_subject_requests
  ADD COLUMN target_type text CHECK (target_type IS NULL OR target_type IN ('report','report_about_me','commendation','player_comment','player_profile','gaming_account','account')),
  ADD COLUMN target_ref text CHECK (target_ref IS NULL OR length(target_ref) <= 300);

-- L-06: subscription transparency (price, next charge, invoices).
ALTER TABLE ss.subscriptions ADD COLUMN amount_pence integer, ADD COLUMN currency text, ADD COLUMN billing_interval text;
ALTER TABLE ss.payments ADD COLUMN invoice_number text CHECK (length(invoice_number) <= 64),
  ADD COLUMN invoice_url text CHECK (invoice_url IS NULL OR invoice_url ~ '^https://(invoice|pay)\.stripe\.com/[A-Za-z0-9/_?=&%.-]+$'),
  ADD COLUMN period_end timestamptz;
