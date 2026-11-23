import { supabase } from './supabaseClient'
import { photoPublicUrl } from './license-queries'
import type { TeacherRole, TeachingLevel, VerificationKind, VerificationStatus } from '@/types/teaching'

/*
 * teacher_students: a student asks, the teacher accepts / declines.
 * Status moves are checked by a trigger (tg_teacher_students_guard).
 */

export type TeacherStudentStatus = 'pending' | 'active' | 'declined' | 'cancelled' | 'ended'

/** A heartbeat (log_activity) arrives every ~30 s while the app is open. */
export const ACTIVE_NOW_MS = 2 * 60 * 1000

export function isActiveNow(lastActiveAt: string | null, now = Date.now()): boolean {
  return !!lastActiveAt && now - new Date(lastActiveAt).getTime() < ACTIVE_NOW_MS
}

/* ── teacher side ── */

/** One row of teacher_students_overview(). Progress fields are null for pending requests. */
export interface StudentOverview {
  link_id: string
  status: 'pending' | 'active'
  student_id: string
  first_name: string | null
  last_name: string | null
  username: string | null
  avatar_url: string | null
  skill_node_id: string
  skill_name: string
  message: string | null
  requested_at: string
  level_name: string | null
  level_index: number | null
  levels_total: number
  items_done: number | null
  items_total: number
  minutes_7d: number | null
  last_active_at: string | null
}

export async function fetchStudentsOverview(): Promise<StudentOverview[]> {
  const { data, error } = await supabase.rpc('teacher_students_overview')
  if (error) throw error
  return (data ?? []) as StudentOverview[]
}

export async function setStudentLinkStatus(linkId: string, status: TeacherStudentStatus): Promise<void> {
  const { error } = await supabase.from('teacher_students').update({ status }).eq('id', linkId)
  if (error) throw error
}

export function personName(p: { first_name: string | null; last_name: string | null; username: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username || 'User'
}

/* ── student side: teachers of a skill ── */

export interface SkillTeacher {
  userId: string
  name: string
  avatarUrl: string | null
  photoUrl: string | null
  level: TeachingLevel
  titleBefore: string
  titleAfter: string
  role: TeacherRole | null
  institutionName: string
  verificationKind: VerificationKind | null
  verificationStatus: VerificationStatus
}

interface SkillTeacherRow {
  level: TeachingLevel
  teacher_licenses: {
    user_id: string
    title_before: string
    title_after: string
    role: TeacherRole | null
    institution_name: string
    photo_path: string | null
    verification_kind: VerificationKind | null
    verification_status: VerificationStatus
    profiles: { first_name: string | null; last_name: string | null; username: string | null; avatar_url: string | null } | null
  } | null
}

/** Teachers with an APPROVED license that lists this skill. */
export async function fetchSkillTeachers(skillNodeId: string): Promise<SkillTeacher[]> {
  const { data, error } = await supabase
    .from('license_skills')
    .select(
      'level, teacher_licenses!inner(user_id, title_before, title_after, role, institution_name, photo_path, verification_kind, verification_status, profiles(first_name, last_name, username, avatar_url))',
    )
    .eq('skill_node_id', skillNodeId)
    .limit(30)
  if (error) throw error
  return ((data ?? []) as unknown as SkillTeacherRow[])
    .filter((r) => r.teacher_licenses)
    .map((r) => {
      const t = r.teacher_licenses!
      const p = t.profiles
      return {
        userId: t.user_id,
        name: p ? personName(p) : 'Teacher',
        avatarUrl: p?.avatar_url ?? null,
        photoUrl: photoPublicUrl(t.photo_path),
        level: r.level,
        titleBefore: t.title_before,
        titleAfter: t.title_after,
        role: t.role,
        institutionName: t.institution_name,
        verificationKind: t.verification_kind,
        verificationStatus: t.verification_status,
      }
    })
}

export interface MyTeacherLink {
  id: string
  teacherId: string
  status: 'pending' | 'active'
}

/** My open requests / active teachers for one skill. */
export async function fetchMyTeacherLinks(userId: string, skillNodeId: string): Promise<MyTeacherLink[]> {
  const { data, error } = await supabase
    .from('teacher_students')
    .select('id, teacher_id, status')
    .eq('student_id', userId)
    .eq('skill_node_id', skillNodeId)
    .in('status', ['pending', 'active'])
  if (error) throw error
  return ((data ?? []) as { id: string; teacher_id: string; status: 'pending' | 'active' }[]).map((r) => ({
    id: r.id,
    teacherId: r.teacher_id,
    status: r.status,
  }))
}

export async function requestTeacher(opts: {
  studentId: string
  teacherId: string
  skillNodeId: string
  message: string
}): Promise<void> {
  const { error } = await supabase.from('teacher_students').insert({
    student_id: opts.studentId,
    teacher_id: opts.teacherId,
    skill_node_id: opts.skillNodeId,
    message: opts.message.trim() || null,
  })
  if (error) throw error
}
