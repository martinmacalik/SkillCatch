import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Lock, MessageCircle, UserRound, Users, X, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/cn'
import { startDirectChat } from '@/lib/chat-queries'
import { isActiveNow, personName, type StudentOverview, type TeacherStudentStatus } from '@/lib/teacher-students-queries'

interface StudentsSectionProps {
  /** Only an approved license can receive students. */
  enabled: boolean
  requests: StudentOverview[]
  students: StudentOverview[]
  loading: boolean
  error: string | null
  now: number
  onSetStatus: (linkId: string, status: TeacherStudentStatus) => Promise<void>
}

/**
 * Requests to accept / decline. The students themselves live on the class pages
 * (one class per skill, see ClassesSection) — this section hides once there's
 * nothing to decide and you already have students.
 */
export function StudentsSection({ enabled, requests, students, loading, error, onSetStatus }: StudentsSectionProps) {
  if (enabled && !loading && !error && requests.length === 0 && students.length > 0) return null

  return (
    <section className="rounded-2xl bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">{requests.length > 0 ? 'New requests' : 'Your students'}</h3>
      </div>

      {!enabled ? (
        <EmptyBox icon={Lock}>
          Once your license is approved, students can find you on the pages of your skills and ask to learn with you.
        </EmptyBox>
      ) : loading ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
        </div>
      ) : error ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : (
        <>
          {requests.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {requests.map((r) => (
                <RequestRow key={r.link_id} row={r} onSetStatus={onSetStatus} />
              ))}
            </ul>
          )}

          {students.length === 0 && requests.length === 0 && (
            <EmptyBox icon={Users}>
              No students yet. They&apos;ll find you under &ldquo;Teachers&rdquo; on the pages of the skills on your
              license.
            </EmptyBox>
          )}
        </>
      )}
    </section>
  )
}

/* ── rows ── */

function Avatar({ row, online }: { row: StudentOverview; online?: boolean }) {
  return (
    <div className="relative shrink-0">
      {row.avatar_url ? (
        <img src={row.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-700">
          <UserRound className="h-5 w-5" />
        </div>
      )}
      {online && (
        <span
          className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500"
          title="Active now"
        />
      )}
    </div>
  )
}

function RequestRow({
  row,
  onSetStatus,
}: {
  row: StudentOverview
  onSetStatus: (linkId: string, status: TeacherStudentStatus) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const act = async (status: TeacherStudentStatus) => {
    setBusy(true)
    try {
      await onSetStatus(row.link_id, status)
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50/60 p-3">
      <Avatar row={row} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-medium text-gray-900">
          {personName(row)} <span className="font-normal text-gray-500">wants to learn</span> {row.skill_name}
        </p>
        {row.message && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">&ldquo;{row.message}&rdquo;</p>}
      </div>
      <div className="ml-auto flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void act('declined')}
          className="flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-white disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          Decline
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act('active')}
          className="flex cursor-pointer items-center gap-1 rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-purple-800 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          Accept
        </button>
      </div>
    </li>
  )
}

/** One active student (used on the class page). `extra` = e.g. open / returned assignment counts. */
export function StudentRow({ row, now, extra }: { row: StudentOverview; now: number; extra?: ReactNode }) {
  const navigate = useNavigate()
  const [opening, setOpening] = useState(false)
  const online = isActiveNow(row.last_active_at, now)
  const progress = row.items_total > 0 ? Math.round(((row.items_done ?? 0) / row.items_total) * 100) : null

  const openChat = async () => {
    setOpening(true)
    try {
      navigate(`/dashboard/chats/${await startDirectChat(row.student_id)}`)
    } finally {
      setOpening(false)
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <Avatar row={row} online={online} />

      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-semibold text-gray-900">{personName(row)}</p>
        <p className="truncate text-xs text-gray-500">
          {row.skill_name}
          {row.level_name && (
            <>
              {' · '}
              {row.level_name}
              {row.levels_total > 0 && row.level_index != null && ` (${row.level_index}/${row.levels_total})`}
            </>
          )}
        </p>
      </div>

      {/* progress through the skill's checklist */}
      <div className="w-32 shrink-0">
        {progress == null ? (
          <p className="text-xs text-gray-400">No checklist</p>
        ) : (
          <>
            <div className="flex justify-between text-[11px] text-gray-500">
              <span>Progress</span>
              <span className="font-semibold text-gray-700">{progress}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-linear-to-r from-violet-700 to-fuchsia-600" style={{ width: `${progress}%` }} />
            </div>
          </>
        )}
      </div>

      <div className="w-28 shrink-0 text-xs">
        <p className="font-semibold text-gray-700">{row.minutes_7d ?? 0} min</p>
        <p className="text-gray-400">this week</p>
      </div>

      <p className={cn('w-24 shrink-0 text-xs', online ? 'font-semibold text-emerald-600' : 'text-gray-400')}>
        {online ? 'Active now' : lastSeen(row.last_active_at, now)}
      </p>

      {extra}

      <button
        type="button"
        onClick={() => void openChat()}
        disabled={opening}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        Chat
      </button>
    </li>
  )
}

function lastSeen(iso: string | null, now: number): string {
  if (!iso) return 'Not today'
  const min = Math.round((now - new Date(iso).getTime()) / 60000)
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  return h < 24 ? `${h} h ago` : 'Yesterday'
}

function EmptyBox({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-6 py-8 text-center">
      <Icon className="h-6 w-6 text-gray-300" />
      <p className="max-w-sm text-sm text-gray-500">{children}</p>
    </div>
  )
}
