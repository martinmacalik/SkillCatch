import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Pencil, Reply, Smile, Trash2 } from 'lucide-react'
import {
  formatChatTime,
  REACTION_EMOJI,
  type Message,
  type ReactionEmoji,
  type ReplyPreview,
} from '@/lib/chat-queries'

interface Props {
  message: Message
  mine: boolean
  myId: string
  replyTarget: ReplyPreview | null // the message this one answers (already resolved)
  senderName: (senderId: string | null) => string
  active: boolean // touch screens: toolbar opened by a tap
  highlighted: boolean // just jumped here from a reply preview
  onActivate: () => void
  onReply: () => void
  onEdit: () => void
  onDelete: () => void
  onReact: (emoji: ReactionEmoji) => void
  onJumpTo: (messageId: string) => void
}

// One message = one full-width row. Hovering anywhere on the row shows the
// toolbar next to the bubble (edit + delete only for my own messages).
export function MessageRow({
  message, mine, myId, replyTarget, senderName, active, highlighted,
  onActivate, onReply, onEdit, onDelete, onReact, onJumpTo,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const deleted = message.deleted_at !== null

  // close the emoji picker on a click outside of it
  useEffect(() => {
    if (!pickerOpen) return
    const close = (e: globalThis.MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [pickerOpen])

  const pick = (emoji: ReactionEmoji) => {
    setPickerOpen(false)
    onReact(emoji)
  }

  const toolbarVisible = active || pickerOpen
  const toolbar = deleted ? null : (
    <div
      ref={pickerRef}
      className={`relative shrink-0 items-center gap-0.5 ${toolbarVisible ? 'flex' : 'hidden group-hover:flex'}`}
    >
      {mine && (
        <>
          <ToolButton title="Edit" onClick={onEdit}><Pencil className="h-4 w-4" /></ToolButton>
          <ToolButton title="Delete" onClick={onDelete}><Trash2 className="h-4 w-4" /></ToolButton>
        </>
      )}
      <ToolButton title="Reply" onClick={onReply}><Reply className="h-4 w-4" /></ToolButton>
      <ToolButton title="React" onClick={() => setPickerOpen(o => !o)}><Smile className="h-4 w-4" /></ToolButton>

      {pickerOpen && (
        <div
          className={`absolute bottom-full z-10 mb-1 flex gap-0.5 rounded-full bg-white p-1 shadow-lg ${mine ? 'left-0' : 'right-0'}`}
        >
          {REACTION_EMOJI.map(e => (
            <button
              key={e}
              onClick={() => pick(e)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:scale-110 hover:bg-gray-100"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div
      id={`msg-${message.id}`}
      onClick={() => { if (isTouchScreen()) onActivate() }}
      className={`group flex w-full items-center gap-1.5 rounded-xl px-1 py-0.5 transition-colors ${
        mine ? 'justify-end' : 'justify-start'
      } ${highlighted ? 'bg-purple-100/60' : 'hover:bg-gray-100/50'}`}
    >
      {mine && toolbar}

      <div className={`flex max-w-[75%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm ${
            mine ? 'rounded-br-md bg-linear-to-br from-indigo-600 to-fuchsia-600 text-white' : 'rounded-bl-md bg-white text-gray-900'
          }`}
        >
          {replyTarget && !deleted && (
            <button
              onClick={e => { e.stopPropagation(); onJumpTo(replyTarget.id) }}
              className={`mb-1 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-xs ${
                mine ? 'border-white/60 bg-white/15 text-white/85' : 'border-purple-400 bg-gray-100 text-gray-500'
              }`}
            >
              <span className="font-semibold">{senderName(replyTarget.sender_id)}</span>
              <span className="line-clamp-1 italic">
                {replyTarget.deleted_at ? 'Message deleted' : replyTarget.body}
              </span>
            </button>
          )}

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

        <Reactions message={message} myId={myId} onReact={onReact} />
      </div>

      {!mine && toolbar}
    </div>
  )
}

// 👍 2  😂 1 — my own reaction is highlighted, clicking a chip toggles that emoji
function Reactions({ message, myId, onReact }: Pick<Props, 'message' | 'myId' | 'onReact'>) {
  if (message.reactions.length === 0) return null
  const mine = message.reactions.find(r => r.user_id === myId)?.emoji
  const counts = REACTION_EMOJI
    .map(e => ({ emoji: e, count: message.reactions.filter(r => r.emoji === e).length }))
    .filter(c => c.count > 0)

  return (
    <div className="-mt-1.5 flex gap-1 px-2">
      {counts.map(c => (
        <button
          key={c.emoji}
          onClick={e => { e.stopPropagation(); onReact(c.emoji) }}
          className={`flex items-center gap-0.5 rounded-full border px-1.5 text-xs shadow-sm transition ${
            mine === c.emoji ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-100 bg-white text-gray-500'
          }`}
        >
          <span>{c.emoji}</span>
          {c.count > 1 && <span>{c.count}</span>}
        </button>
      ))}
    </div>
  )
}

function ToolButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      title={title}
      onClick={(e: MouseEvent) => { e.stopPropagation(); onClick() }}
      className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-white hover:text-gray-900"
    >
      {children}
    </button>
  )
}

// no hover on phones/tablets → a tap on the row shows the toolbar instead
function isTouchScreen() {
  return window.matchMedia('(hover: none)').matches
}
