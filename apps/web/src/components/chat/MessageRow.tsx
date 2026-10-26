import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Pencil, Reply, Smile, Trash2, X } from 'lucide-react'
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
  senderLabel: string | null // group chats: name above the first message of a run
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
  message, mine, senderLabel, replyTarget, senderName, active, highlighted,
  onActivate, onReply, onEdit, onDelete, onReact, onJumpTo,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

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

  const emojiPicker = (
    <div className="flex gap-0.5 rounded-full bg-white p-1 shadow-lg">
      {REACTION_EMOJI.map(e => (
        <button
          key={e}
          onClick={ev => { ev.stopPropagation(); pick(e) }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition hover:scale-110 hover:bg-gray-100"
        >
          {e}
        </button>
      ))}
    </div>
  )

  const replyButton = <ToolButton title="Reply" onClick={onReply}><Reply className="h-4 w-4" /></ToolButton>
  const reactButton = <ToolButton title="React" onClick={() => setPickerOpen(true)}><Smile className="h-4 w-4" /></ToolButton>

  const toolbarVisible = active || pickerOpen
  const toolbar = (
    <div
      ref={pickerRef}
      className={`shrink-0 items-center gap-0.5 ${toolbarVisible ? 'flex' : 'hidden group-hover:flex'}`}
    >
      {/* while picking, the other tools hide and the emoji sit inline on the
          outer side of the button: [bubble][×][emoji] / [emoji][×][bubble] */}
      {pickerOpen ? (
        <>
          {mine && emojiPicker}
          <ToolButton title="Close" onClick={() => setPickerOpen(false)}><X className="h-4 w-4" /></ToolButton>
          {!mine && emojiPicker}
        </>
      ) : mine ? (
        <>
          <ToolButton title="Edit" onClick={onEdit}><Pencil className="h-4 w-4" /></ToolButton>
          <ToolButton title="Delete" onClick={onDelete}><Trash2 className="h-4 w-4" /></ToolButton>
          {replyButton}
          {reactButton}
        </>
      ) : (
        // mirrored: the react button sits next to the bubble on both sides
        <>
          {reactButton}
          {replyButton}
        </>
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
        {senderLabel && <p className="mb-0.5 mt-1 px-2 text-xs font-medium text-gray-500">{senderLabel}</p>}
        <div
          className={`relative rounded-2xl px-3.5 py-2 text-sm ${
            mine ? 'rounded-br-md bg-linear-to-br from-indigo-600 to-fuchsia-600 text-white' : 'rounded-bl-md bg-white text-gray-900'
          } ${reactionMargin(message.reactions)}`}
        >
          {replyTarget && (
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

          <p className="whitespace-pre-wrap break-words">{message.body}</p>
          <p className={`mt-0.5 text-right text-[10px] ${mine ? 'text-white/70' : 'text-gray-400'}`}>
            {message.edited_at && 'edited · '}
            {formatChatTime(message.created_at)}
          </p>

          <Reactions message={message} mine={mine} onReact={onReact} />
        </div>
      </div>

      {!mine && toolbar}
    </div>
  )
}

// room under the bubble for the reactions (+ the count line under them)
function reactionMargin(reactions: Message['reactions']): string {
  if (reactions.length === 0) return ''
  const hasCount = reactions.some((r, i) => reactions.findIndex(x => x.emoji === r.emoji) !== i)
  return hasCount ? 'mb-5' : 'mb-3'
}

// big emoji pinned to the bubble's bottom outer corner; clicking one toggles it
function Reactions({ message, mine, onReact }: Pick<Props, 'message' | 'mine' | 'onReact'>) {
  if (message.reactions.length === 0) return null
  const counts = REACTION_EMOJI
    .map(e => ({ emoji: e, count: message.reactions.filter(r => r.emoji === e).length }))
    .filter(c => c.count > 0)

  return (
    <div className={`absolute -bottom-4 flex gap-0.5 ${mine ? '-left-2' : '-right-2'}`}>
      {counts.map(c => (
        <button
          key={c.emoji}
          onClick={e => { e.stopPropagation(); onReact(c.emoji) }}
          className="flex flex-col items-center transition hover:scale-110"
        >
          <span className="text-xl leading-6 drop-shadow-md">{c.emoji}</span>
          {/* count under the emoji, so it never overlaps the bubble or the text */}
          {c.count > 1 && <span className="text-[10px] font-semibold leading-none text-gray-900">{c.count}</span>}
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
