# SkillCatch Admin & Moderation System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure SkillCatch into a pnpm monorepo, add four database tables with RLS, build a secure Express admin API, build a minimal Vite+React admin UI, and wire SkillFeedbackPage to the new moderation tables instead of directly mutating the tree.

**Architecture:** pnpm workspaces (`apps/web`, `apps/admin`, `apps/admin-api`, `packages/shared`). Admin API is an Express 4 app deployed as a single Vercel Node Function — it exclusively holds the Supabase service role key. Admin UI uses the anon key for Supabase auth only; all data goes through the admin-api with a Bearer token. SkillFeedbackPage is refactored to submit proposals into `node_restructure_requests` via RLS INSERT, with no direct tree mutations.

**Tech Stack:** Vite 7 + React 19 + TypeScript 5 + Tailwind CSS 4 (web, admin); Express 4 + Zod 3 + TypeScript 5 (admin-api); @supabase/supabase-js 2; pnpm workspaces; Vitest + Supertest (admin-api tests).

**Spec:** `docs/superpowers/specs/2026-04-02-admin-moderation-system-design.md`

---

## File Map

### Created — repo root
- `pnpm-workspace.yaml`
- `package.json` (replace current with workspace root)

### Moved — existing app
- Everything currently at root `src/`, `public/`, `index.html`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `tsconfig*.json`, `components.json`, `eslint.config.js`, `.prettierrc.json` → `apps/web/`
- Root `package.json` → `apps/web/package.json` (name changed to `"web"`)
- Root `vercel.json` → `apps/web/vercel.json`

### Created — admin-api (`apps/admin-api/`)
- `package.json`
- `tsconfig.json`
- `.env.example`
- `src/lib/env.ts`
- `src/lib/supabase.ts`
- `src/middleware/auth.ts`
- `src/middleware/errorHandler.ts`
- `src/routes/requests.ts`
- `src/routes/messages.ts`
- `src/routes/audit.ts`
- `src/validation/proposal.ts`
- `src/validation/requests.ts`
- `src/validation/common.ts`
- `src/app.ts`
- `src/server.ts`
- `api/index.ts`
- `src/middleware/__tests__/auth.test.ts`

### Created — admin UI (`apps/admin/`)
- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- `index.html`
- `.env.example`
- `vercel.json`
- `src/main.tsx`
- `src/index.css`
- `src/App.tsx`
- `src/types/api.ts`
- `src/lib/supabaseClient.ts`
- `src/lib/api.ts`
- `src/contexts/AuthContext.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/components/StatusBadge.tsx`
- `src/components/ProposalDiff.tsx`
- `src/components/RequestCard.tsx`
- `src/components/MessageItem.tsx`
- `src/components/AuditRow.tsx`
- `src/components/layout/AdminShell.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/TopBar.tsx`
- `src/pages/LoginPage.tsx`
- `src/pages/AccessDeniedPage.tsx`
- `src/pages/RequestsPage.tsx`
- `src/pages/MessagesPage.tsx`
- `src/pages/AuditPage.tsx`

### Created — migrations (`supabase/migrations/`)
- `20260402001_admin_users.sql`
- `20260402002_node_restructure_requests.sql`
- `20260402003_support_messages.sql`
- `20260402004_admin_audit_log.sql`
- `20260402005_rls_indexes_rpc.sql`

### Modified — web app (`apps/web/src/`)
- `types/restructure.ts` (new)
- `lib/serializeProposal.ts` (new)
- `hooks/useSubmitRestructureRequest.ts` (new)
- `components/skill-feedback/RestructureForm.tsx` (extracted from SkillFeedbackPage)
- `components/skill-feedback/RestructureSuccess.tsx` (new)
- `pages/SkillFeedbackPage.tsx` (refactored to slim shell)

### Created — shared package
- `packages/shared/package.json` (placeholder only)

---

## Phase 1: Monorepo Setup

### Task 1: Create workspace root and move existing app

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json` (new root)
- Create: `apps/web/` directory (move all existing app files here)
- Create: `packages/shared/package.json`

- [ ] **Step 1: Create `apps/web/` and `packages/shared/` directories**

```bash
mkdir -p apps/web packages/shared
```

- [ ] **Step 2: Move existing source files into `apps/web/`**

Use git mv for each item so history is preserved:

```bash
git mv src apps/web/src
git mv public apps/web/public
git mv index.html apps/web/index.html
git mv vite.config.ts apps/web/vite.config.ts
git mv tailwind.config.js apps/web/tailwind.config.js
git mv postcss.config.js apps/web/postcss.config.js
git mv tsconfig.json apps/web/tsconfig.json
git mv tsconfig.app.json apps/web/tsconfig.app.json
git mv tsconfig.node.json apps/web/tsconfig.node.json
git mv components.json apps/web/components.json
git mv eslint.config.js apps/web/eslint.config.js
git mv .prettierrc.json apps/web/.prettierrc.json
git mv vercel.json apps/web/vercel.json
```

- [ ] **Step 3: Copy current `package.json` to `apps/web/package.json` and update the name**

Open `apps/web/package.json` and change the `"name"` field:

```json
{
  "name": "web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  }
}
```

Keep all `dependencies` and `devDependencies` from the original `package.json` unchanged.

- [ ] **Step 4: Create the new root `package.json`**

Create `package.json` at the repo root (replacing the old one):

```json
{
  "name": "skillcatch",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev:web": "pnpm --filter web dev",
    "dev:admin": "pnpm --filter admin dev",
    "dev:api": "pnpm --filter admin-api dev",
    "build:web": "pnpm --filter web build",
    "build:admin": "pnpm --filter admin build",
    "build:api": "pnpm --filter admin-api build",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "prettier": "^3.2.5"
  }
}
```

- [ ] **Step 5: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 6: Create `packages/shared/package.json`**

```json
{
  "name": "@skillcatch/shared",
  "version": "0.0.0",
  "private": true,
  "main": "./index.ts"
}
```

- [ ] **Step 7: Update `.gitignore` — add per-app node_modules entries**

Open `.gitignore` and append:

```
# Per-app builds
apps/web/dist
apps/admin/dist
apps/admin-api/dist

# Per-app env files
apps/**/.env.local
apps/**/.env
```

- [ ] **Step 8: Delete old root `node_modules` and reinstall**

```bash
rm -rf node_modules
pnpm install
```

Expected: pnpm installs `apps/web`'s dependencies under `apps/web/node_modules` (or hoisted), no errors.

- [ ] **Step 9: Verify the existing web app still runs**

```bash
pnpm dev:web
```

Expected: Vite starts on `http://localhost:5173`, no import errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: restructure repo into pnpm monorepo (apps/web)"
```

---

## Phase 2: Database Migrations

### Task 2: Migration — `admin_users`

**Files:**
- Create: `supabase/migrations/20260402001_admin_users.sql`

- [ ] **Step 1: Create migrations directory**

```bash
mkdir -p supabase/migrations
```

- [ ] **Step 2: Create `supabase/migrations/20260402001_admin_users.sql`**

```sql
-- admin_users: maps auth users to admin roles
-- user_id is PK (one row per user, role cannot be duplicated)
-- No user-facing RLS policies — backend reads this via service role only

