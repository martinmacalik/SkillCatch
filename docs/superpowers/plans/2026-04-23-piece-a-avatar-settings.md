# Piece A — Avatar + Settings Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the Settings page into a full self-service surface with editable profile fields, uploadable avatars (backed by Supabase Storage with Google OAuth fallback), theme preference, notification toggles, and a GitHub-style hard delete account flow.

**Architecture:** Single Supabase migration adds columns, a storage bucket, storage policies, FK cascades on `auth.users`, and a `delete_own_account()` RPC. Frontend work adds three composable Settings sections (Identity / Account / Preferences) plus a `ThemeProvider` context that reflects `profiles.theme`. `AuthProvider` gains a one-time backfill that copies a Google-provided `avatar_url` into `profiles.avatar_url` when the row's value is `null`.

**Tech Stack:** React 19 + Vite + TypeScript, Tailwind v4 (`@custom-variant dark (&:is(.dark *))` already wired in [index.css:5](apps/web/src/index.css#L5)), Supabase (Postgres + Storage + RLS), `@supabase/supabase-js` v2.

**Testing note:** `apps/web` has no test framework today (`admin-api` uses vitest, web does not). This plan substitutes manual verification steps — browser + dev server + Supabase SQL editor — for unit tests. Adding vitest to web is out of scope for this piece.

**Spec:** [docs/superpowers/specs/2026-04-23-piece-a-avatar-settings-design.md](docs/superpowers/specs/2026-04-23-piece-a-avatar-settings-design.md)

---

## File structure

**New files:**
- `supabase/migrations/20260423001_profile_expansion.sql` — schema + storage + RPC + FK cascades
- `apps/web/src/lib/usernameRules.ts` — validator + reserved list
- `apps/web/src/lib/countries.ts` — curated ISO-2 → label list
- `apps/web/src/lib/languages.ts` — curated ISO-639-1 → label list
- `apps/web/src/lib/avatarUpload.ts` — resize + upload + cleanup helper
- `apps/web/src/contexts/ThemeProvider.tsx` — reads `profiles.theme`, toggles `.dark` on `<html>`
- `apps/web/src/components/settings/AvatarUploader.tsx`
- `apps/web/src/components/settings/IdentitySection.tsx`
- `apps/web/src/components/settings/AccountSection.tsx`
- `apps/web/src/components/settings/DeleteAccountModal.tsx`
- `apps/web/src/components/settings/PreferencesSection.tsx`

**Modified files:**
- `apps/web/src/pages/SettingsPage.tsx` — rewritten to compose the three sections
- `apps/web/src/contexts/AuthProvider.tsx` — adds Google avatar backfill on session
- `apps/web/src/main.tsx` — wraps app in `ThemeProvider` under `AuthProvider`

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260423001_profile_expansion.sql`

**Context:** Adds profile columns, lowercases any existing username values, adds username format/uniqueness constraints, creates the `avatars` storage bucket and policies, replaces FKs to `auth.users` with CASCADE/SET NULL so hard delete works, and defines `public.delete_own_account()`.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260423001_profile_expansion.sql

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

-- 4. Ensure own-row UPDATE policy exists
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
      USING (true); -- profiles are effectively public (needed later for /u/:username in piece C)
  END IF;
END $$;

-- 5. FK cascades so delete_own_account() can remove auth.users row
--    Rewrite each FK to REFERENCES auth.users(id) with an explicit action.

-- profiles.id — cascade
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_skills.user_id — cascade (user's own data)
ALTER TABLE public.user_skills
  DROP CONSTRAINT IF EXISTS user_skills_user_id_fkey;
ALTER TABLE public.user_skills
  ADD CONSTRAINT user_skills_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_skill_attributes.user_id — cascade (user's own data)
ALTER TABLE public.user_skill_attributes
  DROP CONSTRAINT IF EXISTS user_skill_attributes_user_id_fkey;
ALTER TABLE public.user_skill_attributes
  ADD CONSTRAINT user_skill_attributes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- teaching_offers.user_id — cascade (user's own data)
ALTER TABLE public.teaching_offers
  DROP CONSTRAINT IF EXISTS teaching_offers_user_id_fkey;
ALTER TABLE public.teaching_offers
  ADD CONSTRAINT teaching_offers_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- admin_users.created_by — set null (audit reference, don't block deletion)
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

-- admin_audit_log.actor_user_id — set null (keep audit row, null out actor)
--   First make the column nullable so SET NULL is valid.
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
    SET public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- Drop prior policies if re-running
DROP POLICY IF EXISTS "avatars public read"   ON storage.objects;
DROP POLICY IF EXISTS "avatars owner insert"  ON storage.objects;
DROP POLICY IF EXISTS "avatars owner update"  ON storage.objects;
DROP POLICY IF EXISTS "avatars owner delete"  ON storage.objects;

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
```

- [ ] **Step 2: Apply the migration**

Run the whole file in the Supabase SQL editor (production/staging). It's idempotent — safe to re-run.

- [ ] **Step 3: Manually verify each piece**

In the SQL editor run:

```sql
-- Columns present
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='profiles'
   AND column_name IN ('bio','country','city','primary_language','theme',
                       'notif_weekly_digest','notif_qa_answers','notif_proposal_updates');
-- Expect 8 rows.

-- Username constraint + index
SELECT conname FROM pg_constraint
 WHERE conrelid='public.profiles'::regclass AND conname='profiles_username_format';
SELECT indexname FROM pg_indexes
 WHERE schemaname='public' AND tablename='profiles' AND indexname='profiles_username_lower_key';

-- Bucket
SELECT id, public, file_size_limit FROM storage.buckets WHERE id='avatars';
-- Expect: ('avatars', true, 2097152)

-- RPC
SELECT proname, provolatile FROM pg_proc WHERE proname='delete_own_account';
-- Expect 1 row.

-- Profiles FK
SELECT confdeltype FROM pg_constraint WHERE conname='profiles_id_fkey';
-- Expect 'c' (cascade).
```

Every check should return the expected row(s).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260423001_profile_expansion.sql
git commit -m "feat(db): add profile expansion migration (columns, avatars bucket, delete RPC)"
```

---

## Task 2: Username validator, country + language lists

**Files:**
- Create: `apps/web/src/lib/usernameRules.ts`
- Create: `apps/web/src/lib/countries.ts`
- Create: `apps/web/src/lib/languages.ts`

**Context:** Pure modules, no dependencies beyond standard JS. Kept separate so sections can import them without circular deps.

- [ ] **Step 1: Write `usernameRules.ts`**

```ts
// apps/web/src/lib/usernameRules.ts

export const USERNAME_MIN = 3
export const USERNAME_MAX = 30

export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'api', 'auth', 'dashboard', 'help',
  'login', 'logout', 'profile', 'settings', 'signin', 'signup',
  'skillpath', 'support', 'u', 'user', 'users',
])

