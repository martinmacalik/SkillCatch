# Social Profile Builder — Design Spec
_2026-04-23_

## Overview
A two-page social profile system: a drag-and-drop card builder for authenticated users, and a public read-only profile page for logged-in visitors. Profiles are discoverable via the Discover page.

## Data Model

### `profile_cards` table
```
id           uuid PK default gen_random_uuid()
user_id      uuid FK → auth.users (ON DELETE CASCADE)
position     integer NOT NULL
type         text CHECK IN ('text','text_photo','photo','skills','cv')
data         jsonb NOT NULL DEFAULT '{}'
created_at   timestamptz DEFAULT now()
```

**RLS:**
- Authenticated users: SELECT any row (public profiles)
- Owner only: INSERT, UPDATE, DELETE own rows

**JSONB `data` shapes per type:**
- `text`: `{ heading?: string, body: string }`
- `text_photo`: `{ heading?: string, body: string, photo_url: string, photo_position: 'left'|'right' }`
- `photo`: `{ url: string, caption?: string }`
- `skills`: `{ skill_ids: string[] }`
- `cv`: `{ file_url: string, filename: string }`

### Storage
- Bucket: `profile-media` (public read, owner write)
- Path: `{user_id}/{card_id}/{filename}`

### RPC
- `reorder_profile_cards(p_user_id uuid, p_ids uuid[])` — updates positions atomically in a single transaction. SECURITY DEFINER, callable by authenticated owner only.

## TopBar Changes
1. **SkillCoins circle** (amber) — already implemented
2. **Settings circle** (gray) — Settings icon, navigates to `/dashboard/settings`
3. **Avatar circle** (rightmost) — shows `profiles.avatar_url` img, falls back to gradient div. Navigates to `/dashboard/profile-builder`

TopBar fetches `avatar_url` alongside existing `first_name, last_name, skillcoin_balance`.

## Profile Builder Page (`/dashboard/profile-builder`)

### Layout
Two-column: card list left, editor panel right.

### Left — Card list
- Vertical drag-drop list via `@dnd-kit/core` + `@dnd-kit/sortable`
- Each item: drag handle, type label, delete button
- "Add card" button → type picker (text / text+photo / photo / skills / cv)
- On drop: call `reorder_profile_cards` RPC

### Right — Editor panel
- Opens on card click
- Auto-saves on change (debounced Supabase UPDATE, 500ms)
- Per type:
  - **text**: heading input + body textarea
  - **text_photo**: heading + body + image upload + left/right toggle
  - **photo**: image upload + caption
  - **skills**: multi-select from `user_skills` joined `skill_nodes`
  - **cv**: PDF file upload, shows filename + replace/remove
- "View public profile →" link at top, opens `/profile/{user_id}` in new tab

## Public Profile Page (`/profile/:id`)

- Authenticated users only (redirect to `/signin` otherwise)
- Top: avatar, full name, username, bio
- Cards rendered in `position` order
- Empty/incomplete cards silently skipped
- CV card shows download button to Supabase storage URL

## Discover Page — People Tab

- New "People" tab on existing `/dashboard/discover`
- Searchable grid: avatar, name, username, bio snippet
- Search: ilike on `first_name`, `last_name`, `username`
- Card click → `/profile/:id`

## Out of Scope
- Drag-and-drop on mobile (pointer events only for now)
- Profile privacy settings (all profiles visible to all logged-in users)
- Card templates or themes
