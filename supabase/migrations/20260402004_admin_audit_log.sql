-- admin_audit_log: append-only record of admin actions
-- No user-facing policies — backend reads/writes via service role only
-- Application code must never UPDATE or DELETE rows in this table

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid,
  before_data   jsonb,
  after_data    jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: all access through service role in backend