CREATE TABLE IF NOT EXISTS admin_users (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('developer', 'moderator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: all access through service role in backend
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260402001_admin_users.sql
git commit -m "db: add admin_users table migration"
```

---

### Task 3: Migration — `node_restructure_requests`

**Files:**
- Create: `supabase/migrations/20260402002_node_restructure_requests.sql`

- [ ] **Step 1: Create `supabase/migrations/20260402002_node_restructure_requests.sql`**

```sql
-- node_restructure_requests: user-submitted proposals to restructure the skill tree
-- Users INSERT their own rows via RLS; all approvals/denials go through the backend

CREATE TABLE IF NOT EXISTS node_restructure_requests (
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

ALTER TABLE node_restructure_requests ENABLE ROW LEVEL SECURITY;

-- Authenticated users may insert their own requests
CREATE POLICY "users_insert_own_requests"
  ON node_restructure_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (requester_user_id = auth.uid());

-- Authenticated users may read only their own requests
CREATE POLICY "users_select_own_requests"
  ON node_restructure_requests
  FOR SELECT
  TO authenticated
  USING (requester_user_id = auth.uid());
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260402002_node_restructure_requests.sql
git commit -m "db: add node_restructure_requests table migration"
```

---

### Task 4: Migration — `support_messages`

**Files:**
- Create: `supabase/migrations/20260402003_support_messages.sql`

- [ ] **Step 1: Create `supabase/migrations/20260402003_support_messages.sql`**

```sql
-- support_messages: contact/support inbox
-- Authenticated users INSERT directly via RLS (sender_user_id = auth.uid())
-- Anonymous submissions go through the backend service role (deferred feature)

CREATE TABLE IF NOT EXISTS support_messages (
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

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Authenticated users may insert their own messages
CREATE POLICY "authenticated_users_insert_messages"
  ON support_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (sender_user_id = auth.uid());

-- Authenticated users may read only their own messages
CREATE POLICY "authenticated_users_select_own_messages"
  ON support_messages
  FOR SELECT
  TO authenticated
  USING (sender_user_id = auth.uid());
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260402003_support_messages.sql
git commit -m "db: add support_messages table migration"
```

---

### Task 5: Migration — `admin_audit_log`

**Files:**
- Create: `supabase/migrations/20260402004_admin_audit_log.sql`

- [ ] **Step 1: Create `supabase/migrations/20260402004_admin_audit_log.sql`**

```sql
-- admin_audit_log: append-only record of admin actions
-- No user-facing policies — backend reads/writes via service role only
-- Application code must never UPDATE or DELETE rows in this table

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid,
  before_data   jsonb,
  after_data    jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: all access through service role in backend
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260402004_admin_audit_log.sql
git commit -m "db: add admin_audit_log table migration"
```

---

### Task 6: Migration — indexes, RLS check, approval RPC

**Files:**
- Create: `supabase/migrations/20260402005_rls_indexes_rpc.sql`

- [ ] **Step 1: Create `supabase/migrations/20260402005_rls_indexes_rpc.sql`**

```sql
-- Indexes
CREATE INDEX IF NOT EXISTS idx_restructure_requests_requester
  ON node_restructure_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_restructure_requests_status
  ON node_restructure_requests(status);
CREATE INDEX IF NOT EXISTS idx_restructure_requests_created_at
  ON node_restructure_requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_messages_sender
  ON support_messages(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_status
  ON support_messages(status);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON admin_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type
  ON admin_audit_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON admin_audit_log(created_at DESC);

-- Approval RPC: atomically applies tree changes, writes audit log, marks request approved
-- Called by admin-api with service role after validating proposal shape
-- Supports proposal types: 'rename', 'reparent', 'add_child'
CREATE OR REPLACE FUNCTION approve_restructure_request(
  p_request_id     uuid,
  p_actor_user_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request record;
  v_proposal_type text;
BEGIN
  -- Lock the row to prevent concurrent approvals
  SELECT * INTO v_request
  FROM node_restructure_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING HINT = p_request_id::text;
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'request_not_pending' USING HINT = v_request.status;
  END IF;

  v_proposal_type := v_request.proposal->>'type';

  -- Apply tree changes based on proposal type
  IF v_proposal_type = 'rename' THEN
    UPDATE skill_nodes
    SET name = v_request.proposal->'changes'->>'new_name'
    WHERE id = v_request.target_node_id;

  ELSIF v_proposal_type = 'reparent' THEN
    -- Update primary parent_id on skill_nodes
    UPDATE skill_nodes
    SET parent_id = (
      v_request.proposal->'changes'->'new_parent_ids'->0
    )::text::uuid
    WHERE id = v_request.target_node_id;
    -- Replace multi-parent records
    DELETE FROM skill_node_parents
    WHERE child_node_id = v_request.target_node_id;
    INSERT INTO skill_node_parents (child_node_id, parent_node_id)
    SELECT
      v_request.target_node_id,
      jsonb_array_elements_text(
        v_request.proposal->'changes'->'new_parent_ids'
      )::uuid;

  ELSIF v_proposal_type = 'add_child' THEN
    INSERT INTO skill_nodes (name, slug, parent_id, is_leaf)
    VALUES (
      v_request.proposal->'changes'->'child_node'->>'name',
      v_request.proposal->'changes'->'child_node'->>'slug',
      v_request.target_node_id,
      (v_request.proposal->'changes'->'child_node'->>'is_leaf')::boolean
    );

  ELSE
    RAISE EXCEPTION 'unsupported_proposal_type' USING HINT = v_proposal_type;
  END IF;

  -- Write audit log entry
  INSERT INTO admin_audit_log (
    actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    p_actor_user_id,
    'approve_restructure_request',
    'node_restructure_request',
    p_request_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'approved', 'proposal', v_request.proposal)
  );

  -- Mark request approved
  UPDATE node_restructure_requests
  SET
    status      = 'approved',
    reviewed_by = p_actor_user_id,
    reviewed_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'request_id', p_request_id);
END;
$$;
```

- [ ] **Step 2: Apply all migrations**

Option A — Supabase CLI:
```bash
supabase db push
```

Option B — manual (Supabase dashboard → SQL Editor):
Run each file in order: `20260402001` → `20260402002` → `20260402003` → `20260402004` → `20260402005`.

Expected: all five files execute without errors. Tables visible in Supabase Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260402005_rls_indexes_rpc.sql
git commit -m "db: add indexes, RLS verification, and approval RPC"
```

---

## Phase 3: Admin API

### Task 7: Initialize `apps/admin-api` package

**Files:**
- Create: `apps/admin-api/package.json`
- Create: `apps/admin-api/tsconfig.json`
- Create: `apps/admin-api/.env.example`

- [ ] **Step 1: Create `apps/admin-api/package.json`**

```json
{
  "name": "admin-api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.5",
    "@types/supertest": "^6.0.2",
    "supertest": "^6.3.4",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.2"
  }
}
```

- [ ] **Step 2: Create `apps/admin-api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "baseUrl": "."
  },
  "include": ["src/**/*", "api/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `apps/admin-api/.env.example`**

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_CORS_ORIGINS=http://localhost:5174,https://admin.skillcatch.space
```

- [ ] **Step 4: Install admin-api dependencies**

```bash
pnpm --filter admin-api install
```

Expected: `apps/admin-api/node_modules` created, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-api/package.json apps/admin-api/tsconfig.json apps/admin-api/.env.example
git commit -m "feat: scaffold admin-api package"
```

---

### Task 8: `lib/env.ts` and `lib/supabase.ts`

**Files:**
- Create: `apps/admin-api/src/lib/env.ts`
- Create: `apps/admin-api/src/lib/supabase.ts`

- [ ] **Step 1: Create `apps/admin-api/src/lib/env.ts`**

```typescript
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_ANON_KEY: required('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
  ADMIN_CORS_ORIGINS: required('ADMIN_CORS_ORIGINS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
```

- [ ] **Step 2: Create `apps/admin-api/src/lib/supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Used only for JWT verification via auth.getUser()
// Never used for data queries
export const supabaseAuth = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Used for all privileged data operations
// Never referenced from any frontend code
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
```

- [ ] **Step 3: Create `.env.local` for local dev (not committed)**

Create `apps/admin-api/.env.local` with real values from Supabase dashboard:

```
SUPABASE_URL=https://uylqvlvkelceehopuhgt.supabase.co
SUPABASE_ANON_KEY=<your anon key from Supabase dashboard>
SUPABASE_SERVICE_ROLE_KEY=<your service role key from Supabase dashboard>
ADMIN_CORS_ORIGINS=http://localhost:5174,http://localhost:5173
```

Confirm `.env.local` is in `.gitignore` — never commit this file.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter admin-api typecheck
```

Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-api/src/lib/env.ts apps/admin-api/src/lib/supabase.ts
git commit -m "feat(admin-api): add env validation and supabase clients"
```

---

### Task 9: Auth middleware with tests

**Files:**
- Create: `apps/admin-api/src/middleware/auth.ts`
- Create: `apps/admin-api/src/middleware/__tests__/auth.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `apps/admin-api/src/middleware/__tests__/auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../lib/supabase', () => ({
  supabaseAuth: { auth: { getUser: vi.fn() } },
  supabaseAdmin: { from: vi.fn() },
}));

import { requireAuth, requireAdmin } from '../auth';
import { supabaseAuth, supabaseAdmin } from '../../lib/supabase';

function makeApp(...middleware: Parameters<typeof express.Router['prototype']['get']>[1][]) {
  const app = express();
  app.use(express.json());
  app.get('/test', ...(middleware as any[]), (_req: any, res: any) => res.json({ ok: true }));
  return app;
}

describe('requireAuth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(makeApp(requireAuth)).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing/i);
  });

  it('returns 401 when token is invalid', async () => {
    vi.mocked(supabaseAuth.auth.getUser).mockResolvedValueOnce({
      data: { user: null },
      error: new Error('invalid token'),
    } as any);
    const res = await request(makeApp(requireAuth))
      .get('/test')
      .set('Authorization', 'Bearer bad-token');
    expect(res.status).toBe(401);
  });

  it('attaches req.user and calls next() when token is valid', async () => {
    vi.mocked(supabaseAuth.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    } as any);
    const app = express();
    app.use(express.json());
    app.get('/test', requireAuth as any, (req: any, res: any) =>
      res.json({ userId: req.user.id })
    );
    const res = await request(app)
      .get('/test')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('user-123');
  });
});

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.mocked(supabaseAuth.auth.getUser).mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    } as any);
  });

  it('returns 403 when user is not in admin_users', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: new Error('not found') }),
        }),
      }),
    } as any);
    const res = await request(makeApp(requireAuth, requireAdmin))
      .get('/test')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('attaches adminRole = "developer" for developer users', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { role: 'developer' }, error: null }),
        }),
      }),
    } as any);
    const app = express();
    app.use(express.json());
    app.get('/test', requireAuth as any, requireAdmin as any, (req: any, res: any) =>
      res.json({ role: req.adminRole })
    );
    const res = await request(app)
      .get('/test')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('developer');
  });

  it('attaches adminRole = "moderator" for moderator users', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { role: 'moderator' }, error: null }),
        }),
      }),
    } as any);
    const app = express();
    app.use(express.json());
    app.get('/test', requireAuth as any, requireAdmin as any, (req: any, res: any) =>
      res.json({ role: req.adminRole })
    );
    const res = await request(app)
      .get('/test')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('moderator');
  });
});

describe('requireDeveloper', () => {
  it('returns 403 for moderator role', async () => {
    vi.mocked(supabaseAuth.auth.getUser).mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    } as any);
    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { role: 'moderator' }, error: null }),
        }),
      }),
    } as any);
    const { requireDeveloper } = await import('../auth');
    const app = express();
    app.use(express.json());
    app.get('/test', requireAuth as any, requireAdmin as any, requireDeveloper as any, (_req: any, res: any) =>
      res.json({ ok: true })
    );
    const res = await request(app).get('/test').set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests — expect them to fail (auth module not yet created)**

```bash
pnpm --filter admin-api test
```

Expected: FAIL — "Cannot find module '../auth'"

- [ ] **Step 3: Create `apps/admin-api/src/middleware/auth.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import { supabaseAuth, supabaseAdmin } from '../lib/supabase';

declare global {
  namespace Express {
    interface Request {
      user: { id: string; email?: string };
      adminRole: 'developer' | 'moderator';
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  const token = authHeader.slice(7);
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  req.user = { id: data.user.id, email: data.user.email ?? undefined };
  next();
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('admin_users')
    .select('role')
    .eq('user_id', req.user.id)
    .single();
  if (error || !data) {
    res.status(403).json({ error: 'Access denied: not an admin' });
    return;
  }
  req.adminRole = data.role as 'developer' | 'moderator';
  next();
}

export function requireDeveloper(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.adminRole !== 'developer') {
    res.status(403).json({ error: 'Access denied: developer role required' });
    return;
  }
  next();
}
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
pnpm --filter admin-api test
```

Expected: All tests PASS, no failures.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-api/src/middleware/auth.ts apps/admin-api/src/middleware/__tests__/auth.test.ts
git commit -m "feat(admin-api): add auth middleware with tests"
```

---

### Task 10: Error handler and validation schemas

**Files:**
- Create: `apps/admin-api/src/middleware/errorHandler.ts`
- Create: `apps/admin-api/src/validation/common.ts`
- Create: `apps/admin-api/src/validation/proposal.ts`
- Create: `apps/admin-api/src/validation/requests.ts`

- [ ] **Step 1: Create `apps/admin-api/src/middleware/errorHandler.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(422).json({ error: 'Validation error', details: err.errors });
    return;
  }
  console.error('[admin-api error]', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error' });
}
```

- [ ] **Step 2: Create `apps/admin-api/src/validation/common.ts`**

```typescript
import { z } from 'zod';

export const uuidSchema = z.string().uuid('Invalid UUID format');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const requestStatusSchema = z
  .enum(['pending', 'approved', 'denied'])
  .optional();

export const messageStatusSchema = z.enum(['open', 'closed']).optional();
```

- [ ] **Step 3: Create `apps/admin-api/src/validation/proposal.ts`**

```typescript
import { z } from 'zod';

export const proposalV1Schema = z.object({
  version: z.literal(1),
  type: z.enum(['rename', 'reparent', 'add_child', 'move', 'merge', 'split']),
  target_node_id: z.string().uuid().optional(),
  changes: z.object({
    new_parent_ids: z.array(z.string().uuid()).optional(),
    new_name: z.string().min(1).max(255).optional(),
    child_node: z
      .object({
        name: z.string().min(1).max(255),
        slug: z.string().min(1).max(255),
        is_leaf: z.boolean(),
      })
      .optional(),
    merge_node_ids: z.array(z.string().uuid()).optional(),
    notes: z.string().optional(),
  }),
});

export type ProposalV1 = z.infer<typeof proposalV1Schema>;

export function validateProposal(proposal: unknown): ProposalV1 {
  return proposalV1Schema.parse(proposal);
}
```

- [ ] **Step 4: Create `apps/admin-api/src/validation/requests.ts`**

```typescript
import { z } from 'zod';

export const denyRequestSchema = z.object({
  denial_reason: z
    .string()
    .min(1, 'Denial reason is required')
    .max(1000, 'Denial reason must be under 1000 characters'),
});
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter admin-api typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-api/src/middleware/errorHandler.ts apps/admin-api/src/validation/
git commit -m "feat(admin-api): add error handler and validation schemas"
```

---

### Task 11: Routes — restructure requests

**Files:**
- Create: `apps/admin-api/src/routes/requests.ts`

- [ ] **Step 1: Create `apps/admin-api/src/routes/requests.ts`**

```typescript
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { validateProposal } from '../validation/proposal';
import { denyRequestSchema } from '../validation/requests';
import { paginationSchema, requestStatusSchema, uuidSchema } from '../validation/common';
import { ZodError } from 'zod';

export const requestsRouter = Router();

// GET /requests?status=pending&page=1&limit=20
requestsRouter.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const status = requestStatusSchema.parse(req.query.status);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('node_restructure_requests')
      .select(
        '*, target_node:skill_nodes(id, name, slug, path), requester:profiles(username)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page, limit });
  } catch (err) {
    next(err);
  }
});

// GET /requests/:id
requestsRouter.get('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const { data, error } = await supabaseAdmin
      .from('node_restructure_requests')
      .select(
        '*, target_node:skill_nodes(id, name, slug, path), requester:profiles(username)'
      )
      .eq('id', id)
      .single();
    if (error || !data) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /requests/:id/approve
requestsRouter.post('/:id/approve', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);

    const { data: existing, error: loadErr } = await supabaseAdmin
      .from('node_restructure_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (loadErr || !existing) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (existing.status !== 'pending') {
      res.status(409).json({ error: 'Request is not pending' });
      return;
    }

    try {
      validateProposal(existing.proposal);
    } catch (e) {
      if (e instanceof ZodError) {
        res.status(422).json({ error: 'Invalid proposal shape', details: e.errors });
        return;
      }
      throw e;
    }

    const { error: rpcErr } = await supabaseAdmin.rpc(
      'approve_restructure_request',
      { p_request_id: id, p_actor_user_id: req.user.id }
    );

    if (rpcErr) {
      if (rpcErr.message?.includes('request_not_pending')) {
        res.status(409).json({ error: 'Request is not pending' });
        return;
      }
      if (rpcErr.message?.includes('unsupported_proposal_type')) {
        res.status(422).json({ error: 'Proposal type not yet supported for auto-approval' });
        return;
      }
      throw rpcErr;
    }

    const { data: updated } = await supabaseAdmin
      .from('node_restructure_requests')
      .select('*')
      .eq('id', id)
      .single();

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /requests/:id/deny
requestsRouter.post('/:id/deny', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const { denial_reason } = denyRequestSchema.parse(req.body);

    const { data: existing, error: loadErr } = await supabaseAdmin
      .from('node_restructure_requests')
      .select('status, proposal')
      .eq('id', id)
      .single();

    if (loadErr || !existing) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (existing.status !== 'pending') {
      res.status(409).json({ error: 'Request is not pending' });
      return;
    }

    const { error: auditErr } = await supabaseAdmin
      .from('admin_audit_log')
      .insert({
        actor_user_id: req.user.id,
        action: 'deny_restructure_request',
        entity_type: 'node_restructure_request',
        entity_id: id,
        before_data: { status: 'pending' },
        after_data: { status: 'denied', denial_reason },
      });
    if (auditErr) throw auditErr;

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('node_restructure_requests')
      .update({
        status: 'denied',
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        denial_reason,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter admin-api typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-api/src/routes/requests.ts
git commit -m "feat(admin-api): add restructure requests routes"
```

---

### Task 12: Routes — messages and audit

**Files:**
- Create: `apps/admin-api/src/routes/messages.ts`
- Create: `apps/admin-api/src/routes/audit.ts`

- [ ] **Step 1: Create `apps/admin-api/src/routes/messages.ts`**

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { paginationSchema, messageStatusSchema, uuidSchema } from '../validation/common';

export const messagesRouter = Router();

// GET /messages?status=open&page=1
messagesRouter.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const status = messageStatusSchema.parse(req.query.status);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('support_messages')
      .select('*, sender:profiles(username)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page, limit });
  } catch (err) {
    next(err);
  }
});

async function setMessageStatus(
  req: Request,
  res: Response,
  next: NextFunction,
  newStatus: 'open' | 'closed',
  action: string
) {
  try {
    const id = uuidSchema.parse(req.params.id);

    const { data: existing } = await supabaseAdmin
      .from('support_messages')
      .select('status')
      .eq('id', id)
      .single();

    if (!existing) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    await supabaseAdmin.from('admin_audit_log').insert({
      actor_user_id: req.user.id,
      action,
      entity_type: 'support_message',
      entity_id: id,
      before_data: { status: existing.status },
      after_data: { status: newStatus },
    });

    const { data: updated, error } = await supabaseAdmin
      .from('support_messages')
      .update({
        status: newStatus,
        handled_by: req.user.id,
        handled_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

// POST /messages/:id/close
messagesRouter.post('/:id/close', requireAuth, requireAdmin, (req, res, next) =>
  setMessageStatus(req, res, next, 'closed', 'close_support_message')
);

// POST /messages/:id/open
messagesRouter.post('/:id/open', requireAuth, requireAdmin, (req, res, next) =>
  setMessageStatus(req, res, next, 'open', 'reopen_support_message')
);
```

- [ ] **Step 2: Create `apps/admin-api/src/routes/audit.ts`**

```typescript
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { paginationSchema } from '../validation/common';
import { z } from 'zod';

export const auditRouter = Router();

const entityTypeSchema = z.string().min(1).optional();

// GET /audit?entity_type=node_restructure_request&page=1
auditRouter.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const entityType = entityTypeSchema.parse(req.query.entity_type);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('admin_audit_log')
      .select('*, actor:profiles(username)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (entityType) query = query.eq('entity_type', entityType);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page, limit });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter admin-api typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/admin-api/src/routes/messages.ts apps/admin-api/src/routes/audit.ts
git commit -m "feat(admin-api): add messages and audit routes"
```

---

### Task 13: Assemble Express app and Vercel entry

**Files:**
- Create: `apps/admin-api/src/app.ts`
- Create: `apps/admin-api/src/server.ts`
- Create: `apps/admin-api/api/index.ts`

- [ ] **Step 1: Create `apps/admin-api/src/app.ts`**

```typescript
import express from 'express';
import cors from 'cors';
import { env } from './lib/env';
import { errorHandler } from './middleware/errorHandler';
import { requestsRouter } from './routes/requests';
import { messagesRouter } from './routes/messages';
import { auditRouter } from './routes/audit';

const app = express();

app.use(
  cors({
    origin: env.ADMIN_CORS_ORIGINS,
    credentials: true,
  })
);
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));
app.use('/requests', requestsRouter);
app.use('/messages', messagesRouter);
app.use('/audit', auditRouter);

app.use(errorHandler);

export default app;
```

- [ ] **Step 2: Create `apps/admin-api/src/server.ts` (local dev only)**

```typescript
import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT ?? 3001;
app.listen(Number(PORT), () => {
  console.log(`admin-api running at http://localhost:${PORT}`);
});
```

Add `dotenv` to dependencies so `server.ts` loads `.env.local`:

```bash
pnpm --filter admin-api add dotenv
```

- [ ] **Step 3: Create `apps/admin-api/api/index.ts` (Vercel entry)**

```typescript
// Vercel Node.js Function entry point
// Vercel auto-detects this file and deploys it as a serverless function
// The Express app is the request handler — no listen() call needed
import app from '../src/app';

export default app;
```

Note: Vercel sets environment variables at runtime — no `dotenv` needed in this file.

- [ ] **Step 4: Smoke-test the dev server**

```bash
pnpm dev:api
```

In another terminal:
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{"status":"ok","ts":1234567890}
```

- [ ] **Step 5: Run all tests**

```bash
pnpm --filter admin-api test
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin-api/src/app.ts apps/admin-api/src/server.ts apps/admin-api/api/index.ts
git commit -m "feat(admin-api): assemble Express app and Vercel entry"
```

---

## Phase 4: Admin UI

### Task 14: Initialize `apps/admin` package

**Files:**
- Create: `apps/admin/package.json`
- Create: `apps/admin/tsconfig.json`
- Create: `apps/admin/vite.config.ts`
- Create: `apps/admin/index.html`
- Create: `apps/admin/src/index.css`
- Create: `apps/admin/.env.example`
- Create: `apps/admin/vercel.json`

- [ ] **Step 1: Create `apps/admin/package.json`**

```json
{
  "name": "admin",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5174",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@tailwindcss/vite": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.3.3",
    "vite": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create `apps/admin/tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

Create `apps/admin/tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"]
}
```

Create `apps/admin/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: Create `apps/admin/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 4: Create `apps/admin/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SkillCatch Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `apps/admin/src/index.css`**

```css
@import "tailwindcss";

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #0a0a0a;
  color: white;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 6: Create `apps/admin/vercel.json`**

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 7: Create `apps/admin/.env.example`**

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ADMIN_API_URL=http://localhost:3001
```

- [ ] **Step 8: Install admin dependencies**

```bash
pnpm --filter admin install
```

Expected: Dependencies installed, no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/admin/
git commit -m "feat: scaffold admin UI package"
```

---

### Task 15: Types, Supabase client, and API wrapper

**Files:**
- Create: `apps/admin/src/types/api.ts`
- Create: `apps/admin/src/lib/supabaseClient.ts`
- Create: `apps/admin/src/lib/api.ts`

- [ ] **Step 1: Create `apps/admin/src/types/api.ts`**

```typescript
export type RequestStatus = 'pending' | 'approved' | 'denied';
export type MessageStatus = 'open' | 'closed';

export interface SkillNode {
  id: string;
  name: string;
  slug: string;
  path: string | null;
}

export interface Profile {
  username: string | null;
}

export interface RestructureRequest {
  id: string;
  requester_user_id: string | null;
  target_node_id: string | null;
  proposal: Record<string, unknown>;
  proposal_version: number;
  message: string | null;
  status: RequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  denial_reason: string | null;
  created_at: string;
  target_node?: SkillNode | null;
  requester?: Profile | null;
}

export interface SupportMessage {
  id: string;
  sender_user_id: string | null;
  email: string | null;
  subject: string;
  body: string;
  status: MessageStatus;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
  sender?: Profile | null;
}

export interface AuditLogEntry {
  id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
  actor?: Profile | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number | null;
  page: number;
  limit: number;
}
```

- [ ] **Step 2: Create `apps/admin/src/lib/supabaseClient.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
```

- [ ] **Step 3: Create `apps/admin/src/lib/api.ts`**

```typescript
import { supabase } from './supabaseClient';
import type {
  RestructureRequest,
  SupportMessage,
  AuditLogEntry,
  PaginatedResponse,
} from '../types/api';

const BASE_URL = import.meta.env.VITE_ADMIN_API_URL as string;

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new ApiError('Not authenticated', 401);

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(body.error ?? 'Request failed', res.status);
  }

  return res.json() as Promise<T>;
}

export const api = {
  getRequests: (params?: { status?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    return apiFetch<PaginatedResponse<RestructureRequest>>(`/requests?${q}`);
  },

  approveRequest: (id: string) =>
    apiFetch<RestructureRequest>(`/requests/${id}/approve`, { method: 'POST' }),

  denyRequest: (id: string, denial_reason: string) =>
    apiFetch<RestructureRequest>(`/requests/${id}/deny`, {
      method: 'POST',
      body: JSON.stringify({ denial_reason }),
    }),

  getMessages: (params?: { status?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.page) q.set('page', String(params.page));
    return apiFetch<PaginatedResponse<SupportMessage>>(`/messages?${q}`);
  },

  closeMessage: (id: string) =>
    apiFetch<SupportMessage>(`/messages/${id}/close`, { method: 'POST' }),

  openMessage: (id: string) =>
    apiFetch<SupportMessage>(`/messages/${id}/open`, { method: 'POST' }),

  getAuditLog: (params?: { entity_type?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.entity_type) q.set('entity_type', params.entity_type);
    if (params?.page) q.set('page', String(params.page));
    return apiFetch<PaginatedResponse<AuditLogEntry>>(`/audit?${q}`);
  },
};

export { ApiError };
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/types/api.ts apps/admin/src/lib/supabaseClient.ts apps/admin/src/lib/api.ts
git commit -m "feat(admin): add API types, Supabase client, and API wrapper"
```

---

### Task 16: AuthContext, ProtectedRoute, and shared UI atoms

**Files:**
- Create: `apps/admin/src/contexts/AuthContext.tsx`
- Create: `apps/admin/src/components/ProtectedRoute.tsx`
- Create: `apps/admin/src/components/StatusBadge.tsx`
- Create: `apps/admin/src/components/ProposalDiff.tsx`

- [ ] **Step 1: Create `apps/admin/src/contexts/AuthContext.tsx`**

```typescript
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signOut = () => supabase.auth.signOut().then(() => undefined);

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Create `apps/admin/src/components/ProtectedRoute.tsx`**

```typescript
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <span className="text-neutral-500 text-sm">Loading…</span>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 3: Create `apps/admin/src/components/StatusBadge.tsx`**

```typescript
import type { RequestStatus, MessageStatus } from '../types/api';

const STYLES: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  approved: 'bg-green-500/20 text-green-400 border border-green-500/30',
  denied: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
  open: 'bg-neutral-700 text-neutral-300 border border-neutral-600',
  closed: 'bg-neutral-800 text-neutral-500 border border-neutral-700',
};

export function StatusBadge({
  status,
}: {
  status: RequestStatus | MessageStatus;
}) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
        STYLES[status] ?? ''
      }`}
    >
      {status}
    </span>
  );
}
```

- [ ] **Step 4: Create `apps/admin/src/components/ProposalDiff.tsx`**

```typescript
interface Props {
  proposal: Record<string, unknown>;
  message?: string | null;
}

export function ProposalDiff({ proposal, message }: Props) {
  const type = proposal.type as string | undefined;
  const changes = proposal.changes as Record<string, unknown> | undefined;
  const version = proposal.version as number | undefined;

  return (
    <div className="text-sm space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-neutral-500 text-xs">Type</span>
        <span className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded text-xs font-mono">
          {type ?? 'unknown'}
        </span>
        {version != null && (
          <span className="text-neutral-600 text-xs">v{version}</span>
        )}
      </div>
      {changes != null && (
        <pre className="bg-[#0d0d0d] border border-neutral-800 rounded p-3 text-xs text-neutral-300 overflow-auto max-h-40 whitespace-pre-wrap">
          {JSON.stringify(changes, null, 2)}
        </pre>
      )}
      {message && (
        <p className="text-neutral-400 italic text-xs">"{message}"</p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/contexts/ apps/admin/src/components/ProtectedRoute.tsx apps/admin/src/components/StatusBadge.tsx apps/admin/src/components/ProposalDiff.tsx
git commit -m "feat(admin): add AuthContext, ProtectedRoute, StatusBadge, ProposalDiff"
```

---

### Task 17: Layout components

**Files:**
- Create: `apps/admin/src/components/layout/AdminShell.tsx`
- Create: `apps/admin/src/components/layout/Sidebar.tsx`
- Create: `apps/admin/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Create `apps/admin/src/components/layout/Sidebar.tsx`**

```typescript
import { NavLink } from 'react-router-dom';

const NAV = [
  { label: 'Requests', href: '/requests' },
  { label: 'Messages', href: '/messages' },
  { label: 'Audit Log', href: '/audit' },
];

export function Sidebar() {
  return (
    <aside className="w-52 shrink-0 bg-black border-r border-neutral-900 flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-neutral-900">
        <span className="text-white text-sm font-semibold tracking-tight">
          SkillCatch Admin
        </span>
      </div>
      <nav className="flex-1 py-4">
        {NAV.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) =>
              `block px-5 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'text-white border-l-2 border-indigo-500 bg-indigo-500/5'
                  : 'text-neutral-500 hover:text-white border-l-2 border-transparent'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Create `apps/admin/src/components/layout/TopBar.tsx`**

```typescript
import { useAuth } from '../../contexts/AuthContext';

export function TopBar() {
  const { session, signOut } = useAuth();

  return (
    <header className="h-12 border-b border-neutral-900 flex items-center justify-end px-6 gap-4">
      <span className="text-neutral-500 text-xs">
        {session?.user.email ?? ''}
      </span>
      <button
        onClick={signOut}
        className="text-neutral-500 hover:text-white text-xs transition-colors"
      >
        Sign out
      </button>
    </header>
  );
}
```

- [ ] **Step 3: Create `apps/admin/src/components/layout/AdminShell.tsx`**

```typescript
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AdminShell() {
  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/layout/
git commit -m "feat(admin): add AdminShell, Sidebar, TopBar layout components"
```

---

### Task 18: RequestCard and RequestsPage

**Files:**
- Create: `apps/admin/src/components/RequestCard.tsx`
- Create: `apps/admin/src/pages/RequestsPage.tsx`

- [ ] **Step 1: Create `apps/admin/src/components/RequestCard.tsx`**

```typescript
import { useState } from 'react';
import type { RestructureRequest } from '../types/api';
import { StatusBadge } from './StatusBadge';
import { ProposalDiff } from './ProposalDiff';
import { api, ApiError } from '../lib/api';

interface Props {
  request: RestructureRequest;
  onUpdate: (updated: RestructureRequest) => void;
}

export function RequestCard({ request, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [denyMode, setDenyMode] = useState(false);
  const [denialReason, setDenialReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      const updated = await api.approveRequest(request.id);
      onUpdate(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async () => {
    if (!denialReason.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await api.denyRequest(request.id, denialReason);
      onUpdate(updated);
      setDenyMode(false);
      setDenialReason('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-neutral-800 bg-[#111] rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={request.status} />
            <span className="text-white font-medium text-sm truncate">
              {request.target_node?.name ?? 'Unknown node'}
            </span>
            {request.target_node?.path && (
              <span className="text-neutral-600 text-xs font-mono">
                {String(request.target_node.path)}
              </span>
            )}
          </div>
          <p className="text-neutral-500 text-xs">
            by {request.requester?.username ?? 'anonymous'} ·{' '}
            {new Date(request.created_at).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-neutral-500 hover:text-white text-xs shrink-0 transition-colors"
        >
          {expanded ? 'collapse' : 'expand'}
        </button>
      </div>

      {expanded && (
        <ProposalDiff proposal={request.proposal} message={request.message} />
      )}

      {error && <p className="text-rose-400 text-xs">{error}</p>}

      {request.status === 'pending' && !denyMode && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs rounded transition-colors"
          >
            {loading ? 'Approving…' : 'Approve'}
          </button>
          <button
            onClick={() => setDenyMode(true)}
            disabled={loading}
            className="px-3 py-1.5 border border-rose-500/40 hover:border-rose-500 text-rose-400 hover:text-rose-300 text-xs rounded transition-colors"
          >
            Deny
          </button>
        </div>
      )}

      {denyMode && (
        <div className="space-y-2">
          <textarea
            value={denialReason}
            onChange={(e) => setDenialReason(e.target.value)}
            placeholder="Reason for denial (required)"
            className="w-full bg-[#0d0d0d] border border-neutral-700 text-white text-xs rounded p-2 resize-none h-20 placeholder-neutral-600 focus:outline-none focus:border-neutral-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleDeny}
              disabled={loading || !denialReason.trim()}
              className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-xs rounded transition-colors"
            >
              {loading ? 'Denying…' : 'Confirm Deny'}
            </button>
            <button
              onClick={() => {
                setDenyMode(false);
                setDenialReason('');
              }}
              className="px-3 py-1.5 text-neutral-500 hover:text-white text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {request.status === 'denied' && request.denial_reason && (
        <p className="text-neutral-600 text-xs italic border-t border-neutral-800 pt-2">
          Denied: {request.denial_reason}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/admin/src/pages/RequestsPage.tsx`**

```typescript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RestructureRequest, RequestStatus } from '../types/api';
import { RequestCard } from '../components/RequestCard';
import { api, ApiError } from '../lib/api';

const TABS: { label: string; value: RequestStatus | '' }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'All', value: '' },
  { label: 'Approved', value: 'approved' },
  { label: 'Denied', value: 'denied' },
];

export function RequestsPage() {
  const [tab, setTab] = useState<RequestStatus | ''>('pending');
  const [requests, setRequests] = useState<RestructureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = (currentTab: RequestStatus | '') => {
    setLoading(true);
    setError(null);
    api
      .getRequests(currentTab ? { status: currentTab } : undefined)
      .then((res) => setRequests(res.data))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) navigate('/access-denied');
        else setError(e instanceof ApiError ? e.message : 'Failed to load requests');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(tab);
  }, [tab]);

  const handleUpdate = (updated: RestructureRequest) => {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-white text-xl font-semibold">Restructure Requests</h1>

      <div className="flex gap-1 bg-[#111] border border-neutral-800 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              tab === t.value
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-500 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-neutral-500 text-sm">Loading…</p>}

      {error && (
        <div className="space-y-2">
          <p className="text-rose-400 text-sm">{error}</p>
          <button
            onClick={() => load(tab)}
            className="text-indigo-400 hover:text-indigo-300 text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && requests.length === 0 && (
        <p className="text-neutral-500 text-sm">
          No {tab ? tab : ''} requests.
        </p>
      )}

      {!loading && !error && requests.length > 0 && (
        <div className="space-y-3">
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/RequestCard.tsx apps/admin/src/pages/RequestsPage.tsx
git commit -m "feat(admin): add RequestCard and RequestsPage"
```

---

### Task 19: MessageItem, MessagesPage, AuditRow, AuditPage

**Files:**
- Create: `apps/admin/src/components/MessageItem.tsx`
- Create: `apps/admin/src/pages/MessagesPage.tsx`
- Create: `apps/admin/src/components/AuditRow.tsx`
- Create: `apps/admin/src/pages/AuditPage.tsx`

- [ ] **Step 1: Create `apps/admin/src/components/MessageItem.tsx`**

```typescript
import { useState } from 'react';
import type { SupportMessage } from '../types/api';
import { StatusBadge } from './StatusBadge';
import { api, ApiError } from '../lib/api';

interface Props {
  message: SupportMessage;
  onUpdate: (updated: SupportMessage) => void;
}

export function MessageItem({ message, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setLoading(true);
    setError(null);
    try {
      const updated =
        message.status === 'open'
          ? await api.closeMessage(message.id)
          : await api.openMessage(message.id);
      onUpdate(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-neutral-800 bg-[#111] rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={message.status} />
            <span className="text-white text-sm font-medium truncate">
              {message.subject}
            </span>
          </div>
          <p className="text-neutral-500 text-xs">
            {message.sender?.username ?? message.email ?? 'anonymous'} ·{' '}
            {new Date(message.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-neutral-500 hover:text-white text-xs transition-colors"
          >
            {expanded ? 'collapse' : 'read'}
          </button>
          <button
            onClick={toggle}
            disabled={loading}
            className={`text-xs px-2.5 py-1 rounded border transition-colors disabled:opacity-50 ${
              message.status === 'open'
                ? 'border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500'
                : 'border-neutral-800 text-neutral-600 hover:text-neutral-400'
            }`}
          >
            {loading ? '…' : message.status === 'open' ? 'Close' : 'Reopen'}
          </button>
        </div>
      </div>

      {expanded && (
        <p className="text-neutral-300 text-sm whitespace-pre-wrap border-t border-neutral-800 pt-2">
          {message.body}
        </p>
      )}

      {error && <p className="text-rose-400 text-xs">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/admin/src/pages/MessagesPage.tsx`**

```typescript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SupportMessage, MessageStatus } from '../types/api';
import { MessageItem } from '../components/MessageItem';
import { api, ApiError } from '../lib/api';

const TABS: { label: string; value: MessageStatus | '' }[] = [
  { label: 'Open', value: 'open' },
  { label: 'All', value: '' },
  { label: 'Closed', value: 'closed' },
];

export function MessagesPage() {
  const [tab, setTab] = useState<MessageStatus | ''>('open');
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = (currentTab: MessageStatus | '') => {
    setLoading(true);
    setError(null);
    api
      .getMessages(currentTab ? { status: currentTab } : undefined)
      .then((res) => setMessages(res.data))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) navigate('/access-denied');
        else setError(e instanceof ApiError ? e.message : 'Failed to load messages');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(tab);
  }, [tab]);

  const handleUpdate = (updated: SupportMessage) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === updated.id ? updated : m))
    );
  };

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-white text-xl font-semibold">Support Messages</h1>

      <div className="flex gap-1 bg-[#111] border border-neutral-800 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              tab === t.value
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-500 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-neutral-500 text-sm">Loading…</p>}

      {error && (
        <div className="space-y-2">
          <p className="text-rose-400 text-sm">{error}</p>
          <button
            onClick={() => load(tab)}
            className="text-indigo-400 hover:text-indigo-300 text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && messages.length === 0 && (
        <p className="text-neutral-500 text-sm">No {tab || ''} messages.</p>
      )}

      {!loading && !error && messages.length > 0 && (
        <div className="space-y-3">
          {messages.map((m) => (
            <MessageItem key={m.id} message={m} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/admin/src/components/AuditRow.tsx`**

```typescript
import type { AuditLogEntry } from '../types/api';

const ACTION_LABELS: Record<string, string> = {
  approve_restructure_request: 'Approved request',
  deny_restructure_request: 'Denied request',
  close_support_message: 'Closed message',
  reopen_support_message: 'Reopened message',
};

export function AuditRow({ entry }: { entry: AuditLogEntry }) {
  return (
    <div className="border-b border-neutral-900 py-3 flex items-start gap-4">
      <div className="shrink-0 text-xs text-neutral-600 w-36">
        {new Date(entry.created_at).toLocaleString()}
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white text-xs font-medium">
            {ACTION_LABELS[entry.action] ?? entry.action}
          </span>
          <span className="text-neutral-600 text-xs font-mono">
            {entry.entity_type}
          </span>
        </div>
        <p className="text-neutral-500 text-xs">
          by {entry.actor?.username ?? entry.actor_user_id}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/admin/src/pages/AuditPage.tsx`**

```typescript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuditLogEntry } from '../types/api';
import { AuditRow } from '../components/AuditRow';
import { api, ApiError } from '../lib/api';

export function AuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .getAuditLog()
      .then((res) => setEntries(res.data))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) navigate('/access-denied');
        else setError(e instanceof ApiError ? e.message : 'Failed to load audit log');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-white text-xl font-semibold">Audit Log</h1>

      {loading && <p className="text-neutral-500 text-sm">Loading…</p>}

      {error && (
        <div className="space-y-2">
          <p className="text-rose-400 text-sm">{error}</p>
          <button
            onClick={load}
            className="text-indigo-400 hover:text-indigo-300 text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className="text-neutral-500 text-sm">No audit log entries yet.</p>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="bg-[#111] border border-neutral-800 rounded-lg px-4">
          {entries.map((e) => (
            <AuditRow key={e.id} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/MessageItem.tsx apps/admin/src/pages/MessagesPage.tsx apps/admin/src/components/AuditRow.tsx apps/admin/src/pages/AuditPage.tsx
git commit -m "feat(admin): add MessageItem, MessagesPage, AuditRow, AuditPage"
```

---

### Task 20: LoginPage, AccessDeniedPage, App.tsx, main.tsx

**Files:**
- Create: `apps/admin/src/pages/LoginPage.tsx`
- Create: `apps/admin/src/pages/AccessDeniedPage.tsx`
- Create: `apps/admin/src/App.tsx`
- Create: `apps/admin/src/main.tsx`

- [ ] **Step 1: Create `apps/admin/src/pages/LoginPage.tsx`**

```typescript
import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    navigate('/requests');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-white text-xl font-semibold">Admin Sign In</h1>
          <p className="text-neutral-500 text-sm">SkillCatch internal dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full bg-[#111] border border-neutral-800 text-white text-sm rounded-lg px-4 py-2.5 placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full bg-[#111] border border-neutral-800 text-white text-sm rounded-lg px-4 py-2.5 placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
          />
          {error && <p className="text-rose-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/admin/src/pages/AccessDeniedPage.tsx`**

```typescript
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function AccessDeniedPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto">
          <svg
            className="w-6 h-6 text-rose-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
        </div>
        <h1 className="text-white text-lg font-semibold">Access Denied</h1>
        <p className="text-neutral-500 text-sm">
          Your account does not have admin access to this dashboard.
        </p>
        <button
          onClick={handleSignOut}
          className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
        >
          Sign out and try another account
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/admin/src/App.tsx`**

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminShell } from './components/layout/AdminShell';
import { LoginPage } from './pages/LoginPage';
import { AccessDeniedPage } from './pages/AccessDeniedPage';
import { RequestsPage } from './pages/RequestsPage';
import { MessagesPage } from './pages/MessagesPage';
import { AuditPage } from './pages/AuditPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/access-denied" element={<AccessDeniedPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AdminShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/requests" replace />} />
            <Route path="requests" element={<RequestsPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="audit" element={<AuditPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/requests" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

- [ ] **Step 4: Create `apps/admin/src/main.tsx`**

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 5: Create `apps/admin/.env.local` for local dev (not committed)**

```
VITE_SUPABASE_URL=https://uylqvlvkelceehopuhgt.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon key>
VITE_ADMIN_API_URL=http://localhost:3001
```

- [ ] **Step 6: Verify admin app builds and runs**

```bash
pnpm dev:admin
```

Expected: Vite starts on `http://localhost:5174`, login page visible, no console errors.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/
git commit -m "feat(admin): complete admin UI — login, pages, app router"
```

---

## Phase 5: Web App Refactor (SkillFeedbackPage)

### Task 21: Types and serializer

**Files:**
- Create: `apps/web/src/types/restructure.ts`
- Create: `apps/web/src/lib/serializeProposal.ts`

- [ ] **Step 1: Create `apps/web/src/types/restructure.ts`**

```typescript
export type FeedbackType = 'restructure' | 'new-node' | 'report' | 'missing';

export type ProposalChangeType =
  | 'rename'
  | 'reparent'
  | 'add_child'
  | 'move'
  | 'merge'
  | 'split';

export interface RestructureProposal {
  version: 1;
  type: ProposalChangeType;
  changes: {
    new_parent_ids?: string[];
    new_name?: string;
    child_node?: {
      name: string;
      slug: string;
      is_leaf: boolean;
    };
    merge_node_ids?: string[];
    notes?: string;
  };
}
```

- [ ] **Step 2: Create `apps/web/src/lib/serializeProposal.ts`**

```typescript
import type { RestructureProposal, ProposalChangeType } from '../types/restructure';

export function serializeProposal(
  type: ProposalChangeType,
  changes: RestructureProposal['changes']
): RestructureProposal {
  return { version: 1, type, changes };
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/types/restructure.ts apps/web/src/lib/serializeProposal.ts
git commit -m "feat(web): add restructure types and proposal serializer"
```

---

### Task 22: `useSubmitRestructureRequest` hook

**Files:**
- Create: `apps/web/src/hooks/useSubmitRestructureRequest.ts`

- [ ] **Step 1: Create `apps/web/src/hooks/useSubmitRestructureRequest.ts`**

```typescript
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { RestructureProposal } from '@/types/restructure';

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | {
      status: 'success';
      requestId: string;
      proposal: RestructureProposal;
      targetNodeName?: string;
    }
  | { status: 'error'; message: string };

interface SubmitOptions {
  proposal: RestructureProposal;
  targetNodeId?: string;
  targetNodeName?: string;
  message?: string;
}

export function useSubmitRestructureRequest() {
  const [state, setState] = useState<SubmitState>({ status: 'idle' });

  const submit = async (opts: SubmitOptions) => {
    setState({ status: 'submitting' });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setState({
        status: 'error',
        message: 'You must be signed in to submit a request.',
      });
      return;
    }

    const { data, error } = await supabase
      .from('node_restructure_requests')
      .insert({
        requester_user_id: session.user.id,
        target_node_id: opts.targetNodeId ?? null,
        proposal: opts.proposal,
        proposal_version: opts.proposal.version,
        message: opts.message ?? null,
      })
      .select('id')
      .single();

    if (error || !data) {
      setState({
        status: 'error',
        message: error?.message ?? 'Failed to submit request. Please try again.',
      });
      return;
    }

    setState({
      status: 'success',
      requestId: data.id,
      proposal: opts.proposal,
      targetNodeName: opts.targetNodeName,
    });
  };

  const reset = () => setState({ status: 'idle' });

  return { state, submit, reset };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/useSubmitRestructureRequest.ts
git commit -m "feat(web): add useSubmitRestructureRequest hook"
```

---

### Task 23: `RestructureSuccess` component

**Files:**
- Create: `apps/web/src/components/skill-feedback/RestructureSuccess.tsx`

- [ ] **Step 1: Create `apps/web/src/components/skill-feedback/RestructureSuccess.tsx`**

```typescript
import { Link } from 'react-router-dom';
import type { RestructureProposal } from '@/types/restructure';

interface Props {
  requestId: string;
  proposal: RestructureProposal;
  targetNodeName?: string;
  onReset: () => void;
}

export function RestructureSuccess({
  proposal,
  targetNodeName,
  onReset,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16 text-center px-6">
      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
        <svg
          className="w-6 h-6 text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <div className="space-y-2 max-w-sm">
        <h2 className="text-white text-lg font-semibold">Proposal submitted</h2>
        <p className="text-neutral-400 text-sm">
          Your restructure request is pending review. An admin will review it shortly.
        </p>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-5 py-4 text-left text-sm space-y-2 min-w-52">
        <div className="flex justify-between gap-8">
          <span className="text-neutral-500">Type</span>
          <span className="text-white font-mono text-xs">{proposal.type}</span>
        </div>
        {targetNodeName && (
          <div className="flex justify-between gap-8">
            <span className="text-neutral-500">Node</span>
            <span className="text-white text-xs">{targetNodeName}</span>
          </div>
        )}
        <div className="flex justify-between gap-8">
          <span className="text-neutral-500">Status</span>
          <span className="text-amber-400 text-xs">Pending review</span>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          to="/dashboard/skills"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
        >
          Back to Skills
        </Link>
        <button
          onClick={onReset}
          className="px-4 py-2 text-neutral-400 hover:text-white text-sm transition-colors"
        >
          Submit another
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/skill-feedback/RestructureSuccess.tsx
git commit -m "feat(web): add RestructureSuccess component"
```

---

### Task 24: Refactor SkillFeedbackPage

**Files:**
- Create: `apps/web/src/components/skill-feedback/RestructureForm.tsx` (extracted)
- Modify: `apps/web/src/pages/SkillFeedbackPage.tsx` (slim shell, no direct tree mutations)

- [ ] **Step 1: Read the current SkillFeedbackPage**

Open and read `apps/web/src/pages/SkillFeedbackPage.tsx` fully. Identify:
- Where the restructure proposal is built (the tree builder UI)
- Where direct DB writes to `skill_nodes` / `skill_node_parents` / `skill_attribute_defs` happen — **these must be removed**
- What non-restructure feedback modes exist and whether they can stay

- [ ] **Step 2: Extract the restructure UI into `RestructureForm.tsx`**

Create `apps/web/src/components/skill-feedback/RestructureForm.tsx` with this interface:

```typescript
import type { RestructureProposal } from '@/types/restructure';
import { serializeProposal } from '@/lib/serializeProposal';

interface Props {
  submitting: boolean;
  onSubmit: (opts: {
    proposal: RestructureProposal;
    targetNodeId?: string;
    targetNodeName?: string;
    message?: string;
  }) => void;
}

export function RestructureForm({ submitting, onSubmit }: Props) {
  // Move all the restructure-specific UI and state from SkillFeedbackPage here.
  // The submit handler must call:
  //   onSubmit({ proposal: serializeProposal(type, changes), targetNodeId, targetNodeName, message })
  // It must NOT call supabase.from('skill_nodes')... or any other direct tree mutation.
  //
  // Preserve existing UX: node selection, proposal building, message field.
  // Replace the old submit logic entirely with the onSubmit callback.
  return null; // replace with extracted JSX
}
```

Move the actual JSX and state from `SkillFeedbackPage.tsx` into this component, replacing the old submit action.

- [ ] **Step 3: Rewrite `SkillFeedbackPage.tsx` as a slim shell**

Replace the contents of `apps/web/src/pages/SkillFeedbackPage.tsx` with:

```typescript
import { useSubmitRestructureRequest } from '@/hooks/useSubmitRestructureRequest';
import { RestructureForm } from '@/components/skill-feedback/RestructureForm';
import { RestructureSuccess } from '@/components/skill-feedback/RestructureSuccess';

export default function SkillFeedbackPage() {
  const { state, submit, reset } = useSubmitRestructureRequest();

  if (state.status === 'success') {
    return (
      <RestructureSuccess
        requestId={state.requestId}
        proposal={state.proposal}
        targetNodeName={state.targetNodeName}
        onReset={reset}
      />
    );
  }

  return (
    <div>
      <RestructureForm
        submitting={state.status === 'submitting'}
        onSubmit={submit}
      />
      {state.status === 'error' && (
        <p className="text-red-500 text-sm mt-2 px-4">{state.message}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify no direct tree mutations remain in the web app**

Search for any remaining direct writes:

```bash
grep -r "from('skill_nodes')\|from('skill_node_parents')\|from('skill_attribute_defs')" apps/web/src/pages/SkillFeedbackPage.tsx apps/web/src/components/skill-feedback/
```

Expected: No matches. Any `.insert()`/`.update()`/`.delete()` on tree tables from these files is a bug — remove them.

- [ ] **Step 5: Verify web app still runs**

```bash
pnpm dev:web
```

Navigate to `/dashboard/skill-feedback`. The restructure UI should load and the submit action should insert into `node_restructure_requests`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/skill-feedback/ apps/web/src/pages/SkillFeedbackPage.tsx
git commit -m "feat(web): refactor SkillFeedbackPage — proposals go to moderation queue"
```

---

## Phase 6: Vercel Config and Final Wiring

### Task 25: Vercel configs and `.env.example` files

**Files:**
- Verify: `apps/web/vercel.json` (moved in Task 1)
- Verify: `apps/admin/vercel.json` (created in Task 14)
- Note: `apps/admin-api` — no `vercel.json` needed (Vercel auto-detects `api/index.ts`)
- Create: `apps/web/.env.example`

- [ ] **Step 1: Verify `apps/web/vercel.json` content**

Open `apps/web/vercel.json`. It should contain exactly:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

If it still has the old content from before the move, update it to match the above.

- [ ] **Step 2: Verify `apps/admin/vercel.json` content**

Open `apps/admin/vercel.json`. Should contain:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 3: Create `apps/web/.env.example`**

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 4: Supabase redirect URL checklist**

In Supabase dashboard → Authentication → URL Configuration → Redirect URLs, confirm these are added:

```
https://skillcatch.space/auth/callback
https://admin.skillcatch.space/auth/callback
http://localhost:5173/auth/callback
http://localhost:5174/auth/callback
```

After creating Vercel projects: add the actual preview URL wildcard patterns shown in Vercel dashboard (format: `https://<project-slug>-*.vercel.app/auth/callback`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/.env.example
git commit -m "chore: add env examples and verify Vercel configs"
```

---

### Task 26: Final build verification

- [ ] **Step 1: Run full build**

```bash
pnpm build
```

Expected: All three apps build without errors. Check for TypeScript errors specifically.

- [ ] **Step 2: Run admin-api tests one final time**

```bash
pnpm --filter admin-api test
```

Expected: All tests PASS.

- [ ] **Step 3: Smoke-test the full local stack**

In three separate terminals:

Terminal 1:
```bash
pnpm dev:api
```

Terminal 2:
```bash
pnpm dev:admin
```

Terminal 3:
```bash
pnpm dev:web
```

Verify:
- `http://localhost:3001/health` returns `{"status":"ok"}`
- `http://localhost:5174` shows the admin login page
- `http://localhost:5173` shows the main app

- [ ] **Step 4: End-to-end smoke test (manual)**

1. Sign in to the main app at `localhost:5173`
2. Navigate to `/dashboard/skill-feedback`
3. Build a restructure proposal and submit
4. Confirm the row appears in Supabase `node_restructure_requests` with `status = 'pending'`
5. Sign in to admin UI at `localhost:5174` with an account that is in `admin_users`
6. Confirm the request appears in the Requests page
7. Deny it with a reason — confirm `status = 'denied'` in Supabase
8. Confirm audit log row appears

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final build verification and smoke test cleanup"
```

---

## Vercel Deployment Checklist (post-implementation reference)

1. **Create three Vercel projects** from the same GitHub repo:
   - `skillcatch-web` → root dir: `apps/web`
   - `skillcatch-admin` → root dir: `apps/admin`
   - `skillcatch-admin-api` → root dir: `apps/admin-api`

2. **Set environment variables per project** (Vercel dashboard → Settings → Environment Variables):

   `skillcatch-web`:
   ```
   VITE_SUPABASE_URL
   VITE_SUPABASE_ANON_KEY
   ```

   `skillcatch-admin`:
   ```
   VITE_SUPABASE_URL
   VITE_SUPABASE_ANON_KEY
   VITE_ADMIN_API_URL=https://admin-api.skillcatch.space
   ```

   `skillcatch-admin-api`:
   ```
   SUPABASE_URL
   SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY   ← set only here, never in web or admin
   ADMIN_CORS_ORIGINS=https://admin.skillcatch.space
   ```

3. **Assign custom domains** in Vercel:
   - `skillcatch-web` → `skillcatch.space`
   - `skillcatch-admin` → `admin.skillcatch.space`
   - `skillcatch-admin-api` → `admin-api.skillcatch.space`

4. **Add Vercel preview URL wildcards** to Supabase redirect URLs after projects are created.

5. **Insert first admin user** directly in Supabase SQL editor:
   ```sql
   INSERT INTO admin_users (user_id, role)
   VALUES ('<your-auth-uid>', 'developer');
   ```
