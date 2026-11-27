import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { personName, type StudentOverview } from '@/lib/teacher-students-queries'
import {
  createAssignment,
  deleteAssignment,
  newAssignmentId,
  updateAssignment,
  uploadTeachFile,
  type Assignment,
  type Attachment,
  type Audience,
} from '@/lib/teach-assignments-queries'
import { AttachmentEditor } from './AttachmentEditor'
import { Modal } from './Modal'

interface Props {
  skillNodeId: string
  /** active students of this class, for "Selected students" */
  students: StudentOverview[]
  /** editing: the assignment + its picked students */
  initial?: Assignment & { student_ids: string[] }
  onClose: () => void
  onSaved: (id: string) => void
  onDeleted?: () => void
}

// <input type="datetime-local"> works in local time without a zone
const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AssignmentFormModal({ skillNodeId, students, initial, onClose, onSaved, onDeleted }: Props) {
  // the id exists before saving, so files upload straight into {id}/teacher/
  const [id] = useState(() => initial?.id ?? newAssignmentId())
  const [title, setTitle] = useState(initial?.title ?? '')
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [due, setDue] = useState(initial?.due_at ? toLocalInput(initial.due_at) : '')
  const [audience, setAudience] = useState<Audience>(initial?.audience ?? 'group')
  const [picked, setPicked] = useState<string[]>(initial?.student_ids ?? [])
  const [attachments, setAttachments] = useState<Attachment[]>(initial?.attachments ?? [])
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = title.trim().length > 0 && (audience === 'group' || picked.length > 0)

  const save = async () => {
    setBusy(true)
    setError(null)
    const input = {
      title,
      instructions,
      due_at: due ? new Date(due).toISOString() : null,
      audience,
      student_ids: picked,
      attachments,
    }
    try {
      if (initial) await updateAssignment(id, input)
      else await createAssignment(id, skillNodeId, input)
      onSaved(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!initial || !confirm('Delete this assignment and everything students handed in for it?')) return
    setBusy(true)
    try {
      await deleteAssignment(initial.id)
      onDeleted?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.')
      setBusy(false)
    }
  }

  const toggle = (sid: string) => setPicked(p => (p.includes(sid) ? p.filter(x => x !== sid) : [...p, sid]))

  return (
    <Modal title={initial ? 'Edit assignment' : 'New assignment'} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-500">Title</span>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value.slice(0, 120))}
            placeholder="e.g. Practice chords G – C – D"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-500">Instructions</span>
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value.slice(0, 5000))}
            rows={5}
            placeholder="What should they do, and what should they hand in?"
            className="resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400"
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-500">Materials</span>
          <AttachmentEditor
            items={attachments}
            onChange={setAttachments}
            upload={f => uploadTeachFile(id, 'teacher', f)}
            disabled={busy}
            onBusyChange={setUploading}
          />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-500">Due (optional)</span>
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={due}
              onChange={e => setDue(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400"
            />
            {due && (
              <button type="button" onClick={() => setDue('')} className="text-xs text-gray-400 hover:text-gray-700">
                No due date
              </button>
            )}
          </div>
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-gray-500">For</span>
          <div className="flex gap-2">
            {(['group', 'students'] as const).map(a => (
              <button
                key={a}
                type="button"
                onClick={() => setAudience(a)}
                className={cn(
                  'rounded-xl border px-3 py-1.5 text-sm transition',
                  audience === a ? 'border-purple-600 bg-purple-50 font-semibold text-purple-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                )}
              >
                {a === 'group' ? 'Whole class' : 'Selected students'}
              </button>
            ))}
          </div>
          {audience === 'group' ? (
            <p className="text-xs text-gray-400">Everyone in this class, including students who join later.</p>
          ) : students.length === 0 ? (
            <p className="text-xs text-gray-400">No students in this class yet.</p>
          ) : (
            <div className="flex max-h-48 flex-col overflow-y-auto rounded-xl border border-gray-100">
              {students.map(s => (
                <label key={s.student_id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={picked.includes(s.student_id)}
                    onChange={() => toggle(s.student_id)}
                    className="h-4 w-4 accent-purple-700"
                  />
                  {personName(s)}
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
          {initial && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-gray-500 transition hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
          <button type="button" onClick={onClose} className="ml-auto rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || busy || uploading}
            onClick={() => void save()}
            className="rounded-xl bg-purple-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-800 disabled:opacity-40"
          >
            {busy ? 'Saving…' : initial ? 'Save' : 'Assign'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
