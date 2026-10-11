-- Chat module: conversations (1:1 + group), participants with roles and
-- chat requests (pending/accepted), messages (text / image / skill / system)
-- with editing and soft delete, private chat-media bucket, realtime.
--
-- Security model:
--   * messages        → read/write directly through RLS (frequent, simple)
--   * conversations,
--     participants    → read through RLS, write ONLY through RPC functions
--                       (multi-step operations + role rules)
--
-- Idempotent — safe to re-run.

-- ════════════════════════════════════════════════════════════════
-- TABLES
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.conversations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type             text        NOT NULL CHECK (type IN ('direct','group')),
  title            text        CHECK (title IS NULL OR char_length(btrim(title)) BETWEEN 1 AND 100),
  -- 'smaller_uuid:bigger_uuid' for direct chats → max one 1:1 chat per pair
  direct_key       text        UNIQUE,
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_type_fields CHECK (
       (type = 'direct' AND title IS NULL     AND direct_key IS NOT NULL)
    OR (type = 'group'  AND title IS NOT NULL AND direct_key IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id  uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role             text        NOT NULL DEFAULT 'member'
                     CHECK (role IN ('owner','admin','member')),
  -- pending = chat request not yet accepted (cannot read or send messages)
  status           text        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted')),
  joined_at        timestamptz NOT NULL DEFAULT now(),
  last_read_at     timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  -- NULL for system messages and after the sender deletes their account
  sender_id        uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  type             text        NOT NULL CHECK (type IN ('text','image','skill','system')),
  body             text        CHECK (body IS NULL OR char_length(body) <= 4000),
  image_path       text,       -- path inside the chat-media bucket
  skill_node_id    uuid        REFERENCES public.skill_nodes(id) ON DELETE SET NULL,
  metadata         jsonb,      -- system messages only, e.g. {"event":"member_added",...}
  created_at       timestamptz NOT NULL DEFAULT now(),
  edited_at        timestamptz, -- NULL = never edited
  deleted_at       timestamptz, -- NULL = not deleted
  -- a deleted message must not keep any content
  CONSTRAINT messages_deleted_has_no_content CHECK (
    deleted_at IS NULL
    OR (body IS NULL AND image_path IS NULL AND skill_node_id IS NULL)
  ),
  -- required/forbidden fields per type (skill_node_id for 'skill' is checked
  -- by trigger on insert only, so deleting a skill node can SET NULL safely)
  CONSTRAINT messages_content_by_type CHECK (
    deleted_at IS NOT NULL
    OR (type = 'text'   AND body IS NOT NULL AND char_length(btrim(body)) > 0
                        AND image_path IS NULL AND skill_node_id IS NULL AND metadata IS NULL)
    OR (type = 'image'  AND image_path IS NOT NULL
                        AND skill_node_id IS NULL AND metadata IS NULL)
    OR (type = 'skill'  AND image_path IS NULL AND metadata IS NULL)
    OR (type = 'system' AND metadata IS NOT NULL
                        AND body IS NULL AND image_path IS NULL AND skill_node_id IS NULL)
  )
);

-- ════════════════════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════════════════════

-- "my conversations" (PK starts with conversation_id, so it can't serve this)
CREATE INDEX IF NOT EXISTS conversation_participants_user_idx
  ON public.conversation_participants (user_id);

-- latest messages of a conversation + pagination
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON public.messages (conversation_id, created_at DESC);

-- FK indexes so ON DELETE SET NULL doesn't scan the whole table
CREATE INDEX IF NOT EXISTS messages_sender_idx
  ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS messages_skill_node_idx
  ON public.messages (skill_node_id) WHERE skill_node_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS conversations_created_by_idx
  ON public.conversations (created_by);

-- ════════════════════════════════════════════════════════════════
-- RLS HELPERS (SECURITY DEFINER → bypass RLS → no policy recursion)
-- ════════════════════════════════════════════════════════════════

-- Caller is in the conversation in ANY status (incl. pending request).
CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND user_id = (SELECT auth.uid())
  );
$$;

-- Caller is in the conversation AND accepted it (may read/send messages).
CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND user_id = (SELECT auth.uid())
      AND status = 'accepted'
  );
$$;

