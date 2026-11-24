/*
 * Teaching license – frontend types.
 *
 * Map 1:1 onto the tables (camelCase → snake_case), migration 20261123001:
 *   TeacherLicense  → teacher_licenses
 *   LicenseSkill    → license_skills    (license_id → teacher_licenses.id)
 *   LicenseEvidence → license_evidence  (license_skill_id → license_skills.id)
 *   EducatorVerification → educator_verifications (license_id → teacher_licenses.id)
 *
 * institution_* columns live on teacher_licenses (a snapshot of the name, so
 * the card stays correct when the static lists change later).
 *
 * Fields marked "client-only" never go to the database.
 */

/** Review state of a license and of each skill on it. */
export type LicenseStatus = 'draft' | 'pending' | 'approved' | 'rejected'

/** How well the teacher claims to master the skill. */
export type TeachingLevel = 'intermediate' | 'advanced' | 'expert'

/** What the proof shows (the meaning). */
export type EvidenceType = 'certificate' | 'competition' | 'home_showcase'

/** What the proof is (the medium). */
export type EvidenceKind = 'image' | 'video' | 'pdf' | 'link'

/** Colour preset of the license card. */
export type LicenseTheme = 'violet' | 'indigo' | 'fuchsia' | 'midnight'

export interface LicenseEvidence {
  id: string
  licenseSkillId: string
  kind: EvidenceKind
  type: EvidenceType
  /** Links: the link. Files: something to show it with (blob: preview or a signed Storage URL). */
  url: string
  /** Files once uploaded: path in bucket license-files. Null for links and unsaved files. */
  path: string | null
  /** Original file name (null for links). */
  fileName: string | null
  description: string
  /** ISO date `YYYY-MM-DD`, null when not filled in. */
  date: string | null
  /** The teacher wants it on their teacher profile (private by default). */
  isPublic: boolean
  createdAt: string
  /** client-only: the picked file, uploaded on save. */
  file: File | null
}

export interface LicenseSkill {
  id: string
  licenseId: string
  /** FK skill_nodes.id */
  skillNodeId: string
  skillName: string
  level: TeachingLevel
  /** On the live license: 'approved' (on the card) or 'rejected' (left out by the admin). */
  status: LicenseStatus
  /** Why the admin left this skill out (live license only). */
  rejectionReason?: string | null
  evidence: LicenseEvidence[]
}

/** What kind of place the teacher belongs to. Drives how the institution is picked. */
export type InstitutionType = 'university' | 'school' | 'organization' | 'club' | 'other'

/** How the teacher teaches (optional, shown under the name). */
export type TeacherRole = 'teacher' | 'coach' | 'lecturer' | 'professional' | 'self_taught' | 'student'

export type VerificationStatus = 'none' | 'pending' | 'verified'
export type VerificationMethod = 'email' | 'document'
/** What the check proves: works at the school, or studies there. */
export type VerificationKind = 'educator' | 'student'

/**
 * "Verified educator / student" check → table educator_verifications
 * (license_id → teacher_licenses.id, one row per license).
 */
export interface EducatorVerification {
  /** Fixed when the check is submitted; the card stamp follows this, not the current role. */
  kind: VerificationKind | null
  method: VerificationMethod | null
  status: VerificationStatus
  /** School e-mail the code was sent to. */
  email: string | null
  /** Uploaded proof (staff ID, contract, student ID…): something to show it with. */
  documentUrl: string | null
  /** Path in bucket license-files once uploaded. */
  documentPath: string | null
  documentFileName: string | null
  /** client-only: the picked document file. */
  documentFile: File | null
  submittedAt: string | null
  verifiedAt: string | null
}

export interface TeacherLicense {
  id: string
  /** FK profiles.id */
  userId: string | null
  /** Read from the account, not edited in the form. */
  displayName: string
  /** Academic title before / after the name, free text ("Mgr.", "Ph.D."). */
  titleBefore: string
  titleAfter: string
  role: TeacherRole | null

  /** ISO 3166-1 alpha-2 of the institution's country. */
  countryCode: string
  institutionType: InstitutionType | null
  /** Id from the static lists (RED_IZO, university slug); null = typed by hand. */
  institutionId: string | null
  institutionName: string
  /** Known e-mail domains of the institution (universities only, for now). */
  institutionDomains: string[] | null

  bio: string
  photoUrl: string | null
  /** Path in bucket license-photos once uploaded. */
  photoPath: string | null
  /** client-only: the picked photo, uploaded on save. */
  photoFile: File | null
  theme: LicenseTheme
  status: LicenseStatus
  verification: EducatorVerification
  createdAt: string
  updatedAt: string
  skills: LicenseSkill[]
}

/* ── labels shared by the card, form and overview ── */

export const LEVEL_LABELS: Record<TeachingLevel, string> = {
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
}

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  certificate: 'Certificate',
  competition: 'Competition',
  home_showcase: 'Home showcase',
}

export const STATUS_LABELS: Record<LicenseStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

export const INSTITUTION_TYPE_LABELS: Record<InstitutionType, string> = {
  university: 'University',
  school: 'School',
  organization: 'Organization',
  club: 'Club or gym',
  other: 'Other',
}

export const ROLE_LABELS: Record<TeacherRole, string> = {
  teacher: 'Teacher',
  coach: 'Coach / Trainer',
  lecturer: 'Lecturer',
  professional: 'Professional',
  self_taught: 'Self-taught',
  student: 'Student',
}

export const VERIFIED_LABELS: Record<VerificationKind, string> = {
  educator: 'Verified educator',
  student: 'Verified student',
}

export const BIO_MAX_LENGTH = 200
export const ACADEMIC_TITLE_MAX_LENGTH = 30

/* ── database shapes ── */

/** One evidence item inside a submission payload. */
export interface PayloadEvidence {
  kind: EvidenceKind
  type: EvidenceType
  url: string | null
  path: string | null
  fileName: string | null
  description: string
  date: string | null
  /** Shown on the teacher profile (older payloads don't have it → private). */
  isPublic?: boolean
}

/**
 * teacher_license_submissions.payload: a full snapshot of the form.
 * approve_license_submission() copies it into the live tables.
 */
export interface LicensePayload {
  titleBefore: string
  titleAfter: string
  role: TeacherRole | null
  countryCode: string
  institutionType: InstitutionType | null
  institutionId: string | null
  institutionName: string
  institutionDomains: string[] | null
  bio: string
  photoPath: string | null
  theme: LicenseTheme
  skills: {
    skillNodeId: string
    /** For display only (admin, drafts); the database uses skillNodeId. */
    skillName: string
    level: TeachingLevel
    evidence: PayloadEvidence[]
  }[]
  verification: {
    kind: VerificationKind | null
    method: VerificationMethod | null
    status: VerificationStatus
    email: string | null
    documentPath: string | null
    documentFileName: string | null
    submittedAt: string | null
    verifiedAt: string | null
  }
}

export type SubmissionStatus = 'draft' | 'pending' | 'approved' | 'rejected'
export type SubmissionKind = 'new' | 'edit'
