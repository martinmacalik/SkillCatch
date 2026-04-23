# Piece A — Avatar upload + Settings expansion

**Status:** Design
**Date:** 2026-04-23
**Scope:** First of four pieces (A → B → C → D) for the header redesign.
Related pieces: B (SkillCoins), C (public profile + page builder), D (header wiring).

## Goal

Expand the Settings page from a read-only profile snapshot into a full self-service account surface, and make user avatars real (uploaded or pulled from Google OAuth) instead of decorative gradients.

## Non-goals

- Showing the uploaded avatar in the TopBar header circles — covered in piece D.
- Any public profile rendering — covered in piece C.
- Coin-related notification preferences — covered in piece B.
- Email change flow (stays tied to Supabase auth, read-only in Settings).
- Image cropping UI. Client-side resize to 512×512 is enough for v1.

## Database changes

Add to `public.profiles`:

```sql
ALTER TABLE public.profiles
  ADD COLUMN bio text CHECK (char_length(bio) <= 160),
  ADD COLUMN country text,                    -- ISO-3166-1 alpha-2, nullable
  ADD COLUMN city text,                       -- free text, nullable
  ADD COLUMN primary_language text,           -- ISO-639-1, nullable
  ADD COLUMN theme text NOT NULL DEFAULT 'system'
    CHECK (theme IN ('light','dark','system')),
  ADD COLUMN notif_weekly_digest boolean NOT NULL DEFAULT true,
  ADD COLUMN notif_qa_answers boolean NOT NULL DEFAULT true,
  ADD COLUMN notif_proposal_updates boolean NOT NULL DEFAULT true;
```

Existing columns (`avatar_url`, `first_name`, `last_name`, `username`) are reused as-is.

### Username constraints

Add a CHECK + functional unique index for case-insensitive uniqueness:

```sql
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format
    CHECK (username IS NULL OR username ~ '^[a-z0-9_-]{3,30}$');

CREATE UNIQUE INDEX profiles_username_lower_key
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;
```

### Reserved usernames

Enforced client-side and in the validator; a `username_reserved` server-side trigger is optional (not in v1).

Reserved set: `admin`, `administrator`, `api`, `auth`, `dashboard`, `help`, `login`, `logout`, `profile`, `settings`, `signin`, `signup`, `skillpath`, `support`, `u`, `user`, `users`.

### RLS

`profiles` already has per-user RLS. Confirm policies allow `UPDATE` of the new columns by the row's owner (`auth.uid() = id`). No new policies needed if existing ones use row-level `id = auth.uid()`.

## Storage

**Bucket:** `avatars` (public read, authenticated write).
**Path:** `<user_id>/<uuid>.<ext>` where `ext ∈ {jpg, png, webp}`.
**Max size:** 2 MB (enforced by storage policy).
**Content types:** `image/jpeg`, `image/png`, `image/webp`.

Storage RLS:

