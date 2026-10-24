import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Pencil, Reply, SendHorizontal, X } from 'lucide-react'
import { useMessages } from '@/hooks/useMessages'
import {
  conversationName,
  displayName,
  MESSAGE_MAX_LENGTH,
  type ConversationSummary,
  type Message,
  type ReactionEmoji,
  type SystemMetadata,
} from '@/lib/chat-queries'
import { ConversationAvatar } from './ChatAvatar'
import { ChatHeader, type ChatActions } from './ChatHeader'
import { MessageRow } from './MessageRow'

// what the composer is doing besides writing a new message
type Draft = { kind: 'reply' | 'edit'; message: Message } | null

interface Props {
  conversation: ConversationSummary
  isRequest: boolean // I haven't accepted yet → can't read messages
  myId: string
  blockedIds: string[]
  actions: ChatActions
  onAccept: (id: string) => Promise<void>
  onDecline: (id: string) => Promise<void>
}

export function ChatThread({ conversation, isRequest, myId, blockedIds, actions, onAccept, onDecline }: Props) {
  const { id, other } = conversation
  const { messages, loading, loadingOlder, hasMore, error, loadOlder, send, edit, remove, react } =
    useMessages(id, myId, !isRequest)
  const [draft, setDraft] = useState<Draft>(null)

  // 1:1 → the other person; group → look the sender up among the members
  // (someone who left the group isn't a member anymore → "Former member")
  const senderName = (senderId: string | null) => {
    if (senderId === myId) return 'You'
    if (conversation.type === 'direct') return displayName(other)
    const member = conversation.members.find(m => m.id === senderId)
    return member ? displayName(member) : 'Former member'
  }

  const handleDelete = (m: Message) => {
    if (!confirm('Delete this message?')) return
    if (draft?.message.id === m.id) setDraft(null)
    void remove(m.id)
  }

  const handleSubmit = async (body: string) => {
    if (draft?.kind === 'edit') {
      if (body !== draft.message.body) await edit(draft.message.id, body)
    } else {
      await send(body, draft?.kind === 'reply' ? draft.message.id : null)
    }
    setDraft(null)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatHeader
        conversation={conversation}
        isRequest={isRequest}
        myId={myId}
        blockedIds={blockedIds}
        actions={actions}
      />

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
            isGroup={conversation.type === 'group'}
            senderName={senderName}
            onReply={m => setDraft({ kind: 'reply', message: m })}
            onEdit={m => setDraft({ kind: 'edit', message: m })}
            onDelete={handleDelete}
            onReact={(m, emoji) => void react(m.id, emoji)}
          />
          {/* a block (either way) replaces the input; my own block can be undone here */}
          {conversation.blockedByMe ? (
            <BlockedNotice text="You blocked this user.">
              <button
                onClick={() => void actions.unblock(other!.id)}
                className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gray-700"
              >
                Unblock
              </button>
            </BlockedNotice>
          ) : conversation.blockedMe ? (
            <BlockedNotice text="This user has blocked you." />
          ) : (
            <Composer
              key={`composer-${id}`}
              draft={draft}
              senderName={senderName}
              onCancelDraft={() => setDraft(null)}
              onSubmit={handleSubmit}
              disabled={conversation.type === 'direct' && !other}
            />
          )}
        </>
      )}
    </div>
  )
}

