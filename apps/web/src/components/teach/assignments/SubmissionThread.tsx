import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock, Loader2, RotateCcw, Send } from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  commentSubmission,
  fetchSubmissionThread,
  reviewSubmission,
  submitAssignment,
  uploadTeachFile,
  type Attachment,
  type Submission,
  type SubmissionEntry,
} from '@/lib/teach-assignments-queries'
import { AttachmentEditor } from './AttachmentEditor'
import { AttachmentList } from './AttachmentList'

interface Props {
  role: 'teacher' | 'student'
  assignmentId: string
  studentId: string
  studentName: string
  teacherName: string
  /** student left / was removed: history only */
  readOnly?: boolean
  /** after any write, so lists around can refresh their state pills */
  onChanged?: () => void
}

/**
 * One student's work on one assignment: the append-only thread + whatever the
 * viewer can do next. State: no row = not started → submitted → returned ↺ → done.
 */
export function SubmissionThread({ role, assignmentId, studentId, studentName, teacherName, readOnly, onChanged }: Props) {
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [entries, setEntries] = useState<SubmissionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const t = await fetchSubmissionThread(assignmentId, studentId)
      setSubmission(t.submission)
      setEntries(t.entries)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.')
    } finally {
      setLoading(false)
    }
  }, [assignmentId, studentId])

  useEffect(() => {
    void load()
  }, [load])

  // every write: reload the thread, tell the parent; errors stay inline
  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
      await load()
      onChanged?.()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      return false
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
      </div>
    )
  }

  const status = submission?.status ?? 'not_started'
  const nameOf = (authorId: string) =>
    authorId === studentId ? (role === 'student' ? 'You' : studentName) : role === 'teacher' ? 'You' : teacherName

  return (
    <div className="flex flex-col gap-3">
      {entries.length === 0 && role === 'teacher' && (
        <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">Nothing submitted yet.</p>
      )}

      {entries.map(e => (
        <Entry key={e.id} entry={e} name={nameOf(e.author_id)} mine={nameOf(e.author_id) === 'You'} />
      ))}

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {!readOnly && (
        <>
          {role === 'student' && (status === 'not_started' || status === 'returned') && (
            <SubmitForm
              assignmentId={assignmentId}
              studentId={studentId}
              again={status === 'returned'}
              onSubmit={(body, att) => run(() => submitAssignment(assignmentId, body, att))}
            />
          )}

          {role === 'student' && status === 'submitted' && (
            <Banner tone="wait">Submitted. Waiting for {teacherName}’s feedback.</Banner>
          )}
          {status === 'done' && (
            <Banner tone="done">{role === 'student' ? 'Done! Nice work.' : 'Marked done.'}</Banner>
          )}

          {role === 'teacher' && status === 'submitted' && submission && (
            <ReviewForm onReview={(d, c) => run(() => reviewSubmission(submission.id, d, c))} />
          )}

          {/* talk any time once there's a submission (not over a pending review form) */}
          {submission && !(role === 'teacher' && status === 'submitted') && (
            <CommentBox onSend={body => run(() => commentSubmission(submission.id, body))} />
          )}
        </>
      )}
      {readOnly && <p className="text-center text-xs text-gray-400">Read only: this student is no longer on this assignment.</p>}
    </div>
  )
}

// ── pieces ────────────────────────────────────────────────────────────────

function Entry({ entry, name, mine }: { entry: SubmissionEntry; name: string; mine: boolean }) {
  const when = new Date(entry.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  if (entry.kind === 'review') {
    const done = entry.decision === 'done'
    return (
      <div className={cn('rounded-xl px-4 py-3', done ? 'bg-emerald-50' : 'bg-amber-50')}>
        <p className={cn('flex items-center gap-1.5 text-sm font-semibold', done ? 'text-emerald-700' : 'text-amber-700')}>
          {done ? <CheckCircle2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
          {done ? 'Marked done' : 'Returned for changes'}
          <span className="ml-auto text-[11px] font-normal text-gray-400">{when}</span>
        </p>
        {entry.body && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{entry.body}</p>}
      </div>
    )
  }

  if (entry.kind === 'comment') {
    return (
      <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
        <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2', mine ? 'bg-purple-50' : 'bg-gray-100')}>
          <p className="text-[11px] text-gray-500">{name} · {when}</p>
          <p className="whitespace-pre-wrap text-sm text-gray-800">{entry.body}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
        <Send className="h-3.5 w-3.5" /> {name} submitted
        <span className="ml-auto font-normal text-gray-400">{when}</span>
      </p>
      {entry.body && <p className="mb-2 whitespace-pre-wrap text-sm text-gray-800">{entry.body}</p>}
      <AttachmentList items={entry.attachments} />
    </div>
  )
}

function Banner({ tone, children }: { tone: 'wait' | 'done'; children: React.ReactNode }) {
  return (
    <p className={cn(
      'flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium',
      tone === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-600',
    )}>
      {tone === 'done' ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
      {children}
    </p>
  )
}

function SubmitForm({ assignmentId, studentId, again, onSubmit }: {
  assignmentId: string
  studentId: string
  again: boolean
  onSubmit: (body: string, attachments: Attachment[]) => Promise<boolean>
}) {
  const [body, setBody] = useState('')
  const [att, setAtt] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const empty = !body.trim() && att.length === 0

  const submit = async () => {
    setBusy(true)
    if (await onSubmit(body, att)) { setBody(''); setAtt([]) }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3">
      <p className="text-sm font-semibold text-gray-900">{again ? 'Send a fixed version' : 'Your work'}</p>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value.slice(0, 5000))}
        rows={3}
        placeholder={again ? 'What did you change?' : 'Write your answer or a note for your teacher…'}
        className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400"
      />
      <AttachmentEditor
        items={att}
        onChange={setAtt}
        upload={f => uploadTeachFile(assignmentId, studentId, f)}
        disabled={busy}
        onBusyChange={setUploading}
      />
      <button
        type="button"
        disabled={empty || busy || uploading}
        onClick={() => void submit()}
        className="self-end rounded-xl bg-purple-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-800 disabled:opacity-40"
      >
        {busy ? 'Sending…' : again ? 'Resubmit' : 'Submit'}
      </button>
    </div>
  )
}

function ReviewForm({ onReview }: { onReview: (decision: 'done' | 'returned', comment: string) => Promise<boolean> }) {
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const review = async (d: 'done' | 'returned') => {
    setBusy(true)
    if (await onReview(d, comment)) setComment('')
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3">
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value.slice(0, 5000))}
        rows={3}
        placeholder="Feedback (needed when you return it)"
        className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={busy || !comment.trim()}
          onClick={() => void review('returned')}
          title={comment.trim() ? undefined : 'Write what to fix first'}
          className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" /> Return
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void review('done')}
          className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40"
        >
          <CheckCircle2 className="h-4 w-4" /> Mark done
        </button>
      </div>
    </div>
  )
}

function CommentBox({ onSend }: { onSend: (body: string) => Promise<boolean> }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (!body.trim()) return
    setBusy(true)
    if (await onSend(body)) setBody('')
    setBusy(false)
  }

  return (
    <div className="flex items-end gap-2">
      <textarea
        value={body}
        onChange={e => setBody(e.target.value.slice(0, 5000))}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
        rows={1}
        placeholder="Add a comment…"
        className="min-h-9 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400"
      />
      <button
        type="button"
        disabled={busy || !body.trim()}
        onClick={() => void send()}
        title="Send"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white transition hover:bg-gray-700 disabled:opacity-30"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  )
}