```sql
-- Anyone can read avatars (public display).
CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Users can upload to their own folder only.
CREATE POLICY "avatars owner write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own objects (to clean up old avatars).
CREATE POLICY "avatars owner delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update their own objects (overwrite).
CREATE POLICY "avatars owner update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

## Google OAuth avatar handling

On every successful sign-in (in `AuthProvider`), if `profiles.avatar_url IS NULL` and `auth.user.user_metadata.avatar_url` exists, copy the Google URL into `profiles.avatar_url`. We reference the Google URL directly — no download, no storage copy.

When the user uploads a custom avatar, `profiles.avatar_url` is replaced with the Storage URL. When the user removes their avatar, `avatar_url` is set to `null` and the UI falls back to the gradient placeholder. We do not auto-revert to the Google URL — once the user has made a change, the null state is respected.

## Delete account (hard delete, GitHub-style confirm)

RPC `delete_own_account()`:

```sql
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
```

FK cascade from `auth.users` → `profiles` already exists (verify during migration). Other FKs to `auth.users` get cascaded via existing constraints or cleared via triggers that already exist in the project.

**Client confirmation UX:**
- Click "Delete account" → modal opens.
- Modal title: "Delete your account"
- Body: explains what will be deleted (profile, skill data, questions, proposals, everything).
- Confirmation field: "Type your username (`<username>`) to confirm." Submit disabled until typed exactly.
- On submit: call RPC → on success, call `supabase.auth.signOut()` → navigate to `/`.

## Settings page layout

Three sections, stacked vertically on `/dashboard/settings`:

### 1. Identity (editable)
- **Avatar uploader**: shows current avatar or gradient placeholder. Two buttons: "Upload new" (file picker, image only, < 2 MB) and "Remove". On upload: client-side resize to max 512×512 (preserve aspect), upload to Storage, update `profiles.avatar_url`, delete prior object if it was in our bucket.
- **First name** (text)
- **Last name** (text)
- **Username** (text, validated live; lowercased on input; shows red error if reserved, malformed, or taken)
- **Bio** (textarea, 160-char counter)
- **Country** (ISO-2 dropdown — use a small hand-curated list for v1, not a full country API)
- **City** (text)
- **Primary language** (dropdown: `en`, `cs`, `sk`, `de`, `fr`, `es`, `pl` — expand later)
- **Save** button (per-section) — disabled until form is dirty.

### 2. Account (read + actions)
- Email (read-only)
- Sign-in method badge (`Google` if an OAuth identity with `provider='google'` exists, else `Email + password`)
- Account created date (from `profiles.created_at`)
- "Send password reset email" button (existing)
- "Delete account" button (rose / destructive styling) → opens confirm modal.

### 3. Preferences
- Theme: radio group (Light / Dark / System)
- Notifications (toggles):
  - Weekly digest
  - Answers to my questions
  - Updates on my proposals
- **Save** button — disabled until dirty.

## Theme wiring

New `apps/web/src/contexts/ThemeProvider.tsx`. On mount and when `profiles.theme` changes, set `data-theme="light|dark"` on `<html>` (for `system`, read `prefers-color-scheme`). Tailwind's dark variants keyed off the `[data-theme="dark"]` selector via `darkMode: ['class','[data-theme="dark"]']` in `tailwind.config`. Dark styles for the app itself are *not* part of this piece — we only wire the preference and selector so future work can style against it.

## Files touched

**New:**
- `supabase/migrations/20260423001_profile_expansion.sql`
- `apps/web/src/components/settings/AvatarUploader.tsx`
- `apps/web/src/components/settings/IdentitySection.tsx`
- `apps/web/src/components/settings/AccountSection.tsx`
- `apps/web/src/components/settings/PreferencesSection.tsx`
- `apps/web/src/components/settings/DeleteAccountModal.tsx`
- `apps/web/src/contexts/ThemeProvider.tsx`
- `apps/web/src/lib/usernameRules.ts`
- `apps/web/src/lib/avatarUpload.ts` (resize + upload helper)
- `apps/web/src/lib/countries.ts` (small curated list)
- `apps/web/src/lib/languages.ts` (small curated list)

**Modified:**
- `apps/web/src/pages/SettingsPage.tsx` — wires the three sections
- `apps/web/src/contexts/AuthProvider.tsx` — on session, backfill `profiles.avatar_url` from Google metadata when null
- `apps/web/src/main.tsx` — wrap app in `ThemeProvider`
- `apps/web/tailwind.config.*` — enable `data-theme="dark"` selector

## Acceptance criteria

- A user can upload an avatar; it appears on the Settings page immediately after upload.
- A user who signed in with Google sees their Google avatar on first visit to Settings, without uploading anything.
- A user can remove their avatar; the gradient placeholder returns.
- A user can edit and save first name, last name, username, bio, country, city, primary language. Invalid / taken usernames show inline errors and block save.
- A user can switch theme; `<html data-theme>` changes; their choice persists across sessions.
- A user can toggle each notification preference and the value persists.
- A user can initiate account deletion; must type their exact username; on confirm, their `auth.users` row is deleted and they are signed out.
- All queries succeed under RLS; no service-role key is used from the browser.
- Existing password reset button continues to work.

## Risks

- Google avatar URLs can expire. If a user has only ever used the Google URL and Google invalidates it, their avatar breaks. Mitigation: the image element has an `onError` fallback to the gradient placeholder. A future enhancement can copy Google avatars into our bucket, but not in v1.
- Hard delete is irreversible. The GitHub-style username-typing confirmation is the only protection; we do not offer undo.
- If existing `profiles.username` values were ever uppercase, the new lowercase CHECK will fail the migration. Migration includes a `UPDATE profiles SET username = lower(username) WHERE username IS NOT NULL;` step before adding the constraint.
