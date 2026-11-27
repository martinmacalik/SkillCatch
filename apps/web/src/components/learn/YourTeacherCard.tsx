import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Circle, CircleDot, GraduationCap, MessageCircle, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDue, type MyAssignmentRow, type SubmissionState } from '@/lib/teach-assignments-queries'

interface Props {
  teacherId: string
  name: string
  pictureUrl: string | null
  /** this teacher's assignments for me (already filtered) */
  assignments: MyAssignmentRow[] | null
  busy: boolean
  onChat: () => void
  onOpen: (assignmentId: string) => void
}

// returned first (needs you), then not started by due date, then waiting for review
const ORDER: Partial<Record<SubmissionState, number>> = { returned: 0, not_started: 1, submitted: 2 }

/** Student view: "your teacher" + your assignments from them. Never mentions other students. */
export function YourTeacherCard({ teacherId, name, pictureUrl, assignments, busy, onChat, onOpen }: Props) {
  const [showDone, setShowDone] = useState(false)
  const open = (assignments ?? [])
    .filter(a => a.state !== 'done')
    .sort((a, b) =>
      (ORDER[a.state] ?? 9) - (ORDER[b.state] ?? 9)
      || (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'))
  const done = (assignments ?? []).filter(a => a.state === 'done')

  return (
    <div className="rounded-2xl border border-purple-100 bg-white p-5">
      <p className="text-xs font-semibold tracking-widest text-purple-700 uppercase">Your teacher</p>
      <div className="mt-3 flex items-center gap-3">
        <Link to={`/dashboard/profile/${teacherId}`} className="flex min-w-0 flex-1 items-center gap-3">
          {pictureUrl ? (
            <img src={pictureUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700">
              <GraduationCap className="h-5 w-5" />
            </span>
          )}
          <span className="truncate text-sm font-semibold text-black">{name}</span>
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={onChat}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50"
        >
          <MessageCircle className="h-3 w-3" /> Chat
        </button>
      </div>

      <p className="mt-5 text-sm font-bold text-black">Assignments</p>
      {assignments === null ? (
        <p className="mt-2 text-xs text-gray-400">Loading…</p>
      ) : assignments.length === 0 ? (
        <p className="mt-2 text-xs text-gray-400">No assignments yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {open.length === 0 && <li className="py-1.5 text-xs text-gray-400">All done 🎉</li>}
          {open.map(a => <Row key={a.id} a={a} onOpen={onOpen} />)}
          {done.length > 0 && (
            <>
              <li>
                <button onClick={() => setShowDone(v => !v)} className="mt-1 text-xs font-medium text-gray-400 hover:text-gray-700">
                  {showDone ? 'Hide done' : `Show done (${done.length})`}
                </button>
              </li>
              {showDone && done.map(a => <Row key={a.id} a={a} onOpen={onOpen} />)}
            </>
          )}
        </ul>
      )}
    </div>
  )
}

function Row({ a, onOpen }: { a: MyAssignmentRow; onOpen: (id: string) => void }) {
  const icon = {
    returned: <RotateCcw className="h-3.5 w-3.5 text-amber-600" />,
    not_started: <CircleDot className="h-3.5 w-3.5 text-purple-600" />,
    submitted: <Circle className="h-3.5 w-3.5 text-gray-400" />,
    done: <Check className="h-3.5 w-3.5 text-emerald-600" />,
  }[a.state as 'returned' | 'not_started' | 'submitted' | 'done']

  const sub =
    a.state === 'returned' ? 'Returned · fix it'
    : a.state === 'submitted' ? 'Submitted'
    : a.state === 'done' ? 'Done'
    : a.due_at ? `Due ${formatDue(a.due_at)}`
    : 'No due date'

  return (
    <li>
      <button
        onClick={() => onOpen(a.id)}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-gray-50"
      >
        {icon}
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm', a.state === 'done' ? 'text-gray-400' : 'text-gray-900')}>{a.title}</span>
          <span className={cn('block text-[11px]', a.late ? 'font-semibold text-rose-600' : a.state === 'returned' ? 'text-amber-700' : 'text-gray-400')}>
            {sub}{a.late && a.state !== 'returned' && a.state !== 'submitted' ? ' · late' : ''}
          </span>
        </span>
      </button>
    </li>
  )
}
