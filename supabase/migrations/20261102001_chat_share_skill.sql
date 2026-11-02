-- Chat: share a skill with my progress
--
-- A 'skill' message is a card: the skill + the sender's status, level,
-- progress checklist and attribute values. Those live in tables only their
-- owner can read (RLS), so the other members couldn't load them live.
-- → share_skill() reads them as the sender and stores a snapshot in
--   messages.metadata. The card shows the progress at the time of sharing.
--
-- The client can't write metadata (no column grant), so a snapshot can't be
-- faked; sharing goes through the RPC only.

-- ════════════════════════════════════════════════════════════════
-- MESSAGES: 'skill' carries its snapshot in metadata
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_content_by_type;
ALTER TABLE public.messages ADD CONSTRAINT messages_content_by_type CHECK (
  deleted_at IS NOT NULL
  OR (type = 'text'   AND body IS NOT NULL AND char_length(btrim(body)) > 0
                      AND image_path IS NULL AND skill_node_id IS NULL AND metadata IS NULL)
  OR (type = 'image'  AND image_path IS NOT NULL
                      AND skill_node_id IS NULL AND metadata IS NULL)
  OR (type = 'skill'  AND image_path IS NULL AND metadata IS NOT NULL)
  OR (type = 'system' AND metadata IS NOT NULL
                      AND body IS NULL AND image_path IS NULL AND skill_node_id IS NULL)
);

-- ════════════════════════════════════════════════════════════════
-- RPC: share_skill
-- ════════════════════════════════════════════════════════════════
-- Only a skill I have in my profile, and only an approved one (a pending
-- skill is hidden from everyone else, so they couldn't add it).
-- Membership is checked here (SECURITY DEFINER skips the insert policy);
-- blocks are checked by tg_messages_before_insert.

CREATE OR REPLACE FUNCTION public.share_skill(p_conversation_id uuid, p_skill_node_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       uuid := auth.uid();
  v_node     public.skill_nodes;
  v_status   text;
  v_level    jsonb;
  v_progress jsonb;
  v_attrs    jsonb;
  v_id       uuid;
BEGIN
  IF NOT public.is_conversation_member(p_conversation_id) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  SELECT * INTO v_node FROM public.skill_nodes WHERE id = p_skill_node_id;
  IF NOT FOUND OR v_node.status <> 'approved' THEN
    RAISE EXCEPTION 'skill_not_shareable';
  END IF;

  SELECT status INTO v_status
  FROM public.user_skills
  WHERE user_id = v_me AND skill_node_id = p_skill_node_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'skill_not_in_profile';
  END IF;

  -- claimed level: its name + position, e.g. 2 of 5
  SELECT jsonb_build_object(
           'name',  l.name,
           'rank',  (SELECT count(*) FROM public.skill_levels x
                     WHERE x.skill_node_id = l.skill_node_id AND x.sort_order <= l.sort_order),
           'total', (SELECT count(*) FROM public.skill_levels x
                     WHERE x.skill_node_id = l.skill_node_id))
    INTO v_level
  FROM public.user_skill_level u
  JOIN public.skill_levels l ON l.id = u.level_id
  WHERE u.user_id = v_me AND u.skill_node_id = p_skill_node_id;

  -- checklist: checked / all items (null if the skill has no checklist)
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_object(
           'done',  count(c.item_id),
           'total', count(*)) END
    INTO v_progress
  FROM public.skill_progress_items i
  LEFT JOIN public.user_progress_checks c ON c.item_id = i.id AND c.user_id = v_me
  WHERE i.skill_node_id = p_skill_node_id;

  -- my attribute values with their labels, in the skill's order
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'label', d.label,
           'unit',  d.unit,
           'value', a.value_json) ORDER BY d.sort_order), '[]'::jsonb)
    INTO v_attrs
  FROM public.user_skill_attributes a
  JOIN public.skill_attribute_defs d ON d.id = a.attribute_def_id
  WHERE a.user_id = v_me AND a.skill_node_id = p_skill_node_id;

  INSERT INTO public.messages (conversation_id, sender_id, type, skill_node_id, metadata)
  VALUES (
    p_conversation_id,
    v_me,
    'skill',
    p_skill_node_id,
    jsonb_build_object(
      'name',       v_node.name,
      'image_url',  v_node.image_url,
      'status',     v_status,
      'level',      v_level,
      'progress',   v_progress,
      'attributes', v_attrs)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.share_skill(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_skill(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- delete_message: a deleted skill card drops its snapshot too
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delete_message(p_message_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_image_path text;
BEGIN
  SELECT image_path INTO v_image_path
  FROM public.messages
  WHERE id = p_message_id
    AND sender_id = auth.uid()
    AND type <> 'system'
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found_or_not_yours';
  END IF;

  UPDATE public.messages
     SET deleted_at    = now(),
         body          = NULL,
         image_path    = NULL,
         skill_node_id = NULL,
         metadata      = NULL
   WHERE id = p_message_id;

  RETURN v_image_path;
END;
$$;