export type UsernameError =
  | 'too-short'
  | 'too-long'
  | 'bad-chars'
  | 'reserved'

export function validateUsername(raw: string): UsernameError | null {
  const v = raw.toLowerCase()
  if (v.length < USERNAME_MIN) return 'too-short'
  if (v.length > USERNAME_MAX) return 'too-long'
  if (!/^[a-z0-9_-]+$/.test(v)) return 'bad-chars'
  if (RESERVED_USERNAMES.has(v)) return 'reserved'
  return null
}

export function usernameErrorMessage(err: UsernameError): string {
  switch (err) {
    case 'too-short': return `Username must be at least ${USERNAME_MIN} characters.`
    case 'too-long':  return `Username must be at most ${USERNAME_MAX} characters.`
    case 'bad-chars': return 'Only lowercase letters, numbers, underscore, and hyphen.'
    case 'reserved':  return 'This username is reserved.'
  }
}
```

- [ ] **Step 2: Write `countries.ts`**

```ts
// apps/web/src/lib/countries.ts
// Small curated list. Expand later when we have real users from more places.

export type Country = { code: string; label: string }

export const COUNTRIES: Country[] = [
  { code: 'CZ', label: 'Czech Republic' },
  { code: 'SK', label: 'Slovakia' },
  { code: 'PL', label: 'Poland' },
  { code: 'DE', label: 'Germany' },
  { code: 'AT', label: 'Austria' },
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'FR', label: 'France' },
  { code: 'ES', label: 'Spain' },
  { code: 'IT', label: 'Italy' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'SE', label: 'Sweden' },
  { code: 'NO', label: 'Norway' },
  { code: 'DK', label: 'Denmark' },
  { code: 'FI', label: 'Finland' },
  { code: 'CA', label: 'Canada' },
  { code: 'AU', label: 'Australia' },
  { code: 'JP', label: 'Japan' },
]
```

- [ ] **Step 3: Write `languages.ts`**

```ts
// apps/web/src/lib/languages.ts

export type Language = { code: string; label: string }

