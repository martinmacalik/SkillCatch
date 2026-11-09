-- Time Tracker
-- A stopwatch tied to one of the user's skills. Each run is a row in time_sessions.
-- Clients can only read their own rows; every write goes through the timer_* RPCs
-- below (security definer, always auth.uid(), never a user id from a parameter).
-- XP for a session is paid through award_xp (once per session id).

-- ────────────────────────────────────────────────────────────────
-- 1. time_sessions
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_sessions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_node_id  uuid        NOT NULL REFERENCES public.skill_nodes(id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  paused_at      timestamptz,
  paused_seconds integer     NOT NULL DEFAULT 0,
  duration_seconds integer,
  note           text        CHECK (char_length(note) <= 500),
  xp_awarded     integer     NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS time_sessions_user_started_idx
  ON public.time_sessions (user_id, started_at);

-- at most one running (not ended) session per user
CREATE UNIQUE INDEX IF NOT EXISTS time_sessions_one_active_idx
  ON public.time_sessions (user_id) WHERE ended_at IS NULL;

ALTER TABLE public.time_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS time_sessions_self_select ON public.time_sessions;
CREATE POLICY time_sessions_self_select ON public.time_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- no insert/update/delete policies → only the RPCs can write

-- ────────────────────────────────────────────────────────────────
-- 2. time_session_checks: checklist items ticked during a session
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_session_checks (
  session_id uuid NOT NULL REFERENCES public.time_sessions(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES public.skill_progress_items(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, item_id)
);

ALTER TABLE public.time_session_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS time_session_checks_self_select ON public.time_session_checks;
CREATE POLICY time_session_checks_self_select ON public.time_session_checks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.time_sessions s
     WHERE s.id = session_id AND s.user_id = auth.uid()
  ));

-- ────────────────────────────────────────────────────────────────
-- 3. RPCs
-- ────────────────────────────────────────────────────────────────

-- timer_start: open a new session for one of my skills
CREATE OR REPLACE FUNCTION public.timer_start(p_skill_node_id uuid)
RETURNS public.time_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.time_sessions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_skills WHERE user_id = v_uid AND skill_node_id = p_skill_node_id
  ) THEN
    RAISE EXCEPTION 'skill is not in your skills' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM time_sessions WHERE user_id = v_uid AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'a session is already running' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO time_sessions (user_id, skill_node_id)
  VALUES (v_uid, p_skill_node_id)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- timer_pause: freeze the running session
CREATE OR REPLACE FUNCTION public.timer_pause()
RETURNS public.time_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.time_sessions;
BEGIN
  UPDATE time_sessions
     SET paused_at = now()
   WHERE user_id = auth.uid() AND ended_at IS NULL AND paused_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no running session to pause' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_row;
END;
$$;

-- timer_resume: add the pause length to paused_seconds and keep going
CREATE OR REPLACE FUNCTION public.timer_resume()
RETURNS public.time_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.time_sessions;
BEGIN
  UPDATE time_sessions
     SET paused_seconds = paused_seconds + floor(extract(epoch FROM now() - paused_at))::int,
         paused_at = NULL
   WHERE user_id = auth.uid() AND ended_at IS NULL AND paused_at IS NOT NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no paused session to resume' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_row;
END;
$$;

-- timer_stop: close the session, compute duration (max 4 h) and pay XP
--   < 60 s → 0 XP, otherwise 1 XP per full minute, +10 bonus from 25 min
CREATE OR REPLACE FUNCTION public.timer_stop()
RETURNS public.time_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_row      public.time_sessions;
  v_now      timestamptz := now();
  v_paused   int;
  v_duration int;
  v_xp       int;
BEGIN
  SELECT * INTO v_row
    FROM time_sessions
   WHERE user_id = v_uid AND ended_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no running session to stop' USING ERRCODE = 'P0001';
  END IF;

  -- a pause still open at stop time counts as paused
  v_paused := v_row.paused_seconds
    + CASE WHEN v_row.paused_at IS NOT NULL
           THEN floor(extract(epoch FROM v_now - v_row.paused_at))::int
           ELSE 0 END;

  v_duration := floor(extract(epoch FROM v_now - v_row.started_at))::int - v_paused;
  v_duration := greatest(0, least(v_duration, 4 * 3600));

  v_xp := CASE
    WHEN v_duration < 60 THEN 0
    ELSE v_duration / 60 + CASE WHEN v_duration >= 25 * 60 THEN 10 ELSE 0 END
  END;

  UPDATE time_sessions
     SET ended_at = v_now,
         paused_at = NULL,
         paused_seconds = v_paused,
         duration_seconds = v_duration,
         xp_awarded = v_xp
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  IF v_xp > 0 THEN
    -- inserts into xp_transactions and adds to profiles.xp (once per session id)
    PERFORM award_xp(v_uid, v_xp, 'time_session', v_row.id);
  END IF;

  RETURN v_row;
