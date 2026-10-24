-- ════════════════════════════════════════════════════════════════
-- Chat: hiding 1:1 chats + blocking users (+ groups respect blocks)
-- ════════════════════════════════════════════════════════════════
--   hidden_conversations → "trash" on a 1:1 chat: hidden from MY list only,
--                          comes back with the next message (frontend compares
--                          hidden_at with last_message_at) or via "New chat"
--   user_blocks          → blocker ↔ blocked: nobody can write in their 1:1 chat,
--                          no new chat request, no group invite between them
-- Groups need no schema change: create_group_conversation(),
-- add_conversation_members() and leave_conversation() already exist.
--
-- Idempotent — safe to re-run.

-- ── HIDDEN CONVERSATIONS ────────────────────────────────────────
-- Own table instead of a column on conversation_participants: participants
-- rows are visible to the other person, this table only to its owner
-- (the other person must not notice anything).

CREATE TABLE IF NOT EXISTS public.hidden_conversations (
  user_id          uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id  uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  hidden_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

-- FK index for the ON DELETE CASCADE from conversations
CREATE INDEX IF NOT EXISTS hidden_conversations_conversation_idx
  ON public.hidden_conversations (conversation_id);

ALTER TABLE public.hidden_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hidden_conversations_select_own ON public.hidden_conversations;
CREATE POLICY hidden_conversations_select_own ON public.hidden_conversations
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- writes only through hide_conversation() / get_or_create_direct_conversation()
REVOKE INSERT, UPDATE, DELETE ON public.hidden_conversations FROM anon, authenticated;

-- ── USER BLOCKS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id  uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id <> blocked_id)
);

-- "who blocked me" (the PK starts with blocker_id, so it can't serve this)
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx
  ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- both sides see the row: the blocked user's chat shows "this user blocked you"
DROP POLICY IF EXISTS user_blocks_select_involved ON public.user_blocks;
CREATE POLICY user_blocks_select_involved ON public.user_blocks
  FOR SELECT TO authenticated
  USING (blocker_id = (SELECT auth.uid()) OR blocked_id = (SELECT auth.uid()));

-- writes only through block_user() / unblock_user()
REVOKE INSERT, UPDATE, DELETE ON public.user_blocks FROM anon, authenticated;

-- ── INTERNAL HELPER ─────────────────────────────────────────────

-- A block exists in either direction. Only called from SECURITY DEFINER
-- functions below (clients can't call it → can't probe who blocked whom).
CREATE OR REPLACE FUNCTION public._is_blocked(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = p_a AND blocked_id = p_b)
       OR (blocker_id = p_b AND blocked_id = p_a)
  );
$$;

REVOKE ALL ON FUNCTION public._is_blocked(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── MESSAGES: no writing in a blocked 1:1 chat ──────────────────
-- Same checks as 20261016002 + the block check. SECURITY DEFINER now,
-- so it can read the other participant and the blocks regardless of RLS.

CREATE OR REPLACE FUNCTION public.tg_messages_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- 1:1 chat where one side blocked the other (system messages have no sender)
  IF NEW.sender_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.conversation_participants p
      ON p.conversation_id = c.id AND p.user_id <> NEW.sender_id
    WHERE c.id = NEW.conversation_id
      AND c.type = 'direct'
      AND public._is_blocked(NEW.sender_id, p.user_id)
  ) THEN
    RAISE EXCEPTION 'user_blocked';
  END IF;

  RETURN NEW;
END;
$$;

-- ── RPC: 1:1 chat (replaces the version from 20261011001) ───────
-- New: an existing chat is un-hidden for the caller ("New chat" brings a
-- hidden chat back); a NEW chat request can't be sent across a block.

CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(p_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_key text;
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_other_user_id IS NULL OR p_other_user_id = v_uid THEN
    RAISE EXCEPTION 'invalid_other_user';
  END IF;

  v_key := least(v_uid::text, p_other_user_id::text) || ':' || greatest(v_uid::text, p_other_user_id::text);

  SELECT id INTO v_id FROM public.conversations WHERE direct_key = v_key;
  IF FOUND THEN
    DELETE FROM public.hidden_conversations WHERE user_id = v_uid AND conversation_id = v_id;
    RETURN v_id;
  END IF;

  IF public._is_blocked(v_uid, p_other_user_id) THEN
    RAISE EXCEPTION 'user_blocked';
  END IF;

  INSERT INTO public.conversations (type, direct_key, created_by)
  VALUES ('direct', v_key, v_uid)
  ON CONFLICT (direct_key) DO NOTHING
  RETURNING id INTO v_id;

  -- another request created it in the meantime → return that one
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.conversations WHERE direct_key = v_key;
    RETURN v_id;
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, user_id, role, status)
  VALUES (v_id, v_uid,           'member', 'accepted'),
         (v_id, p_other_user_id, 'member', 'pending');

  RETURN v_id;
END;
$$;

-- ── RPC: groups skip blocked users (replace 20261011001 versions) ──

CREATE OR REPLACE FUNCTION public.create_group_conversation(
  p_title      text,
  p_member_ids uuid[] DEFAULT '{}'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO public.conversations (type, title, created_by)
  VALUES ('group', btrim(p_title), v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id, role, status)
  VALUES (v_id, v_uid, 'owner', 'accepted');

  INSERT INTO public.conversation_participants (conversation_id, user_id, role, status)
  SELECT DISTINCT v_id, m, 'member', 'pending'
  FROM unnest(coalesce(p_member_ids, '{}')) AS m
  WHERE m IS NOT NULL AND m <> v_uid
    AND NOT public._is_blocked(v_uid, m);

  PERFORM public._add_system_message(v_id, 'group_created', jsonb_build_object('title', btrim(p_title)));

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_conversation_members(p_conversation_id uuid, p_user_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_added uuid;
BEGIN
  PERFORM public._require_group_role(p_conversation_id, ARRAY['owner','admin']);

  FOR v_added IN
    INSERT INTO public.conversation_participants (conversation_id, user_id, role, status)
    SELECT DISTINCT p_conversation_id, u, 'member', 'pending'
    FROM unnest(coalesce(p_user_ids, '{}')) AS u
    WHERE u IS NOT NULL
      AND NOT public._is_blocked(auth.uid(), u)
    ON CONFLICT (conversation_id, user_id) DO NOTHING
    RETURNING user_id
  LOOP
    PERFORM public._add_system_message(p_conversation_id, 'member_added', jsonb_build_object('target_id', v_added));
  END LOOP;
END;
$$;

-- ── RPC: hide / block ───────────────────────────────────────────

-- "Trash" on an accepted 1:1 chat. Re-hiding just moves hidden_at.
CREATE OR REPLACE FUNCTION public.hide_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations c
    JOIN public.conversation_participants p ON p.conversation_id = c.id
    WHERE c.id = p_conversation_id
      AND c.type = 'direct'
      AND p.user_id = auth.uid()
      AND p.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'not_a_direct_chat_member';
  END IF;

  INSERT INTO public.hidden_conversations (user_id, conversation_id, hidden_at)
  VALUES (auth.uid(), p_conversation_id, now())
  ON CONFLICT (user_id, conversation_id) DO UPDATE SET hidden_at = EXCLUDED.hidden_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'invalid_user';
  END IF;

  INSERT INTO public.user_blocks (blocker_id, blocked_id)
  VALUES (auth.uid(), p_user_id)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_user(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.user_blocks
  WHERE blocker_id = auth.uid() AND blocked_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.hide_conversation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.block_user(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unblock_user(uuid)      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hide_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_user(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_user(uuid)      TO authenticated;

-- ── REALTIME ────────────────────────────────────────────────────
-- the blocked person's chat switches to "this user blocked you" live

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_blocks'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_blocks;
    END IF;
  END IF;
END $$;
