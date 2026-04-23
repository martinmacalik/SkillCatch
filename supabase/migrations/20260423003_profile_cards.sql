-- profile_cards: user-built public profile blocks

CREATE TABLE IF NOT EXISTS public.profile_cards (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position     integer     NOT NULL DEFAULT 0,
  type         text        NOT NULL CHECK (type IN ('text','text_photo','photo','skills','cv')),
  data         jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_cards_user_position_idx
  ON public.profile_cards (user_id, position);

ALTER TABLE public.profile_cards ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_cards' AND policyname='cards_select_authenticated'
  ) THEN
    CREATE POLICY cards_select_authenticated ON public.profile_cards
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_cards' AND policyname='cards_owner_insert'
  ) THEN
    CREATE POLICY cards_owner_insert ON public.profile_cards
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_cards' AND policyname='cards_owner_update'
  ) THEN
    CREATE POLICY cards_owner_update ON public.profile_cards
      FOR UPDATE TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profile_cards' AND policyname='cards_owner_delete'
  ) THEN
    CREATE POLICY cards_owner_delete ON public.profile_cards
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- profile-media storage bucket (card photos + CV uploads)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('profile-media', 'profile-media', true, 10485760,
          ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
  ON CONFLICT (id) DO UPDATE
    SET public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "profile-media public read"  ON storage.objects;
DROP POLICY IF EXISTS "profile-media owner insert" ON storage.objects;
DROP POLICY IF EXISTS "profile-media owner update" ON storage.objects;
DROP POLICY IF EXISTS "profile-media owner delete" ON storage.objects;

CREATE POLICY "profile-media public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-media');

CREATE POLICY "profile-media owner insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'profile-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "profile-media owner update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'profile-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "profile-media owner delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'profile-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- reorder_profile_cards: atomically sets position = array index for each card
CREATE OR REPLACE FUNCTION public.reorder_profile_cards(p_user_id uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_i int;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  FOR v_i IN 1..array_length(p_ids, 1) LOOP
    UPDATE profile_cards
       SET position = v_i
     WHERE id = p_ids[v_i] AND user_id = p_user_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_profile_cards(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_profile_cards(uuid, uuid[]) TO authenticated;