export const LANGUAGES: Language[] = [
  { code: 'en', label: 'English' },
  { code: 'cs', label: 'Čeština' },
  { code: 'sk', label: 'Slovenčina' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'pl', label: 'Polski' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'sv', label: 'Svenska' },
  { code: 'ja', label: '日本語' },
]
```

- [ ] **Step 4: Sanity check (typecheck)**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors in the new files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/usernameRules.ts apps/web/src/lib/countries.ts apps/web/src/lib/languages.ts
git commit -m "feat(web): add username validator + country/language lists"
```

---

## Task 3: Avatar upload helper

**Files:**
- Create: `apps/web/src/lib/avatarUpload.ts`

**Context:** Pure browser helper. Accepts a `File`, downsizes to max 512×512 via canvas preserving aspect, uploads to `avatars/<uid>/<uuid>.webp`, and optionally cleans up a prior in-bucket object. Returns the public URL.

- [ ] **Step 1: Write the helper**

```ts
// apps/web/src/lib/avatarUpload.ts
import { supabase } from './supabaseClient'

const MAX_DIM = 512
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

export class AvatarUploadError extends Error {}

async function resizeToBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new AvatarUploadError('Canvas 2D context unavailable.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new AvatarUploadError('Canvas toBlob failed.'))),
      'image/webp',
      0.9,
    )
  })
}

/**
 * Try to delete a prior avatar object if it lives in our bucket.
 * Best-effort — failures are swallowed.
 */
async function tryDeletePrior(userId: string, priorUrl: string | null) {
  if (!priorUrl) return
  const marker = `/storage/v1/object/public/avatars/${userId}/`
  const idx = priorUrl.indexOf(marker)
  if (idx === -1) return // not ours — probably a Google URL
  const objectPath = `${userId}/${priorUrl.slice(idx + marker.length)}`
  await supabase.storage.from('avatars').remove([objectPath])
}

/**
 * Upload a new avatar for `userId`, update `profiles.avatar_url`, and
 * return the public URL that was saved.
 */
export async function uploadAvatar(
  userId: string,
  file: File,
  priorUrl: string | null,
): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new AvatarUploadError('File is larger than 2 MB.')
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new AvatarUploadError('Only JPEG, PNG, or WebP images are allowed.')
  }

  const blob = await resizeToBlob(file)
  const objectName = `${userId}/${crypto.randomUUID()}.webp`

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(objectName, blob, { contentType: 'image/webp', upsert: false })
  if (uploadErr) throw new AvatarUploadError(uploadErr.message)

  const { data } = supabase.storage.from('avatars').getPublicUrl(objectName)
  const publicUrl = data.publicUrl

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (updateErr) throw new AvatarUploadError(updateErr.message)

  await tryDeletePrior(userId, priorUrl)
  return publicUrl
}

/**
 * Clear `profiles.avatar_url` and, if the prior URL lives in our bucket,
 * delete the storage object too.
 */
export async function removeAvatar(userId: string, priorUrl: string | null) {
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw new AvatarUploadError(error.message)
  await tryDeletePrior(userId, priorUrl)
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/avatarUpload.ts
git commit -m "feat(web): add avatar upload helper (resize + storage + profile update)"
```

---

## Task 4: ThemeProvider

**Files:**
- Create: `apps/web/src/contexts/ThemeProvider.tsx`
- Modify: `apps/web/src/main.tsx`

