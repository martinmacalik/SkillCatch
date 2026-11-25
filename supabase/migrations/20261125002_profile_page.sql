-- Profile page (Notion-style builder)
-- banner_url              → wide cover image above the profile (stored in the avatars bucket, userId/ folder)
-- profile_page_created_at → when the user clicked "Set up profile page"; NULL = not set up yet
-- Idempotent — safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banner_url              text,
  ADD COLUMN IF NOT EXISTS profile_page_created_at timestamptz;

-- Users who already built cards in the old builder keep a visible public profile
UPDATE public.profiles p
   SET profile_page_created_at = now()
 WHERE p.profile_page_created_at IS NULL
   AND EXISTS (SELECT 1 FROM public.profile_cards c WHERE c.user_id = p.id);
