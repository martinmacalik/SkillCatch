/*
 * Teaching license – frontend types.
 *
 * Shaped so they map 1:1 onto future tables (camelCase → snake_case):
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
export type LicenseStatus = 'draft' | 'pending' | 'verified' | 'rejected'

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
  /** For files: a preview object URL now, a Storage URL later. For links: the link itself. */
  url: string
  /** Original file name (null for links). */
  fileName: string | null
  description: string
  /** ISO date `YYYY-MM-DD`, null when not filled in. */
  date: string | null
  createdAt: string
  /** client-only: the picked file, uploaded to Storage when the backend exists. */
  file: File | null
}

export interface LicenseSkill {
  id: string
  licenseId: string
  /** Later a FK to skill_nodes.id; null while skills are mocked. */
  skillNodeId: string | null
  skillName: string
  level: TeachingLevel
  status: LicenseStatus
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
  /** Uploaded proof (staff ID, contract, student ID, confirmation of studies…). Preview URL now, Storage path later. */
  documentUrl: string | null
  documentFileName: string | null
  /** client-only: the picked document file. */
  documentFile: File | null
  submittedAt: string | null
  verifiedAt: string | null
}

export interface TeacherLicense {
  id: string
  /** Later a FK to profiles.id. */
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
  /** client-only: the picked photo, uploaded to Storage later. */
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
  verified: 'Verified',
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
