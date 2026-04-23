# Social Profile Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a drag-and-drop card-based profile builder, a public profile page, a People tab on Discover, and wire the TopBar avatar/settings buttons.

**Architecture:** `profile_cards` table stores ordered JSONB cards per user. The builder page uses @dnd-kit/sortable for reordering and auto-saves on change. The public profile page renders cards by type. Discover gets a People tab with profile search.

**Tech Stack:** React, TypeScript, Tailwind, Supabase (Postgres + Storage), @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, lucide-react.

---

## File Map

**New files:**
- `supabase/migrations/20260423003_profile_cards.sql`
- `apps/web/src/pages/ProfileBuilderPage.tsx`
- `apps/web/src/pages/PublicProfilePage.tsx`
- `apps/web/src/components/profile-builder/SortableCardList.tsx`
- `apps/web/src/components/profile-builder/CardEditorPanel.tsx`

**Modified files:**
- `apps/web/src/components/layout/TopBar.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/pages/DiscoverPage.tsx`

---

## Task 1: Migration — profile_cards table + storage bucket + reorder RPC

**Files:**
- Create: `supabase/migrations/20260423003_profile_cards.sql`

- [ ] **Step 1: Write the migration file**

```sql
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

-- reorder_profile_cards: atomically updates position for each card id in order
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
```

- [ ] **Step 2: Run in Supabase SQL editor**

Paste the entire file into the Supabase SQL editor and execute. Verify:
- `profile_cards` table appears in Table Editor
- `profile-media` bucket appears in Storage
- `reorder_profile_cards` function appears in Database → Functions

---

## Task 2: Install @dnd-kit packages

**Files:**
- Modify: `apps/web/package.json` (via npm install)

- [ ] **Step 1: Install**

```bash
cd apps/web && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Verify**

```bash
grep "@dnd-kit" apps/web/package.json
```

Expected: three entries for `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json
git commit -m "chore: install @dnd-kit packages for profile builder"
```

---

## Task 3: TopBar — settings icon + avatar button

**Files:**
- Modify: `apps/web/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Replace TopBar.tsx with the updated version**

```tsx
import { useEffect, useState } from 'react'
import { Search, Coins, Settings } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthProvider'
import { useSearch } from '@/contexts/SearchContext'

const searchPlaceholders: Record<string, string> = {
  '/dashboard': 'Search',
  '/dashboard/chats': 'Search Chat',
  '/dashboard/skills': 'Search Skill',
  '/dashboard/learn': 'Search Course',
  '/dashboard/discover': 'Discover',
}

export function TopBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const placeholder = searchPlaceholders[location.pathname] || 'Search'
  const { session } = useAuth()
  const { query, setQuery } = useSearch()
  const isSkills = location.pathname === '/dashboard/skills'
  const [profile, setProfile] = useState<{
    first_name: string | null
    last_name: string | null
    skillcoin_balance: number
    avatar_url: string | null
  } | null>(null)

  useEffect(() => {
    if (!session?.user) return
    supabase
      .from('profiles')
      .select('first_name, last_name, skillcoin_balance, avatar_url')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [session])

  const displayName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || (session?.user?.email ?? '')
    : (session?.user?.email ?? '')

  const email = session?.user?.email ?? ''

  return (
    <header className="flex h-14 shrink-0 items-center justify-between rounded-2xl bg-gray-100 px-4 sm:h-16 sm:px-6 2xl:h-21">
      {/* Search — hidden on mobile, visible sm+ */}
      <div className="relative hidden w-full max-w-xs sm:block sm:max-w-sm lg:max-w-md">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={placeholder}
          value={isSkills ? query : undefined}
          onChange={isSkills ? (e) => setQuery(e.target.value) : undefined}
          className="w-full rounded-4xl bg-white py-3 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10"
        />
      </div>

      {/* Mobile: page title */}
      <p className="text-base font-semibold text-gray-900 sm:hidden">
        {placeholder}
      </p>

      {/* Profile section */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* SkillCoins */}
        <div className="relative hidden sm:block">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
            <Coins className="h-4 w-4 text-amber-600" />
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white leading-none">
            {profile?.skillcoin_balance ?? 0}
          </span>
        </div>

        {/* Settings */}
        <button
          onClick={() => navigate('/dashboard/settings')}
          className="hidden h-10 w-10 items-center justify-center rounded-full bg-gray-200 transition hover:bg-gray-300 sm:flex"
          title="Settings"
        >
          <Settings className="h-4 w-4 text-gray-600" />
        </button>

        {/* Avatar — navigates to profile builder */}
        <button
          onClick={() => navigate('/dashboard/profile-builder')}
          className="h-9 w-9 shrink-0 overflow-hidden rounded-full sm:h-11 sm:w-11"
          title="My profile"
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-linear-to-br from-pink-300 to-rose-400" />
          )}
        </button>

        <div className="ml-1 hidden text-right sm:block">
          <p className="text-sm font-semibold text-gray-900">{displayName}</p>
          <p className="text-xs text-gray-400">{email}</p>
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/layout/TopBar.tsx
git commit -m "feat: wire settings + avatar buttons in TopBar"
```

