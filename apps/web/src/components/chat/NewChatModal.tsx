import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { displayName } from '@/lib/chat-queries'
import { usePeopleSearch } from '@/hooks/usePeopleSearch'
import { ChatAvatar } from './ChatAvatar'

interface Props {
  myId: string
  onPick: (userId: string) => Promise<void>
  onClose: () => void
}

export function NewChatModal({ myId, onPick, onClose }: Props) {
  const { query, search, people, loading, error: searchError } = usePeopleSearch(myId)
  const [pickingId, setPickingId] = useState<string | null>(null)
  const [pickError, setError] = useState<string | null>(null)
  const error = pickError ?? searchError

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pick = async (id: string) => {
    setPickingId(id)
    setError(null)
    try {
      await onPick(id)
    } catch {
      setError('Could not start the chat.')
      setPickingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-3xl bg-white p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">New chat</h2>
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

        {error && <p className="mb-2 text-sm text-red-500">{error}</p>}

        <div className="skills-scroll -mx-1 flex-1 overflow-y-auto px-1">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
            </div>
          ) : people.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No users found.</p>
          ) : (
            people.map(p => (
              <button
                key={p.id}
                onClick={() => pick(p.id)}
                disabled={pickingId !== null}
                className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-gray-50 disabled:opacity-50"
              >
                <ChatAvatar profile={p} className="h-10 w-10" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{displayName(p)}</p>
                  {p.username && <p className="text-xs text-gray-400">@{p.username}</p>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
