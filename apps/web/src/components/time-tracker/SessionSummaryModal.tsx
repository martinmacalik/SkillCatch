import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Flash } from 'reicon-react'
import { getMyProgressChecks, getProgressItems, type ProgressItem } from '@/lib/progress-queries'
import { errorMessage, formatClock, timerLog, type TimeSession } from '@/lib/timer-queries'

interface Props {
  session: TimeSession
  skillName: string
  onClose: () => void
}

// Shown after Stop: what you did, how long, XP earned + optional note and checklist items
export function SessionSummaryModal({ session, skillName, onClose }: Props) {
  const [items, setItems] = useState<ProgressItem[]>([])
  const [alreadyDone, setAlreadyDone] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getProgressItems(session.skill_node_id), getMyProgressChecks(session.skill_node_id)])
      .then(([list, done]) => { setItems(list); setAlreadyDone(done) })
      .catch(() => {}) // checklist is optional
  }, [session.skill_node_id])

  const openItems = items.filter(i => !alreadyDone.has(i.id))
  const duration = session.duration_seconds ?? 0

  function toggle(id: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!note.trim() && picked.size === 0) return onClose()
    setSaving(true)
    setError(null)
    try {
      await timerLog(session.id, note, [...picked])
      onClose()
    } catch (e) {
      setError(errorMessage(e, 'Could not save'))
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 text-gray-900 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Session done</p>
            <h2 className="mt-0.5 text-xl font-bold">{skillName}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Time</p>
            <p className="font-mono text-2xl font-semibold tabular-nums">{formatClock(duration)}</p>
          </div>
          <div className="rounded-xl bg-purple-50 p-3">
            <p className="text-xs text-purple-700">XP earned</p>
            <p className="flex items-center gap-1 text-2xl font-semibold text-purple-800">
              <Flash weight="Filled" className="nav-icon-active h-5 w-5" />+{session.xp_awarded}
            </p>
          </div>
        </div>
        {duration < 60 && <p className="-mt-2 text-xs text-gray-400">Sessions under a minute don't earn XP.</p>}
        {duration >= 4 * 3600 && <p className="-mt-2 text-xs text-gray-400">Sessions are capped at 4 hours.</p>}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Note <span className="font-normal text-gray-400">(optional)</span></span>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="What did you work on?"
            className="resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
          <span className="self-end text-[11px] text-gray-400">{note.length}/500</span>
        </label>

        {openItems.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">Did you finish something? <span className="font-normal text-gray-400">(optional)</span></p>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {openItems.map(item => {
                const on = picked.has(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.id)}
                    className="flex items-center gap-2.5 rounded-lg p-2 text-left text-sm transition hover:bg-gray-50"
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300'}`}>
                      {on && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      {item.text}
                      <span className="ml-1.5 text-xs text-gray-400">{item.section}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100">
            Skip
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-purple-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-purple-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
