-- SkillCoin system
-- Adds skillcoin_balance to profiles, a transaction ledger, and wires up
-- automatic coin awards when a restructure request is approved.

-- 1. Balance column on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS skillcoin_balance integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS skillcoin_balance_non_negative;
ALTER TABLE public.profiles
  ADD CONSTRAINT skillcoin_balance_non_negative CHECK (skillcoin_balance >= 0);

-- 2. Transaction ledger (audit trail for every credit/debit)
CREATE TABLE IF NOT EXISTS public.skillcoin_transactions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount       integer     NOT NULL, -- positive = credit, negative = debit
  reason       text        NOT NULL, -- e.g. 'restructure_approved', 'course_purchase'
  reference_id uuid,                 -- optional FK to the triggering entity
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.skillcoin_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'skillcoin_transactions'
       AND policyname = 'transactions_self_select'
  ) THEN
    CREATE POLICY transactions_self_select ON public.skillcoin_transactions
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS skillcoin_transactions_user_id_idx
  ON public.skillcoin_transactions (user_id, created_at DESC);

-- 3. award_skillcoins — internal helper, not directly callable by users
--    Called by approve_restructure_request and future service-role callers.
CREATE OR REPLACE FUNCTION public.award_skillcoins(
  p_user_id    uuid,
  p_amount     integer,
  p_reason     text,
  p_reference_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET skillcoin_balance = skillcoin_balance + p_amount
   WHERE id = p_user_id;

  INSERT INTO public.skillcoin_transactions (user_id, amount, reason, reference_id)
  VALUES (p_user_id, p_amount, p_reason, p_reference_id);
END;
$$;

REVOKE ALL ON FUNCTION public.award_skillcoins(uuid, integer, text, uuid) FROM PUBLIC;

-- 4. Patch approve_restructure_request to award 10 coins on approval
--    Full function is reproduced here (CREATE OR REPLACE) with the award
--    call added just before the status update.
CREATE OR REPLACE FUNCTION approve_restructure_request(
  p_request_id     uuid,
  p_actor_user_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request       record;
  v_proposal_type text;
  v_notes_raw     text;
  v_tree          jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = p_actor_user_id) THEN
    RAISE EXCEPTION 'insufficient_privileges' USING HINT = 'Actor must be a registered admin';
  END IF;

  SELECT * INTO v_request
  FROM node_restructure_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING HINT = p_request_id::text;
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'request_not_pending' USING HINT = v_request.status;
  END IF;

  v_proposal_type := v_request.proposal->>'type';

  IF v_proposal_type = 'rename' THEN
    IF (v_request.proposal->'changes'->>'new_name') IS NULL THEN
      RAISE EXCEPTION 'invalid_proposal_data' USING HINT = 'new_name is required for rename';
    END IF;
    UPDATE skill_nodes
    SET name = v_request.proposal->'changes'->>'new_name'
    WHERE id = v_request.target_node_id;

  ELSIF v_proposal_type = 'reparent' THEN
    UPDATE skill_nodes
    SET parent_id = (
      v_request.proposal->'changes'->'new_parent_ids'->0
    )::text::uuid
    WHERE id = v_request.target_node_id;
    DELETE FROM skill_node_parents
    WHERE child_node_id = v_request.target_node_id;
    INSERT INTO skill_node_parents (child_node_id, parent_node_id)
    SELECT
      v_request.target_node_id,
      jsonb_array_elements_text(
        v_request.proposal->'changes'->'new_parent_ids'
      )::uuid;

  ELSIF v_proposal_type = 'add_child' THEN
    INSERT INTO skill_nodes (name, slug, parent_id, is_leaf)
    VALUES (
      v_request.proposal->'changes'->'child_node'->>'name',
      v_request.proposal->'changes'->'child_node'->>'slug',
      v_request.target_node_id,
      (v_request.proposal->'changes'->'child_node'->>'is_leaf')::boolean
    );

  ELSIF v_proposal_type = 'move' THEN
    v_notes_raw := v_request.proposal->'changes'->>'notes';
    IF v_notes_raw IS NULL THEN
      RAISE EXCEPTION 'invalid_proposal_data' USING HINT = 'notes is required for move';
    END IF;
    v_tree := v_notes_raw::jsonb;
    PERFORM _apply_move_tree(v_tree);

  ELSE
    RAISE EXCEPTION 'unsupported_proposal_type' USING HINT = v_proposal_type;
  END IF;

  -- Award 10 SkillCoins to the requester for an approved proposal
  IF v_request.requester_user_id IS NOT NULL THEN
    PERFORM public.award_skillcoins(
      v_request.requester_user_id,
      10,
      'restructure_approved',
      p_request_id
    );
  END IF;

  INSERT INTO admin_audit_log (
    actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    p_actor_user_id,
    'approve_restructure_request',
    'node_restructure_request',
    p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'approved', 'proposal', v_request.proposal)
  );

  UPDATE node_restructure_requests
  SET
    status      = 'approved',
    reviewed_by = p_actor_user_id,
    reviewed_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'request_id', p_request_id);
END;
$$;
