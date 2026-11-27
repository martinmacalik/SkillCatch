import { Pencil } from 'lucide-react'

import { useTeacherStudents } from '@/hooks/useTeacherStudents'
import { isActiveNow } from '@/lib/teacher-students-queries'
import type { OpenSubmission, RejectedSubmission } from '@/lib/license-queries'
import type { TeacherLicense } from '@/types/teaching'
import { LicenseCard } from '../LicenseCard'
import { StatusBadge } from '../StatusBadge'
import { LicenseSkillsPanel } from './LicenseSkillsPanel'
import { LicenseStatusBanner } from './LicenseStatusBanner'
import { ClassesSection } from './ClassesSection'
import { StudentsSection } from './StudentsSection'

interface TeacherDashboardProps {
  userId: string
  live: TeacherLicense | null
  open: OpenSubmission | null
  rejected: RejectedSubmission | null
  onEdit: () => void
  onSubmitDraft: () => Promise<void>
  onWithdraw: () => Promise<void>
  /** Reload after a proof of an approved skill changed. */
  onProofsChanged: () => Promise<void>
}

/**
 * The Teach page once a license exists (approved or waiting):
 *   status banner · your license (small, with Edit) · stats · students · materials
 */
export function TeacherDashboard({
  userId,
  live,
  open,
  rejected,
  onEdit,
  onSubmitDraft,
  onWithdraw,
  onProofsChanged,
}: TeacherDashboardProps) {
  // students can only come with an approved license
  const { requests, students, loading, error, now, setStatus } = useTeacherStudents(!!live)
  const activeNow = students.filter((s) => isActiveNow(s.last_active_at, now)).length

  // what students see; before the first approval, the submitted version
  const shown = live ?? open?.license ?? null
  if (!shown) return null

  return (
    <div className="flex flex-col gap-5">
      <LicenseStatusBanner
        hasLive={!!live}
        open={open}
        rejected={rejected}
        onEdit={onEdit}
        onSubmitDraft={onSubmitDraft}
        onWithdraw={onWithdraw}
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] 2xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* ── left: the license + its skills & proofs ── */}
        <div className="flex min-w-0 flex-col gap-5">
        <section className="flex flex-col gap-4 rounded-2xl bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-gray-900">Your license</h3>
            <StatusBadge status={shown.status} />
          </div>
          <LicenseCard license={shown} />
          <button
            type="button"
            onClick={onEdit}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-800"
          >
            <Pencil className="h-4 w-4" />
            Edit license
          </button>
          {live && (
            <p className="-mt-1 text-center text-xs text-gray-400">Changes go to review. Students see this version until then.</p>
          )}
        </section>

        <LicenseSkillsPanel userId={userId} live={live} open={open} onEdit={onEdit} onChanged={onProofsChanged} />
        </div>

        {/* ── right: requests + classes (materials library comes in phase 2) ── */}
        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Stat label="Students" value={live ? students.length : '–'} accent />
            <Stat label="Active now" value={live ? activeNow : '–'} />
            <Stat label="Requests" value={live ? requests.length : '–'} />
          </div>

          <StudentsSection
            enabled={!!live}
            requests={requests}
            students={students}
            loading={loading}
            error={error}
            now={now}
            onSetStatus={setStatus}
          />

          {live && <ClassesSection reloadKey={students.length} />}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return accent ? (
    <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-violet-950 to-fuchsia-700 p-3 text-white sm:p-4">
      <p className="text-[11px] font-medium sm:text-sm">{label}</p>
      <p className="relative mt-1 text-2xl font-medium sm:text-4xl">{value}</p>
    </div>
  ) : (
    <div className="rounded-2xl bg-white p-3 sm:p-4">
      <p className="text-[11px] font-medium text-gray-500 sm:text-sm">{label}</p>
      <p className="mt-1 text-2xl font-medium text-gray-900 sm:text-4xl">{value}</p>
    </div>
  )
}
