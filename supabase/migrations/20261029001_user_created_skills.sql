-- User-created skills + in-app notifications
--
-- A user who can't find their skill can create one. It lands in skill_nodes
-- with status 'pending': the creator sees it (and has it in their profile)
-- right away, everyone else only after an admin approves it in the admin app.
-- A rejected skill stays as history (status 'rejected', hidden from everyone)
-- and the creator gets a notification with the reason, optionally linking the
-- existing skill it duplicates.
--
-- Duplicate prevention:
--   1. search_skill_nodes(): accent/case-insensitive + trigram (typo-tolerant)
--      search, used by the main skill search and the live "similar skills"
--      hint in the create form.
--   2. create_user_skill(): refuses a name that already exists (approved or
--      pending) under the same parent, serialized per parent with an advisory
--      lock so two concurrent requests can't both pass the check.
--   3. Admin review, where rejecting can point at the existing skill.

SET search_path = public, extensions;

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA extensions;

-- ════════════════════════════════════════════════════════════════
-- SKILL_NODES: review columns
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.skill_nodes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS show_creator boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.skill_nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_skill_nodes_pending_created
  ON public.skill_nodes(created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_skill_nodes_created_by
  ON public.skill_nodes(created_by)
  WHERE created_by IS NOT NULL;

-- Normalized name used for comparing skills: "  Kytára " → "kytara".
-- IMMUTABLE so it can back an index (unaccent itself is only STABLE because
-- its dictionary could change; we pin the dictionary explicitly).
CREATE OR REPLACE FUNCTION public.skill_name_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, extensions
AS $$
  SELECT lower(regexp_replace(unaccent('unaccent'::regdictionary, trim(p_name)), '\s+', ' ', 'g'));
$$;

CREATE INDEX IF NOT EXISTS idx_skill_nodes_name_key_trgm
  ON public.skill_nodes USING gin (public.skill_name_key(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_skill_nodes_parent_name_key
  ON public.skill_nodes(parent_id, public.skill_name_key(name));

-- ════════════════════════════════════════════════════════════════
-- SKILL_NODES: RLS — non-approved nodes are visible only to their creator
-- ════════════════════════════════════════════════════════════════
-- The table predates the migrations folder, so we don't know which policies
-- it already has. A permissive "everyone reads" policy plus a RESTRICTIVE
-- visibility filter is correct either way: restrictive policies are ANDed
-- with all permissive ones. Writes have no policies — they go through
-- SECURITY DEFINER functions or the admin-api (service role).

ALTER TABLE public.skill_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skill_nodes_read" ON public.skill_nodes;
CREATE POLICY "skill_nodes_read"
  ON public.skill_nodes
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "skill_nodes_hide_unapproved" ON public.skill_nodes;
CREATE POLICY "skill_nodes_hide_unapproved"
  ON public.skill_nodes
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved' OR (status = 'pending' AND created_by = auth.uid()));

-- ════════════════════════════════════════════════════════════════
-- SEARCH (SECURITY INVOKER → the RLS above applies)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.search_skill_nodes(p_query text, p_limit int DEFAULT 30)
RETURNS SETOF public.skill_nodes
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  WITH q AS (SELECT public.skill_name_key(p_query) AS k)
  SELECT n.*
  FROM public.skill_nodes n, q
  WHERE q.k <> ''
    AND n.status <> 'rejected'
    AND (
      strpos(public.skill_name_key(n.name), q.k) > 0          -- substring
      OR similarity(public.skill_name_key(n.name), q.k) > 0.3  -- typo-tolerant
    )
  ORDER BY
    (public.skill_name_key(n.name) = q.k) DESC,
    similarity(public.skill_name_key(n.name), q.k) DESC,
    n.name
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;

GRANT EXECUTE ON FUNCTION public.search_skill_nodes(text, int) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════
-- CREATE (user-facing RPC)
-- ════════════════════════════════════════════════════════════════
-- Creates a pending leaf skill under an approved category and adds it to the
-- caller's profile. Errors (RAISE EXCEPTION messages the client maps):
--   not_authenticated, invalid_skill_name, invalid_status, invalid_parent,
--   too_many_pending, duplicate_skill (DETAIL = existing node id, visible to
--   the caller), duplicate_pending (someone else's pending suggestion).

CREATE OR REPLACE FUNCTION public.create_user_skill(
  p_name         text,
  p_parent_id    uuid,
  p_show_creator boolean DEFAULT false,
  p_status       text DEFAULT 'watchlist'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_name     text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_parent   record;
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

  SELECT id, path, is_leaf, status INTO v_parent
  FROM public.skill_nodes
  WHERE id = p_parent_id;

  IF NOT FOUND OR v_parent.status <> 'approved' OR v_parent.is_leaf THEN
    RAISE EXCEPTION 'invalid_parent';
  END IF;

  -- Spam guard: a handful of open suggestions per user is plenty
  IF (SELECT count(*) FROM public.skill_nodes
      WHERE created_by = v_uid AND status = 'pending') >= 5 THEN
    RAISE EXCEPTION 'too_many_pending';
  END IF;

  -- Serialize creations under one parent so the duplicate check below can't
  -- race (two users creating "Kytara" in the same second).
  PERFORM pg_advisory_xact_lock(hashtext('skill_nodes_children:' || p_parent_id::text));

  SELECT id, status, created_by INTO v_existing
  FROM public.skill_nodes
  WHERE parent_id = p_parent_id
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
    p_parent_id,
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

REVOKE EXECUTE ON FUNCTION public.create_user_skill(text, uuid, boolean, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_user_skill(text, uuid, boolean, text) TO authenticated;

-- Creator can flip "show me as the creator" on their own skill later
CREATE OR REPLACE FUNCTION public.set_skill_show_creator(p_skill_id uuid, p_show boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.skill_nodes
     SET show_creator = coalesce(p_show, false)
   WHERE id = p_skill_id
     AND created_by = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_creator';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_skill_show_creator(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_skill_show_creator(uuid, boolean) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- NOTIFICATIONS
-- ════════════════════════════════════════════════════════════════
-- Written only by the admin-api (service role). The UI builds the text from
-- `type` + `data`, so wording can change without touching stored rows.
--   skill_approved: { skill_id, skill_name }
--   skill_rejected: { skill_name, reason, duplicate_of_id?, duplicate_of_name? }

CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('skill_approved', 'skill_rejected')),
  data       jsonb NOT NULL DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Marking as read goes through an RPC so users can't rewrite type/data
CREATE OR REPLACE FUNCTION public.mark_notifications_read()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.notifications
     SET read_at = now()
   WHERE user_id = auth.uid()
     AND read_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notifications_read() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read() TO authenticated;

-- Realtime: the bell updates the moment an admin decides
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END $$;
