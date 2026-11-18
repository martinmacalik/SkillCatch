-- Automatic activity tracking (dashboard Learning Tracker)
--
-- The web app counts, without any start/stop button:
--   - how long the user is in the app today (any page, tab visible),
--   - how long they spend on each skill's learn page today.
-- The client sends small deltas every ~30 s through log_activity(), which adds
-- them to per-day rows. A day with 10+ minutes in the app counts toward the
-- streak (replaces the login-based streak from user_login_days).
--
-- `day` is the user's LOCAL calendar date, sent by the client, so "today"
-- matches what the user sees. The function only accepts dates within one day
-- of the server's date (covers every timezone) and caps each delta, so the
-- totals can't be inflated from the browser console. There are no write
-- policies: writes go only through log_activity().

SET search_path = public;

-- ════════════════════════════════════════════════════════════════
-- TABLES
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_daily_activity (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day         date NOT NULL,
  app_seconds integer NOT NULL DEFAULT 0 CHECK (app_seconds >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS public.user_skill_daily_time (
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_node_id uuid NOT NULL REFERENCES public.skill_nodes(id) ON DELETE CASCADE,
  day           date NOT NULL,
  seconds       integer NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, skill_node_id)
);

-- FK lookups when a skill node is deleted (cascade)
CREATE INDEX IF NOT EXISTS idx_user_skill_daily_time_skill
  ON public.user_skill_daily_time(skill_node_id);

-- ════════════════════════════════════════════════════════════════
-- RLS: read own rows, no direct writes
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.user_daily_activity   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skill_daily_time ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_daily_activity: read own" ON public.user_daily_activity;
CREATE POLICY "user_daily_activity: read own" ON public.user_daily_activity
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_skill_daily_time: read own" ON public.user_skill_daily_time;
CREATE POLICY "user_skill_daily_time: read own" ON public.user_skill_daily_time
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ════════════════════════════════════════════════════════════════
-- RPC: log_activity
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_activity(
  p_day            date,
  p_app_seconds    integer,
  p_skill_node_id  uuid    DEFAULT NULL,
  p_skill_seconds  integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_app   integer := LEAST(GREATEST(COALESCE(p_app_seconds, 0), 0), 300);
  v_skill integer := LEAST(GREATEST(COALESCE(p_skill_seconds, 0), 0), 300);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_day IS NULL OR p_day NOT BETWEEN current_date - 1 AND current_date + 1 THEN
    RAISE EXCEPTION 'day out of range';
  END IF;

  IF v_app > 0 THEN
    INSERT INTO public.user_daily_activity AS a (user_id, day, app_seconds)
    VALUES (v_uid, p_day, v_app)
    ON CONFLICT (user_id, day) DO UPDATE
      SET app_seconds = a.app_seconds + EXCLUDED.app_seconds,
          updated_at  = now();
  END IF;

  IF p_skill_node_id IS NOT NULL AND v_skill > 0 THEN
    INSERT INTO public.user_skill_daily_time AS s (user_id, skill_node_id, day, seconds)
    VALUES (v_uid, p_skill_node_id, p_day, v_skill)
    ON CONFLICT (user_id, day, skill_node_id) DO UPDATE
      SET seconds    = s.seconds + EXCLUDED.seconds,
          updated_at = now();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.log_activity(date, integer, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_activity(date, integer, uuid, integer) TO authenticated;
