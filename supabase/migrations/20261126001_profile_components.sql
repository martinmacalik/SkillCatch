-- ════════════════════════════════════════════════════════════════
-- Profile page components (blocks laid out in rows)
--
-- profile_cards becomes a list of blocks placed on a grid of rows:
--   row_index → which row on the page (0, 1, 2 …)
--   col_index → position inside the row (0–2, max 3 blocks per row)
-- New block types: text, image, embed, skill_list, skill_spotlight.
-- Old cards are converted once (text_photo → text + image side by side).
--
-- get_profile_skills(): live skill data for the skill blocks. Levels and
-- time are private (RLS "own rows"), so it runs as SECURITY DEFINER and
-- returns ONLY the skills the owner put into a block, time only for a
-- spotlight with show_time on.
-- Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════════

SET search_path = public;

ALTER TABLE public.profile_cards DROP CONSTRAINT IF EXISTS profile_cards_type_check;

-- ── layout columns + one-time conversion of the old cards ───────
-- Runs only while row_index doesn't exist yet, so a re-run can't reset a layout.
DO $$
DECLARE
  -- public URL → object path inside the profile-media bucket
  v_marker constant text := '/storage/v1/object/public/profile-media/';
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'profile_cards' AND column_name = 'row_index') THEN
    RETURN;
  END IF;

  ALTER TABLE public.profile_cards
    ADD COLUMN row_index int NOT NULL DEFAULT 0,
    ADD COLUMN col_index int NOT NULL DEFAULT 0;

  -- every old card gets its own row, in the old order
  UPDATE public.profile_cards SET row_index = position, col_index = 0;

  -- text_photo → image block next to the text, on the side visitors saw it
  -- (old public page: photo_position 'right' rendered the photo on the LEFT)
  INSERT INTO public.profile_cards (user_id, position, row_index, col_index, type, data, created_at)
  SELECT user_id, position, position,
         CASE WHEN data->>'photo_position' = 'right' THEN 0 ELSE 1 END,
         'image',
         jsonb_build_object('path', split_part(data->>'photo_url', v_marker, 2)),
         created_at
  FROM public.profile_cards
  WHERE type = 'text_photo' AND position(v_marker IN coalesce(data->>'photo_url', '')) > 0;

  UPDATE public.profile_cards
     SET type = 'text',
         col_index = CASE WHEN data->>'photo_position' = 'right'
                           AND position(v_marker IN coalesce(data->>'photo_url', '')) > 0 THEN 1 ELSE 0 END,
         data = jsonb_strip_nulls(jsonb_build_object('heading', data->'heading', 'body', data->'body'))
   WHERE type = 'text_photo';

  UPDATE public.profile_cards
     SET type = 'image',
         data = jsonb_strip_nulls(jsonb_build_object(
                  'path',    nullif(split_part(data->>'url', v_marker, 2), ''),
                  'caption', data->'caption'))
   WHERE type = 'photo';

  UPDATE public.profile_cards SET type = 'skill_list' WHERE type = 'skills';

  -- CV → link block to the uploaded PDF, so nothing disappears
  UPDATE public.profile_cards
     SET type = 'embed',
         data = jsonb_build_object(
                  'kind',  'link',
                  'url',   coalesce(data->>'file_url', ''),
                  'title', coalesce(nullif(data->>'filename', ''), 'CV'))
   WHERE type = 'cv';
END $$;

ALTER TABLE public.profile_cards
  ADD CONSTRAINT profile_cards_type_check
  CHECK (type IN ('text', 'image', 'embed', 'skill_list', 'skill_spotlight'));

ALTER TABLE public.profile_cards DROP CONSTRAINT IF EXISTS profile_cards_layout_check;
ALTER TABLE public.profile_cards
  ADD CONSTRAINT profile_cards_layout_check
  CHECK (row_index >= 0 AND col_index BETWEEN 0 AND 2 AND pg_column_size(data) <= 16384);

CREATE INDEX IF NOT EXISTS profile_cards_user_layout_idx
  ON public.profile_cards (user_id, row_index, col_index);


