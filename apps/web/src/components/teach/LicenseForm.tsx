import { useId, type ReactNode } from 'react'
import { Camera, Plus } from 'lucide-react'

import { cn } from '@/lib/cn'
import {
  BIO_MAX_LENGTH,
  INSTITUTION_TYPE_LABELS,
  ROLE_LABELS,
  type InstitutionType,
  type LicenseSkill,
  type TeacherLicense,
  type TeacherRole,
} from '@/types/teaching'
import { CountryCombobox } from './CountryCombobox'
import { EducatorVerification } from './EducatorVerification'
import { InstitutionCombobox, type InstitutionValue } from './InstitutionCombobox'
import { SelectMenu } from './SelectMenu'
import { SkillProofEditor } from './SkillProofEditor'
import { TitleInput } from './TitleInput'
import {
  ACADEMIC_TITLES_AFTER,
  ACADEMIC_TITLES_BEFORE,
  EMPTY_VERIFICATION,
  LICENSE_THEMES,
  THEME_ORDER,
  canSubmit,
  newId,
  verificationKindForRole,
} from './teach-utils'

const INSTITUTION_TYPE_OPTIONS = (Object.keys(INSTITUTION_TYPE_LABELS) as InstitutionType[]).map((value) => ({
  value,
  label: INSTITUTION_TYPE_LABELS[value],
}))
const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as TeacherRole[]).map((value) => ({ value, label: ROLE_LABELS[value] }))

interface LicenseFormProps {
  value: TeacherLicense
  onChange: (next: TeacherLicense) => void
  availableSkills: string[]
  createPreviewUrl: (file: File) => string
  releasePreviewUrl: (url: string | null) => void
  onSaveDraft: () => void
  onSubmit: () => void
  onCancel: () => void
}

/**
 * Controlled form: owns no license state itself. Every change goes up through
 * `onChange`, which is what keeps the preview card live.
 */
