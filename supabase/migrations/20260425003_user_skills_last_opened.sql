-- Track when a user last opened a Learn page for a skill in their library.
-- Used to order the Learning column: pinned first, then most recently opened.
ALTER TABLE public.user_skills
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz;

-- Composite index matches the ORDER BY in getUserLearningSkills.
CREATE INDEX IF NOT EXISTS user_skills_user_recent_idx
  ON public.user_skills (user_id, pinned DESC, last_opened_at DESC NULLS LAST);

-- RPC: touch the row for the current user. Idempotent; no-op if the user
-- doesn't have this skill in their library. SECURITY DEFINER so we can't be
-- fooled by a forged user_id from the client.
CREATE OR REPLACE FUNCTION public.touch_skill_last_opened(p_skill_node_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.user_skills
     SET last_opened_at = now()
   WHERE user_id = auth.uid()
     AND skill_node_id = p_skill_node_id;
$$;

REVOKE ALL ON FUNCTION public.touch_skill_last_opened(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_skill_last_opened(uuid) TO authenticated;
