-- admin_users: maps auth users to admin roles
-- user_id is PK (one row per user, role cannot be duplicated)
-- No user-facing RLS policies — backend reads this via service role only

CREATE TABLE IF NOT EXISTS admin_users (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('developer', 'moderator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: all access through service role in backend
