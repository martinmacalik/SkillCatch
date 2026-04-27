-- skill_learning_suggestions: non-editor users propose a new block list for
-- a skill's Learn page. Editors review/approve/deny in the admin subdomain.
--
-- Mirrors node_restructure_requests in shape so both flows feel consistent.

CREATE TABLE IF NOT EXISTS public.skill_learning_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_node_id   uuid NOT NULL REFERENCES public.skill_nodes(id) ON DELETE CASCADE,
  submitted_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposed_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  message         text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','denied')),
  reviewed_by     uuid REFERENCES auth.users(id),
  reviewed_at     timestamptz,
  deny_reason     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sls_skill_status_idx
  ON public.skill_learning_suggestions (skill_node_id, status);

CREATE INDEX IF NOT EXISTS sls_submitter_status_idx
  ON public.skill_learning_suggestions (submitted_by, status);

ALTER TABLE public.skill_learning_suggestions ENABLE ROW LEVEL SECURITY;

-- Submitter can read their own suggestions (so the UI can show the pending pill).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='skill_learning_suggestions' AND policyname='sls_self_read'
  ) THEN
    CREATE POLICY sls_self_read ON public.skill_learning_suggestions
      FOR SELECT TO authenticated
      USING (auth.uid() = submitted_by);
  END IF;

  -- Editors can read every suggestion (admin subdomain will use the same query).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='skill_learning_suggestions' AND policyname='sls_editor_read'
  ) THEN
    CREATE POLICY sls_editor_read ON public.skill_learning_suggestions
      FOR SELECT TO authenticated
      USING (public.is_editor());
  END IF;

  -- Editors can update (approve/deny). Approval logic lives in an RPC, not policies.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='skill_learning_suggestions' AND policyname='sls_editor_update'
  ) THEN
    CREATE POLICY sls_editor_update ON public.skill_learning_suggestions
      FOR UPDATE TO authenticated
      USING (public.is_editor())
      WITH CHECK (public.is_editor());
  END IF;
END $$;

-- INSERTs go through the RPC so submitted_by is always auth.uid() server-side.

-- RPC: submit a suggestion. Returns the new row's id.
-- proposed_blocks is the FULL final block list the submitter wants the page to have.
-- Each entry: { id?: uuid, type: text, content: jsonb, sort_order: int }
--   - id present  → submitter kept the existing block (possibly with new content)
--   - id absent   → submitter wants a new block created
--   - existing block id NOT present in the list → submitter wants it deleted
CREATE OR REPLACE FUNCTION public.submit_learning_suggestion(
  p_skill_node_id   uuid,
  p_proposed_blocks jsonb,
  p_message         text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF jsonb_typeof(p_proposed_blocks) <> 'array' THEN
    RAISE EXCEPTION 'proposed_blocks must be a JSON array';
  END IF;

  INSERT INTO public.skill_learning_suggestions
    (skill_node_id, submitted_by, proposed_blocks, message)
  VALUES
    (p_skill_node_id, v_uid, p_proposed_blocks, p_message)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.submit_learning_suggestion(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_learning_suggestion(uuid, jsonb, text) TO authenticated;
