import { supabase } from './supabaseClient'
import type {
  EducatorVerification,
  EvidenceKind,
  EvidenceType,
  InstitutionType,
  LicensePayload,
  LicenseSkill,
  LicenseTheme,
  SubmissionKind,
  SubmissionStatus,
  TeacherLicense,
  TeacherRole,
  TeachingLevel,
  VerificationKind,
  VerificationMethod,
  VerificationStatus,
} from '@/types/teaching'

/*
 * Teaching license ↔ Supabase (migration 20261123001_teacher_licenses).
 *
 *   teacher_licenses (+ skills, evidence)  approved version, read-only for the client
 *   teacher_license_submissions            the teacher's draft / pending change (payload = JSON snapshot)
 *
 * Files: photo → bucket license-photos (public URL),
 *        proofs + verification document → bucket license-files (private, signed URLs).
 */

export const PHOTO_BUCKET = 'license-photos'
export const FILES_BUCKET = 'license-files'
const SIGNED_URL_SECONDS = 60 * 60

/* ── row shapes (only the columns we read) ── */

interface EvidenceRow {
  id: string
  license_skill_id: string
  kind: EvidenceKind
  type: EvidenceType
  url: string | null
  storage_path: string | null
  file_name: string | null
  description: string
  date: string | null
  sort_order: number
}

interface LicenseSkillRow {
  id: string
  license_id: string
  skill_node_id: string
  level: TeachingLevel
  sort_order: number
  skill_nodes: { name: string } | null
  license_evidence: EvidenceRow[]
}

interface VerificationRow {
  kind: VerificationKind
  method: VerificationMethod
  status: Exclude<VerificationStatus, 'none'>
  email: string | null
  document_path: string | null
  document_file_name: string | null
  submitted_at: string | null
  verified_at: string | null
}

interface LicenseRow {
  id: string
  user_id: string
  title_before: string
  title_after: string
  role: TeacherRole | null
  country_code: string
  institution_type: InstitutionType | null
  institution_id: string | null
  institution_name: string
  institution_domains: string[] | null
  bio: string
  photo_path: string | null
  theme: LicenseTheme
  verification_kind: VerificationKind | null
  verification_status: VerificationStatus
  approved_at: string
  created_at: string
  updated_at: string
  license_skills: LicenseSkillRow[]
  // one-to-one embed: PostgREST returns an object (or null)
  educator_verifications: VerificationRow | VerificationRow[] | null
}

interface SubmissionRow {
  id: string
  kind: SubmissionKind
  status: SubmissionStatus
  payload: LicensePayload
  submitted_at: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

/* ── what the Teach page works with ── */

export interface OpenSubmission {
  id: string
  kind: SubmissionKind
  status: 'draft' | 'pending'
  submittedAt: string | null
  license: TeacherLicense
}

export interface RejectedSubmission {
  kind: SubmissionKind
  reason: string
  reviewedAt: string | null
  /** The rejected version, so the teacher can fix it instead of starting over. */
  license: TeacherLicense
}

export interface MyLicenseState {
  /** Approved version (what students see), or null. */
  live: TeacherLicense | null
  /** Draft or change waiting for review, or null. */
  open: OpenSubmission | null
  /** Last submission was rejected and nothing newer exists. */
  rejected: RejectedSubmission | null
}

/* ── helpers ── */

export function photoPublicUrl(path: string | null): string | null {
  return path ? supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl : null
}

/** Signed URLs for many private paths in one request. Missing paths map to null. */
async function signFiles(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)]
  const map = new Map<string, string>()
  if (unique.length === 0) return map
  const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS)
  if (error) throw error
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl)
  }
  return map
}

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function filePathsOfPayload(p: LicensePayload): string[] {
  const paths = p.skills.flatMap((s) => s.evidence.map((e) => e.path).filter((x): x is string => !!x))
  if (p.verification.documentPath) paths.push(p.verification.documentPath)
  return paths
}

/* ── row / payload → TeacherLicense ── */

