import { useEffect, useState } from 'react'
import { fetchAssignment, formatDue, type Assignment } from '@/lib/teach-assignments-queries'
import { AttachmentList } from '@/components/teach/assignments/AttachmentList'
import { Modal } from '@/components/teach/assignments/Modal'
import { SubmissionThread } from '@/components/teach/assignments/SubmissionThread'

interface Props {
  assignmentId: string
  studentId: string
  /** names of my active teachers in this skill (to label the thread) */
  teacherNames: Map<string, string>
  onClose: () => void
  onChanged: () => void
}

/** Opened from the "Your teacher" card or a notification (?assignment=<id> on Learn). */
export function StudentAssignmentModal({ assignmentId, studentId, teacherNames, onClose, onChanged }: Props) {
  // undefined = loading, null = gone / no longer mine
  const [a, setA] = useState<Assignment | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    fetchAssignment(assignmentId)
      .then(x => { if (alive) setA(x) })
      .catch(() => { if (alive) setA(null) })
    return () => { alive = false }
  }, [assignmentId])

  if (a === null) {
    return (
      <Modal title="Assignment" onClose={onClose}>
        <p className="px-5 py-10 text-center text-sm text-gray-500">This assignment is no longer available.</p>
      </Modal>
    )
  }

  const teacherName = a ? teacherNames.get(a.teacher_id) ?? 'your teacher' : ''
  const late = !!a?.due_at && new Date(a.due_at) < new Date()

  return (
    <Modal title={a?.title ?? 'Loading…'} onClose={onClose}>
      {a && (
        <div className="flex flex-col gap-4 p-5">
          <div>
            <p className="text-xs text-gray-500">
              From {teacherName}
              {a.due_at && (
                <span className={late ? 'text-rose-600' : undefined}> · due {formatDue(a.due_at)}</span>
              )}
            </p>
            {a.instructions && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{a.instructions}</p>}
            <div className="mt-3">
              <AttachmentList items={a.attachments} />
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <SubmissionThread
              role="student"
              assignmentId={a.id}
              studentId={studentId}
              studentName="You"
              teacherName={teacherName}
              onChanged={onChanged}
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
