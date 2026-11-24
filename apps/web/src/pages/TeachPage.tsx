import { useEffect, useMemo, useState } from 'react'
import { Clock } from 'lucide-react'

import { useAuth } from '@/contexts/AuthProvider'
import { supabase } from '@/lib/supabaseClient'
import { onAppEvent } from '@/lib/app-events'
import { useTeacherLicense } from '@/hooks/useTeacherLicense'
import type { TeacherLicense } from '@/types/teaching'
import { EmptyLicenseState } from '@/components/teach/EmptyLicenseState'
import { LicenseCard } from '@/components/teach/LicenseCard'
import { LicenseForm } from '@/components/teach/LicenseForm'
import { TeacherDashboard } from '@/components/teach/dashboard/TeacherDashboard'
import { emptyLicense } from '@/components/teach/teach-utils'
import { defaultCountryCode } from '@/data/countries'

/**
 * Name on the card = the name used everywhere else in the app (TopBar, chats):
 * profiles first + last name, then username, then the sign-in metadata.
 * null until the profile is loaded, so the license isn't fetched twice.
 */
function useDisplayName(): string | null {
  const { session } = useAuth()
  const userId = session?.user.id
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    const meta = session?.user.user_metadata as Record<string, unknown> | undefined
    const fallback =
      ['full_name', 'name', 'username'].map((k) => meta?.[k]).find((v): v is string => typeof v === 'string' && !!v.trim())?.trim() ??
      session?.user.email?.split('@')[0] ??
      'Your name'

    const load = () =>
      supabase
        .from('profiles')
        .select('first_name, last_name, username')
        .eq('id', userId)
        .maybeSingle()
        .then(({ data }) => {
          const full = [data?.first_name, data?.last_name].filter(Boolean).join(' ').trim()
          setName(full || data?.username || fallback)
        })
    void load()
    // name changed in Settings
    return onAppEvent('profile:refresh', () => void load())
  }, [userId, session])

  return name
}

function messageOf(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') return err.message
  return 'Something went wrong.'
}

export default function TeachPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const profileName = useDisplayName()
  const displayName = profileName ?? ''
  // wait for the name: it's baked into the license objects
  const lic = useTeacherLicense(profileName === null ? undefined : userId, displayName)

  // Working copy while editing; null = not editing. Nothing in the database
  // changes until Save draft / Submit, so Cancel just drops it.
  const [draft, setDraft] = useState<TeacherLicense | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // continue the open draft / pending change, else fix the rejected one, else
  // start from the approved license, else from scratch
  const startEditing = () => {
    setSaveError(null)
    const base =
      lic.open?.license ?? lic.rejected?.license ?? lic.live ?? emptyLicense(displayName, userId ?? null, defaultCountryCode())
    // approved skills: proofs are managed under the license, so take the current ones;
    // skills left out by the admin are being fixed: show them in the preview again
    const liveById = new Map((lic.live?.skills ?? []).map((s) => [s.skillNodeId, s]))
    setDraft({
      ...base,
      skills: base.skills.map((s) => {
        const live = liveById.get(s.skillNodeId)
        if (live?.status === 'approved') return { ...s, evidence: live.evidence }
        return s.status === 'rejected' ? { ...s, status: 'draft' } : s
      }),
    })
  }

  // per-skill result of the last review, for the form
  const liveSkillReview = useMemo(
    () =>
      new Map(
        (lic.live?.skills ?? []).map((s) => [
          s.skillNodeId,
          { status: s.status === 'rejected' ? ('rejected' as const) : ('approved' as const), reason: s.rejectionReason ?? null },
        ]),
      ),
    [lic.live],
  )

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
              liveSkillReview={liveSkillReview}
            />
          </div>
        </>
      ) : (lic.live || lic.open) && userId ? (
        <TeacherDashboard
          userId={userId}
          live={lic.live}
          open={lic.open}
          rejected={lic.rejected}
          onEdit={startEditing}
          onSubmitDraft={async () => {
            if (lic.open) await lic.save(lic.open.license, true)
          }}
          onWithdraw={lic.withdraw}
          onProofsChanged={lic.reload}
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
