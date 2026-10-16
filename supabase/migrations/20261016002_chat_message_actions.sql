-- ════════════════════════════════════════════════════════════════
-- Chat: replies + reactions
-- ════════════════════════════════════════════════════════════════
--   messages.reply_to_id → the message this one answers (same conversation)
--   message_reactions    → one reaction per user per message, 4 emoji
--                          read through RLS, write ONLY through set_message_reaction()
-- Editing and deleting need no schema change (messages_update_own policy,
-- GRANT UPDATE (body), delete_message() already exist).

-- ── REPLIES ─────────────────────────────────────────────────────

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;

-- client may set it when sending (adds to the existing column grant)
GRANT INSERT (reply_to_id) ON public.messages TO authenticated;

-- the replied message must be in the same conversation
CREATE OR REPLACE FUNCTION public.tg_messages_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type = 'skill' AND NEW.skill_node_id IS NULL THEN
    RAISE EXCEPTION 'skill_message_requires_skill_node_id';
  END IF;

  -- image must live in this conversation's folder, in the sender's subfolder
  IF NEW.type = 'image'
     AND NEW.image_path NOT LIKE NEW.conversation_id::text || '/' || NEW.sender_id::text || '/%' THEN
    RAISE EXCEPTION 'invalid_image_path'
      USING HINT = 'Expected {conversation_id}/{sender_id}/{file}';
  END IF;

  IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.messages
    WHERE id = NEW.reply_to_id
      AND conversation_id = NEW.conversation_id
  ) THEN
    RAISE EXCEPTION 'reply_to_other_conversation';
  END IF;

  RETURN NEW;
END;
$$;

-- ── REACTIONS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id       uuid        NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  -- copied from the message: cheap RLS check + realtime filter per conversation
  conversation_id  uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  emoji            text        NOT NULL CHECK (emoji IN ('👍','👎','😂','😮')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS message_reactions_conversation_idx
  ON public.message_reactions (conversation_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- accepted members see all reactions in their conversations
DROP POLICY IF EXISTS message_reactions_select_member ON public.message_reactions;
CREATE POLICY message_reactions_select_member ON public.message_reactions
  FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id));

-- no write policies + revoked privileges: writes only through the RPC below
REVOKE INSERT, UPDATE, DELETE ON public.message_reactions FROM anon, authenticated;

-- Set my reaction on a message. Same emoji again or NULL → remove it.
-- One function = the toggle is atomic (no "read state, then write" race).
CREATE OR REPLACE FUNCTION public.set_message_reaction(p_message_id uuid, p_emoji text)
RETURNS text -- my reaction after the call (NULL = none)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id uuid;
  v_current         text;
BEGIN
  SELECT conversation_id INTO v_conversation_id
  FROM public.messages
  WHERE id = p_message_id
    AND type <> 'system'
    AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.is_conversation_member(v_conversation_id) THEN
    RAISE EXCEPTION 'message_not_found';
  END IF;

  SELECT emoji INTO v_current
  FROM public.message_reactions
  WHERE message_id = p_message_id AND user_id = auth.uid()
  FOR UPDATE;

  IF p_emoji IS NULL OR p_emoji = v_current THEN
    DELETE FROM public.message_reactions
    WHERE message_id = p_message_id AND user_id = auth.uid();
    RETURN NULL;
  END IF;

  INSERT INTO public.message_reactions (message_id, user_id, conversation_id, emoji)
  VALUES (p_message_id, auth.uid(), v_conversation_id, p_emoji)
  ON CONFLICT (message_id, user_id)
  DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now();

  RETURN p_emoji;
END;
$$;

REVOKE ALL ON FUNCTION public.set_message_reaction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_message_reaction(uuid, text) TO authenticated;

-- a deleted message keeps no reactions
CREATE OR REPLACE FUNCTION public.tg_messages_after_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.message_reactions WHERE message_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_after_soft_delete ON public.messages;
CREATE TRIGGER messages_after_soft_delete AFTER UPDATE OF deleted_at ON public.messages
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.tg_messages_after_soft_delete();

-- ── REALTIME ────────────────────────────────────────────────────
-- FULL: DELETE events carry the old row (message_id, user_id) so the
-- client knows which reaction disappeared.

ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
    END IF;
  END IF;
END $$;
