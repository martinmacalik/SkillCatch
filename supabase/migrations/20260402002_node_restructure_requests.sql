-- node_restructure_requests: user-submitted proposals to restructure the skill tree
-- Users INSERT their own rows via RLS; all approvals/denials go through the backend

CREATE TABLE IF NOT EXISTS node_restructure_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_node_id     uuid REFERENCES skill_nodes(id) ON DELETE SET NULL,
  proposal           jsonb NOT NULL DEFAULT '{}',
  proposal_version   integer NOT NULL DEFAULT 1,
  message            text,
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by        uuid REFERENCES auth.users(id),
  reviewed_at        timestamptz,
  denial_reason      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE node_restructure_requests ENABLE ROW LEVEL SECURITY;

-- Authenticated users may insert their own requests
CREATE POLICY "users_insert_own_requests"
  ON node_restructure_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (requester_user_id = auth.uid());

-- Authenticated users may read only their own requests
CREATE POLICY "users_select_own_requests"
  ON node_restructure_requests
  FOR SELECT
  TO authenticated
  USING (requester_user_id = auth.uid());
