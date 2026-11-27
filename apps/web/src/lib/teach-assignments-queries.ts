import { supabase } from './supabaseClient'
import { resizeToBlob } from './avatarUpload'

/*
 * Teach phase 1: assignments → submissions → review (migration 20261127001).
 * Reads: RLS tables + RPCs that compute the state. Writes: RPCs only.
 * A "class" = teacher + skill; the student side never sees it as a group.
 */

export type Attachment =
  | { kind: 'file'; path: string; name: string; mime: string; size: number }
  | { kind: 'link'; url: string; title?: string }

/** no row = not_started; left / removed = has work but is no longer an addressee (teacher view) */
export type SubmissionState = 'not_started' | 'submitted' | 'returned' | 'done' | 'left' | 'removed'
export type Audience = 'group' | 'students'

export interface Assignment {
  id: string
  teacher_id: string
  skill_node_id: string
  title: string
  instructions: string
  due_at: string | null
  audience: Audience
  attachments: Attachment[]
  created_at: string
}

export interface ClassOverview {
  skill_node_id: string
  skill_name: string
  skill_image_url: string | null
  students: number
  assignments: number
  to_review: number
  next_due: string | null
  licensed: boolean
}

export interface ClassAssignmentRow {
  id: string
  title: string
  due_at: string | null
  audience: Audience
  created_at: string
  recipients: number
  submitted: number
  to_review: number
  done: number
}

export interface ProgressRow {
  student_id: string
  first_name: string | null
  last_name: string | null
  username: string | null
  avatar_url: string | null
  state: SubmissionState
  submission_id: string | null
  submitted_at: string | null
  late: boolean
}

export interface MyAssignmentRow {
  id: string
  teacher_id: string
  title: string
  due_at: string | null
  created_at: string
  state: SubmissionState
  submission_id: string | null
  late: boolean
}

export interface Submission {
  id: string
  assignment_id: string
  student_id: string
  status: 'submitted' | 'returned' | 'done'
  submitted_at: string
  first_submitted_at: string
  reviewed_at: string | null
}

export interface SubmissionEntry {
  id: string
  submission_id: string
  author_id: string
  kind: 'submission' | 'review' | 'comment'
  decision: 'done' | 'returned' | null
  body: string
  attachments: Attachment[]
  created_at: string
}

export interface AssignmentInput {
  title: string
  instructions: string
  due_at: string | null
  audience: Audience
  student_ids: string[]
  attachments: Attachment[]
}

const BUCKET = 'teach-files'
const SIGNED_URL_SECONDS = 3600
export const TEACH_FILE_MAX = 15 * 1024 * 1024
export const TEACH_MAX_ATTACHMENTS = 10
export const TEACH_FILE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg'
const IMAGE_MAX_DIM = 1600

/** RPC errors come as { message }; show the database's reason when there is one */
function fail(error: { message?: string } | null): never {
  throw new Error(error?.message || 'Something went wrong.')
}

// ── teacher: reads ────────────────────────────────────────────────────────

export async function fetchClassesOverview(): Promise<ClassOverview[]> {
  const { data, error } = await supabase.rpc('teacher_classes_overview')
  if (error) fail(error)
  return (data ?? []) as ClassOverview[]
}

export async function fetchClassAssignments(skillNodeId: string): Promise<ClassAssignmentRow[]> {
  const { data, error } = await supabase.rpc('class_assignments', { p_skill_node_id: skillNodeId })
  if (error) fail(error)
  return (data ?? []) as ClassAssignmentRow[]
}

export async function fetchAssignmentProgress(id: string): Promise<ProgressRow[]> {
  const { data, error } = await supabase.rpc('assignment_progress', { p_assignment_id: id })
  if (error) fail(error)
  return (data ?? []) as ProgressRow[]
}

export interface StudentSummary { student_id: string; open: number; returned: number; to_review: number }

export async function fetchClassStudentsSummary(skillNodeId: string): Promise<Map<string, StudentSummary>> {
  const { data, error } = await supabase.rpc('class_students_summary', { p_skill_node_id: skillNodeId })
  if (error) fail(error)
  return new Map(((data ?? []) as StudentSummary[]).map(r => [r.student_id, r]))
}

export async function fetchAssignmentStudents(id: string): Promise<string[]> {
  const { data, error } = await supabase.from('teach_assignment_students').select('student_id').eq('assignment_id', id)
  if (error) fail(error)
  return (data ?? []).map(r => r.student_id as string)
}

// ── both sides ────────────────────────────────────────────────────────────

