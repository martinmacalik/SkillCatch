import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Plus, X } from 'lucide-react'
import { displayName, formatChatTime, type ConversationSummary } from '@/lib/chat-queries'
import { ChatAvatar } from './ChatAvatar'

interface Props {
  requests: ConversationSummary[]
  conversations: ConversationSummary[]
  activeId: string | undefined
  loading: boolean
  error: string | null
  filter: string
  onAccept: (id: string) => Promise<void>
  onDecline: (id: string) => Promise<void>
  onNewChat: () => void
}

function matches(c: ConversationSummary, filter: string) {
  const q = filter.trim().toLowerCase()
  if (!q) return true
  return displayName(c.other).toLowerCase().includes(q) || !!c.other?.username?.toLowerCase().includes(q)
}

export function ConversationList({
  requests, conversations, activeId, loading, error, filter, onAccept, onDecline, onNewChat,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const shownRequests = requests.filter(c => matches(c, filter))
  const shownConversations = conversations.filter(c => matches(c, filter))

  const run = async (id: string, action: (id: string) => Promise<void>) => {
    setBusyId(id)
    try { await action(id) } finally { setBusyId(null) }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-1 pb-3">
        <h1 className="text-2xl font-bold text-gray-900">Chats</h1>
        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 rounded-full bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
        >
          <Plus className="h-4 w-4" />
          New chat
        </button>
      </div>

      <div className="skills-scroll flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
          </div>
        ) : error ? (
          <p className="py-12 text-center text-sm text-red-500">{error}</p>
        ) : (
          <>
            {shownRequests.length > 0 && (
              <section className="mb-4">
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Chat requests
                </p>
                <div className="flex flex-col gap-2">
                  {shownRequests.map(c => (
                    <div
                      key={c.id}
                      className={`flex items-center gap-3 rounded-2xl bg-white p-3 ${
                        c.id === activeId ? 'ring-2 ring-purple-300' : ''
                      }`}
                    >
                      <Link to={`/dashboard/chats/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <ChatAvatar profile={c.other} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-gray-900">{displayName(c.other)}</p>
                          <p className="text-xs text-gray-400">wants to chat with you</p>
                        </div>
                      </Link>
                      <button
                        title="Accept"
                        disabled={busyId === c.id}
                        onClick={() => run(c.id, onAccept)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        title="Decline"
                        disabled={busyId === c.id}
                        onClick={() => run(c.id, onDecline)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-500 transition hover:bg-red-100 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="flex flex-col gap-1">
              {shownConversations.map(c => (
                <Link
                  key={c.id}
                  to={`/dashboard/chats/${c.id}`}
                  className={`flex items-center gap-3 rounded-2xl p-3 transition ${
                    c.id === activeId ? 'bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)]' : 'hover:bg-white/70'
                  }`}
                >
                  <ChatAvatar profile={c.other} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-gray-900 ${c.unread ? 'font-bold' : 'font-medium'}`}>
                      {displayName(c.other)}
                    </p>
                    <p className="truncate text-xs text-gray-400">
                      {c.otherPending ? 'Waiting for acceptance' : c.other?.username ? `@${c.other.username}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`text-xs ${c.unread ? 'font-semibold text-purple-600' : 'text-gray-400'}`}>
                      {formatChatTime(c.lastMessageAt ?? c.createdAt)}
                    </span>
                    {c.unread && <span className="h-2.5 w-2.5 rounded-full bg-purple-600" />}
                  </div>
                </Link>
              ))}
            </div>

            {shownConversations.length === 0 && shownRequests.length === 0 && (
              <p className="py-12 text-center text-sm text-gray-400">
                {filter.trim() ? 'No chats found.' : 'No chats yet. Start one with “New chat”.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
