-- ════════════════════════════════════════════════════════════════
-- LEARN: global per-skill content + personal user state
-- ════════════════════════════════════════════════════════════════

-- Roles: simple table-based role model. One row per granted role.
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('admin','editor')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND policyname='roles_self_read'
  ) THEN
    CREATE POLICY roles_self_read ON public.user_roles
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- SECURITY DEFINER helper: callable from any RLS policy.
-- STABLE so Postgres caches the result within a query.
CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','editor')
  );
$$;

REVOKE ALL ON FUNCTION public.is_editor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_editor() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- GLOBAL CONTENT
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.skill_learning_pages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_node_id uuid NOT NULL UNIQUE REFERENCES public.skill_nodes(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_by    uuid REFERENCES auth.users(id),
  updated_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS slp_skill_node_idx ON public.skill_learning_pages(skill_node_id);

CREATE TABLE IF NOT EXISTS public.skill_learning_blocks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    uuid NOT NULL REFERENCES public.skill_learning_pages(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('heading','text','callout','resource_list','flashcards','checklist')),
  content    jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS slb_page_sort_idx ON public.skill_learning_blocks(page_id, sort_order);

ALTER TABLE public.skill_learning_pages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_learning_blocks ENABLE ROW LEVEL SECURITY;

-- Pages: published readable by all authenticated; draft only editors.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='skill_learning_pages' AND policyname='slp_read'
  ) THEN
    CREATE POLICY slp_read ON public.skill_learning_pages
      FOR SELECT TO authenticated
      USING (status = 'published' OR public.is_editor());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='skill_learning_pages' AND policyname='slp_editor_write'
  ) THEN
    CREATE POLICY slp_editor_write ON public.skill_learning_pages
      FOR ALL TO authenticated
      USING (public.is_editor())
      WITH CHECK (public.is_editor());
  END IF;
END $$;

-- Blocks: readable iff their parent page is readable.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='skill_learning_blocks' AND policyname='slb_read'
  ) THEN
    CREATE POLICY slb_read ON public.skill_learning_blocks
      FOR SELECT TO authenticated
      USING (
        public.is_editor()
        OR EXISTS (
          SELECT 1 FROM public.skill_learning_pages p
          WHERE p.id = page_id AND p.status = 'published'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='skill_learning_blocks' AND policyname='slb_editor_write'
  ) THEN
    CREATE POLICY slb_editor_write ON public.skill_learning_blocks
      FOR ALL TO authenticated
      USING (public.is_editor())
      WITH CHECK (public.is_editor());
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- PERSONAL STATE
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_learning_skills (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_node_id    uuid NOT NULL REFERENCES public.skill_nodes(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'learning' CHECK (status IN ('learning','paused','completed')),
  progress_percent smallint NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill_node_id)
);

CREATE TABLE IF NOT EXISTS public.user_skill_notes (
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_node_id uuid NOT NULL REFERENCES public.skill_nodes(id) ON DELETE CASCADE,
  content       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill_node_id)
);

ALTER TABLE public.user_learning_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skill_notes     ENABLE ROW LEVEL SECURITY;

-- One policy each, full CRUD scoped by auth.uid(). Never trust user_id from the client.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_learning_skills' AND policyname='uls_self_all'
  ) THEN
    CREATE POLICY uls_self_all ON public.user_learning_skills
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_skill_notes' AND policyname='usn_self_all'
  ) THEN
    CREATE POLICY usn_self_all ON public.user_skill_notes
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- TIMESTAMP TRIGGER (one trigger function, reused on every table)
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='slp_updated_at') THEN
    CREATE TRIGGER slp_updated_at BEFORE UPDATE ON public.skill_learning_pages
      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='slb_updated_at') THEN
    CREATE TRIGGER slb_updated_at BEFORE UPDATE ON public.skill_learning_blocks
      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='uls_updated_at') THEN
    CREATE TRIGGER uls_updated_at BEFORE UPDATE ON public.user_learning_skills
      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='usn_updated_at') THEN
    CREATE TRIGGER usn_updated_at BEFORE UPDATE ON public.user_skill_notes
      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
-- REORDER RPC (atomic, server-validated)
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reorder_learning_blocks(p_page_id uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_i int;
BEGIN
  IF NOT public.is_editor() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  FOR v_i IN 1..array_length(p_ids, 1) LOOP
    UPDATE public.skill_learning_blocks
       SET sort_order = v_i
     WHERE id = p_ids[v_i] AND page_id = p_page_id;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.reorder_learning_blocks(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_learning_blocks(uuid, uuid[]) TO authenticated;