**Context:** Tailwind v4 dark variant is already wired as `.dark` class on any ancestor ([index.css:5](apps/web/src/index.css#L5)). This provider reads `profiles.theme` for the current user and applies `.dark` on `<html>` accordingly. For `theme='system'` it follows `prefers-color-scheme` and listens for changes.

- [ ] **Step 1: Write `ThemeProvider.tsx`**

```tsx
// apps/web/src/contexts/ThemeProvider.tsx
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthProvider'

export type ThemePreference = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: ThemePreference
  setTheme: (t: ThemePreference) => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyDarkClass(effective: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', effective === 'dark')
}

function resolveEffective(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return pref
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [theme, setThemeState] = useState<ThemePreference>('system')

  // Load preference from profiles on session change
  useEffect(() => {
    if (!session?.user) {
      applyDarkClass(resolveEffective('system'))
      return
    }
    supabase
      .from('profiles')
      .select('theme')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        const t = (data?.theme ?? 'system') as ThemePreference
        setThemeState(t)
        applyDarkClass(resolveEffective(t))
      })
  }, [session])

  // When the user's OS-level preference changes AND they're on 'system', re-apply
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyDarkClass(resolveEffective('system'))
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback(
    async (t: ThemePreference) => {
      setThemeState(t)
      applyDarkClass(resolveEffective(t))
      if (session?.user) {
        await supabase.from('profiles').update({ theme: t }).eq('id', session.user.id)
      }
    },
    [session],
  )

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
```

- [ ] **Step 2: Wrap `main.tsx`**

Replace the tree inside `createRoot(...).render(...)`:

```tsx
// apps/web/src/main.tsx — new body (inside createRoot.render)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthProvider'
import { SearchProvider } from './contexts/SearchContext'
import { ThemeProvider } from './contexts/ThemeProvider'

import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";

import "@fontsource/literata/500.css";
import "@fontsource/literata/400.css";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <SearchProvider>
            <App />
          </SearchProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
```

`ThemeProvider` must be **inside** `AuthProvider` (it calls `useAuth`).

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `cd apps/web && pnpm dev`

1. Open the app, sign in, open DevTools → Elements.
2. Confirm `<html>` has (or does not have) the `.dark` class matching your OS's current color scheme.
3. In Supabase SQL editor: `UPDATE profiles SET theme='dark' WHERE id = '<your-uid>';` then reload.
4. Confirm `<html class="dark">` is now present regardless of OS.
5. Reset: `UPDATE profiles SET theme='system' WHERE id = '<your-uid>';`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/contexts/ThemeProvider.tsx apps/web/src/main.tsx
git commit -m "feat(web): add ThemeProvider that reflects profiles.theme"
```

---

## Task 5: AuthProvider Google avatar backfill

**Files:**
- Modify: `apps/web/src/contexts/AuthProvider.tsx`

**Context:** After a successful sign-in, if `profiles.avatar_url` is `null` and `auth.user.user_metadata.avatar_url` has a Google-provided URL, copy the URL into `profiles.avatar_url`. Runs once per session.

- [ ] **Step 1: Modify AuthProvider**

Replace the file content with:

```tsx
// apps/web/src/contexts/AuthProvider.tsx
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

interface AuthContextType {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function backfillGoogleAvatarIfNeeded(session: Session) {
  const user = session.user;
  const providerAvatar =
    (user.user_metadata?.avatar_url as string | undefined) ??
    (user.user_metadata?.picture as string | undefined);
  if (!providerAvatar) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .single();
  if (error || !data) return;
  if (data.avatar_url) return; // already set (custom upload or previously backfilled)

  await supabase
    .from("profiles")
    .update({ avatar_url: providerAvatar, updated_at: new Date().toISOString() })
    .eq("id", user.id);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const backfilledForUser = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  // One-shot backfill per user per page load
  useEffect(() => {
    if (!session?.user) {
      backfilledForUser.current = null;
      return;
    }
    if (backfilledForUser.current === session.user.id) return;
    backfilledForUser.current = session.user.id;
    void backfillGoogleAvatarIfNeeded(session);
  }, [session]);

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

With a Google-signed-in test account whose `profiles.avatar_url IS NULL`:

1. In Supabase SQL editor: `UPDATE profiles SET avatar_url = NULL WHERE id = '<your-uid>';`
2. Reload the web app.
3. In SQL editor: `SELECT avatar_url FROM profiles WHERE id = '<your-uid>';` — should now be the Google URL.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/contexts/AuthProvider.tsx
git commit -m "feat(web): backfill profiles.avatar_url from Google metadata when null"
```

---

## Task 6: AvatarUploader component

**Files:**
- Create: `apps/web/src/components/settings/AvatarUploader.tsx`

**Context:** Visual component owning the avatar preview + "Upload new" + "Remove" buttons. Surfaces upload progress + errors. Parent passes `userId`, `currentUrl`, `onChange(newUrl|null)`.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/settings/AvatarUploader.tsx
import { useRef, useState } from 'react'
import { uploadAvatar, removeAvatar, AvatarUploadError } from '../../lib/avatarUpload'

interface Props {
  userId: string
  currentUrl: string | null
  onChange: (newUrl: string | null) => void
}

export function AvatarUploader({ userId, currentUrl, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [brokenImage, setBrokenImage] = useState(false)

  const handleFile = async (file: File) => {
    setBusy(true)
    setErr(null)
    try {
      const url = await uploadAvatar(userId, file, currentUrl)
      setBrokenImage(false)
      onChange(url)
    } catch (e) {
      setErr(e instanceof AvatarUploadError ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    setBusy(true)
    setErr(null)
    try {
      await removeAvatar(userId, currentUrl)
      onChange(null)
    } catch (e) {
      setErr(e instanceof AvatarUploadError ? e.message : 'Remove failed.')
    } finally {
      setBusy(false)
    }
  }

  const showImage = currentUrl && !brokenImage

  return (
    <div className="flex items-center gap-5">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-purple-300 to-indigo-400">
        {showImage && (
          <img
            src={currentUrl}
            alt="Avatar"
            className="h-full w-full object-cover"
            onError={() => setBrokenImage(true)}
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-xl bg-purple-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-800 disabled:opacity-60"
          >
            {busy ? 'Working…' : 'Upload new'}
          </button>
          <button
            type="button"
            disabled={busy || !currentUrl}
            onClick={handleRemove}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
          >
            Remove
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
              e.target.value = '' // allow re-selecting the same file
            }}
          />
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <p className="text-xs text-gray-400">JPEG, PNG, or WebP — up to 2 MB.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/settings/AvatarUploader.tsx
git commit -m "feat(web): add AvatarUploader component"
```

---

## Task 7: IdentitySection component

**Files:**
- Create: `apps/web/src/components/settings/IdentitySection.tsx`

**Context:** Form for avatar + first/last name + username + bio + country + city + primary language. Owns its own load + save state. Uses `AvatarUploader` (which saves avatar independently) and a single **Save** button for the text fields.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/settings/IdentitySection.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { validateUsername, usernameErrorMessage } from '../../lib/usernameRules'
import { COUNTRIES } from '../../lib/countries'
import { LANGUAGES } from '../../lib/languages'
import { AvatarUploader } from './AvatarUploader'

interface IdentityRow {
  avatar_url: string | null
  first_name: string | null
  last_name: string | null
  username: string | null
  bio: string | null
  country: string | null
  city: string | null
  primary_language: string | null
}

const EMPTY: IdentityRow = {
  avatar_url: null,
  first_name: '',
  last_name: '',
  username: '',
  bio: '',
  country: '',
  city: '',
  primary_language: '',
}

export function IdentitySection({ userId }: { userId: string }) {
  const [original, setOriginal] = useState<IdentityRow>(EMPTY)
  const [row, setRow] = useState<IdentityRow>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [usernameTaken, setUsernameTaken] = useState(false)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('avatar_url,first_name,last_name,username,bio,country,city,primary_language')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!data) return
        const r: IdentityRow = {
          avatar_url: data.avatar_url,
          first_name: data.first_name ?? '',
          last_name:  data.last_name  ?? '',
          username:   data.username   ?? '',
          bio:        data.bio        ?? '',
          country:    data.country    ?? '',
          city:       data.city       ?? '',
          primary_language: data.primary_language ?? '',
        }
        setOriginal(r)
        setRow(r)
      })
  }, [userId])

  const usernameErr = row.username
    ? validateUsername(row.username)
    : null
  const dirty = JSON.stringify(row) !== JSON.stringify(original)
  const bioLen = (row.bio ?? '').length
  const bioOver = bioLen > 160

  const handleSave = async () => {
    setSaving(true)
    setSaveErr(null)
    setSaved(false)
    setUsernameTaken(false)
    const patch = {
      first_name:       row.first_name || null,
      last_name:        row.last_name || null,
      username:         row.username || null,
      bio:              row.bio || null,
      country:          row.country || null,
      city:             row.city || null,
      primary_language: row.primary_language || null,
      updated_at:       new Date().toISOString(),
    }
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
    setSaving(false)
    if (error) {
      // 23505 = unique_violation → username collision
      if ((error as { code?: string }).code === '23505') {
        setUsernameTaken(true)
      } else {
        setSaveErr(error.message)
      }
      return
    }
    setOriginal(row)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const canSave = dirty && !saving && !usernameErr && !bioOver

  return (
    <div
      className="rounded-2xl bg-white p-6"
      style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
    >
      <h2 className="text-xl font-normal text-gray-900">Identity</h2>
      <p className="mt-0.5 text-sm text-gray-400">How you appear to yourself and others.</p>

      <div className="mt-6">
        <AvatarUploader
          userId={userId}
          currentUrl={row.avatar_url}
          onChange={(url) => {
            setRow((r) => ({ ...r, avatar_url: url }))
            setOriginal((o) => ({ ...o, avatar_url: url })) // avatar saves itself
          }}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="First name">
          <input
            className="input"
            value={row.first_name ?? ''}
            onChange={(e) => setRow({ ...row, first_name: e.target.value })}
          />
        </Field>
        <Field label="Last name">
          <input
            className="input"
            value={row.last_name ?? ''}
            onChange={(e) => setRow({ ...row, last_name: e.target.value })}
          />
        </Field>

        <Field label="Username" error={
          usernameTaken ? 'That username is taken.' :
          usernameErr ? usernameErrorMessage(usernameErr) : undefined
        }>
          <input
            className="input"
            value={row.username ?? ''}
            onChange={(e) =>
              setRow({ ...row, username: e.target.value.toLowerCase() })
            }
            placeholder="e.g. martin_m"
          />
        </Field>
        <Field label="Primary language">
          <select
            className="input"
            value={row.primary_language ?? ''}
            onChange={(e) => setRow({ ...row, primary_language: e.target.value })}
          >
            <option value="">—</option>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Country">
          <select
            className="input"
            value={row.country ?? ''}
            onChange={(e) => setRow({ ...row, country: e.target.value })}
          >
            <option value="">—</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field label="City">
          <input
            className="input"
            value={row.city ?? ''}
            onChange={(e) => setRow({ ...row, city: e.target.value })}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Bio"
            error={bioOver ? `${bioLen}/160` : undefined}
            hint={!bioOver ? `${bioLen}/160` : undefined}
          >
            <textarea
              className="input min-h-[80px] resize-y"
              maxLength={200}
              value={row.bio ?? ''}
              onChange={(e) => setRow({ ...row, bio: e.target.value })}
              placeholder="One line about you."
            />
          </Field>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="rounded-xl bg-purple-700 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <p className="text-sm text-emerald-600">Saved.</p>}
        {saveErr && <p className="text-sm text-rose-600">{saveErr}</p>}
      </div>
    </div>
  )
}

