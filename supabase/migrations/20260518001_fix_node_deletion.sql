-- Fix: _apply_move_tree deletion used ltree `path <@` to collect the subtree,
-- but path is not reliably maintained (reparent only updates parent_id, not path,
-- and some inserts never set path). A stale or NULL path makes the DELETE a
-- silent no-op while the request still gets marked approved.
--
-- Fix: collect the subtree via a recursive CTE over parent_id instead.
-- parent_id is the FK that the app actually uses for tree navigation and is
-- always correct regardless of ltree path maintenance.

CREATE OR REPLACE FUNCTION _apply_move_tree(p_nodes jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_len         int;
  v_i           int;
  v_node        jsonb;
  v_node_id     uuid;
  v_subtree_ids uuid[];
BEGIN
  v_len := jsonb_array_length(p_nodes);
  FOR v_i IN 0..(v_len - 1) LOOP
    v_node    := p_nodes->v_i;
    v_node_id := (v_node->>'id')::uuid;

    IF (v_node->>'deleted') = 'true' THEN
      -- Collect the full subtree via parent_id recursion (reliable; path may be stale/null)
      SELECT array_agg(id) INTO v_subtree_ids
      FROM (
        WITH RECURSIVE d AS (
          SELECT id FROM skill_nodes WHERE id = v_node_id
          UNION ALL
          SELECT sn.id FROM skill_nodes sn JOIN d ON sn.parent_id = d.id
        )
        SELECT id FROM d
      ) sub;

      IF v_subtree_ids IS NOT NULL THEN
        DELETE FROM user_skill_attributes  WHERE skill_node_id = ANY(v_subtree_ids);
        DELETE FROM user_skills            WHERE skill_node_id = ANY(v_subtree_ids);
        DELETE FROM teaching_offers        WHERE skill_node_id = ANY(v_subtree_ids);
        DELETE FROM skill_resources        WHERE skill_node_id = ANY(v_subtree_ids);
        DELETE FROM skill_stats            WHERE skill_node_id = ANY(v_subtree_ids);
        DELETE FROM skill_attribute_defs   WHERE skill_node_id = ANY(v_subtree_ids);
        DELETE FROM skill_node_parents
          WHERE child_node_id  = ANY(v_subtree_ids)
             OR parent_node_id = ANY(v_subtree_ids);
        -- Cascade-enabled tables (skill_learning_pages, user_skill_notes,
        -- skill_levels, skill_progress_items, skill_learning_suggestions) are
        -- handled automatically by ON DELETE CASCADE.
        DELETE FROM skill_nodes WHERE id = ANY(v_subtree_ids);
      END IF;
      CONTINUE;
    END IF;

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
