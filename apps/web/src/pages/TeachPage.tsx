import { useState } from 'react'
import { Clock, Pencil } from 'lucide-react'

import { useAuth } from '@/contexts/AuthProvider'
import { useTeacherLicense } from '@/hooks/useTeacherLicense'
import type { TeacherLicense } from '@/types/teaching'
import { EmptyLicenseState } from '@/components/teach/EmptyLicenseState'
import { LicenseCard } from '@/components/teach/LicenseCard'
import { LicenseForm } from '@/components/teach/LicenseForm'
import { StatusBadge } from '@/components/teach/StatusBadge'
import { LEVEL_LABELS } from '@/types/teaching'
import { MOCK_USER_SKILLS, emptyLicense } from '@/components/teach/teach-utils'
import { defaultCountryCode } from '@/data/countries'

/** Name shown on the card, taken from the session (no extra request). */
function useDisplayName(): string {
  const { session } = useAuth()
  const meta = session?.user.user_metadata as Record<string, unknown> | undefined
  for (const key of ['full_name', 'name', 'username']) {
    const v = meta?.[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return session?.user.email?.split('@')[0] ?? 'Your name'
}

export default function TeachPage() {
  const { session } = useAuth()
  const displayName = useDisplayName()
  const { license, createPreviewUrl, releasePreviewUrl, saveDraft, submitForReview, discardDraft } = useTeacherLicense()

  // Working copy while editing; null = not editing. The saved `license` stays
  // untouched until "Save draft", so "Cancel" simply drops the draft.
  const [draft, setDraft] = useState<TeacherLicense | null>(null)

  const startEditing = () => setDraft(license ?? emptyLicense(displayName, session?.user.id ?? null, defaultCountryCode()))

  const finish = (save: (d: TeacherLicense) => void) => {
    if (!draft) return
    save(draft)
    setDraft(null)
  }

  const cancel = () => {
    discardDraft()
    setDraft(null)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── header ── */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Teach</h1>
        <p className="mt-1.5 text-base text-gray-500">Share what you master and teach others.</p>
      </div>

      {draft ? (
        /* ── editing: preview + form (preview above on mobile) ── */
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div className="lg:sticky lg:top-0">
            <p className="mb-3 text-xs font-semibold tracking-widest text-gray-400 uppercase">Live preview</p>
            <LicenseCard license={draft} />
          </div>
          <LicenseForm
            value={draft}
            onChange={setDraft}
            availableSkills={MOCK_USER_SKILLS}
            createPreviewUrl={createPreviewUrl}
            releasePreviewUrl={releasePreviewUrl}
            onSaveDraft={() => finish(saveDraft)}
            onSubmit={() => finish(submitForReview)}
            onCancel={cancel}
          />
        </div>
      ) : license ? (
        <LicenseOverview license={license} onEdit={startEditing} />
      ) : (
        <div className="flex flex-1 items-center py-6 sm:py-12">
          <EmptyLicenseState onCreate={startEditing} />
        </div>
      )}
    </div>
  )
}

/* ── has a license ── */

function LicenseOverview({ license, onEdit }: { license: TeacherLicense; onEdit: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <LicenseCard license={license} />

      <div className="flex flex-col items-center gap-3">
        {license.status === 'pending' && (
          <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700">
            <Clock className="h-4 w-4" />
            Submitted for review. Editing moves it back to draft.
          </p>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="flex cursor-pointer items-center gap-2 rounded-xl bg-purple-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-800"
        >
          <Pencil className="h-4 w-4" />
          Edit license
        </button>
      </div>

      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Skills on your license</h3>
          <StatusBadge status={license.status} />
        </div>
        <ul className="divide-y divide-gray-100">
          {license.skills.map((skill) => (
            <li key={skill.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">{skill.skillName}</p>
                <p className="text-sm text-gray-500">
                  {LEVEL_LABELS[skill.level]} · {skill.evidence.length} {skill.evidence.length === 1 ? 'proof' : 'proofs'}
                </p>
              </div>
              <StatusBadge status={skill.status} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
