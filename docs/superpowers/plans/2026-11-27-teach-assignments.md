# Teach Phase 1: Assignments & Submissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teacher gives assignments to a skill class or to picked students, students submit (text, files, links), the teacher marks them Done or Returns them with a comment, and the loop repeats until Done.

**Architecture:** New Supabase tables (`teach_assignments`, `teach_assignment_students`, `teach_submissions`, `teach_submission_entries`) with RLS read access. Every state change goes through SECURITY DEFINER RPCs, which also write the notifications. There is a private `teach-files` bucket. On the frontend, one query lib and shared attachment and thread components serve two surfaces: a class page on Teach and the reworked `TeachersWidget` on Learn.

**Tech Stack:** React 19 + TS + Tailwind v4 + react-router 7, Supabase (Postgres, RLS, Storage), lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-27-teach-classroom-design.md` (section 5 = this plan)

## Global Constraints

- **Do not commit or create branches.** Leave everything uncommitted (user rule). The "commit" step in every task is replaced by "run checks".
- The project has no test framework. A task is verified by `npx tsc -b` (exit 0) and `npx eslint <changed files>` (clean) in `apps/web`. SQL is verified by reading it against the checklist in Task 1. The user applies the migration.
- UI copy is in English. The student UI never mentions a class or group, other students or counts of students. Use singular "your teacher".
- Grading is only `done` / `returned` plus a comment. Return requires a comment.
- Files: private bucket `teach-files`, 15 MB (15728640), MIME `image/jpeg,image/png,image/webp,image/gif,application/pdf,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg`. Video only as a link.
- Limits: title 1–120, instructions and body ≤ 5000, attachments ≤ 10 per item.
- "Late" means `due_at < coalesce(first_submitted_at, now())`, not `done`, and the student was active in the class before `due_at` (`teacher_students.responded_at`).
- Links are checked with `normalizeUrl` at render time (http/https only). YouTube embeds use `youtube-nocookie`.
- Migrations are idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `CREATE OR REPLACE`). SECURITY DEFINER functions use `SET search_path = ''`, `REVOKE … FROM PUBLIC, anon` and `GRANT … TO authenticated`.

## Review Focus

1. **A student who left (`ended`) or was removed from an assignment.** The teacher sees them greyed and read-only, they are not counted, and `review_submission` / `comment_submission` reject them with an error. Pinned in Task 1, RPC guard `_teach_student_in_assignment`.
2. **Submitting twice fast or resubmitting after Done.** `submit_assignment` locks the submission row (`FOR UPDATE`) and raises on `done`. Task 1.
3. **A teacher who lost the skill from the license.** Reading and reviewing still work, create and update raise `not licensed for this skill`, and the class card shows "Not on your license". Tasks 1 and 4.
4. **A notification link to an assignment the viewer can no longer see.** The modal shows "This assignment is no longer available" instead of a blank page or crash. Task 5.
5. **A `javascript:` URL in a link attachment.** It is dropped at save in the RPC (`^https?://`) and at render (`normalizeUrl`). Tasks 1 and 3.

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/20261127001_teach_assignments.sql`

**Interfaces – Produces (callable by the frontend):**
- Tables (readable via RLS): `teach_assignments`, `teach_assignment_students`, `teach_submissions`, `teach_submission_entries`. Columns exactly as in spec 5.2, including `first_submitted_at`.
- `create_assignment(p_skill_node_id uuid, p_title text, p_instructions text, p_due_at timestamptz, p_audience text, p_student_ids uuid[], p_attachments jsonb) RETURNS uuid`
- `update_assignment(p_id uuid, p_title text, p_instructions text, p_due_at timestamptz, p_audience text, p_student_ids uuid[], p_attachments jsonb) RETURNS void`
- `delete_assignment(p_id uuid) RETURNS text[]`: storage paths for the client to remove (all objects under `{id}/`, read from `storage.objects`)
- `submit_assignment(p_assignment_id uuid, p_body text, p_attachments jsonb) RETURNS uuid` (submission id)
- `review_submission(p_submission_id uuid, p_decision text, p_comment text) RETURNS void`
- `comment_submission(p_submission_id uuid, p_body text) RETURNS void`
- `teacher_classes_overview() RETURNS TABLE(skill_node_id uuid, skill_name text, skill_image_url text, students int, assignments int, to_review int, next_due timestamptz, licensed boolean)`. One row per skill that has an active student **or** an approved license skill.
- `assignment_progress(p_assignment_id uuid) RETURNS TABLE(student_id uuid, first_name text, last_name text, username text, avatar_url text, state text, submission_id uuid, submitted_at timestamptz, late boolean)`. `state` is one of `not_started`, `submitted`, `returned`, `done`, `left` or `removed`. Teacher only.
- `class_assignments(p_skill_node_id uuid) RETURNS TABLE(id uuid, title text, due_at timestamptz, audience text, created_at timestamptz, recipients int, submitted int, to_review int, done int)`. Teacher only. Counts include only current addressees with an active link.
- `my_assignments(p_skill_node_id uuid) RETURNS TABLE(id uuid, teacher_id uuid, title text, due_at timestamptz, created_at timestamptz, state text, submission_id uuid, late boolean)`. Caller as student. Only assignments `can_see_assignment` allows.

- [ ] **Step 1: Write the schema.** Four tables with the CHECKs from Global Constraints, the indexes from spec 5.2 and `teach_submissions.unique(assignment_id, student_id)`. Attachments CHECK: `jsonb_typeof = 'array' AND jsonb_array_length <= 10`.
- [ ] **Step 2: Write the helpers** (SECURITY DEFINER STABLE, not granted to clients except `can_see_assignment`, which the RLS policies use):
  - `_teach_active_link(p_teacher uuid, p_student uuid, p_skill uuid) RETURNS timestamptz`: `responded_at` of the active link, or null.
  - `_teach_student_in_assignment(p_assignment uuid, p_student uuid) RETURNS boolean`: active link AND (audience = 'group' OR a row in `teach_assignment_students`).
  - `can_see_assignment(p_assignment uuid, p_uid uuid) RETURNS boolean`: teacher, or `_teach_student_in_assignment`.
  - `_teach_licensed(p_teacher uuid, p_skill uuid) RETURNS boolean`: approved `license_skills` joined to the teacher's `teacher_licenses`, using the same join as policy `teacher_students_request`.
  - `_teach_clean_attachments(p jsonb, p_prefix text) RETURNS jsonb`: keeps up to 10 items. Accepted items:
    - `{kind:'file', path, name, mime, size}` where `path` starts with `p_prefix`
    - `{kind:'link', url, title?}` where `url ~* '^https?://'`
    - `kind:'material'` passes through for phase 2

    Drops everything else.
- [ ] **Step 3: Write the RLS policies.**
  - SELECT on all four tables via `can_see_assignment` (submissions and entries: the submission's student, or the teacher of the assignment).
  - `teach_assignment_students` SELECT: the teacher, or `student_id = auth.uid()`.
  - No INSERT, UPDATE or DELETE policies, so writes are possible only through the RPCs.
- [ ] **Step 4: Write the RPCs.** Rules:
  - create / update: caller is the teacher (update: owner of `p_id`), `_teach_licensed` is true, else `RAISE 'not licensed for this skill'`. For `p_audience = 'students'`, every id must have an active link, and the array must be non-empty. Replace the `teach_assignment_students` rows. Attachments are cleaned with prefix `{id}/teacher/` (create: generate the id first). Notification `assignment_new` goes to all addressees on create and only to newly added ones on update. For `group`, the addressees are all active students.
  - delete: owner only. Collect `storage.objects.name` where `bucket_id='teach-files' AND name LIKE id||'/%'`, delete the row (cascade), return the names.
  - submit:
    - checks `_teach_student_in_assignment(p_assignment_id, auth.uid())`
    - body trimmed; raise `empty submission` if the body is empty and there are no attachments
    - attachments cleaned with prefix `{assignment_id}/{uid}/`
    - upsert the submission with `FOR UPDATE`, raise `already done` if the status is `done`
    - set status `submitted`, `submitted_at = now()`, `first_submitted_at = coalesce(first_submitted_at, now())`
    - insert entry `submission`, notify the teacher with `assignment_submitted`
  - review:
    - caller is the teacher of the assignment, status is `submitted`, and the student is still `_teach_student_in_assignment`
    - decision is `done` or `returned`; `returned` requires a trimmed comment
    - update the status and `reviewed_at`, insert entry `review` with `decision`, notify the student with `assignment_reviewed`
  - comment: caller is the student (still in the assignment) or the teacher (and the student is still in it). Insert entry `comment` and notify the other side with `assignment_comment`, data `{…, to_role:'student'|'teacher'}`.
  - Notification data for all types: `assignment_id, title, skill_node_id, skill_name, other_name, decision?, to_role?`.
- [ ] **Step 5: Notifications CHECK.** Drop and re-add `notifications_type_check` with the six existing types plus `assignment_new, assignment_submitted, assignment_reviewed, assignment_comment`.
- [ ] **Step 6: Bucket and storage policies.** Bucket `teach-files` (private, 15728640, MIME list from Global Constraints). Path segment 1 = assignment id, segment 2 = `teacher` or the student uuid.
  - read: teacher of the assignment, or (`can_see_assignment` and segment 2 in (`'teacher'`, `auth.uid()`))
  - insert: (segment 2 = `'teacher'` and caller is the teacher) or (segment 2 = `auth.uid()` and `_teach_student_in_assignment`)
  - delete: teacher of the assignment only
  - Segment 1 is cast to uuid safely, through a regex check before the cast.
- [ ] **Step 7: Self-check the SQL** against Review Focus items 1–3 and 5, and check that every function has `search_path = ''`, fully qualified `public.` names and REVOKE/GRANT.

### Task 2: Query library and links helper

**Files:**
- Create: `apps/web/src/lib/links.ts`. Move `normalizeUrl`, `hostOf` and `youtubeId` here from `lib/profile-blocks.ts`, and re-export them from profile-blocks so existing imports keep working.
- Create: `apps/web/src/lib/teach-assignments-queries.ts`

**Interfaces – Produces:**
```ts
type Attachment =
  | { kind: 'file'; path: string; name: string; mime: string; size: number }
  | { kind: 'link'; url: string; title?: string }
