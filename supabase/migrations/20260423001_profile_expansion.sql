-- Piece A: profile expansion
-- Adds editable profile columns, username constraints, the avatars storage
-- bucket + policies, FK cascades on auth.users, and delete_own_account() RPC.
-- Idempotent — safe to re-run.

-- 1. Profile columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio                     text CHECK (char_length(bio) <= 160),
  ADD COLUMN IF NOT EXISTS country                 text,
  ADD COLUMN IF NOT EXISTS city                    text,
  ADD COLUMN IF NOT EXISTS primary_language        text,
  ADD COLUMN IF NOT EXISTS theme                   text NOT NULL DEFAULT 'system'
    CHECK (theme IN ('light','dark','system')),
  ADD COLUMN IF NOT EXISTS notif_weekly_digest     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_qa_answers        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_proposal_updates  boolean NOT NULL DEFAULT true;

-- 2. Lowercase existing usernames so the format CHECK won't fail
UPDATE public.profiles
   SET username = lower(username)
 WHERE username IS NOT NULL
   AND username <> lower(username);

-- 3. Username format + case-insensitive uniqueness
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format
    CHECK (username IS NULL OR username ~ '^[a-z0-9_-]{3,30}$');

DROP INDEX IF EXISTS profiles_username_lower_key;
CREATE UNIQUE INDEX profiles_username_lower_key
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- 4. Ensure own-row UPDATE + SELECT policies exist on profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'profiles'
       AND policyname = 'profiles_self_update'
  ) THEN
    CREATE POLICY profiles_self_update ON public.profiles
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'profiles'
       AND policyname = 'profiles_self_select'
  ) THEN
    CREATE POLICY profiles_self_select ON public.profiles
      FOR SELECT
      TO authenticated
      USING (true); -- profiles are effectively public (piece C needs /u/:username)
  END IF;
END $$;

-- 5. FK cascades so delete_own_account() can remove auth.users row

-- profiles.id — cascade
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_skills.user_id — cascade
ALTER TABLE public.user_skills
  DROP CONSTRAINT IF EXISTS user_skills_user_id_fkey;
ALTER TABLE public.user_skills
  ADD CONSTRAINT user_skills_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_skill_attributes.user_id — cascade
ALTER TABLE public.user_skill_attributes
  DROP CONSTRAINT IF EXISTS user_skill_attributes_user_id_fkey;
ALTER TABLE public.user_skill_attributes
  ADD CONSTRAINT user_skill_attributes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- teaching_offers.user_id — cascade
ALTER TABLE public.teaching_offers
  DROP CONSTRAINT IF EXISTS teaching_offers_user_id_fkey;
ALTER TABLE public.teaching_offers
  ADD CONSTRAINT teaching_offers_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- admin_users.created_by — set null
ALTER TABLE public.admin_users
  DROP CONSTRAINT IF EXISTS admin_users_created_by_fkey;
ALTER TABLE public.admin_users
  ADD CONSTRAINT admin_users_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- node_restructure_requests.reviewed_by — set null
ALTER TABLE public.node_restructure_requests
  DROP CONSTRAINT IF EXISTS node_restructure_requests_reviewed_by_fkey;
ALTER TABLE public.node_restructure_requests
  ADD CONSTRAINT node_restructure_requests_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- support_messages.handled_by — set null
ALTER TABLE public.support_messages
  DROP CONSTRAINT IF EXISTS support_messages_handled_by_fkey;
ALTER TABLE public.support_messages
  ADD CONSTRAINT support_messages_handled_by_fkey
    FOREIGN KEY (handled_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- admin_audit_log.actor_user_id — set null (keep audit row, clear actor)
ALTER TABLE public.admin_audit_log
  ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_actor_user_id_fkey;
ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 6. Avatars storage bucket (public read, authenticated self-write)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('avatars', 'avatars', true, 2097152,
          ARRAY['image/jpeg','image/png','image/webp'])
  ON CONFLICT (id) DO UPDATE
    SET public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "avatars public read"  ON storage.objects;
DROP POLICY IF EXISTS "avatars owner insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars owner update" ON storage.objects;
DROP POLICY IF EXISTS "avatars owner delete" ON storage.objects;

CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars owner insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars owner update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars owner delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 7. delete_own_account() RPC — relies on FK cascades above
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
