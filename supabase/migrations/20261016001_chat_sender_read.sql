-- Fix: my own message marked the conversation as unread for me.
-- Unread = last_message_at > my last_read_at, and sending a message bumped
-- last_message_at without touching the sender's last_read_at.
--
-- Fix: the after-insert trigger also moves the sender's last_read_at to the
-- message time (sending a message implies I've read the conversation).
-- GREATEST keeps it from moving backwards. System messages (sender_id NULL)
-- match no participant and change nothing.

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

  UPDATE public.conversation_participants
     SET last_read_at = GREATEST(COALESCE(last_read_at, NEW.created_at), NEW.created_at)
   WHERE conversation_id = NEW.conversation_id
     AND user_id = NEW.sender_id;

  RETURN NEW;
END;
$$;