function Field({
  label, error, hint, children,
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-widest text-gray-400">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
      {!error && hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  )
}
```

- [ ] **Step 2: Add the shared `.input` class**

Append to `apps/web/src/index.css` inside the existing `@layer components` block:

```css
.input {
  @apply w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-200;
}
```

(If that layer already closes before you get there, add it at the end of the file as its own `@layer components` block.)

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/settings/IdentitySection.tsx apps/web/src/index.css
git commit -m "feat(web): add IdentitySection + shared .input class"
```

---

## Task 8: DeleteAccountModal + AccountSection

**Files:**
- Create: `apps/web/src/components/settings/DeleteAccountModal.tsx`
- Create: `apps/web/src/components/settings/AccountSection.tsx`

**Context:** Modal requires typing the user's exact username to enable the destructive button, then calls `delete_own_account()` → signs out → navigates to `/`. `AccountSection` shows email + sign-in method + created date + password reset + delete trigger.

- [ ] **Step 1: Write `DeleteAccountModal.tsx`**

```tsx
// apps/web/src/components/settings/DeleteAccountModal.tsx
import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

interface Props {
  username: string | null
  onClose: () => void
}

export function DeleteAccountModal({ username, onClose }: Props) {
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const required = username ?? ''
  const canDelete = required !== '' && typed === required && !busy

  const handleDelete = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await supabase.rpc('delete_own_account')
    if (error) {
      setBusy(false)
      setErr(error.message)
      return
    }
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Delete your account</h3>
        <p className="mt-2 text-sm text-gray-600">
          This removes your profile, skills, teaching offers, questions, and proposals
          permanently. This cannot be undone.
        </p>

        {required === '' ? (
          <p className="mt-4 text-sm text-rose-600">
            Set a username first in the Identity section — we use it as the
            delete confirmation.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-gray-700">
              Type <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">{required}</code> to confirm.
            </p>
            <input
              autoFocus
              className="input mt-2"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </>
        )}

        {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `AccountSection.tsx`**

```tsx
// apps/web/src/components/settings/AccountSection.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthProvider'
import { DeleteAccountModal } from './DeleteAccountModal'

export function AccountSection() {
  const { session } = useAuth()
  const [username, setUsername] = useState<string | null>(null)
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [passwordEmailSent, setPasswordEmailSent] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const email = session?.user?.email ?? ''
  const identities = session?.user?.identities ?? []
  const signInMethod = identities.find((i) => i.provider === 'google')
    ? 'Google'
    : 'Email + password'

  useEffect(() => {
    if (!session?.user) return
    supabase
      .from('profiles')
      .select('username,created_at')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setUsername(data.username)
          setCreatedAt(data.created_at)
        }
      })
  }, [session])

  const handleSendPasswordReset = async () => {
    if (!email) return
    await supabase.auth.resetPasswordForEmail(email)
    setPasswordEmailSent(true)
  }

  return (
    <div className="rounded-2xl bg-white p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
      <h2 className="text-xl font-normal text-gray-900">Account</h2>
      <p className="mt-0.5 text-sm text-gray-400">Authentication and irreversible actions.</p>

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KV label="Email" value={email || '—'} />
        <KV label="Sign-in method" value={signInMethod} />
        <KV
          label="Account created"
          value={createdAt ? new Date(createdAt).toLocaleDateString() : '—'}
        />
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          onClick={handleSendPasswordReset}
          disabled={passwordEmailSent}
          className="rounded-xl bg-purple-700 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {passwordEmailSent ? 'Email sent' : 'Send password reset email'}
        </button>
        {passwordEmailSent && <p className="text-sm text-gray-400">Check your inbox at {email}.</p>}
      </div>

      <div className="mt-6 border-t border-gray-100 pt-6">
        <h3 className="text-sm font-semibold text-gray-900">Danger zone</h3>
        <p className="mt-1 text-sm text-gray-500">
          Permanently delete your account and all associated data.
        </p>
        <button
          onClick={() => setConfirmOpen(true)}
          className="mt-3 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
        >
          Delete account
        </button>
      </div>

      {confirmOpen && (
        <DeleteAccountModal username={username} onClose={() => setConfirmOpen(false)} />
      )}
    </div>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value}</dd>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/settings/DeleteAccountModal.tsx apps/web/src/components/settings/AccountSection.tsx