export function LicenseForm({
  value,
  onChange,
  availableSkills,
  createPreviewUrl,
  releasePreviewUrl,
  onSaveDraft,
  onSubmit,
  onCancel,
}: LicenseFormProps) {
  const ids = useId()
  const set = <K extends keyof TeacherLicense>(key: K, v: TeacherLicense[K]) => onChange({ ...value, [key]: v })

  const addedNames = new Set(value.skills.map((s) => s.skillName))
  const unusedSkills = availableSkills.filter((name) => !addedNames.has(name))
  const hasSkills = value.skills.length > 0
  const submittable = canSubmit(value)

  /* photo */
  const pickPhoto = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    releasePreviewUrl(value.photoUrl)
    onChange({ ...value, photoFile: file, photoUrl: createPreviewUrl(file) })
  }
  const removePhoto = () => {
    releasePreviewUrl(value.photoUrl)
    onChange({ ...value, photoFile: null, photoUrl: null })
  }

  /* role */
  const verificationKind = verificationKindForRole(value.role)
  const changeRole = (role: TeacherRole | null) => {
    const v = value.verification
    // a check proves one thing (works there / studies there); a role that
    // needs the other kind can't keep the old stamp
    const stale = v.status !== 'none' && v.kind !== verificationKindForRole(role)
    if (stale) releasePreviewUrl(v.documentUrl)
    onChange({ ...value, role, verification: stale ? EMPTY_VERIFICATION : v })
  }

  /* institution */
  const setInstitution = (next: InstitutionValue, extra: Partial<TeacherLicense> = {}) => {
    // an e-mail check was made against the old institution's domain, so it no longer applies
    const emailCheckStale = value.verification.method === 'email' && next.id !== value.institutionId
    onChange({
      ...value,
      ...extra,
      institutionId: next.id,
      institutionName: next.name,
      institutionDomains: next.domains,
      verification: emailCheckStale ? EMPTY_VERIFICATION : value.verification,
    })
  }
  /** A picked entry belongs to one country + list; a typed name may stay. */
  const keepTypedName = (): InstitutionValue =>
    value.institutionId ? { id: null, name: '', domains: null } : { id: null, name: value.institutionName, domains: null }

  /* skills */
  const addSkill = (skillName: string) => {
    const skill: LicenseSkill = {
      id: newId(),
      licenseId: value.id,
      skillNodeId: null,
      skillName,
      level: 'intermediate',
      status: 'draft',
      evidence: [],
    }
    set('skills', [...value.skills, skill])
  }
  const updateSkill = (next: LicenseSkill) =>
    set('skills', value.skills.map((s) => (s.id === next.id ? next : s)))
  const removeSkill = (skill: LicenseSkill) => {
    for (const ev of skill.evidence) if (ev.kind !== 'link') releasePreviewUrl(ev.url)
    set('skills', value.skills.filter((s) => s.id !== skill.id))
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* ── 1. personal ── */}
      <Section step={1} title="About you" hint="Everything here is optional. Empty fields stay off the card.">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-gray-100 ring-1 ring-gray-200">
            {value.photoUrl ? (
              <img src={value.photoUrl} alt="Your photo" className="h-full w-full object-cover" />
            ) : (
              <Camera className="absolute inset-0 m-auto h-6 w-6 text-gray-400" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200">
              {value.photoUrl ? 'Change photo' : 'Upload photo'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  pickPhoto(e.target.files?.[0])
                  e.target.value = '' // allow picking the same file again
                }}
              />
            </label>
            {value.photoUrl && (
              <button
                type="button"
                onClick={removePhoto}
                className="cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Title before name" htmlFor={`${ids}-tb`}>
            <TitleInput
              id={`${ids}-tb`}
              value={value.titleBefore}
              onChange={(v) => set('titleBefore', v)}
              suggestions={ACADEMIC_TITLES_BEFORE}
              placeholder="e.g. Mgr."
            />
          </Field>
          <Field label="Title after name" htmlFor={`${ids}-ta`}>
            <TitleInput
              id={`${ids}-ta`}
              value={value.titleAfter}
              onChange={(v) => set('titleAfter', v)}
              suggestions={ACADEMIC_TITLES_AFTER}
              placeholder="e.g. Ph.D."
            />
          </Field>
        </div>

        <Field label="Role" htmlFor={`${ids}-role`} className="mt-4">
          <SelectMenu<TeacherRole>
            id={`${ids}-role`}
            value={value.role}
            onChange={changeRole}
            options={ROLE_OPTIONS}
            emptyLabel="No role"
          />
        </Field>

        <Field
          label="Bio"
          htmlFor={`${ids}-bio`}
          className="mt-4"
          aside={
            <span className={cn('text-xs', value.bio.length >= BIO_MAX_LENGTH ? 'text-red-500' : 'text-gray-400')}>
              {value.bio.length}/{BIO_MAX_LENGTH}
            </span>
          }
        >
          <textarea
            id={`${ids}-bio`}
            className="input min-h-24 resize-y"
            placeholder="A few words about how you teach…"
            maxLength={BIO_MAX_LENGTH}
            value={value.bio}
            onChange={(e) => set('bio', e.target.value)}
          />
        </Field>
      </Section>

      {/* ── 2. institution ── */}
      <Section
        step={2}
        title="School or organization"
        hint="Where you teach, study or train. Still at high school or university? Add it too."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Country" htmlFor={`${ids}-country`}>
            <CountryCombobox
              id={`${ids}-country`}
              value={value.countryCode}
              onChange={(code) => {
                if (code !== value.countryCode) setInstitution(keepTypedName(), { countryCode: code })
              }}
            />
          </Field>
          <Field label="Institution type" htmlFor={`${ids}-itype`}>
            <SelectMenu<InstitutionType>
              id={`${ids}-itype`}
              value={value.institutionType}
              onChange={(type) => {
                if (type !== value.institutionType) setInstitution(keepTypedName(), { institutionType: type })
              }}
              options={INSTITUTION_TYPE_OPTIONS}
              emptyLabel="Choose type…"
            />
          </Field>
        </div>

        <Field label="Institution" htmlFor={`${ids}-inst`} className="mt-4">
          <InstitutionCombobox
            // new country / type = new list, so start the combobox fresh
            key={`${value.institutionType ?? 'none'}-${value.countryCode}`}
            id={`${ids}-inst`}
            countryCode={value.countryCode}
            institutionType={value.institutionType}
            value={{ id: value.institutionId, name: value.institutionName, domains: value.institutionDomains }}
            onChange={(next) => setInstitution(next)}
          />
        </Field>
      </Section>

      {/* ── 3. skills with proof ── */}
      <Section step={3} title="Skills you teach" hint="Pick at least one skill, set your level and back it with proof.">
        {unusedSkills.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {unusedSkills.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => addSkill(name)}
                className="flex cursor-pointer items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-gray-600 ring-1 ring-gray-200 transition-colors hover:text-purple-700 hover:ring-purple-300"
              >
                <Plus className="h-3.5 w-3.5" />
                {name}
              </button>
            ))}
          </div>
        )}

        {hasSkills ? (
          <div className={cn('flex flex-col gap-3', unusedSkills.length > 0 && 'mt-4')}>
            {value.skills.map((skill) => (
              <SkillProofEditor
                key={skill.id}
                skill={skill}
                onChange={updateSkill}
                onRemove={() => removeSkill(skill)}
                createPreviewUrl={createPreviewUrl}
                releasePreviewUrl={releasePreviewUrl}
              />
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-400">No skills added yet.</p>
        )}
      </Section>

      {/* ── 4. verified educator / student ── */}
      <Section
        step={4}
        title={verificationKind === 'student' ? 'Student verification (optional)' : 'Educator verification (optional)'}
        hint={
          verificationKind === 'student'
            ? 'Verifying that you study at your school adds a Verified student stamp to your card.'
            : "You don't have to be a teacher to get a license. Verifying that you teach at a school adds a Verified educator stamp to your card."
        }
      >
        <EducatorVerification
          value={value.verification}
          onChange={(v) => set('verification', v)}
          kind={verificationKind}
          institutionName={value.institutionName.trim()}
          institutionDomains={value.institutionDomains}
          createPreviewUrl={createPreviewUrl}
          releasePreviewUrl={releasePreviewUrl}
        />
      </Section>

      {/* ── 5. theme ── */}
      <Section step={5} title="Card theme">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEME_ORDER.map((key) => {
            const theme = LICENSE_THEMES[key]
            const active = value.theme === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => set('theme', key)}
                aria-pressed={active}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-xl p-2.5 text-sm font-semibold ring-1 transition',
                  active ? 'text-gray-900 ring-2 ring-purple-600' : 'text-gray-500 ring-gray-200 hover:ring-gray-300',
                )}
              >
                <span className="h-7 w-7 shrink-0 rounded-full" style={{ background: theme.band }} />
                {theme.label}
              </button>
            )
          })}
        </div>
      </Section>

      {/* ── actions ── */}
      <div className="flex flex-col-reverse gap-3 rounded-2xl bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-100"
        >
          Cancel
        </button>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={!hasSkills}
            className="cursor-pointer rounded-xl px-6 py-3 text-sm font-semibold text-purple-700 ring-1 ring-purple-200 transition-colors hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            Save draft
          </button>
          {/* disabled buttons don't get hover events, so the tooltip sits on a wrapper */}
          <span
            className="flex"
            title={submittable ? undefined : 'Every skill needs at least one proof before you can submit.'}
          >
            <button
              type="button"
              onClick={onSubmit}
              disabled={!submittable}
              className="w-full cursor-pointer rounded-xl bg-purple-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-800 disabled:cursor-not-allowed disabled:bg-purple-300"
            >
              Submit for review
            </button>
          </span>
        </div>
      </div>
      {!hasSkills && <p className="-mt-2 text-center text-xs text-gray-400 sm:text-right">Add at least one skill to save.</p>}
    </div>
  )
}

/* ── small layout helpers ── */

function Section({ step, title, hint, children }: { step: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-violet-950 to-fuchsia-700 text-xs font-bold text-white">
          {step}
        </span>
        <div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          {hint && <p className="mt-0.5 text-sm text-gray-500">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

/**
 * Label + control. A <div> with htmlFor rather than a wrapping <label>: a
 * wrapping label would forward clicks inside a combobox dropdown to the input.
 */
function Field({
  label,
  htmlFor,
  aside,
  className,
  children,
}: {
  label: string
  htmlFor: string
  aside?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-sm font-medium text-gray-700">
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  )
}