END;
$$;

-- timer_log: note + checklist items for one of my finished sessions.
-- Replaces the session's checks; ticked items are also upserted into user_progress_checks.
CREATE OR REPLACE FUNCTION public.timer_log(
  p_session_id uuid,
  p_note       text,
  p_item_ids   uuid[] DEFAULT '{}'
) RETURNS public.time_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.time_sessions;
BEGIN
  SELECT * INTO v_row
    FROM time_sessions
   WHERE id = p_session_id AND user_id = v_uid AND ended_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found or still running' USING ERRCODE = 'P0001';
  END IF;

  UPDATE time_sessions
     SET note = nullif(btrim(p_note), '')
   WHERE id = p_session_id
  RETURNING * INTO v_row;

  DELETE FROM time_session_checks WHERE session_id = p_session_id;

  -- only items that belong to the session's skill
  INSERT INTO time_session_checks (session_id, item_id)
  SELECT p_session_id, i.id
    FROM skill_progress_items i
   WHERE i.id = ANY(coalesce(p_item_ids, '{}'))
     AND i.skill_node_id = v_row.skill_node_id;

  INSERT INTO user_progress_checks (user_id, item_id)
  SELECT v_uid, c.item_id
    FROM time_session_checks c
   WHERE c.session_id = p_session_id
  ON CONFLICT (user_id, item_id) DO NOTHING;

  RETURN v_row;
END;
$$;

-- timer_active: my running session (0 or 1 rows)
CREATE OR REPLACE FUNCTION public.timer_active()
RETURNS SETOF public.time_sessions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM time_sessions
   WHERE user_id = auth.uid() AND ended_at IS NULL
   LIMIT 1;
$$;

-- timer_heatmap: minutes per day (Europe/Prague) for the last 365 days,
-- optionally for one skill. Days without activity are not returned.
CREATE OR REPLACE FUNCTION public.timer_heatmap(p_skill_node_id uuid DEFAULT NULL)
RETURNS TABLE (day date, minutes int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (s.started_at AT TIME ZONE 'Europe/Prague')::date AS day,
         round(sum(s.duration_seconds) / 60.0)::int       AS minutes
    FROM time_sessions s
   WHERE s.user_id = auth.uid()
     AND s.ended_at IS NOT NULL
     AND (p_skill_node_id IS NULL OR s.skill_node_id = p_skill_node_id)
     AND (s.started_at AT TIME ZONE 'Europe/Prague')::date
         > (now() AT TIME ZONE 'Europe/Prague')::date - 365
   GROUP BY 1
   ORDER BY 1;
$$;

-- timer_day_breakdown: minutes per skill on one day (for the heatmap tooltip)
CREATE OR REPLACE FUNCTION public.timer_day_breakdown(p_day date)
RETURNS TABLE (skill_node_id uuid, skill_name text, minutes int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.skill_node_id,
         n.name,
         round(sum(s.duration_seconds) / 60.0)::int AS minutes
    FROM time_sessions s
    JOIN skill_nodes n ON n.id = s.skill_node_id
   WHERE s.user_id = auth.uid()
     AND s.ended_at IS NOT NULL
     AND (s.started_at AT TIME ZONE 'Europe/Prague')::date = p_day
   GROUP BY s.skill_node_id, n.name
   ORDER BY minutes DESC;
$$;

-- ────────────────────────────────────────────────────────────────
-- 4. Grants: only signed-in users may call the RPCs
-- ────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.timer_start(uuid)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.timer_pause()                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.timer_resume()               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.timer_stop()                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.timer_log(uuid, text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.timer_active()               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.timer_heatmap(uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.timer_day_breakdown(date)    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.timer_start(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.timer_pause()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.timer_resume()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.timer_stop()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.timer_log(uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.timer_active()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.timer_heatmap(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.timer_day_breakdown(date)    TO authenticated;