git commit -m "feat(web): add AccountSection + delete account confirmation modal"
```

---

## Task 9: PreferencesSection component

**Files:**
- Create: `apps/web/src/components/settings/PreferencesSection.tsx`

**Context:** Theme radio (delegates to `useTheme`) and three notification toggles saved directly to `profiles`. The notif toggles persist on toggle (no Save button needed — they're one-click state).

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/settings/PreferencesSection.tsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useTheme } from '../../contexts/ThemeProvider'
import type { ThemePreference } from '../../contexts/ThemeProvider'

type Notif = {
  notif_weekly_digest: boolean
  notif_qa_answers: boolean
  notif_proposal_updates: boolean
}

const EMPTY_NOTIF: Notif = {
  notif_weekly_digest: true,
  notif_qa_answers: true,
  notif_proposal_updates: true,
}

export function PreferencesSection({ userId }: { userId: string }) {
  const { theme, setTheme } = useTheme()
  const [notif, setNotif] = useState<Notif>(EMPTY_NOTIF)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('notif_weekly_digest,notif_qa_answers,notif_proposal_updates')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) setNotif(data as Notif)
      })
  }, [userId])

  const toggle = async (key: keyof Notif) => {
    const next = { ...notif, [key]: !notif[key] }
    setNotif(next)
    await supabase.from('profiles').update({ [key]: next[key] }).eq('id', userId)
  }

  return (
    <div className="rounded-2xl bg-white p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
      <h2 className="text-xl font-normal text-gray-900">Preferences</h2>
      <p className="mt-0.5 text-sm text-gray-400">Theme and notifications.</p>

      <div className="mt-6">
        <p className="mb-2 text-xs uppercase tracking-widest text-gray-400">Theme</p>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as ThemePreference[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => void setTheme(t)}
              className={[
                'rounded-xl border px-4 py-2 text-sm font-medium transition',
                theme === t
                  ? 'border-purple-700 bg-purple-700 text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100',
              ].join(' ')}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <p className="mb-2 text-xs uppercase tracking-widest text-gray-400">Notifications</p>
        <div className="space-y-3">
          <Toggle
            label="Weekly digest"
            description="A summary of new skills, resources, and popular questions once per week."
            checked={notif.notif_weekly_digest}
            onChange={() => void toggle('notif_weekly_digest')}
          />
          <Toggle
            label="Answers to my questions"
            description="Ping me when someone answers a question I've asked."
            checked={notif.notif_qa_answers}
            onChange={() => void toggle('notif_qa_answers')}
          />
          <Toggle
            label="Updates on my proposals"
            description="Ping me when an admin approves or rejects a skill-tree change I submitted."
            checked={notif.notif_proposal_updates}
            onChange={() => void toggle('notif_proposal_updates')}
          />
        </div>
      </div>
    </div>
  )
}

function Toggle({
  label, description, checked, onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <span className="flex-1">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="mt-0.5 block text-xs text-gray-500">{description}</span>
      </span>
      <button
        role="switch"
        aria-checked={checked}
        type="button"
        onClick={onChange}
        className={[
          'relative h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-purple-700' : 'bg-gray-300',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </label>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/settings/PreferencesSection.tsx
git commit -m "feat(web): add PreferencesSection (theme + notification toggles)"
```

