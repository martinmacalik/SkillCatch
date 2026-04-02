-- Indexes
CREATE INDEX IF NOT EXISTS idx_restructure_requests_requester
  ON node_restructure_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_restructure_requests_status
  ON node_restructure_requests(status);
CREATE INDEX IF NOT EXISTS idx_restructure_requests_created_at
  ON node_restructure_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_messages_sender
  ON support_messages(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_status
  ON support_messages(status);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON admin_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type
  ON admin_audit_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON admin_audit_log(created_at DESC);

-- Approval RPC: atomically applies tree changes, writes audit log, marks request approved
-- Called by admin-api with service role after validating proposal shape
-- Supports proposal types: 'rename', 'reparent', 'add_child'
CREATE OR REPLACE FUNCTION approve_restructure_request(
  p_request_id     uuid,
  p_actor_user_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request record;
  v_proposal_type text;
BEGIN
  -- Lock the row to prevent concurrent approvals
  SELECT * INTO v_request
  FROM node_restructure_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING HINT = p_request_id::text;
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'request_not_pending' USING HINT = v_request.status;
  END IF;

  v_proposal_type := v_request.proposal->>'type';

  -- Apply tree changes based on proposal type
  IF v_proposal_type = 'rename' THEN
    UPDATE skill_nodes
    SET name = v_request.proposal->'changes'->>'new_name'
    WHERE id = v_request.target_node_id;

  ELSIF v_proposal_type = 'reparent' THEN
    -- Update primary parent_id on skill_nodes
    UPDATE skill_nodes
    SET parent_id = (
      v_request.proposal->'changes'->'new_parent_ids'->0
    )::text::uuid
    WHERE id = v_request.target_node_id;
    -- Replace multi-parent records
    DELETE FROM skill_node_parents
    WHERE child_node_id = v_request.target_node_id;
    INSERT INTO skill_node_parents (child_node_id, parent_node_id)
    SELECT
      v_request.target_node_id,
      jsonb_array_elements_text(
        v_request.proposal->'changes'->'new_parent_ids'
      )::uuid;

  ELSIF v_proposal_type = 'add_child' THEN
    INSERT INTO skill_nodes (name, slug, parent_id, is_leaf)
    VALUES (
      v_request.proposal->'changes'->'child_node'->>'name',
      v_request.proposal->'changes'->'child_node'->>'slug',
      v_request.target_node_id,
      (v_request.proposal->'changes'->'child_node'->>'is_leaf')::boolean
    );

  ELSE
    RAISE EXCEPTION 'unsupported_proposal_type' USING HINT = v_proposal_type;
  END IF;

  -- Write audit log entry
  INSERT INTO admin_audit_log (
    actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    p_actor_user_id,
    'approve_restructure_request',
    'node_restructure_request',
    p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'approved', 'proposal', v_request.proposal)
  );

  -- Mark request approved
  UPDATE node_restructure_requests
  SET
    status      = 'approved',
    reviewed_by = p_actor_user_id,
    reviewed_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'request_id', p_request_id);
END;
$$;
