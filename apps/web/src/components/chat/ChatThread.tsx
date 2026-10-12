import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, SendHorizontal, X } from 'lucide-react'
import { useMessages } from '@/hooks/useMessages'
import {
  displayName,
  formatChatTime,
  MESSAGE_MAX_LENGTH,
  type ConversationSummary,
  type Message,
} from '@/lib/chat-queries'
import { ChatAvatar } from './ChatAvatar'

interface Props {
  conversation: ConversationSummary
  isRequest: boolean // I haven't accepted yet → can't read messages
  myId: string
  onAccept: (id: string) => Promise<void>
  onDecline: (id: string) => Promise<void>
}

export function ChatThread({ conversation, isRequest, myId, onAccept, onDecline }: Props) {
  const { id, other } = conversation
  const { messages, loading, loadingOlder, hasMore, error, loadOlder, send } = useMessages(id, myId, !isRequest)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
        <Link
          to="/dashboard/chats"
          className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-gray-100 lg:hidden"
          title="Back"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </Link>
        {other ? (
          <Link to={`/profile/${other.id}`} className="flex min-w-0 items-center gap-3">
            <ChatAvatar profile={other} className="h-10 w-10" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-900">{displayName(other)}</p>
              {other.username && <p className="text-xs text-gray-400">@{other.username}</p>}
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <ChatAvatar profile={null} className="h-10 w-10" />
            <p className="font-semibold text-gray-500">{displayName(null)}</p>
          </div>
        )}
      </div>

      {isRequest ? (
        <RequestPanel conversation={conversation} onAccept={onAccept} onDecline={onDecline} />
      ) : (
        <>
          {conversation.otherPending && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs text-amber-700">
              Waiting for {displayName(other)} to accept your chat request. You can already write.
            </p>
          )}
          <MessageList
            key={id}
            messages={messages}
            myId={myId}
            loading={loading}
            loadingOlder={loadingOlder}
            hasMore={hasMore}
            error={error}
            onLoadOlder={loadOlder}
          />
          <Composer key={`composer-${id}`} onSend={send} disabled={!other} />
        </>
      )}
    </div>
  )
}

function RequestPanel({
  conversation, onAccept, onDecline,
}: Pick<Props, 'conversation' | 'onAccept' | 'onDecline'>) {
  const [busy, setBusy] = useState(false)
  const run = async (action: (id: string) => Promise<void>) => {
    setBusy(true)
    try { await action(conversation.id) } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <ChatAvatar profile={conversation.other} className="h-20 w-20" />
      <div>
        <p className="text-lg font-semibold text-gray-900">{displayName(conversation.other)} wants to chat</p>
        <p className="mt-1 text-sm text-gray-400">You'll see their messages after you accept.</p>
      </div>
      <div className="flex gap-3">
        <button
          disabled={busy}
          onClick={() => run(onDecline)}
          className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-red-500 transition hover:bg-red-50 disabled:opacity-50"
        >
          <X className="h-4 w-4" /> Decline
        </button>
        <button
          disabled={busy}
          onClick={() => run(onAccept)}
          className="flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> Accept
        </button>
      </div>
    </div>
  )
}

interface MessageListProps {
  messages: Message[]
  myId: string
  loading: boolean
  loadingOlder: boolean
  hasMore: boolean
  error: string | null
  onLoadOlder: () => void
}

function MessageList({ messages, myId, loading, loadingOlder, hasMore, error, onLoadOlder }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prev = useRef({ firstId: '', lastId: '', scrollHeight: 0, nearBottom: true })

  // Keep the view where the user expects it:
  //  - older messages prepended → keep the same message on screen
  //  - new message appended     → follow it if I sent it or was already at the bottom
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || messages.length === 0) return
    const firstId = messages[0].id
    const last = messages[messages.length - 1]
    const p = prev.current

    if (p.firstId && firstId !== p.firstId && last.id === p.lastId) {
      el.scrollTop += el.scrollHeight - p.scrollHeight
    } else if (last.id !== p.lastId && (p.nearBottom || last.sender_id === myId)) {
      el.scrollTop = el.scrollHeight
    }
    prev.current = { ...p, firstId, lastId: last.id, scrollHeight: el.scrollHeight }
  }, [messages, myId])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    prev.current.nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} className="skills-scroll flex-1 overflow-y-auto py-4 pr-1">
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {hasMore && (
            <button
              onClick={onLoadOlder}
              disabled={loadingOlder}
              className="mx-auto mb-2 rounded-full bg-white px-3 py-1 text-xs text-gray-500 transition hover:text-gray-900 disabled:opacity-50"
            >
              {loadingOlder ? 'Loading…' : 'Load older messages'}
            </button>
          )}
          {error && <p className="text-center text-xs text-red-500">{error}</p>}
          {messages.length === 0 && !error && (
            <p className="py-12 text-center text-sm text-gray-400">No messages yet. Say hi!</p>
          )}
          {messages.map(m => (
            <MessageBubble key={m.id} message={m} mine={m.sender_id === myId} />
          ))}
        </div>
      )}
    </div>
  )
}

function MessageBubble({ message, mine }: { message: Message; mine: boolean }) {
  const deleted = message.deleted_at !== null
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
          mine ? 'rounded-br-md bg-linear-to-br from-indigo-600 to-fuchsia-600 text-white' : 'rounded-bl-md bg-white text-gray-900'
        }`}
      >
        {deleted ? (
          <p className={`italic ${mine ? 'text-white/70' : 'text-gray-400'}`}>Message deleted</p>
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        )}
        <p className={`mt-0.5 text-right text-[10px] ${mine ? 'text-white/70' : 'text-gray-400'}`}>
          {message.edited_at && !deleted && 'edited · '}
          {formatChatTime(message.created_at)}
        </p>
      </div>
    </div>
  )
}

function Composer({ onSend, disabled }: { onSend: (body: string) => Promise<void>; disabled: boolean }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = text.trim()
  const tooLong = text.length > MESSAGE_MAX_LENGTH
  const canSend = !disabled && !sending && trimmed.length > 0 && !tooLong

  const submit = async () => {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      await onSend(trimmed)
      setText('')
    } catch {
      setError('Message could not be sent. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="pt-2">
      <div className="flex items-end gap-2 rounded-2xl bg-white p-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            // Enter sends, Shift+Enter = new line
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            }
          }}
          rows={1}
          placeholder={disabled ? 'This user no longer exists' : 'Write a message…'}
          disabled={disabled}
          className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 field-sizing-content"
        />
        <button
          onClick={() => void submit()}
          disabled={!canSend}
          title="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white transition hover:bg-gray-700 disabled:opacity-30"
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </div>
      <div className="flex justify-between px-2 pt-1 text-xs">
        <span className="text-red-500">{error}</span>
        {text.length > MESSAGE_MAX_LENGTH - 500 && (
          <span className={tooLong ? 'text-red-500' : 'text-gray-400'}>
            {text.length}/{MESSAGE_MAX_LENGTH}
          </span>
        )}
      </div>
    </div>
  )
}