---

## Task 10: Wire SettingsPage

**Files:**
- Modify: `apps/web/src/pages/SettingsPage.tsx`

**Context:** Replace the existing read-only layout with the three composed sections. Keep the page's scroll behavior (the existing wrapper classes).

- [ ] **Step 1: Replace SettingsPage.tsx**

```tsx
// apps/web/src/pages/SettingsPage.tsx
import { useAuth } from '../contexts/AuthProvider'
import { IdentitySection } from '../components/settings/IdentitySection'
import { AccountSection } from '../components/settings/AccountSection'
import { PreferencesSection } from '../components/settings/PreferencesSection'

export default function SettingsPage() {
  const { session } = useAuth()
  const userId = session?.user?.id

  return (
    <div className="skills-scroll -mx-7 -my-5 flex flex-1 flex-col gap-8 overflow-y-auto px-7 py-5">
      <div>
        <h1 className="text-4xl font-normal text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-400">Manage your account preferences.</p>
      </div>

      {userId ? (
        <>
          <IdentitySection userId={userId} />
          <AccountSection />
          <PreferencesSection userId={userId} />
        </>
      ) : (
        <div className="rounded-2xl bg-white p-6 text-sm text-gray-500">
          You need to be signed in to manage settings.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/SettingsPage.tsx
git commit -m "feat(web): rewrite SettingsPage with Identity/Account/Preferences sections"
```