-- ── RPC: save_profile_layout ────────────────────────────────────
-- The whole layout in one call: [{ "id": uuid, "row": int, "col": int }, …]
-- Atomic, so a drag can't leave half of the blocks moved.
CREATE OR REPLACE FUNCTION public.save_profile_layout(p_layout jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF jsonb_typeof(p_layout) <> 'array' THEN RAISE EXCEPTION 'invalid_layout'; END IF;

  UPDATE public.profile_cards c
     SET row_index = (e->>'row')::int,
         col_index = (e->>'col')::int
    FROM jsonb_array_elements(p_layout) e
   WHERE c.id = (e->>'id')::uuid
     AND c.user_id = v_me;
END;
$$;

REVOKE ALL ON FUNCTION public.save_profile_layout(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_profile_layout(jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.reorder_profile_cards(uuid, uuid[]);


-- ── RPC: get_profile_skills ─────────────────────────────────────
-- Live data for the skills in p_user_id's skill blocks. A skill must be in the
-- owner's user_skills and approved. Queries for level / checklist / attributes
-- are the same as in share_skill(); time = finished time-tracker sessions.
CREATE OR REPLACE FUNCTION public.get_profile_skills(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH blocks AS (
    SELECT type, data FROM public.profile_cards
    WHERE user_id = p_user_id AND type IN ('skill_list', 'skill_spotlight')
  ),
  picked AS (
    SELECT e.id, false AS show_time
    FROM blocks b, jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(b.data->'skill_ids') = 'array' THEN b.data->'skill_ids' ELSE '[]'::jsonb END) AS e(id)
    WHERE b.type = 'skill_list'
    UNION ALL
    SELECT b.data->>'skill_id', coalesce((b.data->>'show_time')::boolean, true)
    FROM blocks b
    WHERE b.type = 'skill_spotlight' AND b.data->>'skill_id' IS NOT NULL
  ),
  wanted AS (
    -- ignore anything that isn't a uuid (data is written by the client)
    SELECT id::uuid AS id, bool_or(show_time) AS show_time
    FROM picked
    WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    GROUP BY id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',        n.id,
    'name',      n.name,
    'image_url', n.image_url,
    'status',    us.status,
    'level', (
      SELECT jsonb_build_object(
               'name',  l.name,
               'rank',  (SELECT count(*) FROM public.skill_levels x
                         WHERE x.skill_node_id = l.skill_node_id AND x.sort_order <= l.sort_order),
               'total', (SELECT count(*) FROM public.skill_levels x
                         WHERE x.skill_node_id = l.skill_node_id))
      FROM public.user_skill_level u
      JOIN public.skill_levels l ON l.id = u.level_id
      WHERE u.user_id = p_user_id AND u.skill_node_id = n.id),
    'progress', (
      SELECT CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_object(
               'done',  count(c.item_id),
               'total', count(*)) END
      FROM public.skill_progress_items i
      LEFT JOIN public.user_progress_checks c ON c.item_id = i.id AND c.user_id = p_user_id
      WHERE i.skill_node_id = n.id),
    'attributes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'label', d.label,
               'unit',  d.unit,
               'value', a.value_json) ORDER BY d.sort_order), '[]'::jsonb)
      FROM public.user_skill_attributes a
      JOIN public.skill_attribute_defs d ON d.id = a.attribute_def_id
      WHERE a.user_id = p_user_id AND a.skill_node_id = n.id),
    'time', CASE WHEN w.show_time THEN (
      SELECT jsonb_build_object(
               'total_seconds',    coalesce(sum(t.duration_seconds), 0),
               'last_30d_seconds', coalesce(sum(t.duration_seconds)
                                     FILTER (WHERE t.started_at >= now() - interval '30 days'), 0))
      FROM public.time_sessions t
      WHERE t.user_id = p_user_id AND t.skill_node_id = n.id AND t.ended_at IS NOT NULL) END,
    'teaches', (
      SELECT jsonb_build_object(
               'level',    ls.level,
               'verified', tl.verification_status = 'verified')
      FROM public.license_skills ls
      JOIN public.teacher_licenses tl ON tl.id = ls.license_id
      WHERE tl.user_id = p_user_id AND ls.skill_node_id = n.id AND ls.status = 'approved'
      LIMIT 1)
  )), '[]'::jsonb)
  FROM wanted w
  JOIN public.user_skills us ON us.user_id = p_user_id AND us.skill_node_id = w.id
  JOIN public.skill_nodes n  ON n.id = w.id AND n.status = 'approved';
$$;

REVOKE ALL ON FUNCTION public.get_profile_skills(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_skills(uuid) TO authenticated;
