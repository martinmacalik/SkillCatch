# SkillCatch — Admin & Moderation System Design

**Date:** 2026-04-02
**Status:** Approved — ready for implementation planning

---

## 1. Overview

SkillCatch is a single Vite+React app today. This design restructures it into a pnpm monorepo with three distinct applications, adds a moderation/admin system for user-submitted skill tree proposals and support messages, and deploys all three apps cleanly on Vercel.

### Goals
- Users can submit restructure proposals for the skill tree — no direct tree mutation from the frontend
- Admins review proposals and messages through a secure internal dashboard
- The service role key is strictly confined to the admin API backend
- RLS remains the real protection for all user-facing tables
- The admin API verifies identity server-side before any privileged action

### Non-goals
- Real-time notifications or websockets
- Complex role hierarchies beyond `developer` / `moderator`
- Turborepo (deferred — structure allows adding it later)

---

## 2. Repository Structure

```
SkillCatch/
├── apps/
│   ├── web/                         ← existing Vite+React app (moved)
│   │   ├── src/
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── package.json
│   │   └── vercel.json              ← SPA rewrite to /index.html
│   │
│   ├── admin/                       ← new Vite+React admin UI
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   ├── contexts/
│   │   │   ├── lib/
│   │   │   ├── types/
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── package.json
│   │   └── vercel.json              ← SPA rewrite to /index.html
│   │
│   └── admin-api/                   ← new Express app → Vercel Node Function
│       ├── src/
│       │   ├── lib/
│       │   │   ├── env.ts           ← validated env access, fail-fast
│       │   │   └── supabase.ts      ← exports supabaseAuth + supabaseAdmin
│       │   ├── middleware/
│       │   │   ├── auth.ts          ← requireAuth, requireAdmin, requireDeveloper
│       │   │   └── errorHandler.ts  ← centralized Express error handler
│       │   ├── routes/
│       │   │   ├── requests.ts
│       │   │   ├── messages.ts
│       │   │   └── audit.ts
│       │   ├── validation/
│       │   │   ├── proposal.ts      ← Zod schema for proposal shape
│       │   │   ├── requests.ts      ← Zod schemas for request inputs
│       │   │   ├── messages.ts      ← Zod schemas for message inputs
│       │   │   └── common.ts        ← pagination, UUID validators
│       │   └── app.ts               ← Express app (no listen call)
│       ├── api/
│       │   └── index.ts             ← Vercel entry: export default app
│       ├── package.json
│       ├── tsconfig.json
│       └── vercel.json
│
├── packages/
│   └── shared/                      ← empty for now, ready for shared types
│
├── supabase/
│   └── migrations/
│       ├── 20260402001_admin_users.sql
│       ├── 20260402002_node_restructure_requests.sql
│       ├── 20260402003_support_messages.sql
│       ├── 20260402004_admin_audit_log.sql
│       └── 20260402005_rls_indexes.sql
│
├── database_export.sql              ← legacy reference, kept as-is
├── pnpm-workspace.yaml
├── package.json                     ← root scripts + devDependencies only
└── .gitignore
```

---

## 3. Database Schema

### 3.1 `admin_users`

```sql
CREATE TABLE admin_users (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('developer', 'moderator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
```

- `user_id` is both PK and unique.
- No RLS policies for regular users. Backend reads via service role only.
- RLS enabled, no user-facing policies.

---

### 3.2 `node_restructure_requests`

```sql
CREATE TABLE node_restructure_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_node_id     uuid REFERENCES skill_nodes(id) ON DELETE SET NULL,
  proposal           jsonb NOT NULL DEFAULT '{}',
  proposal_version   integer NOT NULL DEFAULT 1,
  message            text,
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by        uuid REFERENCES auth.users(id),
  reviewed_at        timestamptz,
  denial_reason      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
```

RLS:
- Users can `INSERT` own requests (`requester_user_id = auth.uid()`).
- Users can `SELECT` only their own requests.
- No user `UPDATE` or `DELETE`.
- Approvals/denials are applied via backend service role only.

---

### 3.3 `support_messages`

