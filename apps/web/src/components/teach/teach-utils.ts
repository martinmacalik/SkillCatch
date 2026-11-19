import type {
  EducatorVerification,
  EvidenceKind,
  LicenseStatus,
  LicenseTheme,
  TeacherLicense,
  TeacherRole,
  VerificationKind,
} from '@/types/teaching'

/* ── card colour presets (taken from the dashboard palette) ── */

export interface LicenseThemeStyle {
  label: string
  /** Header band of the card. */
  band: string
  /** Ink colour of stamps, rules and the postmark. */
  ink: string
  /** Paper tint. */
  paper: string
}

export const LICENSE_THEMES: Record<LicenseTheme, LicenseThemeStyle> = {
  // "Total Skills" card: violet-950 → fuchsia-700
  violet: { label: 'Violet', band: 'linear-gradient(135deg, #2e1065, #a21caf)', ink: '#7e22ce', paper: '#fcf9ff' },
  // active nav icon: #4f46e5 → #c026d3
  indigo: { label: 'Indigo', band: 'linear-gradient(135deg, #4f46e5, #c026d3)', ink: '#4338ca', paper: '#f9f9ff' },
  fuchsia: { label: 'Fuchsia', band: 'linear-gradient(135deg, #a21caf, #e879f9)', ink: '#a21caf', paper: '#fff9fd' },
  midnight: { label: 'Midnight', band: 'linear-gradient(135deg, #111827, #4c1d95)', ink: '#1f2937', paper: '#faf8f3' },
}

export const THEME_ORDER: LicenseTheme[] = ['violet', 'indigo', 'fuchsia', 'midnight']

/* ── mock data until skills come from user_skills ── */

export const MOCK_USER_SKILLS: string[] = [
  'Freeride Snowboarding',
  'Disc Golf',
  'Backend Developer',
  'Baking',
  'Clash of Clans',
  'Calisthenics',
  'Bouldering',
  'Basketball',
]

/* ── helpers ── */

export function newId(): string {
  return crypto.randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

export const EMPTY_VERIFICATION: EducatorVerification = {
  kind: null,
  method: null,
  status: 'none',
  email: null,
  documentUrl: null,
  documentFileName: null,
  documentFile: null,
  submittedAt: null,
  verifiedAt: null,
}

/** Students prove they study at the school, everyone else that they work there. */
export function verificationKindForRole(role: TeacherRole | null): VerificationKind {
  return role === 'student' ? 'student' : 'educator'
}

export function emptyLicense(displayName: string, userId: string | null, countryCode: string): TeacherLicense {
  const now = nowIso()
  return {
    id: newId(),
    userId,
    displayName,
    titleBefore: '',
    titleAfter: '',
    role: null,
    countryCode,
    institutionType: null,
    institutionId: null,
    institutionName: '',
    institutionDomains: null,
    bio: '',
    photoUrl: null,
    photoFile: null,
    theme: 'violet',
    status: 'draft',
    verification: EMPTY_VERIFICATION,
    createdAt: now,
    updatedAt: now,
    skills: [],
  }
}

/** Files accepted as proof. */
export const EVIDENCE_ACCEPT = 'image/*,video/*,application/pdf'

/** Maps a picked file to the evidence medium, or null when the type is not allowed. */
export function evidenceKindFromFile(file: File): EvidenceKind | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type === 'application/pdf') return 'pdf'
  return null
}

/** Accepts http(s) links only, so `javascript:` URLs never end up in an <a href>. */
export function normalizeLink(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const withProtocol = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withProtocol)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** Every blob: preview URL a license points at (photo + file evidence). */
export function collectObjectUrls(license: TeacherLicense | null): Set<string> {
  const urls = new Set<string>()
  if (!license) return urls
  if (license.photoUrl?.startsWith('blob:')) urls.add(license.photoUrl)
  if (license.verification.documentUrl?.startsWith('blob:')) urls.add(license.verification.documentUrl)
  for (const skill of license.skills) {
    for (const ev of skill.evidence) {
      if (ev.url.startsWith('blob:')) urls.add(ev.url)
    }
  }
  return urls
}

/**
 * "Mgr. Jana Nováková, Ph.D." — each part only when filled in, the comma only
 * when there is a title after the name.
 */
export function formatNameWithTitles(name: string, titleBefore: string, titleAfter: string): string {
  const before = titleBefore.trim()
  const after = titleAfter.trim()
  const core = [before, name.trim()].filter(Boolean).join(' ')
  return after ? `${core}, ${after}` : core
}

/** Does the e-mail belong to one of the domains (subdomains count: "x@fsv.cuni.cz" ∈ cuni.cz)? */
export function emailMatchesDomains(email: string, domains: readonly string[]): boolean {
  const host = email.trim().toLowerCase().split('@')[1]
  if (!host) return false
  return domains.some((d) => host === d || host.endsWith(`.${d}`))
}

export const ACADEMIC_TITLES_BEFORE = ['Bc.', 'Mgr.', 'Ing.', 'MUDr.', 'PhDr.', 'Dr.', 'Prof.', 'Dipl.-Ing.']
export const ACADEMIC_TITLES_AFTER = ['Ph.D.', 'MBA', 'BSc', 'MSc', 'BA', 'MA', 'DiS.']

export function canSubmit(license: TeacherLicense): boolean {
  return license.skills.length > 0 && license.skills.every((s) => s.evidence.length > 0)
}

export function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const STATUS_STYLES: Record<LicenseStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
  verified: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}