type SubmissionState = 'not_started' | 'submitted' | 'returned' | 'done' | 'left' | 'removed'
interface Assignment { id; teacher_id; skill_node_id; title; instructions; due_at: string|null; audience: 'group'|'students'; attachments: Attachment[]; created_at }
interface ClassOverview { skill_node_id; skill_name; skill_image_url: string|null; students; assignments; to_review; next_due: string|null; licensed: boolean }
interface ClassAssignmentRow { id; title; due_at; audience; created_at; recipients; submitted; to_review; done }
interface ProgressRow { student_id; first_name; last_name; username; avatar_url; state: SubmissionState; submission_id: string|null; submitted_at; late: boolean }
interface MyAssignmentRow { id; teacher_id; title; due_at; created_at; state: SubmissionState; submission_id: string|null; late: boolean }
interface Submission { id; assignment_id; student_id; status: 'submitted'|'returned'|'done'; submitted_at; first_submitted_at; reviewed_at }
interface SubmissionEntry { id; submission_id; author_id; kind: 'submission'|'review'|'comment'; decision: 'done'|'returned'|null; body; attachments: Attachment[]; created_at }
interface AssignmentInput { title; instructions; due_at: string|null; audience; student_ids: string[]; attachments: Attachment[] }

fetchClassesOverview(): Promise<ClassOverview[]>
fetchClassAssignments(skillNodeId): Promise<ClassAssignmentRow[]>
fetchAssignment(id): Promise<Assignment | null>              // null = not visible
fetchAssignmentStudents(id): Promise<string[]>                // teach_assignment_students ids
fetchAssignmentProgress(id): Promise<ProgressRow[]>
fetchMyAssignments(skillNodeId): Promise<MyAssignmentRow[]>
fetchSubmissionThread(assignmentId, studentId): Promise<{ submission: Submission | null; entries: SubmissionEntry[] }>
createAssignment(skillNodeId, input): Promise<string>
updateAssignment(id, skillNodeId, input): Promise<void>
deleteAssignment(id): Promise<void>                           // RPC, then storage.remove(paths)
submitAssignment(assignmentId, body, attachments): Promise<void>
reviewSubmission(submissionId, decision, comment): Promise<void>
commentSubmission(submissionId, body): Promise<void>
uploadTeachFile(assignmentId, folder: 'teacher' | string, file: File): Promise<Attachment>  // images resized via resizeToBlob(1600)
signedTeachUrls(paths: string[]): Promise<Map<string, string>> // createSignedUrls, 1 h
TEACH_FILE_MAX = 15 * 1024 * 1024; TEACH_FILE_ACCEPT (input accept string)
stateLabel(state): string; personName re-used from teacher-students-queries
newAssignmentId(): string                                     // crypto.randomUUID, so teacher files can upload before create
```
`create_assignment` takes an optional `p_id uuid DEFAULT NULL`, so the client can upload the teacher's files under the id before creating the assignment. (Add this parameter in Task 1.)

- [ ] Implement, then run `npx tsc -b` (expect exit 0).

### Task 3: Shared attachment and thread components

**Files (create in `apps/web/src/components/teach/assignments/`):**
- `AttachmentList.tsx`: `{ items: Attachment[] }`. Fetches signed URLs for file items. Images show as thumbnails, PDFs and audio as file chips (audio with `<audio controls>`), links as a host chip, YouTube as a nocookie iframe.
- `AttachmentEditor.tsx`: `{ items, onChange, upload: (f: File) => Promise<Attachment>, disabled? }`. Has a file button (accept `TEACH_FILE_ACCEPT`, rejects anything over `TEACH_FILE_MAX` with an inline error) and an "Add link" input that is normalized with `normalizeUrl`. Max 10 items. Each item has a remove ×. Removing an item before saving only drops it from the list; the file stays in the bucket, as the spec allows.
- `SubmissionThread.tsx`: `{ role: 'teacher'|'student', assignmentId, studentId, readOnly?, onChanged }`. Loads `fetchSubmissionThread` and renders the entries in time order:
  - submission: a card with body and attachments
  - review: a green "Marked done" or amber "Returned" row with the comment
  - comment: a small bubble
  
  Footer:
  - teacher + `submitted` → comment textarea + **Mark done** + **Return** (Return disabled while the textarea is empty)
  - student + (`not_started` | `returned`) → submit form (textarea + AttachmentEditor + **Submit** / **Resubmit**)
  - student + `submitted` → "Waiting for review" + comment box
  - `done` → a green banner + comment box
  - `readOnly` → no footer
  
  Errors from the RPCs show inline.
- [ ] Implement, then run `npx tsc -b` and `npx eslint src/components/teach/assignments`.

### Task 4: Teacher class page

**Files:**
- Create: `apps/web/src/components/teach/dashboard/ClassesSection.tsx`. Cards from `fetchClassesOverview`, laid out as in spec 5.5. Each links to `/dashboard/teach/class/:skillId`. Shows a red "N to review" dot and an amber "Not on your license" chip when `!licensed`.
- Modify: `apps/web/src/components/teach/dashboard/StudentsSection.tsx`. Keep the requests; drop the student list from this section (it moves to the class page). Export `StudentRow` so the class page can reuse it.
- Modify: `apps/web/src/components/teach/dashboard/TeacherDashboard.tsx`. Render `<ClassesSection>` after `StudentsSection` when `live` is set. Remove `<MaterialsSection />` until phase 2.
- Create: `apps/web/src/pages/TeachClassPage.tsx`
  - Route: `teach/class/:skillId`, added in `apps/web/src/App.tsx`.
  - Header: back link to Teach, skill name, student count, and **New assignment** (hidden when `!licensed`).
  - Tabs **Assignments** / **Students**. The active tab is kept in `?tab=`.
  - Assignments: rows from `fetchClassAssignments` showing title, due date (red when past) and "submitted/recipients · N to review". A "To review" filter chip keeps only rows with `to_review > 0`.
  - Students: active students of this skill from `useTeacherStudents`, filtered by `skill_node_id`, shown with `StudentRow`.
- Create: `apps/web/src/components/teach/assignments/AssignmentFormModal.tsx`
  - Props: `{ skillNodeId, students: StudentOverview[], initial?: Assignment & { student_ids: string[] }, onClose, onSaved }`.
  - Fields: title, instructions, due date (`datetime-local`, optional), audience radio "Whole class" / "Selected students" with checkboxes, and an `AttachmentEditor` that uploads to `{id}/teacher`.
  - For an edit it also offers **Delete** with a `confirm()` prompt.
- Create: `apps/web/src/components/teach/assignments/AssignmentDetailModal.tsx`
  - Props: `{ assignmentId, onClose, onChanged }`.
  - Layout: title, due date, instructions, `AttachmentList`, then **Edit** (opens the form modal) and the `fetchAssignmentProgress` list with state pills. `left` and `removed` rows are greyed.
  - Clicking a student opens their `SubmissionThread role="teacher"` (with `readOnly` for `left`/`removed`) in the right half (`lg`) or replacing the list (mobile).
  - **Prev/Next to review** buttons cycle through rows with `state === 'submitted'`.
  - Opened from the assignment row and through `?assignment=<id>&student=<id>` (used by notification links).
- [ ] Implement, then run `npx tsc -b` and `npx eslint src/pages/TeachClassPage.tsx src/components/teach`.

### Task 5: Student side on Learn

**Files:**
- Modify: `apps/web/src/components/learn/TeachersWidget.tsx`
  - For every active link, render a `YourTeacherCard` built from the teacher row with that `userId` (the teacher data comes from `fetchSkillTeachers`). If the teacher is missing there because they lost the license, fall back to the name and avatar from the link (extend `fetchMyTeacherLinks` to select the teacher's profile name and avatar).
  - When at least one link is active, the plain teacher list collapses behind the "Other teachers for this skill" toggle.
- Create: `apps/web/src/components/learn/YourTeacherCard.tsx`
  - Layout: header (avatar, name, **Chat**), then **Assignments** from `fetchMyAssignments(skillNodeId)` filtered by `teacher_id`.
  - Sort order: `returned`, then `not_started` by `due_at` (nulls last), then `submitted`. `done` rows sit behind "Show done (N)".
  - Row icons: ● not started, ↺ returned, ○ submitted, ✓ done. The due date is red when `late`.
  - Clicking a row sets `?assignment=<id>`.
  - Empty state: "No assignments yet."
- Create: `apps/web/src/components/learn/StudentAssignmentModal.tsx`
  - Mounted in `TeachersWidget` and driven by the `assignment` search param.
  - Loads `fetchAssignment`; if it returns `null`, it shows "This assignment is no longer available."
  - Otherwise: title, teacher name, due date, instructions, `AttachmentList`, then `<SubmissionThread role="student" studentId={me}>`.
  - Closing clears the param. `onChanged` reloads the card list.
- [ ] Implement, then run `npx tsc -b` and `npx eslint src/components/learn`.

### Task 6: Notifications

**Files:**
- Modify: `apps/web/src/lib/notification-queries.ts`. Add four union members with `data: { assignment_id; title; skill_node_id; skill_name; other_name; decision?: 'done'|'returned'; to_role?: 'student'|'teacher' }`.
- Modify: `apps/web/src/components/notifications/NotificationsBell.tsx`. Copy and links:
  - `assignment_new`: "**{other_name}** gave you a new assignment: {title}". Opens `/dashboard/learn/{skill_node_id}?assignment={id}`.
  - `assignment_reviewed`:
    - done → "**{title}** was marked done."
    - returned → "**{title}** was returned. Take a look at the feedback."
    - Same link as `assignment_new`.
  - `assignment_submitted`: "**{other_name}** submitted {title}". Opens `/dashboard/teach/class/{skill_node_id}?assignment={id}` (the student id is not in the data; the detail opens on the queue).
  - `assignment_comment`: "**{other_name}** commented on {title}". The link depends on `to_role`.
  - Icons: `ClipboardList` (purple) for new and submitted, `MessageCircle` for comment, and CheckCircle2 / RotateCcw (amber) for reviewed.
- [ ] Implement, then run `npx tsc -b` and `npx eslint .` in `apps/web` (expect no new warnings).

### Task 7: Learning note and spec status

- [ ] Write `docs/learning/21-teach-ukoly-odevzdani.md` in Czech. Cover only what is new relative to notes 16, 17 and 20:
  - RLS for reading only, with all writes through RPCs
  - deriving state from a missing row
  - `FOR UPDATE` against double submit
  - storage policies built from path segments
  - uploading before the row exists (client-generated uuid)
  - notifications created in RPCs
  - a modal driven by a URL search param
- [ ] Set the spec status to "schváleno, fáze 1 implementována". Add a section "Odchylky při implementaci" if anything differed.