---

## Task 4: Add routes to App.tsx

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Add imports and routes**

Add these two imports at the top with the others:
```tsx
import ProfileBuilderPage from './pages/ProfileBuilderPage'
import PublicProfilePage from './pages/PublicProfilePage'
```

Add inside the `<Route path="/dashboard" ...>` group (after `skill-feedback`):
```tsx
<Route path="profile-builder" element={<ProfileBuilderPage />} />
```

Add alongside the existing `/profile` route (outside dashboard group):
```tsx
<Route
  path="/profile/:id"
  element={
    <ProtectedRoute>
      <PublicProfilePage />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat: add profile-builder and public profile routes"
```

---

## Task 5: SortableCardList component

**Files:**
- Create: `apps/web/src/components/profile-builder/SortableCardList.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { GripVertical, Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface ProfileCard {
  id: string
  position: number
  type: 'text' | 'text_photo' | 'photo' | 'skills' | 'cv'
  data: Record<string, unknown>
}

const TYPE_LABELS: Record<ProfileCard['type'], string> = {
  text: 'Text',
  text_photo: 'Text + Photo',
  photo: 'Photo',
  skills: 'Skills',
  cv: 'CV',
}

function SortableCardItem({
  card,
  selected,
  onSelect,
  onDelete,
}: {
  card: ProfileCard
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
        selected
          ? 'border-indigo-300 bg-indigo-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
      onClick={onSelect}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing"
        onClick={e => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm font-medium text-gray-700">
        {TYPE_LABELS[card.type]}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="text-gray-300 hover:text-rose-400 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function SortableCardList({
  cards,
  selectedId,
  onSelect,
  onDelete,
  onReorder,
}: {
  cards: ProfileCard[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onReorder: (cards: ProfileCard[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = cards.findIndex(c => c.id === active.id)
    const newIndex = cards.findIndex(c => c.id === over.id)
    onReorder(arrayMove(cards, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {cards.map(card => (
            <SortableCardItem
              key={card.id}
              card={card}
              selected={card.id === selectedId}
              onSelect={() => onSelect(card.id)}
              onDelete={() => onDelete(card.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/profile-builder/SortableCardList.tsx
git commit -m "feat: SortableCardList component with @dnd-kit"
```

---

## Task 6: CardEditorPanel component