/** null = doesn't exist or the caller can't see it (anymore) */
export async function fetchAssignment(id: string): Promise<Assignment | null> {
  const { data, error } = await supabase
    .from('teach_assignments')
    .select('id, teacher_id, skill_node_id, title, instructions, due_at, audience, attachments, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) fail(error)
  return (data as Assignment | null) ?? null
}

export async function fetchSubmissionThread(
  assignmentId: string,
  studentId: string,
): Promise<{ submission: Submission | null; entries: SubmissionEntry[] }> {
  const { data: submission, error } = await supabase
    .from('teach_submissions')
    .select('id, assignment_id, student_id, status, submitted_at, first_submitted_at, reviewed_at')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .maybeSingle()
  if (error) fail(error)
  if (!submission) return { submission: null, entries: [] }
  const { data: entries, error: e2 } = await supabase
    .from('teach_submission_entries')
    .select('id, submission_id, author_id, kind, decision, body, attachments, created_at')
    .eq('submission_id', submission.id)
    .order('created_at')
  if (e2) fail(e2)
  return { submission: submission as Submission, entries: (entries ?? []) as SubmissionEntry[] }
}

// ── student: reads ────────────────────────────────────────────────────────

export async function fetchMyAssignments(skillNodeId: string): Promise<MyAssignmentRow[]> {
  const { data, error } = await supabase.rpc('my_assignments', { p_skill_node_id: skillNodeId })
  if (error) fail(error)
  return (data ?? []) as MyAssignmentRow[]
}

// ── writes ────────────────────────────────────────────────────────────────

/** Generated on the client so the teacher's files can be uploaded before the assignment exists. */
export const newAssignmentId = () => crypto.randomUUID()

const assignmentArgs = (input: AssignmentInput) => ({
  p_title: input.title.trim(),
  p_instructions: input.instructions.trim(),
  p_due_at: input.due_at,
  p_audience: input.audience,
  p_student_ids: input.audience === 'students' ? input.student_ids : [],
  p_attachments: input.attachments,
})

export async function createAssignment(id: string, skillNodeId: string, input: AssignmentInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_assignment', {
    p_skill_node_id: skillNodeId,
    ...assignmentArgs(input),
    p_id: id,
  })
  if (error) fail(error)
  return data as string
}

export async function updateAssignment(id: string, input: AssignmentInput): Promise<void> {
  const { error } = await supabase.rpc('update_assignment', { p_id: id, ...assignmentArgs(input) })
  if (error) fail(error)
}

/** Files first (the storage policy needs the assignment to still exist), then the row. */
export async function deleteAssignment(id: string): Promise<void> {
  const { data: paths, error } = await supabase.rpc('assignment_file_paths', { p_id: id })
  if (error) fail(error)
  if ((paths as string[] | null)?.length) {
    // stop if this fails: once the row is gone nobody may delete these files anymore
    const { error: se } = await supabase.storage.from(BUCKET).remove(paths as string[])
    if (se) fail(se)
  }
  const { error: e2 } = await supabase.rpc('delete_assignment', { p_id: id })
  if (e2) fail(e2)
}

export async function submitAssignment(assignmentId: string, body: string, attachments: Attachment[]): Promise<void> {
  const { error } = await supabase.rpc('submit_assignment', {
    p_assignment_id: assignmentId,
    p_body: body,
    p_attachments: attachments,
  })
  if (error) fail(error)
}

export async function reviewSubmission(submissionId: string, decision: 'done' | 'returned', comment: string): Promise<void> {
  const { error } = await supabase.rpc('review_submission', {
    p_submission_id: submissionId,
    p_decision: decision,
    p_comment: comment,
  })
  if (error) fail(error)
}

export async function commentSubmission(submissionId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('comment_submission', { p_submission_id: submissionId, p_body: body })
  if (error) fail(error)
}

// ── files ─────────────────────────────────────────────────────────────────

/**
 * folder: 'teacher' for the assignment's own files, the student's id for submission files
 * (the storage policy checks exactly that). Images are shrunk to 1600 px WebP first.
 */
export async function uploadTeachFile(assignmentId: string, folder: string, file: File): Promise<Attachment> {
  if (file.size > TEACH_FILE_MAX) throw new Error('File is larger than 15 MB.')
  if (!TEACH_FILE_ACCEPT.split(',').includes(file.type)) {
    throw new Error('Use an image, PDF or audio file. Add videos as a link.')
  }
  const resizable = /^image\/(jpeg|png|webp)$/.test(file.type)
  const blob: Blob = resizable ? await resizeToBlob(file, IMAGE_MAX_DIM) : file
  const mime = resizable ? 'image/webp' : file.type
  const ext = resizable ? 'webp' : (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${assignmentId}/${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mime, upsert: false })
  if (error) throw new Error(error.message)
  return { kind: 'file', path, name: file.name.slice(0, 200), mime, size: blob.size }
}

export async function signedTeachUrls(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)]
  const map = new Map<string, string>()
  if (unique.length === 0) return map
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS)
  if (error) return map // files just don't preview; the thread still works
  for (const item of data ?? []) if (item.path && item.signedUrl) map.set(item.path, item.signedUrl)
  return map
}

// ── labels ────────────────────────────────────────────────────────────────

export const STATE_LABELS: Record<SubmissionState, string> = {
  not_started: 'Not started',
  submitted: 'Submitted',
  returned: 'Returned',
  done: 'Done',
  left: 'Left',
  removed: 'Removed',
}

export function formatDue(iso: string): string {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  })
}
