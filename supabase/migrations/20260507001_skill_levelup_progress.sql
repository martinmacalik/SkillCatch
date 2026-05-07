-- ════════════════════════════════════════════════════════════════
-- LEVEL UP: editor-defined level tiers + user level claims
-- PROGRESS:  editor-defined checklist items + user checks
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- skill_levels
-- One row per tier (e.g. "Beginner", "7a", "Senior Marketer").
-- criteria is a jsonb array: [{ "text": "..." }, ...]
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.skill_levels (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_node_id uuid        NOT NULL REFERENCES public.skill_nodes(id) ON DELETE CASCADE,
  sort_order    integer     NOT NULL DEFAULT 0,
  name          text        NOT NULL,
  description   text,
  criteria      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_by    uuid        REFERENCES auth.users(id),
  updated_by    uuid        REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sl_skill_sort_idx ON public.skill_levels(skill_node_id, sort_order);

ALTER TABLE public.skill_levels ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='skill_levels' AND policyname='sl_read'
  ) THEN
    CREATE POLICY sl_read ON public.skill_levels
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='skill_levels' AND policyname='sl_editor_write'
  ) THEN
    CREATE POLICY sl_editor_write ON public.skill_levels
      FOR ALL TO authenticated
      USING (public.is_editor())
      WITH CHECK (public.is_editor());
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- user_skill_level
-- One row per user per skill — the level they claim to be at.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_skill_level (
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_node_id uuid        NOT NULL REFERENCES public.skill_nodes(id) ON DELETE CASCADE,
  level_id      uuid        NOT NULL REFERENCES public.skill_levels(id) ON DELETE CASCADE,
  claimed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill_node_id)
);

CREATE INDEX IF NOT EXISTS usl_level_idx ON public.user_skill_level(level_id);

ALTER TABLE public.user_skill_level ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_skill_level' AND policyname='usl_self_all'
  ) THEN
    CREATE POLICY usl_self_all ON public.user_skill_level
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- skill_progress_items
-- Editor-managed checklist items for the Progress tab.
-- section groups items visually (e.g. "Climbing Grades", "Gear").
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.skill_progress_items (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_node_id uuid        NOT NULL REFERENCES public.skill_nodes(id) ON DELETE CASCADE,
  section       text        NOT NULL DEFAULT 'General',
  sort_order    integer     NOT NULL DEFAULT 0,
  text          text        NOT NULL,
  created_by    uuid        REFERENCES auth.users(id),
  updated_by    uuid        REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spi_skill_sort_idx ON public.skill_progress_items(skill_node_id, section, sort_order);

ALTER TABLE public.skill_progress_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='skill_progress_items' AND policyname='spi_read'
  ) THEN
    CREATE POLICY spi_read ON public.skill_progress_items
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='skill_progress_items' AND policyname='spi_editor_write'
  ) THEN
    CREATE POLICY spi_editor_write ON public.skill_progress_items
      FOR ALL TO authenticated
      USING (public.is_editor())
      WITH CHECK (public.is_editor());
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- user_progress_checks
-- Personal: which progress items the user has ticked.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_progress_checks (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id    uuid        NOT NULL REFERENCES public.skill_progress_items(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS upc_user_idx ON public.user_progress_checks(user_id);

ALTER TABLE public.user_progress_checks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_progress_checks' AND policyname='upc_self_all'
  ) THEN
    CREATE POLICY upc_self_all ON public.user_progress_checks
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────
-- updated_at triggers (reuse existing tg_set_updated_at)
-- ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='sl_updated_at') THEN
    CREATE TRIGGER sl_updated_at BEFORE UPDATE ON public.skill_levels
      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='spi_updated_at') THEN
    CREATE TRIGGER spi_updated_at BEFORE UPDATE ON public.skill_progress_items
      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END $$;
