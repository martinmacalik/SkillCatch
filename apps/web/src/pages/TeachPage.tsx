import { useState } from 'react'
import { Clock } from 'lucide-react'

import { useAuth } from '@/contexts/AuthProvider'
import { useTeacherLicense } from '@/hooks/useTeacherLicense'
import type { TeacherLicense } from '@/types/teaching'
import { EmptyLicenseState } from '@/components/teach/EmptyLicenseState'
import { LicenseCard } from '@/components/teach/LicenseCard'
import { LicenseForm } from '@/components/teach/LicenseForm'
import { TeacherDashboard } from '@/components/teach/dashboard/TeacherDashboard'
import { emptyLicense } from '@/components/teach/teach-utils'
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

function messageOf(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') return err.message
  return 'Something went wrong.'
}

export default function TeachPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const displayName = useDisplayName()
  const lic = useTeacherLicense(userId, displayName)

  // Working copy while editing; null = not editing. Nothing in the database
  // changes until Save draft / Submit, so Cancel just drops it.
  const [draft, setDraft] = useState<TeacherLicense | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // continue the open draft / pending change, else fix the rejected one, else
  // start from the approved license, else from scratch
  const startEditing = () => {
    setSaveError(null)
    setDraft(
      lic.open?.license ?? lic.rejected?.license ?? lic.live ?? emptyLicense(displayName, userId ?? null, defaultCountryCode()),
    )
  }

  const save = async (submit: boolean) => {
    if (!draft) return
    setSaving(true)
    setSaveError(null)
    try {
      await lic.save(draft, submit)
      setDraft(null)
    } catch (err) {
      setSaveError(messageOf(err))
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    lic.discardPreviews()
    setDraft(null)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── header ── */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Teach</h1>
        <p className="mt-1.5 text-base text-gray-500">Share what you master and teach others.</p>
      </div>

      {lic.loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
        </div>
      ) : lic.error ? (
        <p className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">Couldn&apos;t load your license: {lic.error}</p>
      ) : draft ? (
        /* ── editing: preview + form (preview above on mobile) ── */
        <>
          {lic.open?.status === 'pending' && (
            <p className="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              <Clock className="h-5 w-5 shrink-0" />
              This version is waiting for approval. Saving a draft pulls it back from review until you submit again.
            </p>
          )}
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
            <div className="lg:sticky lg:top-0">
              <p className="mb-3 text-xs font-semibold tracking-widest text-gray-400 uppercase">Live preview</p>
              <LicenseCard license={draft} />
            </div>
            <LicenseForm
              value={draft}
              onChange={setDraft}
              availableSkills={lic.skillOptions}
              createPreviewUrl={lic.createPreviewUrl}
              releasePreviewUrl={lic.releasePreviewUrl}
              onSaveDraft={() => void save(false)}
              onSubmit={() => void save(true)}
              onCancel={cancel}
              busy={saving}
              error={saveError}
            />
          </div>
        </>
      ) : lic.live || lic.open ? (
        <TeacherDashboard
          live={lic.live}
          open={lic.open}
          rejected={lic.rejected}
          onEdit={startEditing}
          onSubmitDraft={async () => {
            if (lic.open) await lic.save(lic.open.license, true)
          }}
          onWithdraw={lic.withdraw}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center gap-4 py-6 sm:py-12">
          {lic.rejected && (
            <p className="w-full max-w-2xl rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              Your license was not approved{lic.rejected.reason ? `: ${lic.rejected.reason}` : '.'} Fix it and submit again.
            </p>
          )}
          {lic.rejected ? (
            <button
              type="button"
              onClick={startEditing}
              className="cursor-pointer rounded-xl bg-purple-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-800"
            >
              Edit and resubmit
            </button>
          ) : (
            <EmptyLicenseState onCreate={startEditing} />
          )}
        </div>
      )}
    </div>
  )
}
