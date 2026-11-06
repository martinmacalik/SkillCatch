-- create_user_skill: optionally suggest a new category together with the skill.
-- With p_new_category set, p_parent_id is where the new category goes
-- (NULL = top level) and the skill is created inside it. The category is
-- 'pending' like the skill; the admin API approves / rejects it along with
-- its skill. If a category with that name already exists there, it is reused.
-- New error: invalid_category (bad name, or the name belongs to a skill).

DROP FUNCTION IF EXISTS public.create_user_skill(text, uuid, boolean, text);

CREATE OR REPLACE FUNCTION public.create_user_skill(
  p_name         text,
  p_parent_id    uuid,
  p_show_creator boolean DEFAULT false,
  p_status       text DEFAULT 'watchlist',
  p_new_category text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_name     text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_category text := regexp_replace(trim(coalesce(p_new_category, '')), '\s+', ' ', 'g');
  v_parent   record;
  v_parent_id uuid := p_parent_id;
  v_existing record;
  v_slug     text;
  v_id       uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF char_length(v_name) < 2 OR char_length(v_name) > 60 THEN
    RAISE EXCEPTION 'invalid_skill_name';
  END IF;

  IF p_status NOT IN ('watchlist', 'learning', 'learned', 'dormant') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  IF p_new_category IS NOT NULL AND (char_length(v_category) < 2 OR char_length(v_category) > 60) THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;

  -- Spam guard: a handful of open skill suggestions per user is plenty
  IF (SELECT count(*) FROM public.skill_nodes
      WHERE created_by = v_uid AND status = 'pending' AND is_leaf) >= 5 THEN
    RAISE EXCEPTION 'too_many_pending';
  END IF;

  -- ── optional new category ──
  IF p_new_category IS NOT NULL THEN
    IF p_parent_id IS NOT NULL THEN
      SELECT id, path, is_leaf, status INTO v_parent FROM public.skill_nodes WHERE id = p_parent_id;
      IF NOT FOUND OR v_parent.status <> 'approved' OR v_parent.is_leaf THEN
        RAISE EXCEPTION 'invalid_parent';
      END IF;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('skill_nodes_children:' || coalesce(p_parent_id::text, 'root')));

    SELECT id, is_leaf INTO v_existing
    FROM public.skill_nodes
    WHERE parent_id IS NOT DISTINCT FROM p_parent_id
      AND status <> 'rejected'
      AND public.skill_name_key(name) = public.skill_name_key(v_category)
    LIMIT 1;

    IF FOUND THEN
      IF v_existing.is_leaf THEN
        RAISE EXCEPTION 'invalid_category';
      END IF;
      v_parent_id := v_existing.id; -- already there (maybe someone's pending one) → reuse
    ELSE
      v_slug := trim(BOTH '_' FROM lower(regexp_replace(unaccent('unaccent'::regdictionary, v_category), '[^a-zA-Z0-9]+', '_', 'g')));
      IF v_slug = '' THEN
        v_slug := 'category';
      END IF;

      INSERT INTO public.skill_nodes (name, slug, parent_id, path, is_leaf, status, created_by)
      VALUES (
        v_category,
        v_slug,
        p_parent_id,
        CASE WHEN p_parent_id IS NULL OR v_parent.path IS NULL THEN v_slug::ltree ELSE v_parent.path || v_slug::ltree END,
        false,
        'pending',
        v_uid
      )
      RETURNING id INTO v_parent_id;
    END IF;
  END IF;

  -- ── the skill ──
  SELECT id, path, is_leaf, status INTO v_parent
  FROM public.skill_nodes
  WHERE id = v_parent_id;

  -- a pending parent is only allowed when it's a suggested category
  IF NOT FOUND OR v_parent.is_leaf
     OR (v_parent.status <> 'approved' AND (p_new_category IS NULL OR v_parent.status <> 'pending')) THEN
    RAISE EXCEPTION 'invalid_parent';
  END IF;

  -- Serialize creations under one parent so the duplicate check below can't
  -- race (two users creating "Kytara" in the same second).
  PERFORM pg_advisory_xact_lock(hashtext('skill_nodes_children:' || v_parent_id::text));

  SELECT id, status, created_by INTO v_existing
  FROM public.skill_nodes
  WHERE parent_id = v_parent_id
    AND status <> 'rejected'
    AND public.skill_name_key(name) = public.skill_name_key(v_name)
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.status = 'pending' AND v_existing.created_by IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'duplicate_pending';
    END IF;
    RAISE EXCEPTION 'duplicate_skill' USING DETAIL = v_existing.id::text;
  END IF;

  -- ltree labels allow only [A-Za-z0-9_]
  v_slug := trim(BOTH '_' FROM lower(regexp_replace(unaccent('unaccent'::regdictionary, v_name), '[^a-zA-Z0-9]+', '_', 'g')));
  IF v_slug = '' THEN
    v_slug := 'skill';
  END IF;

  INSERT INTO public.skill_nodes (name, slug, parent_id, path, is_leaf, status, created_by, show_creator)
  VALUES (
    v_name,
    v_slug,
    v_parent_id,
    CASE WHEN v_parent.path IS NULL THEN v_slug::ltree ELSE v_parent.path || v_slug::ltree END,
    true,
    'pending',
    v_uid,
    coalesce(p_show_creator, false)
  )
  RETURNING id INTO v_id;

  INSERT INTO public.user_skills (user_id, skill_node_id, status)
  VALUES (v_uid, v_id, p_status);

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_user_skill(text, uuid, boolean, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_user_skill(text, uuid, boolean, text, text) TO authenticated;