```sql
CREATE TABLE support_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email            text,
  subject          text NOT NULL,
  body             text NOT NULL,
  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'closed')),
  handled_by       uuid REFERENCES auth.users(id),
  handled_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT has_sender_or_email
    CHECK (sender_user_id IS NOT NULL OR email IS NOT NULL)
);
```

RLS:
- Authenticated users can `INSERT` directly via the Supabase client (RLS enforces `sender_user_id = auth.uid()`). This is handled from the web app — no admin-api endpoint needed for this path.
- Authenticated users can `SELECT` only their own messages.
- No user `UPDATE` or `DELETE`.
- Anonymous support message submission (email-only, no account) is deferred to a future iteration. It would require a lightweight public `POST /contact` endpoint in admin-api to bypass the anon INSERT RLS restriction safely.

---

### 3.4 `admin_audit_log`

```sql
CREATE TABLE admin_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid,
  before_data   jsonb,
  after_data    jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

- Treated as append-only in application code. No `UPDATE` or `DELETE` ever issued against it.
- RLS enabled, no user-facing policies. Backend reads/writes via service role only.

---

### 3.5 Migration files

| File | Contents |
|------|----------|
| `20260402001_admin_users.sql` | `admin_users` table |
| `20260402002_node_restructure_requests.sql` | `node_restructure_requests` table |
| `20260402003_support_messages.sql` | `support_messages` table |
| `20260402004_admin_audit_log.sql` | `admin_audit_log` table |
| `20260402005_rls_indexes.sql` | All RLS policies + all indexes |

Apply via: `supabase db push` or manually through Supabase dashboard SQL editor.

---

## 4. Admin API (`apps/admin-api`)

### 4.1 Supabase clients

`lib/supabase.ts` exports two clients:

- **`supabaseAuth`** — created with the anon key. Used only to call `supabase.auth.getUser(token)` in `requireAuth`. Never used for data queries.
- **`supabaseAdmin`** — created with the service role key. Used for all privileged reads and writes. Never leaves the server.

### 4.2 Middleware chain

```
requireAuth        → extract Bearer JWT, call getUser(), attach req.user
requireAdmin       → query admin_users, attach req.adminRole ('developer'|'moderator'), 403 if not found
requireDeveloper   → assert req.adminRole === 'developer', 403 otherwise
errorHandler       → centralized Express error handler (last middleware)
```

### 4.3 Endpoints

| Method | Path | Middleware | Description |
|--------|------|------------|-------------|
| `GET` | `/requests` | requireAdmin | List requests. Query: `?status=pending\|approved\|denied`, pagination |
| `GET` | `/requests/:id` | requireAdmin | Single request with target node path info |
| `POST` | `/requests/:id/approve` | requireAdmin | Approve + apply tree changes + audit log |
| `POST` | `/requests/:id/deny` | requireAdmin | Deny + store `denial_reason` + audit log |
| `GET` | `/messages` | requireAdmin | List messages. Query: `?status=open\|closed`, pagination |
| `POST` | `/messages/:id/close` | requireAdmin | Close message + audit log |
| `POST` | `/messages/:id/open` | requireAdmin | Reopen message + audit log |
| `GET` | `/audit` | requireAdmin | List audit log. Query: `?entity_type=`, pagination |
| `GET` | `/admin-users` | requireDeveloper | List admin users |

### 4.4 Approval flow

```
POST /requests/:id/approve
  1. Load request → 404 if not found
  2. Assert status === 'pending' → 409 if already reviewed
  3. Validate proposal shape with Zod → 422 if invalid
  4. Call Supabase RPC / transaction:
       a. Apply skill_nodes changes
       b. Apply skill_node_parents changes
       c. Apply skill_attribute_defs changes
       (all in one atomic operation)
  5. INSERT into admin_audit_log (actor, action, entity_type, entity_id, before_data, after_data)
  6. UPDATE node_restructure_requests SET status='approved', reviewed_by=actor, reviewed_at=now()
  7. Return 200 + updated request