**Files:**
- Create: `apps/web/src/components/profile-builder/CardEditorPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useRef } from 'react'
import { Upload } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { ProfileCard } from './SortableCardList'

async function uploadFile(userId: string, cardId: string, file: File): Promise<string> {
  const path = `${userId}/${cardId}/${file.name}`
  await supabase.storage.from('profile-media').upload(path, file, { upsert: true })
  return supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl
}

function FileUploadButton({
  accept,
  label,
  onUpload,
}: {
  accept: string
  label: string
  onUpload: (file: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => { if (e.target.files?.[0]) onUpload(e.target.files[0]) }}
      />
      <button
        onClick={() => ref.current?.click()}
        className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm text-gray-500 transition hover:border-indigo-400 hover:text-indigo-500"
      >
        <Upload className="h-4 w-4" />
        {label}
      </button>
    </>
  )
}

interface Props {
  card: ProfileCard
  userId: string
  onChange: (data: Record<string, unknown>) => void
  userSkills: { id: string; name: string }[]
}

export function CardEditorPanel({ card, userId, onChange, userSkills }: Props) {
  const d = card.data

  if (card.type === 'text') {
    return (
      <div className="flex flex-col gap-3">
        <input
          value={(d.heading as string) ?? ''}
          onChange={e => onChange({ ...d, heading: e.target.value })}
          placeholder="Heading (optional)"
          className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <textarea
          value={(d.body as string) ?? ''}
          onChange={e => onChange({ ...d, body: e.target.value })}
          placeholder="Body text…"
          rows={5}
          className="resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>
    )
  }

  if (card.type === 'text_photo') {
    return (
      <div className="flex flex-col gap-3">
        <input
          value={(d.heading as string) ?? ''}
          onChange={e => onChange({ ...d, heading: e.target.value })}
          placeholder="Heading (optional)"
          className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <textarea
          value={(d.body as string) ?? ''}
          onChange={e => onChange({ ...d, body: e.target.value })}
          placeholder="Body text…"
          rows={4}
          className="resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        {d.photo_url && (
          <img src={d.photo_url as string} alt="" className="h-32 w-full rounded-xl object-cover" />
        )}
        <FileUploadButton
          accept="image/jpeg,image/png,image/webp"
          label={d.photo_url ? 'Replace photo' : 'Upload photo'}
          onUpload={async file => {
            const url = await uploadFile(userId, card.id, file)
            onChange({ ...d, photo_url: url })
          }}
        />
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ ...d, photo_position: 'left' })}
            className={`flex-1 rounded-xl border py-2 text-xs font-medium transition ${
              (d.photo_position ?? 'left') === 'left'
                ? 'border-indigo-400 bg-indigo-50 text-indigo-600'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            Photo left
          </button>
          <button
            onClick={() => onChange({ ...d, photo_position: 'right' })}
            className={`flex-1 rounded-xl border py-2 text-xs font-medium transition ${
              d.photo_position === 'right'
                ? 'border-indigo-400 bg-indigo-50 text-indigo-600'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            Photo right
          </button>
        </div>
      </div>
    )
  }

  if (card.type === 'photo') {
    return (
      <div className="flex flex-col gap-3">
        {d.url && (
          <img src={d.url as string} alt="" className="h-48 w-full rounded-xl object-cover" />
        )}
        <FileUploadButton
          accept="image/jpeg,image/png,image/webp"
          label={d.url ? 'Replace photo' : 'Upload photo'}
          onUpload={async file => {
            const url = await uploadFile(userId, card.id, file)
            onChange({ ...d, url })
          }}
        />
        <input
          value={(d.caption as string) ?? ''}
          onChange={e => onChange({ ...d, caption: e.target.value })}
          placeholder="Caption (optional)"
          className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>
    )
  }

  if (card.type === 'skills') {
    const selected = (d.skill_ids as string[]) ?? []
    const toggle = (id: string) => {
      const next = selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]
      onChange({ ...d, skill_ids: next })
    }
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-gray-400">Pick skills from your library to showcase</p>
        <div className="flex flex-wrap gap-2">
          {userSkills.map(s => (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                selected.includes(s.id)
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {s.name}
            </button>
          ))}
          {userSkills.length === 0 && (
            <p className="text-sm text-gray-400">No skills in your library yet.</p>
          )}
        </div>
      </div>
    )
  }

  if (card.type === 'cv') {
    return (
      <div className="flex flex-col gap-3">
        {d.filename && (
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
            <span className="flex-1 text-sm text-gray-700 truncate">{d.filename as string}</span>
            <a
              href={d.file_url as string}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-500 hover:underline shrink-0"
            >
              View
            </a>
          </div>
        )}
        <FileUploadButton
          accept="application/pdf"
          label={d.filename ? 'Replace CV (PDF)' : 'Upload CV (PDF)'}
          onUpload={async file => {
            const url = await uploadFile(userId, card.id, file)
            onChange({ ...d, file_url: url, filename: file.name })
          }}
        />
      </div>
    )
  }

  return null
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/profile-builder/CardEditorPanel.tsx
git commit -m "feat: CardEditorPanel with all five card type editors"
```

---

## Task 7: ProfileBuilderPage

**Files:**
- Create: `apps/web/src/pages/ProfileBuilderPage.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useRef, useState } from 'react'
import { Plus, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthProvider'
import { SortableCardList, type ProfileCard } from '@/components/profile-builder/SortableCardList'
import { CardEditorPanel } from '@/components/profile-builder/CardEditorPanel'

type CardType = ProfileCard['type']

const CARD_TYPE_OPTIONS: { type: CardType; label: string; description: string }[] = [
  { type: 'text',       label: 'Text',         description: 'A heading and body text block' },
  { type: 'text_photo', label: 'Text + Photo',  description: 'Text alongside an image' },
  { type: 'photo',      label: 'Photo',         description: 'A full-width image with caption' },
  { type: 'skills',     label: 'Skills',        description: 'Showcase skills from your library' },
  { type: 'cv',         label: 'CV',            description: 'Upload your CV as a PDF' },
]

export default function ProfileBuilderPage() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? ''

  const [cards, setCards] = useState<ProfileCard[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showTypePicker, setShowTypePicker] = useState(false)
  const [userSkills, setUserSkills] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedCard = cards.find(c => c.id === selectedId) ?? null

  useEffect(() => {
    if (!userId) return
    Promise.all([
      supabase
        .from('profile_cards')
        .select('*')
        .eq('user_id', userId)
        .order('position'),
      supabase
        .from('user_skills')
        .select('skill_node_id, skill_nodes(name)')
        .eq('user_id', userId),
    ]).then(([{ data: cardData }, { data: skillData }]) => {
      setCards((cardData ?? []) as ProfileCard[])
      setUserSkills(
        (skillData ?? []).map((s: { skill_node_id: string; skill_nodes: { name: string } | null }) => ({
          id: s.skill_node_id,
          name: s.skill_nodes?.name ?? '',
        }))
      )
      setLoading(false)
    })
  }, [userId])

  const addCard = async (type: CardType) => {
    setShowTypePicker(false)
    const position = cards.length + 1
    const { data, error } = await supabase
      .from('profile_cards')
      .insert({ user_id: userId, type, position, data: {} })
      .select()
      .single()
    if (!error && data) {
      const newCard = data as ProfileCard
      setCards(prev => [...prev, newCard])
      setSelectedId(newCard.id)
    }
  }

  const deleteCard = async (id: string) => {
    await supabase.from('profile_cards').delete().eq('id', id)
    setCards(prev => prev.filter(c => c.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const handleReorder = async (reordered: ProfileCard[]) => {
    setCards(reordered)
    await supabase.rpc('reorder_profile_cards', {
      p_user_id: userId,
      p_ids: reordered.map(c => c.id),
    })
  }

  const handleCardDataChange = (data: Record<string, unknown>) => {
    setCards(prev => prev.map(c => c.id === selectedId ? { ...c, data } : c))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await supabase.from('profile_cards').update({ data }).eq('id', selectedId!)
    }, 500)
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="mt-0.5 text-sm text-gray-400">Build how others see you on SkillCatch</p>
        </div>
        <a
          href={`/profile/${userId}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-indigo-400 hover:text-indigo-600"
        >
          <ExternalLink className="h-4 w-4" />
          View public profile
        </a>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: card list */}
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-700">Cards</p>
          {cards.length === 0 && (
            <div className="mb-3 flex h-24 items-center justify-center rounded-xl border border-dashed border-gray-200">
              <p className="text-sm text-gray-400">Add your first card below</p>
            </div>
          )}
          <SortableCardList
            cards={cards}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={deleteCard}
            onReorder={handleReorder}
          />

          {/* Add card */}
          <div className="relative mt-3">
            <button
              onClick={() => setShowTypePicker(v => !v)}
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-400 transition hover:border-indigo-500 hover:text-indigo-600"
            >
              <Plus className="h-4 w-4" />
              Add card
            </button>
            {showTypePicker && (
              <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-gray-200 bg-white shadow-xl">
                {CARD_TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.type}
                    onClick={() => addCard(opt.type)}
                    className="flex w-full flex-col px-4 py-3 text-left transition hover:bg-indigo-50"
                  >
                    <span className="text-sm font-medium text-gray-800">{opt.label}</span>
                    <span className="text-xs text-gray-400">{opt.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: editor */}
        <div>
          <p className="mb-2 text-sm font-semibold text-gray-700">Edit card</p>
          {selectedCard ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <CardEditorPanel
                card={selectedCard}
                userId={userId}
                onChange={handleCardDataChange}
                userSkills={userSkills}
              />
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-gray-200">
              <p className="text-sm text-gray-400">Select a card to edit it</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/ProfileBuilderPage.tsx
git commit -m "feat: ProfileBuilderPage with drag-drop card builder"
```

---

## Task 8: PublicProfilePage

**Files:**
- Create: `apps/web/src/pages/PublicProfilePage.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { ProfileCard } from '@/components/profile-builder/SortableCardList'

interface Profile {
  id: string
  first_name: string | null
  last_name: string | null
  username: string | null
  avatar_url: string | null
  bio: string | null
}

function CardRenderer({ card }: { card: ProfileCard }) {
  const d = card.data

  if (card.type === 'text') {
    const heading = d.heading as string | undefined
    const body = d.body as string | undefined
    if (!body) return null
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        {heading && <h2 className="mb-2 text-xl font-bold text-gray-900">{heading}</h2>}
        <p className="leading-relaxed text-gray-600 whitespace-pre-wrap">{body}</p>
      </div>
    )
  }

  if (card.type === 'text_photo') {
    const heading = d.heading as string | undefined
    const body = d.body as string | undefined
    const photoUrl = d.photo_url as string | undefined
    const isRight = d.photo_position === 'right'
    if (!body && !photoUrl) return null
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className={`flex gap-6 ${isRight ? 'flex-row' : 'flex-row-reverse'}`}>
          {photoUrl && (
            <img src={photoUrl} alt="" className="h-48 w-48 shrink-0 rounded-xl object-cover" />
          )}
          <div className="flex-1">
            {heading && <h2 className="mb-2 text-xl font-bold text-gray-900">{heading}</h2>}
            {body && <p className="leading-relaxed text-gray-600 whitespace-pre-wrap">{body}</p>}
          </div>
        </div>
      </div>
    )
  }

  if (card.type === 'photo') {
    const url = d.url as string | undefined
    const caption = d.caption as string | undefined
    if (!url) return null
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <img src={url} alt={caption ?? ''} className="w-full rounded-xl object-cover" />
        {caption && <p className="mt-2 text-center text-sm text-gray-400">{caption}</p>}
      </div>
    )
  }

  if (card.type === 'skills') {
    const skillIds = (d.skill_ids as string[]) ?? []
    const names = (d._skill_names as string[]) ?? []
    if (names.length === 0) return null
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-gray-900">Skills</h2>
        <div className="flex flex-wrap gap-2">
          {names.map((name, i) => (
            <span
              key={skillIds[i] ?? i}
              className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (card.type === 'cv') {
    const fileUrl = d.file_url as string | undefined
    const filename = d.filename as string | undefined
    if (!fileUrl) return null
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-gray-900">CV</h2>
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          download={filename}
          className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:border-indigo-400 hover:text-indigo-600"
        >
          <Download className="h-4 w-4" />
          {filename ?? 'Download CV'}
        </a>
      </div>
    )
  }

  return null
}

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [cards, setCards] = useState<ProfileCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, username, avatar_url, bio')
        .eq('id', id)
        .single(),
      supabase
        .from('profile_cards')
        .select('*')
        .eq('user_id', id)
        .order('position'),
    ]).then(async ([{ data: prof }, { data: rawCards }]) => {
      if (!prof) { navigate('/dashboard'); return }
      setProfile(prof)

      // Resolve skill names for skills cards
      const resolvedCards: ProfileCard[] = []
      for (const card of (rawCards ?? []) as ProfileCard[]) {
        if (card.type === 'skills') {
          const ids = (card.data.skill_ids as string[]) ?? []
          if (ids.length > 0) {
            const { data: nodes } = await supabase
              .from('skill_nodes')
              .select('id, name')
              .in('id', ids)
            card = { ...card, data: { ...card.data, _skill_names: (nodes ?? []).map(n => n.name) } }
          }
        }
        resolvedCards.push(card)
      }
      setCards(resolvedCards)
      setLoading(false)
    })
  }, [id, navigate])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
      </div>
    )
  }

  if (!profile) return null

  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.username || 'User'

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {/* Header */}
      <div className="mb-8 flex items-center gap-5">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-pink-300 to-rose-400" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
          {profile.username && (
            <p className="text-sm text-gray-400">@{profile.username}</p>
          )}
          {profile.bio && (
            <p className="mt-1.5 text-sm text-gray-600">{profile.bio}</p>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-4">
        {cards.map(card => (
          <CardRenderer key={card.id} card={card} />
        ))}
        {cards.length === 0 && (
          <p className="py-16 text-center text-sm text-gray-400">This user hasn't set up their profile yet.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/PublicProfilePage.tsx
git commit -m "feat: PublicProfilePage rendering all card types"
```

---

## Task 9: Discover — People tab

**Files:**
- Modify: `apps/web/src/pages/DiscoverPage.tsx`

- [ ] **Step 1: Add People tab state and fetch at the top of DiscoverPage**

Add these imports at the top (after existing imports):
```tsx
import { useNavigate } from 'react-router-dom'
```

Add this interface alongside the existing ones:
```tsx
interface UserProfile {
  id: string
  first_name: string | null
  last_name: string | null
  username: string | null
  avatar_url: string | null
  bio: string | null
}
```

Add this state inside `DiscoverPage()` (after existing state):
```tsx
const navigate = useNavigate()
const [activeTab, setActiveTab] = useState<'skills' | 'people'>('skills')
const [peopleQuery, setPeopleQuery] = useState('')
const [people, setPeople] = useState<UserProfile[]>([])
const [peopleLoading, setPeopleLoading] = useState(false)
```

Add this effect inside `DiscoverPage()` (after existing effects):
```tsx
useEffect(() => {
  if (activeTab !== 'people') return
  setPeopleLoading(true)
  const q = peopleQuery.trim()
  const query = supabase
    .from('profiles')
    .select('id, first_name, last_name, username, avatar_url, bio')
    .order('first_name')
    .limit(40)
  const filtered = q
    ? query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,username.ilike.%${q}%`)
    : query
  filtered.then(({ data }) => {
    setPeople(data ?? [])
    setPeopleLoading(false)
  })
}, [activeTab, peopleQuery])
```

- [ ] **Step 2: Add tab bar just below the header `<div>` in the return JSX**

After the closing `</div>` of the header section and before the search results block, insert:
```tsx
{/* Tab bar */}
<div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
  <button
    onClick={() => setActiveTab('skills')}
    className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
      activeTab === 'skills' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
    }`}
  >
    Skills
  </button>
  <button
    onClick={() => setActiveTab('people')}
    className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
      activeTab === 'people' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
    }`}
  >
    People
  </button>
</div>
```

- [ ] **Step 3: Wrap the existing skills content and add People tab content**

Wrap the existing `{isSearching ? ... : <>...</>}` block with `{activeTab === 'skills' && (...)}`

After that closing block add:
```tsx
{activeTab === 'people' && (
  <div className="flex flex-col gap-5">
    <div className="relative max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        value={peopleQuery}
        onChange={e => setPeopleQuery(e.target.value)}
        placeholder="Search by name or username"
        className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-700 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
      />
    </div>

    {peopleLoading ? (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {people.map(person => {
          const name = [person.first_name, person.last_name].filter(Boolean).join(' ') || person.username || 'User'
          return (
            <button
              key={person.id}
              onClick={() => navigate(`/profile/${person.id}`)}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5"
              style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}
            >
              {person.avatar_url ? (
                <img src={person.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded-full bg-gradient-to-br from-pink-300 to-rose-400" />
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-900">{name}</p>
                {person.username && (
                  <p className="text-xs text-gray-400">@{person.username}</p>
                )}
                {person.bio && (
                  <p className="mt-0.5 truncate text-xs text-gray-500">{person.bio}</p>
                )}
              </div>
            </button>
          )
        })}
        {people.length === 0 && !peopleLoading && (
          <p className="col-span-full py-12 text-center text-sm text-gray-400">
            {peopleQuery ? 'No users found.' : 'No profiles yet.'}
          </p>
        )}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/DiscoverPage.tsx
git commit -m "feat: People tab on Discover page"
```

---

## Self-Review Checklist

- [x] Migration covers table + RLS + storage bucket + RPC — Task 1
- [x] @dnd-kit installed — Task 2
- [x] TopBar: SkillCoins (existing) + Settings + Avatar — Task 3
- [x] Routes added for builder + public profile — Task 4
- [x] SortableCardList with drag-drop — Task 5
- [x] CardEditorPanel with all 5 card types + file upload — Task 6
- [x] ProfileBuilderPage wires list + editor + add/delete/reorder — Task 7
- [x] PublicProfilePage renders all card types, resolves skill names — Task 8
- [x] DiscoverPage People tab with search — Task 9
- [x] No placeholders or TBDs found
- [x] `ProfileCard` type defined in SortableCardList and imported consistently in all tasks
- [x] `uploadFile` helper defined in CardEditorPanel, used within same file
- [x] `reorder_profile_cards` RPC signature matches call in ProfileBuilderPage (`p_user_id`, `p_ids`)
