# SkillCatch — Database Documentation

> **Backend:** Supabase (PostgreSQL + Auth + Storage)
> All user data cascades on `auth.users` delete. Row-Level Security (RLS) is enabled on all user-facing tables.

---

## Table of Contents

1. [Core entities](#1-core-entities)
2. [User skill library](#2-user-skill-library)
3. [Learning content](#3-learning-content)
4. [Skill progression](#4-skill-progression)
5. [Social profile](#5-social-profile)
6. [Skillcoin economy](#6-skillcoin-economy)
7. [Restructure requests](#7-restructure-requests)
8. [Support & admin](#8-support--admin)
9. [Chat](#9-chat)
10. [Storage buckets](#10-storage-buckets)
11. [RPC functions](#11-rpc-functions)
12. [Entity-relationship overview](#12-entity-relationship-overview)

---

## 1. Core entities

### `auth.users` *(Supabase managed)*
The root identity table. Every other table links back here via `user_id` or `id` with `ON DELETE CASCADE`.

---

### `profiles`
One row per user. Created automatically on sign-up via trigger.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | = `auth.users.id` |
| `first_name` | text | |
| `last_name` | text | |
| `username` | text UNIQUE | regex `^[a-z0-9_-]{3,30}$` |
| `avatar_url` | text | URL to `avatars` bucket |
| `bio` | text | max 160 chars |
| `country` | text | |
| `city` | text | |
| `primary_language` | text | |
| `theme` | text | `light` \| `dark` \| `system` |
| `notif_weekly_digest` | bool | notification preference |
| `notif_qa_answers` | bool | notification preference |
| `notif_proposal_updates` | bool | notification preference |
| `skillcoin_balance` | int ≥ 0 | maintained by `award_skillcoins()` RPC |
| `created_at` / `updated_at` | timestamptz | |

**RLS:** Any authenticated user can read. Only the owner can update their own row.

---

### `skill_nodes`
The global skill tree. Hierarchical using both `parent_id` self-reference and an `ltree` path for fast subtree queries.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text | display name |
| `slug` | text | URL-safe identifier |
| `parent_id` | uuid → `skill_nodes` | null = root node |
| `path` | ltree | e.g. `sports.winter.skiing` |
| `is_leaf` | bool | true = no children expected |
| `image_url` | text | optional cover image |
| `created_at` | timestamptz | |

Virtually every feature table has a `skill_node_id` FK pointing here.

---

### `skill_node_parents`
Explicit many-to-many parent–child edge table (mirrors the `parent_id` self-join for cases with multiple parents).

| Column | Type |
|--------|------|
| `child_node_id` | uuid → `skill_nodes` |
| `parent_node_id` | uuid → `skill_nodes` |

---

### `user_roles`
Grants elevated permissions inside the app (separate from Supabase admin).

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid → `auth.users` | |
| `role` | text | `admin` \| `editor` |
| `granted_at` | timestamptz | |

Used by the `is_editor()` helper function which backs all editor-only RLS policies.

---

## 2. User skill library

### `user_skills`
The canonical record that a user has added a skill to their library.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid → `auth.users` | PK part |
| `skill_node_id` | uuid → `skill_nodes` | PK part |
| `status` | text | `watchlist` \| `learning` \| `learned` \| `dormant` |
| `pinned` | bool | pinned to dashboard |
| `started_at` | date | optional user-set date |
| `level` | text | free-text level description |
| `is_teaching` | bool | user offers to teach this skill |
| `visibility` | text | `public` \| `friends` \| `private` |
| `last_opened_at` | timestamptz | updated by `touch_skill_last_opened()` RPC |
| `created_at` | timestamptz | |

**Index:** `(user_id, pinned DESC, last_opened_at DESC)` for recent-skills queries.

---

### `skill_attribute_defs`
Schema for custom metadata fields per skill node (e.g. "Max speed", "Certification body").

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `skill_node_id` | uuid → `skill_nodes` | |
| `key` | text | machine key |
| `label` | text | display label |
| `type` | text | `number` \| `text` \| `enum` \| `date` \| `boolean` \| `multiselect` \| `multi` |
| `unit` | text | optional unit (kg, km/h…) |
| `required` | bool | |
| `enum_values` | text[] | options for enum/multiselect |
| `sort_order` | int | |

---

### `user_skill_attributes`
The user's actual values for the attribute defs above.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid → `auth.users` | PK part |
| `skill_node_id` | uuid → `skill_nodes` | PK part |
| `attribute_def_id` | uuid → `skill_attribute_defs` | PK part |
| `value_json` | jsonb | stored value |
| `created_at` / `updated_at` | timestamptz | |

---

### `skill_stats`
Denormalized counters per skill node (updated by triggers).

| Column | Type |
|--------|------|
| `skill_node_id` | uuid PK → `skill_nodes` |
| `num_users` | bigint |
| `num_teachers` | bigint |
| `updated_at` | timestamptz |

---

### `teaching_offers`
When a user marks `is_teaching = true`, a row is also created here with availability details.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid → `auth.users` | |
| `skill_node_id` | uuid → `skill_nodes` | |
| `mode` | text | `online` \| `in_person` \| `hybrid` |
| `location` | text | |
| `notes` | text | |

---

### `user_login_days`
Tracks unique calendar days a user logged in — used to compute the dashboard streak.

| Column | Type |
|--------|------|
| `user_id` | uuid → `auth.users` |
| `login_date` | date |

**PK:** `(user_id, login_date)` — upserted on each login, naturally deduplicates.

---

## 3. Learning content

### `skill_learning_pages`
One optional learning page per skill node. Admins/editors manage these.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `skill_node_id` | uuid UNIQUE → `skill_nodes` | one page per skill |
| `status` | text | `draft` \| `published` |
| `created_by` / `updated_by` | uuid → `auth.users` | |
| `created_at` / `updated_at` | timestamptz | auto-updated by trigger |

**RLS:** Published pages are readable by all authenticated users. Draft pages visible to editors only.

---

### `skill_learning_blocks`
Ordered content blocks that make up a learning page.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `page_id` | uuid → `skill_learning_pages` | CASCADE delete |
| `type` | text | `heading` \| `text` \| `callout` \| `resource_list` \| `flashcards` \| `checklist` |
| `content` | jsonb | block-type specific payload |
| `sort_order` | int | reordered via `reorder_learning_blocks()` RPC |
| `created_by` / `updated_by` | uuid → `auth.users` | |

**Index:** `(page_id, sort_order)` for ordered fetch.

---

### `skill_learning_suggestions`
Non-editors can propose new block content for a skill page. Admins review and approve/deny.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `skill_node_id` | uuid → `skill_nodes` | |
| `submitted_by` | uuid → `auth.users` | |
| `proposed_blocks` | jsonb | array of proposed block objects |
| `message` | text | optional note to reviewer |
| `status` | text | `pending` \| `approved` \| `denied` |
| `reviewed_by` / `reviewed_at` | uuid / timestamptz | set on review |
| `deny_reason` | text | |

---

### `user_skill_notes`
Per-user private notes on any skill (rich JSON content).

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid → `auth.users` | PK part |
| `skill_node_id` | uuid → `skill_nodes` | PK part |
| `content` | jsonb | editor state |
| `created_at` / `updated_at` | timestamptz | |

**RLS:** Full CRUD, self-only.

---

### `skill_resources`
Curated external links attached to a skill node.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `skill_node_id` | uuid → `skill_nodes` | |
| `title` | text | |
| `url` | text | |
| `kind` | text | `link` \| `video` \| `book` \| `course` \| `other` |

---

## 4. Skill progression

### `skill_levels`
Named proficiency levels defined per skill (e.g. Beginner, Intermediate, Expert). Managed by editors.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `skill_node_id` | uuid → `skill_nodes` | |
| `sort_order` | int | display order |
| `name` | text | e.g. "Intermediate" |
| `description` | text | |
| `criteria` | jsonb | array of `{ text: string }` criteria |

---

### `user_skill_level`
Records which level a user has claimed for a given skill.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid → `auth.users` | PK part |
| `skill_node_id` | uuid → `skill_nodes` | PK part |
| `level_id` | uuid → `skill_levels` | |
| `claimed_at` | timestamptz | |

**RLS:** Full CRUD, self-only.

---

### `skill_progress_items`
Checklist items (grouped by section) that users can tick off per skill. Managed by editors.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `skill_node_id` | uuid → `skill_nodes` | |
| `section` | text | group label, default `General` |
| `sort_order` | int | |
| `text` | text | checklist item text |

**Index:** `(skill_node_id, section, sort_order)`.

---

### `user_progress_checks`
Records which checklist items a user has checked off.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | uuid → `auth.users` | PK part |
| `item_id` | uuid → `skill_progress_items` | PK part |
| `checked_at` | timestamptz | |

**RLS:** Full CRUD, self-only.

---

## 5. Social profile

### `profile_cards`
Users build a public profile from ordered cards of different types.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid → `auth.users` | |
| `position` | int | reordered via `reorder_profile_cards()` RPC |
| `type` | text | `text` \| `text_photo` \| `photo` \| `skills` \| `cv` |
| `data` | jsonb | type-specific payload (heading, body, photo_url, skill_ids, file_url…) |
| `created_at` | timestamptz | |

**RLS:** Any authenticated user can read all cards. Only the owner can insert/update/delete.

---

## 6. Skillcoin economy

### `skillcoin_transactions`
Append-only ledger. The running balance is denormalized into `profiles.skillcoin_balance`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid → `auth.users` | |
| `amount` | int | positive = credit, negative = debit |
| `reason` | text | e.g. `restructure_approved` |
| `reference_id` | uuid | optional — links to the triggering entity |
| `created_at` | timestamptz | |

**Index:** `(user_id, created_at DESC)` for timeline view.
**RLS:** Self-read only.

Coins are currently awarded automatically (+10) when a restructure request is approved by an admin.

---

## 7. Restructure requests

### `node_restructure_requests`
Users propose changes to the skill tree (rename, reparent, add child, move).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `requester_user_id` | uuid → `auth.users` | SET NULL on delete |
| `target_node_id` | uuid → `skill_nodes` | SET NULL on delete |
| `proposal` | jsonb | typed proposal object (see `RestructureProposal` TS type) |
| `proposal_version` | int | schema versioning |
| `message` | text | optional note to admin |
| `status` | text | `pending` \| `approved` \| `denied` |
| `reviewed_by` / `reviewed_at` | uuid / timestamptz | |
| `denial_reason` | text | |

**Proposal types:** `rename` · `reparent` · `add_child` · `move`

Approved via `approve_restructure_request()` RPC which applies the tree change, logs it, and awards Skillcoins.

---

## 8. Support & admin

### `support_messages`
Help page contact form submissions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `sender_user_id` | uuid → `auth.users` | nullable (anonymous allowed) |
| `email` | text | at least one of sender_user_id or email required |
| `subject` | text | |
| `body` | text | |
| `status` | text | `open` \| `closed` |
| `handled_by` / `handled_at` | uuid / timestamptz | set by admin |

**RLS:** Users can insert and read their own messages.

---

### `admin_users`
Whitelist of users with admin panel access. Not the same as `user_roles`.

| Column | Type |
|--------|------|
| `user_id` | uuid PK → `auth.users` |
| `role` | text (`developer` \| `moderator`) |
| `created_by` | uuid → `auth.users` |
| `created_at` | timestamptz |

**RLS:** Disabled — service role only.

---

### `admin_audit_log`
Immutable log of admin actions (approvals, denials, node changes).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `actor_user_id` | uuid → `auth.users` | SET NULL on delete |
| `action` | text | e.g. `approve_restructure` |
| `entity_type` | text | e.g. `node_restructure_request` |
| `entity_id` | uuid | |
| `before_data` / `after_data` | jsonb | snapshot diff |
| `created_at` | timestamptz | |

**RLS:** Disabled — service role only.

---

## 9. Chat

Migration: `20261011001_chat.sql`. Supports 1:1 and group conversations, chat requests, text / image / skill / system messages, editing and soft delete.

**Security model:** `messages` are read and written directly through RLS. `conversations` and `conversation_participants` are readable through RLS but writable **only through RPC functions** (no INSERT/UPDATE/DELETE policies, write privileges revoked).

### `conversations`
One conversation, either direct (1:1) or group.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `type` | text | `direct` \| `group` |
| `title` | text | group only, 1–100 chars; must be NULL for `direct` |
| `direct_key` | text UNIQUE | direct only: `'<smaller uuid>:<bigger uuid>'`, guarantees max one 1:1 chat per pair |
| `created_by` | uuid → `auth.users` | SET NULL on delete |
| `last_message_at` | timestamptz | maintained by trigger on `messages` insert; used to sort the chat list |
| `created_at` / `updated_at` | timestamptz | |

**RLS:** Visible to every participant (including `pending`, so the request shows up).

---

### `conversation_participants`
Membership, role and chat-request status.

| Column | Type | Notes |
|--------|------|-------|
| `conversation_id` | uuid → `conversations` | PK part, CASCADE |
| `user_id` | uuid → `auth.users` | PK part, CASCADE |
| `role` | text | `owner` \| `admin` \| `member` (direct chats: always `member`) |
| `status` | text | `pending` (request not accepted; cannot read/send messages) \| `accepted` |
| `joined_at` | timestamptz | invite time, reset on accept |
| `last_read_at` | timestamptz | set by `mark_conversation_read()`; also moved to the message time when the user sends a message (trigger on `messages` insert) |

**Index:** `(user_id)` for "my conversations".
**RLS:** Participants see the other participants of their conversations.
**Trigger (after delete):** if no accepted participant remains, the conversation is deleted; if the group owner left, the oldest admin (else oldest member) becomes owner.

---

### `messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `conversation_id` | uuid → `conversations` | CASCADE |
| `sender_id` | uuid → `auth.users` | defaults to `auth.uid()`; NULL for system messages / deleted accounts (SET NULL) |
| `type` | text | `text` \| `image` \| `skill` \| `system` |
| `body` | text | ≤ 4000 chars; message text, image caption or skill comment |
| `image_path` | text | path in `chat-media` bucket, must be `{conversation_id}/{sender_id}/…` |
| `skill_node_id` | uuid → `skill_nodes` | shared skill; SET NULL on delete (required on insert for `skill`, enforced by trigger) |
| `metadata` | jsonb | system messages only, e.g. `{"event":"member_added","actor_id":…,"target_id":…}` |
| `reply_to_id` | uuid → `messages` | the message this one replies to; must be in the same conversation (trigger); SET NULL |
| `created_at` | timestamptz | |
| `edited_at` | timestamptz | NULL = never edited; set by trigger when `body` changes |
| `deleted_at` | timestamptz | NULL = not deleted; content columns are wiped on delete |

**Index:** `(conversation_id, created_at DESC)` for loading/paging; FK indexes on `sender_id`, `skill_node_id`.
**RLS:** Only `accepted` members read. Members insert as themselves (`type` ≠ `system`). Authors update their own non-deleted, non-system messages.
**Column privileges:** clients may INSERT only `id, conversation_id, sender_id, type, body, image_path, skill_node_id, reply_to_id` and UPDATE only `body`.
**System message events:** `group_created`, `renamed`, `member_added`, `member_joined`, `member_removed`, `member_left`, `role_changed`.

**RLS helpers** (SECURITY DEFINER, avoid policy recursion on `conversation_participants`):
- `is_conversation_participant(conversation_id)`: caller is in the conversation (any status)
- `is_conversation_member(conversation_id)`: caller is in the conversation with `status = 'accepted'`

### `message_reactions`

| Column | Type | Notes |
|--------|------|-------|
| `message_id` | uuid → `messages` | PK part, CASCADE |
| `user_id` | uuid → `auth.users` | PK part, defaults to `auth.uid()`, CASCADE |
| `conversation_id` | uuid → `conversations` | copied from the message (RLS check + realtime filter), CASCADE |
| `emoji` | text | `👍` \| `👎` \| `😂` \| `😮` |
| `created_at` | timestamptz | |

One reaction per user per message (PK). Reactions of a soft-deleted message are removed by trigger.
**Index:** `(conversation_id)`.
**RLS:** Accepted members read. No write policies, writes only through `set_message_reaction()`.
**Replica identity:** FULL (DELETE events carry `message_id` + `user_id`).

**Realtime:** `messages`, `conversation_participants` and `message_reactions` are in the `supabase_realtime` publication.

---

## 10. Storage buckets

### `avatars`
| Setting | Value |
|---------|-------|
| Visibility | Public |
| Max file size | 2 MB |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp` |
| Path convention | `{user_id}/{filename}` |

Users can only write to their own folder (first path segment = `auth.uid()`).

---

### `profile-media`
Used by profile builder cards (photos and CV PDFs).

| Setting | Value |
|---------|-------|
| Visibility | Public |
| Max file size | 10 MB |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |
| Path convention | `{user_id}/{filename}` |

---

### `chat-media`
Images sent in chat messages.

| Setting | Value |
|---------|-------|
| Visibility | **Private** (use `createSignedUrl`) |
| Max file size | 5 MB |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| Path convention | `{conversation_id}/{user_id}/{filename}` |

Read: accepted members of the conversation (`can_access_chat_media()`). Upload: accepted members, own subfolder only. Delete: the uploader.

---

## 11. RPC functions

All RPCs run as `SECURITY DEFINER` so they can bypass RLS where needed (except internal `_`-prefixed chat helpers, which are SECURITY INVOKER and not executable by clients).

| Function | Description |
|----------|-------------|
| `approve_restructure_request(p_request_id, p_actor_user_id)` | Validates actor is admin, applies the proposal to the skill tree, awards 10 Skillcoins to requester, writes audit log. |
| `award_skillcoins(p_user_id, p_amount, p_reason, p_reference_id?)` | Increments `profiles.skillcoin_balance` and inserts a `skillcoin_transactions` row. |
| `delete_own_account()` | Deletes the caller's `auth.users` row; all user data cascades. |
| `reorder_profile_cards(p_user_id, p_ids)` | Sets `position` = array index for each card; validates caller = owner. |
| `reorder_learning_blocks(p_page_id, p_ids)` | Sets `sort_order` = array index for each block; requires editor role. |
| `touch_skill_last_opened(p_skill_node_id)` | Sets `user_skills.last_opened_at = now()` for the current user. |
| `submit_learning_suggestion(p_skill_node_id, p_proposed_blocks, p_message?)` | Inserts a `skill_learning_suggestions` row on behalf of caller. Returns new suggestion ID. |
| `get_node_descendants(p_node_id)` | Returns all descendant nodes using ltree path matching. |
| `is_editor()` | Returns `true` if the current user has `admin` or `editor` role. Used by RLS policies. |
| `_apply_move_tree(p_nodes)` | Internal helper: walks a proposal node tree, applies renames/deletions recursively. |
| `_apply_move_new_nodes(p_parent_id, p_nodes)` | Internal helper: creates new nodes under a given parent, inheriting its path. |
| `get_or_create_direct_conversation(p_other_user_id)` | Returns the existing 1:1 chat or creates it (caller `accepted`, other user `pending`). |
| `create_group_conversation(p_title, p_member_ids?)` | Creates a group; caller = `owner`, invited users = `pending`. |
| `accept_conversation(p_conversation_id)` | Accepts a chat request (`pending` → `accepted`). |
| `decline_conversation(p_conversation_id)` | Declines a request: deletes the whole direct chat, or only the caller's group invite. |
| `rename_conversation(p_conversation_id, p_title)` | Renames a group. Owner/admin. |
| `add_conversation_members(p_conversation_id, p_user_ids)` | Invites users to a group (`pending`). Owner/admin. |
| `remove_conversation_member(p_conversation_id, p_user_id)` | Removes a participant. Admin → members only; owner → anyone. |
| `set_participant_role(p_conversation_id, p_user_id, p_role)` | Changes role; `owner` transfers ownership. Owner only. |
| `leave_conversation(p_conversation_id)` | Leaves a group (owner hand-over / cleanup via trigger). |
| `mark_conversation_read(p_conversation_id)` | Sets caller's `last_read_at = now()`. |
| `delete_message(p_message_id)` | Soft-deletes caller's own message; returns old `image_path` so the client can remove the file. |
| `set_message_reaction(p_message_id, p_emoji)` | Sets caller's reaction; same emoji again or NULL removes it. Returns the reaction after the call. |
| `is_conversation_participant(id)` / `is_conversation_member(id)` | Chat RLS helpers (see section 9). |
| `can_access_chat_media(p_object_name)` | Storage helper: parses conversation id from the path and checks membership. |

---

## 12. Entity-relationship overview

```
auth.users
  │
  ├── profiles  (1:1, skillcoin_balance denormalized here)
  │     └── skillcoin_transactions  (1:N)
  │
  ├── user_roles  (1:N)
  │
  ├── user_skills  (N:M with skill_nodes)
  │     ├── user_skill_attributes  (per skill+user, uses skill_attribute_defs)
  │     ├── user_skill_notes  (1:1 per skill+user)
  │     ├── user_skill_level  (1:1 per skill+user, refs skill_levels)
  │     └── user_progress_checks  (1:N per user, refs skill_progress_items)
  │
  ├── profile_cards  (1:N)
  ├── user_login_days  (1:N)
  ├── teaching_offers  (1:N)
  ├── node_restructure_requests  (1:N)
  ├── support_messages  (1:N)
  └── conversation_participants  (N:M with conversations, role + status)

conversations  (direct | group)
  ├── conversation_participants  (1:N)
  └── messages  (1:N, optional skill_node_id → skill_nodes)

skill_nodes  (self-referencing tree via parent_id + ltree path)
  ├── skill_attribute_defs  (1:N)
  ├── skill_learning_pages  (1:1)
  │     └── skill_learning_blocks  (1:N, ordered)
  ├── skill_learning_suggestions  (1:N)
  ├── skill_levels  (1:N, ordered)
  ├── skill_progress_items  (1:N, grouped by section)
  ├── skill_resources  (1:N)
  └── skill_stats  (1:1, denormalized counters)

admin_users  ──→  admin_audit_log
```