function liveToLicense(row: LicenseRow, displayName: string, signed: Map<string, string>): TeacherLicense {
  const ver = first(row.educator_verifications)
  const skills: LicenseSkill[] = [...row.license_skills]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({
      id: s.id,
      licenseId: s.license_id,
      skillNodeId: s.skill_node_id,
      skillName: s.skill_nodes?.name ?? 'Skill',
      level: s.level,
      status: 'approved',
      evidence: [...(s.license_evidence ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((e) => ({
          id: e.id,
          licenseSkillId: s.id,
          kind: e.kind,
          type: e.type,
          url: e.kind === 'link' ? (e.url ?? '') : (signed.get(e.storage_path ?? '') ?? ''),
          path: e.storage_path,
          fileName: e.file_name,
          description: e.description,
          date: e.date,
          createdAt: row.updated_at,
          file: null,
        })),
    }))

  const verification: EducatorVerification = ver
    ? {
        kind: ver.kind,
        method: ver.method,
        status: ver.status,
        email: ver.email,
        documentUrl: ver.document_path ? (signed.get(ver.document_path) ?? null) : null,
        documentPath: ver.document_path,
        documentFileName: ver.document_file_name,
        documentFile: null,
        submittedAt: ver.submitted_at,
        verifiedAt: ver.verified_at,
      }
    : {
        kind: null, method: null, status: 'none', email: null, documentUrl: null, documentPath: null,
        documentFileName: null, documentFile: null, submittedAt: null, verifiedAt: null,
      }

  return {
    id: row.id,
    userId: row.user_id,
    displayName,
    titleBefore: row.title_before,
    titleAfter: row.title_after,
    role: row.role,
    countryCode: row.country_code,
    institutionType: row.institution_type,
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    institutionDomains: row.institution_domains,
    bio: row.bio,
    photoUrl: photoPublicUrl(row.photo_path),
    photoPath: row.photo_path,
    photoFile: null,
    theme: row.theme,
    status: 'approved',
    verification,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    skills,
  }
}

function payloadToLicense(
  sub: SubmissionRow,
  userId: string,
  displayName: string,
  signed: Map<string, string>,
): TeacherLicense {
  const p = sub.payload
  const v = p.verification
  return {
    id: sub.id,
    userId,
    displayName,
    titleBefore: p.titleBefore,
    titleAfter: p.titleAfter,
    role: p.role,
    countryCode: p.countryCode,
    institutionType: p.institutionType,
    institutionId: p.institutionId,
    institutionName: p.institutionName,
    institutionDomains: p.institutionDomains,
    bio: p.bio,
    photoUrl: photoPublicUrl(p.photoPath),
    photoPath: p.photoPath,
    photoFile: null,
    theme: p.theme,
    status: sub.status === 'pending' ? 'pending' : 'draft',
    verification: {
      ...v,
      documentUrl: v.documentPath ? (signed.get(v.documentPath) ?? null) : null,
      documentFile: null,
    },
    createdAt: sub.created_at,
    updatedAt: sub.updated_at,
    // ids are only needed while editing; generate stable-enough ones from the index
    skills: p.skills.map((s, i) => {
      const skillId = `${sub.id}-s${i}`
      return {
        id: skillId,
        licenseId: sub.id,
        skillNodeId: s.skillNodeId,
        skillName: s.skillName,
        level: s.level,
        status: sub.status === 'pending' ? 'pending' : 'draft',
        evidence: s.evidence.map((e, j) => ({
          id: `${skillId}-e${j}`,
          licenseSkillId: skillId,
          kind: e.kind,
          type: e.type,
          url: e.kind === 'link' ? (e.url ?? '') : (signed.get(e.path ?? '') ?? ''),
          path: e.path,
          fileName: e.fileName,
          description: e.description,
          date: e.date,
          createdAt: sub.updated_at,
          file: null,
        })),
      }
    }),
  }
}

/* ── load ── */

const LIVE_SELECT =
  '*, license_skills(*, skill_nodes(name), license_evidence(*)), educator_verifications(*)'

export async function fetchMyLicenseState(userId: string, displayName: string): Promise<MyLicenseState> {
  const [liveRes, subsRes] = await Promise.all([
    supabase.from('teacher_licenses').select(LIVE_SELECT).eq('user_id', userId).maybeSingle(),
    supabase
      .from('teacher_license_submissions')
      .select('id, kind, status, payload, submitted_at, reviewed_at, rejection_reason, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1),
  ])
  if (liveRes.error) throw liveRes.error
  if (subsRes.error) throw subsRes.error

  const liveRow = liveRes.data as unknown as LicenseRow | null
  const latest = ((subsRes.data ?? []) as unknown as SubmissionRow[])[0] ?? null
  const openRow = latest && (latest.status === 'draft' || latest.status === 'pending') ? latest : null

  // one signing request for every private file on the page
  const paths: string[] = []
  if (liveRow) {
    for (const s of liveRow.license_skills) for (const e of s.license_evidence ?? []) if (e.storage_path) paths.push(e.storage_path)
    const ver = first(liveRow.educator_verifications)
    if (ver?.document_path) paths.push(ver.document_path)
  }
  const rejectedRow = latest?.status === 'rejected' ? latest : null
  if (openRow) paths.push(...filePathsOfPayload(openRow.payload))
  if (rejectedRow) paths.push(...filePathsOfPayload(rejectedRow.payload))
  const signed = await signFiles(paths)

  return {
    live: liveRow ? liveToLicense(liveRow, displayName, signed) : null,
    open: openRow
      ? {
          id: openRow.id,
          kind: openRow.kind,
          status: openRow.status as 'draft' | 'pending',
          submittedAt: openRow.submitted_at,
          license: payloadToLicense(openRow, userId, displayName, signed),
        }
      : null,
    rejected: rejectedRow
      ? {
          kind: rejectedRow.kind,
          reason: rejectedRow.rejection_reason ?? '',
          reviewedAt: rejectedRow.reviewed_at,
          license: payloadToLicense(rejectedRow, userId, displayName, signed),
        }
      : null,
  }
}

/** The user's own skills: the only ones they can put on a license. */
export async function fetchMySkillOptions(userId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('user_skills')
    .select('skill_node_id, skill_nodes(id, name, status)')
    .eq('user_id', userId)
  if (error) throw error
  type Row = { skill_node_id: string; skill_nodes: { id: string; name: string; status: string } | null }
  return ((data ?? []) as unknown as Row[])
    .map((r) => r.skill_nodes)
    .filter((n): n is { id: string; name: string; status: string } => !!n && n.status !== 'rejected')
    .map((n) => ({ id: n.id, name: n.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/* ── save ── */

function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name)
  return m ? m[1].toLowerCase() : 'bin'
}

async function upload(bucket: string, userId: string, file: File): Promise<string> {
  // own folder (RLS checks the first path segment), random name (no clashes, no PII in the URL)
  const path = `${userId}/${crypto.randomUUID()}.${extensionOf(file.name)}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}

/** Uploads every picked File and returns the payload that goes to the database. */
async function toPayload(draft: TeacherLicense, userId: string): Promise<LicensePayload> {
  const photoPath = draft.photoFile ? await upload(PHOTO_BUCKET, userId, draft.photoFile) : draft.photoPath

  const skills = await Promise.all(
    draft.skills.map(async (s) => ({
      skillNodeId: s.skillNodeId,
      skillName: s.skillName,
      level: s.level,
      evidence: await Promise.all(
        s.evidence.map(async (e) => ({
          kind: e.kind,
          type: e.type,
          url: e.kind === 'link' ? e.url : null,
          path: e.kind === 'link' ? null : e.file ? await upload(FILES_BUCKET, userId, e.file) : e.path,
          fileName: e.fileName,
          description: e.description,
          date: e.date,
        })),
      ),
    })),
  )

  const v = draft.verification
  const documentPath = v.documentFile ? await upload(FILES_BUCKET, userId, v.documentFile) : v.documentPath

  return {
    titleBefore: draft.titleBefore.trim(),
    titleAfter: draft.titleAfter.trim(),
    role: draft.role,
    countryCode: draft.countryCode,
    institutionType: draft.institutionType,
    institutionId: draft.institutionId,
    institutionName: draft.institutionName.trim(),
    institutionDomains: draft.institutionDomains,
    bio: draft.bio.trim(),
    photoPath,
    theme: draft.theme,
    skills,
    verification: {
      kind: v.kind,
      method: v.method,
      status: v.status,
      email: v.email,
      documentPath,
      documentFileName: v.documentFileName,
      submittedAt: v.submittedAt,
      verifiedAt: v.verifiedAt,
    },
  }
}

/**
 * Saves the form as the user's open submission: 'draft' (keep working) or
 * 'pending' (send to admin). kind (new / edit) is set by a database trigger.
 */
export async function saveSubmission(opts: {
  userId: string
  draft: TeacherLicense
  submit: boolean
  openId: string | null
}): Promise<void> {
  const payload = await toPayload(opts.draft, opts.userId)
  const status = opts.submit ? 'pending' : 'draft'

  if (opts.openId) {
    const { error } = await supabase
      .from('teacher_license_submissions')
      .update({ payload, status })
      .eq('id', opts.openId)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('teacher_license_submissions').insert({ user_id: opts.userId, payload, status })
  if (error) throw error
}

/** Throws away the draft / pulls a change back from review. The approved license stays. */
export async function withdrawSubmission(id: string): Promise<void> {
  const { error } = await supabase.from('teacher_license_submissions').delete().eq('id', id)
  if (error) throw error
}