-- Storage helper: object path is '{conversation_id}/{user_id}/{file}'.
-- Returns false (instead of a cast error) for malformed paths.
CREATE OR REPLACE FUNCTION public.can_access_chat_media(p_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_folder text := split_part(p_object_name, '/', 1);
BEGIN
  IF v_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  RETURN public.is_conversation_member(v_folder::uuid);
END;
$$;

REVOKE ALL ON FUNCTION public.is_conversation_participant(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_conversation_member(uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_chat_media(text)       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_chat_media(text)       TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.conversations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                  ENABLE ROW LEVEL SECURITY;

-- conversations: visible to every participant (pending sees the request)
DROP POLICY IF EXISTS conversations_select_participant ON public.conversations;
CREATE POLICY conversations_select_participant ON public.conversations
  FOR SELECT TO authenticated
  USING (public.is_conversation_participant(id));

-- participants: I see who is in the conversations I'm part of
DROP POLICY IF EXISTS participants_select_participant ON public.conversation_participants;
CREATE POLICY participants_select_participant ON public.conversation_participants
  FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id));

-- No INSERT/UPDATE/DELETE policies on conversations / participants:
-- all writes go through the RPC functions below.

-- messages: only accepted members read
DROP POLICY IF EXISTS messages_select_member ON public.messages;
CREATE POLICY messages_select_member ON public.messages
  FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id));

-- messages: accepted members send as themselves; 'system' is RPC-only
DROP POLICY IF EXISTS messages_insert_member ON public.messages;
CREATE POLICY messages_insert_member ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND type IN ('text','image','skill')
    AND public.is_conversation_member(conversation_id)
  );

-- messages: author edits own, non-deleted, non-system message while a member
-- (column grants below restrict WHAT can change: only body)
DROP POLICY IF EXISTS messages_update_own ON public.messages;
CREATE POLICY messages_update_own ON public.messages
  FOR UPDATE TO authenticated
  USING (
    sender_id = (SELECT auth.uid())
    AND type <> 'system'
    AND deleted_at IS NULL
    AND public.is_conversation_member(conversation_id)
  )
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND deleted_at IS NULL
  );

-- No DELETE policy: deleting = delete_message() RPC (soft delete).

-- ════════════════════════════════════════════════════════════════
-- TABLE / COLUMN PRIVILEGES
-- ════════════════════════════════════════════════════════════════
-- Supabase grants ALL on new tables to anon + authenticated by default.
-- RLS already blocks these writes; revoking is a second layer of defence.

REVOKE INSERT, UPDATE, DELETE ON public.conversations             FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.conversation_participants FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.messages                  FROM anon, authenticated;

-- Client may only fill these columns when sending (not created_at,
-- edited_at, deleted_at, metadata) ...
GRANT INSERT (id, conversation_id, sender_id, type, body, image_path, skill_node_id)
  ON public.messages TO authenticated;
-- ... and may only change the text when editing.
GRANT UPDATE (body) ON public.messages TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- conversations.updated_at (reuse existing tg_set_updated_at)
DROP TRIGGER IF EXISTS conversations_updated_at ON public.conversations;
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Validate new messages that a CHECK can't express.
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_before_insert ON public.messages;
CREATE TRIGGER messages_before_insert BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_messages_before_insert();

-- Mark edits: the server sets edited_at, the client can't fake it.
CREATE OR REPLACE FUNCTION public.tg_messages_before_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.deleted_at IS NULL AND NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.edited_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_before_update ON public.messages;
CREATE TRIGGER messages_before_update BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_messages_before_update();

-- Keep conversations.last_message_at fresh for sorting the chat list.
-- SECURITY DEFINER: clients have no UPDATE right on conversations.
CREATE OR REPLACE FUNCTION public.tg_messages_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
     SET last_message_at = NEW.created_at
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_after_insert ON public.messages;
CREATE TRIGGER messages_after_insert AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_messages_after_insert();

-- After a participant disappears (leave, remove, decline, account deleted):
--   * nobody accepted left → delete the conversation (no orphans)
--   * the owner left a group → promote oldest admin, else oldest member
CREATE OR REPLACE FUNCTION public.tg_participants_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- conversation itself is being deleted (cascade) → nothing to do
  IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = OLD.conversation_id) THEN
    RETURN OLD;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = OLD.conversation_id AND status = 'accepted'
  ) THEN
    DELETE FROM public.conversations WHERE id = OLD.conversation_id;
    RETURN OLD;
  END IF;

  IF OLD.role = 'owner' THEN
    UPDATE public.conversation_participants
       SET role = 'owner'
     WHERE conversation_id = OLD.conversation_id
       AND user_id = (
         SELECT user_id FROM public.conversation_participants
         WHERE conversation_id = OLD.conversation_id AND status = 'accepted'
         ORDER BY (role = 'admin') DESC, joined_at
         LIMIT 1
       );
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS participants_after_delete ON public.conversation_participants;
CREATE TRIGGER participants_after_delete AFTER DELETE ON public.conversation_participants
  FOR EACH ROW EXECUTE FUNCTION public.tg_participants_after_delete();

