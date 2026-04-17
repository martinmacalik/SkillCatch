-- Adds support for 'move' proposal type in approve_restructure_request.
-- A 'move' proposal stores the full tree diff in changes.notes as JSON:
--   [{ id, originalName, suggestedName?, children: [...], newNodes?: [{name, isLeaf, children}] }]
-- This migration walks that tree and applies renames + new-node insertions atomically.

CREATE OR REPLACE FUNCTION _apply_move_new_nodes(p_parent_id uuid, p_nodes jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_node  jsonb;
  v_slug  text;
  v_new_id uuid;
BEGIN
  FOR v_node IN SELECT value FROM jsonb_array_elements(p_nodes) LOOP
    v_slug := lower(regexp_replace(v_node->>'name', '[^a-zA-Z0-9]+', '_', 'g'));

    INSERT INTO skill_nodes (name, slug, parent_id, is_leaf)
    VALUES (
      v_node->>'name',
      v_slug,
      p_parent_id,
      (v_node->>'isLeaf')::boolean
    )
    RETURNING id INTO v_new_id;

    IF jsonb_array_length(COALESCE(v_node->'children', '[]'::jsonb)) > 0 THEN
      PERFORM _apply_move_new_nodes(v_new_id, v_node->'children');
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION _apply_move_tree(p_nodes jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_node    jsonb;
  v_node_id uuid;
BEGIN
  FOR v_node IN SELECT value FROM jsonb_array_elements(p_nodes) LOOP
    v_node_id := (v_node->>'id')::uuid;

    IF (v_node->>'suggestedName') IS NOT NULL
       AND (v_node->>'suggestedName') IS DISTINCT FROM (v_node->>'originalName') THEN
      UPDATE skill_nodes
      SET name = v_node->>'suggestedName'
      WHERE id = v_node_id;
    END IF;

    IF jsonb_array_length(COALESCE(v_node->'newNodes', '[]'::jsonb)) > 0 THEN
      PERFORM _apply_move_new_nodes(v_node_id, v_node->'newNodes');
    END IF;

    IF jsonb_array_length(COALESCE(v_node->'children', '[]'::jsonb)) > 0 THEN
      PERFORM _apply_move_tree(v_node->'children');
    END IF;
  END LOOP;
END;
$$;

-- Supports proposal types: 'rename', 'reparent', 'add_child', 'move'
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
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = p_actor_user_id) THEN
    RAISE EXCEPTION 'insufficient_privileges' USING HINT = 'Actor must be a registered admin';
  END IF;

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

  IF v_proposal_type = 'rename' THEN
    IF (v_request.proposal->'changes'->>'new_name') IS NULL THEN
      RAISE EXCEPTION 'invalid_proposal_data' USING HINT = 'new_name is required for rename';
    END IF;
    UPDATE skill_nodes
    SET name = v_request.proposal->'changes'->>'new_name'
    WHERE id = v_request.target_node_id;

  ELSIF v_proposal_type = 'reparent' THEN
    UPDATE skill_nodes
    SET parent_id = (
      v_request.proposal->'changes'->'new_parent_ids'->0
    )::text::uuid
    WHERE id = v_request.target_node_id;
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

  ELSIF v_proposal_type = 'move' THEN
    DECLARE
      v_notes_raw text;
      v_tree      jsonb;
    BEGIN
      v_notes_raw := v_request.proposal->'changes'->>'notes';
      IF v_notes_raw IS NULL THEN
        RAISE EXCEPTION 'invalid_proposal_data' USING HINT = 'notes is required for move';
      END IF;
      v_tree := v_notes_raw::jsonb;
      PERFORM _apply_move_tree(v_tree);
    END;

  ELSE
    RAISE EXCEPTION 'unsupported_proposal_type' USING HINT = v_proposal_type;
  END IF;

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

  UPDATE node_restructure_requests
  SET
    status      = 'approved',
    reviewed_by = p_actor_user_id,
    reviewed_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'request_id', p_request_id);
END;
$$;
