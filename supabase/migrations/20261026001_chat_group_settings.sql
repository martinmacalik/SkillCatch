-- ════════════════════════════════════════════════════════════════
-- Chat: group settings (photo, rename by any member, delete group)
-- ════════════════════════════════════════════════════════════════
--   conversations.avatar_path → group photo, object path in the public
--                               'avatars' bucket ("{uploader_id}/{file}.webp");
--                               the uploader's folder → the existing
--                               "avatars owner insert" policy already allows it
--   rename_conversation()     → now any accepted member (was owner/admin)
--   set_group_avatar()        → any accepted member
--   delete_group()            → owner only, deletes the whole conversation
-- Removing members: remove_conversation_member() already exists.
--
-- Idempotent — safe to re-run.

-- ── GROUP PHOTO COLUMN ──────────────────────────────────────────

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS avatar_path text;

ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_avatar_path_format;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_avatar_path_format CHECK (
    avatar_path IS NULL
    OR (type = 'group' AND avatar_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$')
  );

-- ── RENAME: any accepted member ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.rename_conversation(p_conversation_id uuid, p_title text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._require_group_role(p_conversation_id, ARRAY['owner','admin','member']);

  IF p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_title';
  END IF;

  UPDATE public.conversations SET title = btrim(p_title) WHERE id = p_conversation_id;

  PERFORM public._add_system_message(p_conversation_id, 'renamed', jsonb_build_object('title', btrim(p_title)));
END;
$$;

-- ── GROUP PHOTO: any accepted member ────────────────────────────
-- p_path NULL removes the photo. The file must sit in the caller's own
-- folder, so nobody can point the group at someone else's upload.

CREATE OR REPLACE FUNCTION public.set_group_avatar(p_conversation_id uuid, p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._require_group_role(p_conversation_id, ARRAY['owner','admin','member']);

  IF p_path IS NOT NULL AND split_part(p_path, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'invalid_avatar_path';
  END IF;

  UPDATE public.conversations SET avatar_path = p_path WHERE id = p_conversation_id;

  PERFORM public._add_system_message(p_conversation_id, 'photo_changed');
END;
$$;

-- ── DELETE GROUP: owner only ────────────────────────────────────
-- Participants, messages, reactions, hidden rows go with ON DELETE CASCADE.
-- Files in chat-media / avatars stay (SQL must not delete storage objects).

CREATE OR REPLACE FUNCTION public.delete_group(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._require_group_role(p_conversation_id, ARRAY['owner']);

  DELETE FROM public.conversations WHERE id = p_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_group_avatar(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_group(uuid)           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_group_avatar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_group(uuid)           TO authenticated;