-- ════════════════════════════════════════════════════════════════
-- INTERNAL RPC HELPERS (not callable by clients)
-- SECURITY INVOKER: when called from a SECURITY DEFINER RPC they run with
-- the RPC owner's rights; called directly they would grant nothing.
-- ════════════════════════════════════════════════════════════════

-- Raise unless the caller is an accepted participant of a GROUP with one of p_roles.
CREATE OR REPLACE FUNCTION public._require_group_role(p_conversation_id uuid, p_roles text[])
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT p.role INTO v_role
  FROM public.conversation_participants p
  JOIN public.conversations c ON c.id = p.conversation_id
  WHERE p.conversation_id = p_conversation_id
    AND p.user_id = auth.uid()
    AND p.status = 'accepted'
    AND c.type = 'group';

  IF v_role IS NULL OR NOT (v_role = ANY (p_roles)) THEN
    RAISE EXCEPTION 'insufficient_privileges';
  END IF;
  RETURN v_role;
END;
$$;

-- Insert a system message ("X added Y"). The frontend renders the text
-- from metadata, so names/language always stay current.
CREATE OR REPLACE FUNCTION public._add_system_message(
  p_conversation_id uuid,
  p_event           text,
  p_extra           jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.messages (conversation_id, sender_id, type, metadata)
  VALUES (
    p_conversation_id,
    NULL,
    'system',
    jsonb_build_object('event', p_event, 'actor_id', auth.uid()) || p_extra
  );
$$;

REVOKE ALL ON FUNCTION public._require_group_role(uuid, text[])        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._add_system_message(uuid, text, jsonb)   FROM PUBLIC, anon, authenticated;

-- ════════════════════════════════════════════════════════════════
-- RPC: CREATING CONVERSATIONS
-- ════════════════════════════════════════════════════════════════

-- Returns the existing 1:1 chat with p_other_user_id, or creates it
-- (caller = accepted, other user = pending → chat request).
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
    RETURN v_id;
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

-- Creates a group; caller = accepted owner, invited members = pending.
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
  WHERE m IS NOT NULL AND m <> v_uid;

  PERFORM public._add_system_message(v_id, 'group_created', jsonb_build_object('title', btrim(p_title)));

  RETURN v_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- RPC: CHAT REQUESTS
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.accept_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversation_participants
     SET status = 'accepted', joined_at = now()
   WHERE conversation_id = p_conversation_id
     AND user_id = auth.uid()
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_pending_request';
  END IF;

  IF EXISTS (SELECT 1 FROM public.conversations WHERE id = p_conversation_id AND type = 'group') THEN
    PERFORM public._add_system_message(p_conversation_id, 'member_joined');
  END IF;
END;
$$;

-- Direct chat: the whole conversation is deleted (request rejected).
-- Group: only the caller's invitation is removed.
CREATE OR REPLACE FUNCTION public.decline_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  SELECT c.type INTO v_type
  FROM public.conversations c
  JOIN public.conversation_participants p ON p.conversation_id = c.id
  WHERE c.id = p_conversation_id
    AND p.user_id = auth.uid()
    AND p.status = 'pending';

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'no_pending_request';
  END IF;

  IF v_type = 'direct' THEN
    DELETE FROM public.conversations WHERE id = p_conversation_id;
  ELSE
    DELETE FROM public.conversation_participants
     WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- RPC: GROUP MANAGEMENT
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rename_conversation(p_conversation_id uuid, p_title text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._require_group_role(p_conversation_id, ARRAY['owner','admin']);

  UPDATE public.conversations SET title = btrim(p_title) WHERE id = p_conversation_id;

  PERFORM public._add_system_message(p_conversation_id, 'renamed', jsonb_build_object('title', btrim(p_title)));
END;
$$;

-- Invites users (pending). Already-present users are skipped.
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
    ON CONFLICT (conversation_id, user_id) DO NOTHING
    RETURNING user_id
  LOOP
    PERFORM public._add_system_message(p_conversation_id, 'member_added', jsonb_build_object('target_id', v_added));
  END LOOP;
END;
$$;

-- Admin may remove members; owner may remove anyone. Nobody removes
-- themselves here (use leave_conversation).
CREATE OR REPLACE FUNCTION public.remove_conversation_member(p_conversation_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_role     text;
  v_target_role text;
BEGIN
  v_my_role := public._require_group_role(p_conversation_id, ARRAY['owner','admin']);

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'use_leave_conversation';
  END IF;

  SELECT role INTO v_target_role
  FROM public.conversation_participants
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;
  IF v_my_role = 'admin' AND v_target_role <> 'member' THEN
    RAISE EXCEPTION 'insufficient_privileges';
  END IF;

  DELETE FROM public.conversation_participants
   WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

  PERFORM public._add_system_message(p_conversation_id, 'member_removed', jsonb_build_object('target_id', p_user_id));
END;
$$;

-- Owner only. p_role = 'owner' transfers ownership (old owner → admin).
CREATE OR REPLACE FUNCTION public.set_participant_role(
  p_conversation_id uuid,
  p_user_id         uuid,
  p_role            text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._require_group_role(p_conversation_id, ARRAY['owner']);

  IF p_role NOT IN ('owner','admin','member') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_change_own_role';
  END IF;

  UPDATE public.conversation_participants
     SET role = p_role
   WHERE conversation_id = p_conversation_id
     AND user_id = p_user_id
     AND status = 'accepted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_an_accepted_member';
  END IF;

  IF p_role = 'owner' THEN
    UPDATE public.conversation_participants
       SET role = 'admin'
     WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
  END IF;

  PERFORM public._add_system_message(p_conversation_id, 'role_changed',
    jsonb_build_object('target_id', p_user_id, 'role', p_role));
END;
$$;

-- Leave a group. Owner hand-over / orphan cleanup is done by the
-- participants_after_delete trigger. Direct chats can't be left.
CREATE OR REPLACE FUNCTION public.leave_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT p.status INTO v_status
  FROM public.conversation_participants p
  JOIN public.conversations c ON c.id = p.conversation_id
  WHERE p.conversation_id = p_conversation_id
    AND p.user_id = auth.uid()
    AND c.type = 'group';

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'not_a_group_participant';
  END IF;

  -- system message first: the trigger may delete the whole conversation
  IF v_status = 'accepted' THEN
    PERFORM public._add_system_message(p_conversation_id, 'member_left');
  END IF;

  DELETE FROM public.conversation_participants
   WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- RPC: MESSAGES
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.conversation_participants
     SET last_read_at = now()
   WHERE conversation_id = p_conversation_id
     AND user_id = auth.uid()
     AND status = 'accepted';
$$;

-- Soft delete by the author: content is wiped, the row stays as
-- "message deleted". Returns the old image_path so the frontend can
-- remove the file from Storage (SQL must not delete storage files directly).
CREATE OR REPLACE FUNCTION public.delete_message(p_message_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_image_path text;
BEGIN
  SELECT image_path INTO v_image_path
  FROM public.messages
  WHERE id = p_message_id
    AND sender_id = auth.uid()
    AND type <> 'system'
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found_or_not_yours';
  END IF;

  UPDATE public.messages
     SET deleted_at    = now(),
         body          = NULL,
         image_path    = NULL,
         skill_node_id = NULL
   WHERE id = p_message_id;

  RETURN v_image_path;
END;
$$;

-- RPC permissions: logged-in users only
REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_group_conversation(text, uuid[])        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_conversation(uuid)                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_conversation(uuid)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rename_conversation(uuid, text)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_conversation_members(uuid, uuid[])         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_conversation_member(uuid, uuid)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_participant_role(uuid, uuid, text)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_conversation(uuid)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_message(uuid)                           FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(text, uuid[])     TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_conversation(uuid)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_conversation(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_conversation(uuid, text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_conversation_members(uuid, uuid[])      TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_conversation_member(uuid, uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_participant_role(uuid, uuid, text)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_conversation(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_message(uuid)                        TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- STORAGE: chat-media (PRIVATE bucket, path {conversation_id}/{user_id}/{file})
-- ════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('chat-media', 'chat-media', false, 5242880,
          ARRAY['image/jpeg','image/png','image/webp','image/gif'])
  ON CONFLICT (id) DO UPDATE
    SET public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "chat-media member read"  ON storage.objects;
DROP POLICY IF EXISTS "chat-media member insert" ON storage.objects;
DROP POLICY IF EXISTS "chat-media owner delete" ON storage.objects;

CREATE POLICY "chat-media member read" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'chat-media'
    AND public.can_access_chat_media(name)
  );

CREATE POLICY "chat-media member insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'chat-media'
    AND public.can_access_chat_media(name)
    AND split_part(name, '/', 2) = (SELECT auth.uid())::text
  );

CREATE POLICY "chat-media owner delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'chat-media'
    AND split_part(name, '/', 2) = (SELECT auth.uid())::text
  );

-- ════════════════════════════════════════════════════════════════
-- REALTIME (live new messages + incoming chat requests; RLS applies)
-- ════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversation_participants'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
    END IF;
  END IF;
END $$;