function BlockedNotice({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="mt-2 flex items-center justify-center gap-3 rounded-2xl bg-white p-4 text-sm text-gray-500">
      {text}
      {children}
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
      <ConversationAvatar conversation={conversation} className="h-20 w-20" />
      <div>
        <p className="text-lg font-semibold text-gray-900">
          {conversation.type === 'group'
            ? `You're invited to ${conversationName(conversation)}`
            : `${displayName(conversation.other)} wants to chat`}
        </p>
        <p className="mt-1 text-sm text-gray-400">You'll see the messages after you accept.</p>
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
  isGroup: boolean // show sender names above other people's messages
  senderName: (senderId: string | null) => string
  onReply: (m: Message) => void
  onEdit: (m: Message) => void
  onDelete: (m: Message) => void
  onReact: (m: Message, emoji: ReactionEmoji) => void
}

function MessageList({
  messages, myId, loading, loadingOlder, hasMore, error, onLoadOlder,
  isGroup, senderName, onReply, onEdit, onDelete, onReact,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prev = useRef({ firstId: '', lastId: '', scrollHeight: 0, nearBottom: true })
  const [activeId, setActiveId] = useState<string | null>(null) // touch: row with open toolbar
  const [highlightId, setHighlightId] = useState<string | null>(null)

  // reply previews read the loaded message first, so an edit shows up there too
  const byId = useMemo(() => new Map(messages.map(m => [m.id, m])), [messages])
  // deleted messages stay in state (reply previews still point at them) but aren't shown
  const visible = useMemo(() => messages.filter(m => m.deleted_at === null), [messages])

  // flash the original message after jumping to it from a reply
  useEffect(() => {
    if (!highlightId) return
    const t = setTimeout(() => setHighlightId(null), 1500)
    return () => clearTimeout(t)
  }, [highlightId])

  const jumpTo = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`)
    if (!el) return // not loaded (older page)
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightId(messageId)
  }

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
        <div className="flex flex-col gap-1">
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
          {visible.length === 0 && !hasMore && !error && (
            <p className="py-12 text-center text-sm text-gray-400">No messages yet. Say hi!</p>
          )}
          {visible.map((m, i) => {
            if (m.type === 'system') {
              return (
                <p key={m.id} className="py-1 text-center text-xs text-gray-400">
                  {m.metadata ? systemText(m.metadata, myId, senderName) : ''}
                </p>
              )
            }
            const replyTarget = m.reply_to_id ? (byId.get(m.reply_to_id) ?? m.reply_to) : null
            const mine = m.sender_id === myId
            // group: name above the first message of a run from the same person
            const prevSender = visible[i - 1]?.type === 'system' ? null : visible[i - 1]?.sender_id
            const senderLabel = isGroup && !mine && prevSender !== m.sender_id ? senderName(m.sender_id) : null
            return (
              <MessageRow
                key={m.id}
                message={m}
                mine={mine}
                senderLabel={senderLabel}
                replyTarget={replyTarget}
                senderName={senderName}
                active={activeId === m.id}
                highlighted={highlightId === m.id}
                onActivate={() => setActiveId(id => (id === m.id ? null : m.id))}
                // an action closes the tapped-open toolbar
                onReply={() => { setActiveId(null); onReply(m) }}
                onEdit={() => { setActiveId(null); onEdit(m) }}
                onDelete={() => { setActiveId(null); onDelete(m) }}
                onReact={emoji => { setActiveId(null); onReact(m, emoji) }}
                onJumpTo={jumpTo}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// "Adam added you", "You left the group" — written here from metadata so names stay current
function systemText(meta: SystemMetadata, myId: string, senderName: (id: string | null) => string): string {
  const actor = senderName(meta.actor_id)
  const target = meta.target_id === myId ? 'you' : senderName(meta.target_id ?? null)
  switch (meta.event) {
    case 'group_created': return `${actor} created the group`
    case 'member_added': return `${actor} added ${target}`
    case 'member_joined': return `${actor} joined the group`
    case 'member_left': return `${actor} left the group`
    case 'member_removed': return `${actor} removed ${target}`
    case 'renamed': return `${actor} renamed the group to “${meta.title}”`
    case 'role_changed': return `${actor} made ${target} ${meta.role}`
  }
}

interface ComposerProps {
  draft: Draft
  senderName: (senderId: string | null) => string
  onCancelDraft: () => void
  onSubmit: (body: string) => Promise<void>
  disabled: boolean
}

function Composer({ draft, senderName, onCancelDraft, onSubmit, disabled }: ComposerProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Draft changed → adjust the text right during render (React's pattern for
  // "state derived from a prop change"; no extra render with stale text).
  // Edit loads the message text, leaving edit clears it.
  const [prevDraft, setPrevDraft] = useState<Draft>(null)
  if (draft !== prevDraft) {
    setPrevDraft(draft)
    if (draft?.kind === 'edit') setText(draft.message.body ?? '')
    else if (prevDraft?.kind === 'edit') setText('')
  }

  useEffect(() => {
    if (draft) inputRef.current?.focus()
  }, [draft])

  const trimmed = text.trim()
  const tooLong = text.length > MESSAGE_MAX_LENGTH
  const canSend = !disabled && !sending && trimmed.length > 0 && !tooLong

  const submit = async () => {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      await onSubmit(trimmed)
      setText('')
    } catch {
      setError(draft?.kind === 'edit' ? 'Message could not be saved. Try again.' : 'Message could not be sent. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="pt-2">
      {draft && (
        <div className="mb-1 flex items-center gap-2 rounded-xl bg-white/70 px-3 py-1.5 text-xs text-gray-500">
          {draft.kind === 'edit' ? (
            <Pencil className="h-3.5 w-3.5 shrink-0 text-purple-600" />
          ) : (
            <Reply className="h-3.5 w-3.5 shrink-0 text-purple-600" />
          )}
          <p className="min-w-0 flex-1 truncate">
            {draft.kind === 'edit' ? (
              <span className="font-semibold text-gray-700">Editing message</span>
            ) : (
              <>
                Replying to <span className="font-semibold text-gray-700">{senderName(draft.message.sender_id)}</span>
                {': '}
                {draft.message.body}
              </>
            )}
          </p>
          <button onClick={onCancelDraft} title="Cancel (Esc)" className="rounded-full p-1 transition hover:bg-gray-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 rounded-2xl bg-white p-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            // Enter sends, Shift+Enter = new line, Esc cancels reply/edit
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            } else if (e.key === 'Escape' && draft) {
              onCancelDraft()
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