---

## Task 11: Manual QA pass

**Files:** none.

**Context:** Exercise every acceptance criterion from the spec end-to-end on the dev server.

- [ ] **Step 1: Start the dev server**

Run: `cd apps/web && pnpm dev`
Navigate to `/dashboard/settings` after signing in.

- [ ] **Step 2: Identity flows**
  - Upload a JPEG < 2 MB → appears as preview within a few seconds, `profiles.avatar_url` points to `https://…/storage/v1/object/public/avatars/<uid>/…webp`.
  - Upload a 3 MB file → shows "File is larger than 2 MB." error, no DB change.
  - Click Remove → preview reverts to gradient, `profiles.avatar_url` is `null`.
  - Edit first/last name, bio (test the 160 counter + over-limit error), country, city, primary language → Save → reload page → values persist.
  - Try username `ab` → "too-short" error, Save disabled.
  - Try username `Admin` (ends up `admin` after lowercase) → "reserved" error.
  - Pick a valid unique username → Save succeeds.
  - With a second test account, try to Save the same username → "That username is taken." error.

- [ ] **Step 3: Account flows**
  - Email displays as read-only.
  - Sign-in method badge shows `Google` when signed in via Google, `Email + password` otherwise.
  - Send password reset email → button becomes "Email sent", inbox receives the message.

- [ ] **Step 4: Preferences flows**
  - Click Light / Dark / System → `<html>` class toggles; reload → choice sticks.
  - Toggle each notification switch → reload → state sticks.

- [ ] **Step 5: Google backfill**
  - For a Google-signed-in user, `UPDATE profiles SET avatar_url = NULL WHERE id='<uid>';` in SQL → reload page → `avatar_url` re-populated with Google URL, preview shows Google avatar.

- [ ] **Step 6: Delete account**
  - Use a throwaway test account.
  - Click Delete account → modal opens, shows required username.
  - Type wrong value → button disabled.
  - Type exact username → click Delete → redirected to `/`.
  - In SQL: `SELECT count(*) FROM auth.users WHERE id='<uid>';` → `0`.
  - In SQL: `SELECT count(*) FROM profiles WHERE id='<uid>';` → `0` (cascaded).
  - In SQL: `SELECT count(*) FROM user_skills WHERE user_id='<uid>';` → `0` (cascaded).

- [ ] **Step 7: Regression sweep**
  - Dashboard, Chats, Skills, Learn, Discover, Help pages still render.
  - Sign out / sign in still works.
  - No console errors in DevTools.

- [ ] **Step 8: Commit (if any polish fixes)**

```bash
git add -A
git commit -m "fix(web): QA polish for piece A settings expansion"
```

(Skip the commit if nothing changed.)

---

## Self-review checklist (for the planner, not the implementer)

- [x] Every spec section has at least one task (`avatars` bucket → Task 1; username rules → Tasks 1 + 2; Google fallback → Task 5; theme wiring → Task 4; notif toggles → Task 9; delete flow → Tasks 1 + 8; layout → Task 10; manual QA covers acceptance criteria)
- [x] No placeholders — every code step has complete code
- [x] Type consistency — `ThemePreference`, `Notif`, `IdentityRow`, `AvatarUploadError` used consistently
- [x] File paths are exact
- [x] Every task ends with a commit step
- [x] Testing substitution documented upfront (no web test framework exists; per-task manual verification)
