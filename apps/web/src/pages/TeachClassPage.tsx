import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, Plus, Users } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useTeacherStudents } from '@/hooks/useTeacherStudents'
import {
  fetchClassAssignments,
  fetchClassesOverview,
  fetchClassStudentsSummary,
  formatDue,
  type ClassAssignmentRow,
  type ClassOverview,
  type StudentSummary,
} from '@/lib/teach-assignments-queries'
import { StudentRow } from '@/components/teach/dashboard/StudentsSection'
import { AssignmentDetailModal } from '@/components/teach/assignments/AssignmentDetailModal'
import { AssignmentFormModal } from '@/components/teach/assignments/AssignmentFormModal'

type Tab = 'assignments' | 'students'

/**
 * One class = the teacher's active students in one skill.
 * URL: ?tab=students, ?assignment=<id>[&student=<id>] (notification links open the detail).
 */
export default function TeachClassPage() {
  const { skillId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'students' ? 'students' : 'assignments'
  const openId = params.get('assignment')
  const openStudent = params.get('student')

  const { students: allStudents, now } = useTeacherStudents(true)
  const students = useMemo(() => allStudents.filter(s => s.skill_node_id === skillId), [allStudents, skillId])

  const [info, setInfo] = useState<ClassOverview | null | undefined>(undefined)
  const [rows, setRows] = useState<ClassAssignmentRow[] | null>(null)
  const [summary, setSummary] = useState<Map<string, StudentSummary>>(new Map())
  const [onlyReview, setOnlyReview] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // bump to reload (after create / review / delete)
  const [version, setVersion] = useState(0)
  const load = () => setVersion(v => v + 1)

  useEffect(() => {
    let alive = true
    Promise.all([fetchClassesOverview(), fetchClassAssignments(skillId), fetchClassStudentsSummary(skillId)])
      .then(([classes, list, sum]) => {
        if (!alive) return
        setInfo(classes.find(c => c.skill_node_id === skillId) ?? null)
        setRows(list)
        setSummary(sum)
        setError(null)
      })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not load the class.') })
    return () => { alive = false }
  }, [skillId, version])

  const setParam = (changes: Record<string, string | null>) =>
    setParams(p => {
      const next = new URLSearchParams(p)
      for (const [k, v] of Object.entries(changes)) {
        if (v === null) next.delete(k)
        else next.set(k, v)
      }
      return next
    })

  if (info === null) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <BackLink />
        <p className="mt-6 rounded-2xl bg-white p-8 text-center text-sm text-gray-500">You don’t teach this skill.</p>
      </div>
    )
  }

  const shown = (rows ?? []).filter(r => !onlyReview || r.to_review > 0)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <BackLink />

      <header className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-5">
        {info?.skill_image_url && <img src={info.skill_image_url} alt="" className="h-12 w-12 rounded-xl object-cover" />}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-gray-900">{info?.skill_name ?? '…'}</h1>
          <p className="text-sm text-gray-500">
            {students.length} {students.length === 1 ? 'student' : 'students'}
            {info && info.to_review > 0 && <span className="font-semibold text-rose-600"> · {info.to_review} to review</span>}
          </p>
        </div>
        {info?.licensed ? (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-800"
          >
            <Plus className="h-4 w-4" /> New assignment
          </button>
        ) : info ? (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            Not on your license: you can review, but not add assignments
          </span>
        ) : null}
      </header>

      <div className="flex gap-1 rounded-xl bg-white p-1 sm:w-fit">
        {([['assignments', 'Assignments', ClipboardList], ['students', 'Students', Users]] as const).map(([t, label, Icon]) => (
          <button
            key={t}
            onClick={() => setParam({ tab: t === 'assignments' ? null : t })}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm transition sm:flex-none',
              tab === t ? 'bg-gray-900 font-semibold text-white' : 'text-gray-600 hover:bg-gray-100',
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {tab === 'assignments' ? (
        <section className="rounded-2xl bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex-1 text-base font-semibold text-gray-900">Assignments</h2>
            <button
              onClick={() => setOnlyReview(v => !v)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold transition',
                onlyReview ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600 hover:bg-rose-100',
              )}
            >
              To review
            </button>
          </div>
          {rows === null ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              {onlyReview ? 'Nothing waiting for review.' : 'No assignments yet.'}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {shown.map(r => {
                const past = !!r.due_at && new Date(r.due_at) < new Date()
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => setParam({ assignment: r.id, student: null })}
                      className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-3 text-left transition hover:bg-gray-50"
                    >
                      <span className="min-w-0 flex-1 basis-48 truncate text-sm font-medium text-gray-900">{r.title}</span>
                      <span className={cn('text-xs', past ? 'text-rose-600' : 'text-gray-500')}>
                        {r.due_at ? `Due ${formatDue(r.due_at)}` : 'No due date'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {r.submitted}/{r.recipients} submitted
                      </span>
                      {r.to_review > 0 && (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">
                          {r.to_review} to review
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : (
        <section className="rounded-2xl bg-white p-5">
          <h2 className="mb-1 text-base font-semibold text-gray-900">Students</h2>
          {students.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No students in this class yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {students.map(s => {
                const sum = summary.get(s.student_id)
                return (
                  <StudentRow
                    key={s.link_id}
                    row={s}
                    now={now}
                    extra={
                      sum && (sum.open > 0 || sum.returned > 0 || sum.to_review > 0) ? (
                        <span className="flex gap-1.5 text-[11px] font-semibold">
                          {sum.to_review > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-600">{sum.to_review} to review</span>}
                          {sum.returned > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{sum.returned} returned</span>}
                          {sum.open > 0 && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">{sum.open} open</span>}
                        </span>
                      ) : null
                    }
                  />
                )
              })}
            </ul>
          )}
        </section>
      )}

      {creating && (
        <AssignmentFormModal
          skillNodeId={skillId}
          students={students}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load() }}
        />
      )}

      {openId && (
        <AssignmentDetailModal
          key={openId}
          assignmentId={openId}
          skillNodeId={skillId}
          students={students}
          licensed={!!info?.licensed}
          teacherName="You"
          initialStudentId={openStudent}
          onClose={() => setParam({ assignment: null, student: null })}
          onChanged={load}
        />
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/dashboard/teach" className="flex w-fit items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-900">
      <ArrowLeft className="h-4 w-4" /> Teach
    </Link>
  )
}
