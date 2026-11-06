-- XP: every reward for a concrete thing counts only once.
-- Moving a skill to Learning, back and to Learning again must not pay twice:
-- (user, reason, reference) is unique, and award_xp silently skips repeats.
-- Rows without a reference_id (e.g. a daily login) aren't affected: NULLs never collide.

CREATE UNIQUE INDEX IF NOT EXISTS xp_transactions_once_idx
  ON public.xp_transactions (user_id, reason, reference_id);

CREATE OR REPLACE FUNCTION public.award_xp(
  p_user_id      uuid,
  p_amount       integer,
  p_reason       text,
  p_reference_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.xp_transactions (user_id, amount, reason, reference_id)
  VALUES (p_user_id, p_amount, p_reason, p_reference_id)
  ON CONFLICT (user_id, reason, reference_id) DO NOTHING;

  -- FOUND is false when the insert was skipped → already rewarded, total stays
  IF FOUND THEN
    UPDATE public.profiles
       SET xp = xp + p_amount
     WHERE id = p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.award_xp(uuid, integer, text, uuid) FROM PUBLIC;
