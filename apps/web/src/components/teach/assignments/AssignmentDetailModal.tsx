import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, UserRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import { personName, type StudentOverview } from '@/lib/teacher-students-queries'
import {
  fetchAssignment,
  fetchAssignmentProgress,
  fetchAssignmentStudents,
  formatDue,
  STATE_LABELS,
  type Assignment,
  type ProgressRow,
} from '@/lib/teach-assignments-queries'
import { AssignmentFormModal } from './AssignmentFormModal'
import { AttachmentList } from './AttachmentList'
import { Modal } from './Modal'
import { SubmissionThread } from './SubmissionThread'
import { STATE_PILL } from './state-styles'

interface Props {
  assignmentId: string
  skillNodeId: string
  students: StudentOverview[]
  licensed: boolean
  teacherName: string
  /** open this student's thread right away (notification link) */
  initialStudentId?: string | null
  onClose: () => void
  /** something changed (review, edit, delete): the class list refreshes */
  onChanged: () => void
}

/** Teacher: the assignment, who's where, and one student's thread next to it. */
export function AssignmentDetailModal({
  assignmentId, skillNodeId, students, licensed, teacherName, initialStudentId, onClose, onChanged,
}: Props) {
  const [assignment, setAssignment] = useState<Assignment | null | undefined>(undefined)
  const [rows, setRows] = useState<ProgressRow[]>([])
  const [selected, setSelected] = useState<string | null>(initialStudentId ?? null)
  const [editing, setEditing] = useState<(Assignment & { student_ids: string[] }) | null>(null)

  // bump to reload (after a review / edit)
  const [version, setVersion] = useState(0)
  const load = () => setVersion(v => v + 1)

  useEffect(() => {
    let alive = true
    Promise.all([fetchAssignment(assignmentId), fetchAssignmentProgress(assignmentId)])
      .then(([a, p]) => { if (alive) { setAssignment(a); setRows(p) } })
      .catch(() => { if (alive) setAssignment(null) })
    return () => { alive = false }
  }, [assignmentId, version])

  // with no student picked, start at the first one waiting for review
  const current = selected ?? rows.find(r => r.state === 'submitted')?.student_id ?? null
  const row = rows.find(r => r.student_id === current) ?? null
  const queue = rows.filter(r => r.state === 'submitted')
  const qi = queue.findIndex(r => r.student_id === current)
  const step = (d: 1 | -1) => {
    if (queue.length === 0) return
    const next = qi === -1 ? 0 : (qi + d + queue.length) % queue.length
    setSelected(queue[next].student_id)
  }

  const startEdit = async () => {
    if (!assignment) return
    const ids = assignment.audience === 'students' ? await fetchAssignmentStudents(assignment.id) : []
    // a picked student who has since left can't be shown (or unticked) in the form,
    // and update_assignment rejects non-active ids → keep only current students
    setEditing({ ...assignment, student_ids: ids.filter(id => students.some(s => s.student_id === id)) })
  }

  if (assignment === null) {
    return (
      <Modal title="Assignment" onClose={onClose}>
        <p className="px-5 py-10 text-center text-sm text-gray-500">This assignment is no longer available.</p>
      </Modal>
    )
  }

  return (
    <>
      <Modal
        wide
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <span className="truncate">{assignment?.title ?? 'Loading…'}</span>
            {assignment && licensed && (
              <button onClick={() => void startEdit()} title="Edit" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        }
      >
        {assignment && (
          <div className="grid min-h-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {/* left: brief + students */}
            <div className={cn('flex flex-col gap-4 border-gray-100 p-5 lg:border-r', row && 'hidden lg:flex')}>
              <div>
                <p className={cn('text-xs', assignment.due_at && new Date(assignment.due_at) < new Date() ? 'text-rose-600' : 'text-gray-500')}>
                  {assignment.due_at ? `Due ${formatDue(assignment.due_at)}` : 'No due date'} ·{' '}
                  {assignment.audience === 'group' ? 'Whole class' : 'Selected students'}
                </p>
                {assignment.instructions && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{assignment.instructions}</p>
                )}
                <div className="mt-3">
                  <AttachmentList items={assignment.attachments} />
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold tracking-widest text-gray-400 uppercase">Students</p>
                {rows.length === 0 ? (
                  <p className="text-sm text-gray-400">No students in this class yet.</p>
                ) : (
                  <ul className="flex flex-col">
                    {rows.map(r => (
                      <li key={r.student_id}>
                        <button
                          onClick={() => setSelected(r.student_id)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-gray-50',
                            r.student_id === current && 'bg-purple-50 hover:bg-purple-50',
                            (r.state === 'left' || r.state === 'removed') && 'opacity-60',
                          )}
                        >
                          {r.avatar_url ? (
                            <img src={r.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700">
                              <UserRound className="h-3.5 w-3.5" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{personName(r)}</span>
                          {r.late && <span className="text-[10px] font-semibold text-rose-500">late</span>}
                          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', STATE_PILL[r.state])}>
                            {STATE_LABELS[r.state]}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* right: the selected student's thread */}
            <div className={cn('flex-col gap-3 p-5', row ? 'flex' : 'hidden lg:flex')}>
              {row ? (
                <>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelected(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 lg:hidden" title="Back">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{personName(row)}</p>
                    {queue.length > 0 && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <button onClick={() => step(-1)} className="rounded-lg p-1 hover:bg-gray-100" title="Previous to review">
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        {qi === -1 ? `${queue.length} to review` : `${qi + 1} / ${queue.length} to review`}
                        <button onClick={() => step(1)} className="rounded-lg p-1 hover:bg-gray-100" title="Next to review">
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <SubmissionThread
                    key={row.student_id}
                    role="teacher"
                    assignmentId={assignment.id}
                    studentId={row.student_id}
                    studentName={personName(row)}
                    teacherName={teacherName}
                    readOnly={row.state === 'left' || row.state === 'removed'}
                    onChanged={() => { load(); onChanged() }}
                  />
                </>
              ) : (
                <p className="py-10 text-center text-sm text-gray-400">Pick a student to see their work.</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {editing && (
        <AssignmentFormModal
          skillNodeId={skillNodeId}
          students={students}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); onChanged() }}
          onDeleted={() => { setEditing(null); onChanged(); onClose() }}
        />
      )}
    </>
  )
}
