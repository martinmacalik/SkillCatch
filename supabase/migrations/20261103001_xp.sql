-- XP system
-- XP measures how much you learn overall (drives your level), SkillCoins stay
-- the reward for contributing to the app. Mirrors the SkillCoin setup:
-- a balance on profiles, a ledger, and an internal award helper.

-- 1. XP total on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS xp_non_negative;
ALTER TABLE public.profiles
  ADD CONSTRAINT xp_non_negative CHECK (xp >= 0);

-- 2. Ledger (audit trail for every XP gain)
CREATE TABLE IF NOT EXISTS public.xp_transactions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount       integer     NOT NULL,
  reason       text        NOT NULL, -- e.g. 'skill_added', 'level_up'
  reference_id uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS xp_transactions_self_select ON public.xp_transactions;
CREATE POLICY xp_transactions_self_select ON public.xp_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS xp_transactions_user_id_idx
  ON public.xp_transactions (user_id, created_at DESC);

-- 3. award_xp — internal helper, not directly callable by users
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
  UPDATE public.profiles
     SET xp = xp + p_amount
   WHERE id = p_user_id;

  INSERT INTO public.xp_transactions (user_id, amount, reason, reference_id)
  VALUES (p_user_id, p_amount, p_reason, p_reference_id);
END;
$$;

REVOKE ALL ON FUNCTION public.award_xp(uuid, integer, text, uuid) FROM PUBLIC;
