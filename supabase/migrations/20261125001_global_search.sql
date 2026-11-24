-- ════════════════════════════════════════════════════════════════
-- Global search (TopBar, ⌘K)
--
-- One call returns the top matches + total count per category:
--   my_skills   skills on my profile          (recently opened first)
--   new_skills  skills I don't have yet
--   people      other users
--   teachers    approved license skills matching the query (one row per teacher + skill)
-- Chats, pages, actions, settings and help are searched in the browser.
--
-- SECURITY INVOKER: RLS still applies (hidden / pending skills, rejected
-- license skills, profiles…), the function only saves round trips.
-- Matching: skill_name_key() (lower case, no accents) contains the query;
-- from 3 characters also trigram similarity, so small typos still match.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.global_search(
  p_query text,
  p_limit integer DEFAULT 4,
  p_only  text    DEFAULT NULL   -- one category only (when the user drills into it)
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_q      text := public.skill_name_key(coalesce(p_query, ''));
  v_esc    text;
  v_any    text;   -- LIKE pattern: contains
  v_prefix text;   -- LIKE pattern: starts with
  v_fuzzy  boolean;
  v_lim    integer := least(greatest(coalesce(p_limit, 4), 1), 50);
  r        jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_q = '' OR char_length(v_q) > 100 THEN RETURN r; END IF;
  IF p_only IS NOT NULL AND p_only NOT IN ('my_skills', 'new_skills', 'people', 'teachers') THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;

  -- the query is data, not a pattern: escape LIKE wildcards
  v_esc    := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  v_any    := '%' || v_esc || '%';
  v_prefix := v_esc || '%';
  v_fuzzy  := char_length(v_q) >= 3;

  -- ── my skills ──
  IF p_only IS NULL OR p_only = 'my_skills' THEN
    r := r || jsonb_build_object('my_skills', (
      SELECT jsonb_build_object(
               'count', coalesce(max(total), 0),
               'items', coalesce(jsonb_agg(item ORDER BY rn) FILTER (WHERE rn <= v_lim), '[]'::jsonb))
      FROM (
        SELECT jsonb_build_object('id', n.id, 'name', n.name, 'image_url', n.image_url,
                                  'status', us.status, 'pinned', us.pinned) AS item,
               count(*) OVER () AS total,
               row_number() OVER (ORDER BY
                 (k.key LIKE v_prefix) DESC,
                 us.pinned DESC,
                 us.last_opened_at DESC NULLS LAST,
                 similarity(k.key, v_q) DESC,
                 n.name) AS rn
        FROM user_skills us
        JOIN skill_nodes n ON n.id = us.skill_node_id
        CROSS JOIN LATERAL (SELECT public.skill_name_key(n.name) AS key) k
        WHERE us.user_id = v_uid
          AND (k.key LIKE v_any OR (v_fuzzy AND similarity(k.key, v_q) > 0.3))
      ) x
    ));
  END IF;

  -- ── new skills (not on my profile) ──
  IF p_only IS NULL OR p_only = 'new_skills' THEN
    r := r || jsonb_build_object('new_skills', (
      SELECT jsonb_build_object(
               'count', coalesce(max(total), 0),
               'items', coalesce(jsonb_agg(item ORDER BY rn) FILTER (WHERE rn <= v_lim), '[]'::jsonb))
      FROM (
        SELECT jsonb_build_object('id', n.id, 'name', n.name, 'image_url', n.image_url,
                                  'parent_name', parent.name) AS item,
               count(*) OVER () AS total,
               row_number() OVER (ORDER BY
                 (k.key = v_q) DESC,
                 (k.key LIKE v_prefix) DESC,
                 similarity(k.key, v_q) DESC,
                 n.name) AS rn
        FROM skill_nodes n
        LEFT JOIN skill_nodes parent ON parent.id = n.parent_id
        CROSS JOIN LATERAL (SELECT public.skill_name_key(n.name) AS key) k
        WHERE n.status <> 'rejected'
          AND NOT EXISTS (SELECT 1 FROM user_skills us WHERE us.user_id = v_uid AND us.skill_node_id = n.id)
          AND (k.key LIKE v_any OR (v_fuzzy AND similarity(k.key, v_q) > 0.3))
      ) x
    ));
  END IF;

  -- ── people ──
  IF p_only IS NULL OR p_only = 'people' THEN
    r := r || jsonb_build_object('people', (
      SELECT jsonb_build_object(
               'count', coalesce(max(total), 0),
               'items', coalesce(jsonb_agg(item ORDER BY rn) FILTER (WHERE rn <= v_lim), '[]'::jsonb))
      FROM (
        SELECT jsonb_build_object('id', pr.id, 'name', k.display, 'username', pr.username,
                                  'avatar_url', pr.avatar_url) AS item,
               count(*) OVER () AS total,
               row_number() OVER (ORDER BY
                 (k.key LIKE v_prefix OR k.ukey LIKE v_prefix) DESC,
                 similarity(k.key, v_q) DESC,
                 k.display) AS rn
        FROM profiles pr
        CROSS JOIN LATERAL (
          SELECT coalesce(nullif(trim(concat_ws(' ', pr.first_name, pr.last_name)), ''), pr.username, 'User') AS display,
                 public.skill_name_key(concat_ws(' ', pr.first_name, pr.last_name)) AS key,
                 public.skill_name_key(coalesce(pr.username, '')) AS ukey
        ) k
        WHERE pr.id <> v_uid
          AND (k.key LIKE v_any OR k.ukey LIKE v_any OR (v_fuzzy AND similarity(k.key, v_q) > 0.3))
      ) x
    ));
  END IF;

  -- ── teachers of matching skills ──
  IF p_only IS NULL OR p_only = 'teachers' THEN
    r := r || jsonb_build_object('teachers', (
      SELECT jsonb_build_object(
               'count', coalesce(max(total), 0),
               'items', coalesce(jsonb_agg(item ORDER BY rn) FILTER (WHERE rn <= v_lim), '[]'::jsonb))
      FROM (
        SELECT jsonb_build_object('user_id', tl.user_id,
                                  'name', coalesce(nullif(trim(concat_ws(' ', pr.first_name, pr.last_name)), ''), pr.username, 'Teacher'),
                                  'avatar_url', pr.avatar_url,
                                  'skill_id', n.id, 'skill_name', n.name, 'level', ls.level) AS item,
               count(*) OVER () AS total,
               row_number() OVER (ORDER BY
                 (k.key LIKE v_prefix) DESC,
                 similarity(k.key, v_q) DESC,
                 n.name) AS rn
        FROM license_skills ls
        JOIN teacher_licenses tl ON tl.id = ls.license_id
        JOIN skill_nodes n       ON n.id = ls.skill_node_id
        JOIN profiles pr         ON pr.id = tl.user_id
        CROSS JOIN LATERAL (SELECT public.skill_name_key(n.name) AS key) k
        WHERE ls.status = 'approved'
          AND tl.user_id <> v_uid
          AND (k.key LIKE v_any OR (v_fuzzy AND similarity(k.key, v_q) > 0.3))
      ) x
    ));
  END IF;

  RETURN r;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.global_search(text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.global_search(text, integer, text) TO authenticated;
