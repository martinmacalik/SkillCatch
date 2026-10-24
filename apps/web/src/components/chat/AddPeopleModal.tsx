import { useEffect, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { displayName, type ChatProfile } from '@/lib/chat-queries'
import { usePeopleSearch } from '@/hooks/usePeopleSearch'
import { ChatAvatar } from './ChatAvatar'

interface Props {
  myId: string
  title: string
  confirmLabel: string
  excludeIds: string[] // already in the chat + blocked → not offered
  onConfirm: (people: ChatProfile[]) => Promise<void>
  onClose: () => void
}

// Search + multi-select. The confirm button is the confirmation step.
export function AddPeopleModal({ myId, title, confirmLabel, excludeIds, onConfirm, onClose }: Props) {
  const { query, search, people, loading, error: searchError } = usePeopleSearch(myId)
  const [selected, setSelected] = useState<ChatProfile[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const error = saveError ?? searchError

  const offered = people.filter(p => !excludeIds.includes(p.id))
  const isSelected = (id: string) => selected.some(p => p.id === id)
  const toggle = (p: ChatProfile) =>
    setSelected(s => (isSelected(p.id) ? s.filter(x => x.id !== p.id) : [...s, p]))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const confirm = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await onConfirm(selected)
    } catch {
      setSaveError('Could not add people. Try again.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-3xl bg-white p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 transition hover:bg-gray-100" title="Close">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus
            value={query}
            onChange={e => search(e.target.value)}
            placeholder="Search by name or username"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-700 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
          />
        </div>

        {/* chosen people as removable chips */}
        {selected.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {selected.map(p => (
              <button
                key={p.id}
                onClick={() => toggle(p)}
                className="flex items-center gap-1 rounded-full bg-purple-50 py-1 pl-1 pr-2 text-xs font-medium text-purple-700 transition hover:bg-purple-100"
              >
                <ChatAvatar profile={p} className="h-5 w-5" />
                {displayName(p)}
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}

        {error && <p className="mb-2 text-sm text-red-500">{error}</p>}

        <div className="skills-scroll -mx-1 flex-1 overflow-y-auto px-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
            </div>
          ) : offered.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No users found.</p>
          ) : (
            offered.map(p => (
              <button
                key={p.id}
                onClick={() => toggle(p)}
                className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-gray-50"
              >
                <ChatAvatar profile={p} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900">{displayName(p)}</p>
                  {p.username && <p className="text-xs text-gray-400">@{p.username}</p>}
                </div>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                    isSelected(p.id) ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300'
                  }`}
                >
                  {isSelected(p.id) && <Check className="h-3 w-3" />}
                </span>
              </button>
            ))
          )}
        </div>

        <button
          onClick={() => void confirm()}
          disabled={selected.length === 0 || saving}
          className="mt-4 rounded-full bg-gray-900 py-2.5 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-30"
        >
          {saving ? 'Saving…' : selected.length > 0 ? `${confirmLabel} (${selected.length})` : confirmLabel}
        </button>
      </div>
    </div>
  )
}
