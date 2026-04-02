-- support_messages: contact/support inbox
-- Authenticated users INSERT directly via RLS (sender_user_id = auth.uid())
-- Anonymous submissions go through the backend service role (deferred feature)

CREATE TABLE IF NOT EXISTS support_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email            text,
  subject          text NOT NULL,
  body             text NOT NULL,
  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'closed')),
  handled_by       uuid REFERENCES auth.users(id),
  handled_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT has_sender_or_email
    CHECK (sender_user_id IS NOT NULL OR email IS NOT NULL)
);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Authenticated users may insert their own messages
CREATE POLICY "authenticated_users_insert_messages"
  ON support_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (sender_user_id = auth.uid());

-- Authenticated users may read only their own messages
CREATE POLICY "authenticated_users_select_own_messages"
  ON support_messages
  FOR SELECT
  TO authenticated
  USING (sender_user_id = auth.uid());