```

Denial flow: steps 1–2, skip 3–4, write audit log, set `status='denied'` + `denial_reason`.

### 4.5 Environment variables

```
SUPABASE_URL                 required
SUPABASE_ANON_KEY            required  (for JWT verification only)
SUPABASE_SERVICE_ROLE_KEY    required  (privileged operations)
ADMIN_CORS_ORIGINS           required  (comma-separated list, e.g. https://admin.skillcatch.space,http://localhost:5174)
```

`lib/env.ts` validates all four at startup and throws if any are missing.

---

## 5. Admin UI (`apps/admin`)

### 5.1 File structure

```
src/
├── pages/
│   ├── LoginPage.tsx          ← email+password only
│   ├── AccessDeniedPage.tsx   ← shown when admin-api returns 403
│   ├── RequestsPage.tsx       ← default route, pending-first list
│   ├── MessagesPage.tsx       ← support inbox
│   └── AuditPage.tsx          ← audit log table
├── components/
│   ├── layout/
│   │   ├── AdminShell.tsx     ← sidebar + topbar + outlet
│   │   ├── Sidebar.tsx        ← nav: Requests / Messages / Audit
│   │   └── TopBar.tsx         ← current user + sign-out
│   ├── RequestCard.tsx        ← request row: approve/deny actions
│   ├── MessageItem.tsx        ← message row: close/open actions
│   ├── AuditRow.tsx           ← audit log row
│   ├── StatusBadge.tsx        ← pill badges (pending/approved/denied/open/closed)
│   ├── ProposalDiff.tsx       ← summary-first readable proposal display
│   └── ProtectedRoute.tsx     ← redirects to /login if no session
├── contexts/
│   └── AuthContext.tsx        ← Supabase session wrapper
├── lib/
│   ├── supabaseClient.ts      ← anon key only, used for auth session
│   └── api.ts                 ← typed fetch wrapper → attaches Bearer token → admin-api
├── types/
│   └── api.ts                 ← TypeScript types for all API responses
├── App.tsx                    ← router: /login, /requests, /messages, /audit
└── main.tsx
```

### 5.2 Auth flow

```
Visit admin.skillcatch.space
  → ProtectedRoute checks AuthContext session
  → No session → /login
  → LoginPage: supabase.auth.signInWithPassword()
  → Success → /requests
  → api.ts attaches Authorization: Bearer <access_token> on every call
  → admin-api returns 403 → AccessDeniedPage (not an admin)
  → No frontend check of admin_users — backend is the gate
```

### 5.3 UI style

- Background: `#0a0a0a`, text: white
- Sidebar: solid black, white nav items, active item gets indigo left-border accent
- Primary action (approve, submit): indigo `#6366f1`
- Destructive action (deny, close): rose `#f43f5e`
- Card surfaces: `#111` with 1px subtle border, no shadows
- StatusBadge: pill shapes — pending amber, approved green, denied rose, open/closed neutral
- Typography: medium-weight sans-serif, generous spacing
- Flat and functional — no gradients, no decorative elements

### 5.4 Component states

Every data-fetching component implements three non-happy-path states:
- **Loading:** skeleton or spinner
- **Empty:** clear message ("No pending requests")
- **Error:** error message + retry button

### 5.5 Environment variables

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_ADMIN_API_URL    (= https://admin-api.skillcatch.space)
```

---

## 6. Main Web App Changes (`apps/web`)

The only significant change is `SkillFeedbackPage.tsx` (currently 807 lines).

### 6.1 Refactor structure

```
src/pages/
└── SkillFeedbackPage.tsx                  ← slim shell (~100 lines)

src/components/skill-feedback/
├── RestructureForm.tsx                    ← proposal builder UI
├── RestructureSuccess.tsx                 ← confirmation screen
└── OtherFeedbackForm.tsx                  ← non-restructure feedback modes

src/hooks/
└── useSubmitRestructureRequest.ts         ← submission logic + state machine

src/lib/
└── serializeProposal.ts                   ← proposal serializer utility

src/types/
└── restructure.ts                         ← RestructureProposal shape, FeedbackType enum
```

### 6.2 Data flow change

**Before:** `SkillFeedbackPage` mutates `skill_nodes` directly via Supabase client.

**After:**
```
User builds proposal
  → serializeProposal() produces versioned proposal object
  → useSubmitRestructureRequest()
  → INSERT into node_restructure_requests { proposal, proposal_version, requester_user_id, target_node_id, message }
  → status: 'pending'
  → tree unchanged until admin approves
```

No direct writes to `skill_nodes`, `skill_node_parents`, or `skill_attribute_defs` from the frontend after this refactor.

### 6.3 Submission state machine

```
idle → submitting → success (stores submittedRequestId)
            ↓
          error (message, retryable via reset())
```

`RestructureSuccess` shows: confirmation message + tiny request summary (target node name, proposal type) + link back to skills.

### 6.4 Environment variables

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

No admin API URL. No service role key. Ever.

---

## 7. Vercel Deployment

### 7.1 Three Vercel projects

| Project | Root dir | Domain | Output |
|---------|----------|--------|--------|
| `skillcatch-web` | `apps/web` | `skillcatch.space` | `dist` |
| `skillcatch-admin` | `apps/admin` | `admin.skillcatch.space` | `dist` |
| `skillcatch-admin-api` | `apps/admin-api` | `admin-api.skillcatch.space` | serverless |

### 7.2 `apps/web/vercel.json`

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### 7.3 `apps/admin/vercel.json`

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### 7.4 `apps/admin-api/vercel.json`

```json
{
  "version": 2,
  "routes": [{ "src": "/(.*)", "dest": "api/index.ts" }]
}
```

No `builds` block needed — Vercel detects `@vercel/node` automatically from `api/index.ts`.

### 7.5 Supabase auth redirect URLs

Add all of these in Supabase dashboard → Authentication → URL Configuration:

```
https://skillcatch.space/auth/callback
https://admin.skillcatch.space/auth/callback
http://localhost:5173/auth/callback
http://localhost:5174/auth/callback
```

For Vercel preview URL support, also add wildcard patterns:
```
https://*-skillcatch.vercel.app/auth/callback
https://*-skillcatch-admin.vercel.app/auth/callback
```

---

## 8. Local Development

### Root `package.json` scripts

```json
{
  "scripts": {
    "dev:web":     "pnpm --filter web dev",
    "dev:admin":   "pnpm --filter admin dev",
    "dev:api":     "pnpm --filter admin-api dev",
    "build:web":   "pnpm --filter web build",
    "build:admin": "pnpm --filter admin build",
    "build:api":   "pnpm --filter admin-api build",
    "build":       "pnpm -r build"
  }
}
```

**`admin-api` dev command:** The `dev` script in `apps/admin-api/package.json` uses `tsx watch src/server.ts` where `server.ts` is a thin local wrapper that calls `app.listen(3001)`. This is separate from `api/index.ts` (the Vercel entry). In production Vercel handles the server; locally `tsx --watch` handles it. Alternatively `vercel dev` can be used to emulate the Vercel Function environment locally.

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### Environment files

Each app has its own `.env.local`:

**`apps/web/.env.local`**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

**`apps/admin/.env.local`**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_ADMIN_API_URL=http://localhost:3001
```

**`apps/admin-api/.env.local`**
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_CORS_ORIGINS=http://localhost:5174,http://localhost:5173
```

### Applying migrations

```bash
# If using Supabase CLI:
supabase db push

# Or apply manually through Supabase dashboard SQL editor,
# running each file in 20260402001 → 20260402005 order.
```

---

## 9. Security Invariants

These must never be violated:

1. `SUPABASE_SERVICE_ROLE_KEY` is set **only** in the `skillcatch-admin-api` Vercel project. Never in `web` or `admin`.
2. `VITE_*` env vars are baked into client bundles at build time — they must never contain secrets.
3. The admin UI **never** reads `admin_users` directly. The backend is the only gate.
4. RLS is enabled on all user-facing tables. Service role bypasses RLS intentionally in the backend only.
5. `admin_audit_log` is append-only. No application code ever issues `UPDATE` or `DELETE` against it.
6. All privileged endpoints require both `requireAuth` and `requireAdmin` in the middleware chain. No exceptions.
7. Tree mutations (`skill_nodes`, `skill_node_parents`, `skill_attribute_defs`) from the web frontend are fully removed after the `SkillFeedbackPage` refactor.
