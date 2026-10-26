import { useEffect, useRef, useState } from 'react'
import { Camera, Check, X } from 'lucide-react'
import {
  conversationName,
  displayName,
  fetchProfile,
  type ChatMember,
  type ChatProfile,
  type ConversationSummary,
} from '@/lib/chat-queries'
import { AvatarUploadError } from '@/lib/avatarUpload'
import type { ChatActions } from './ChatHeader'
import { ChatAvatar, ConversationAvatar } from './ChatAvatar'

interface Props {
  conversation: ConversationSummary
  myId: string
  actions: ChatActions
  onClose: () => void
}

// Group popup: photo + name (any member can change them), member list,
// the owner (= "Admin") can remove people and delete the whole group.
export function GroupSettingsModal({ conversation: c, myId, actions, onClose }: Props) {
  const [me, setMe] = useState<ChatProfile | null>(null)
  const [title, setTitle] = useState(conversationName(c))
  const [busy, setBusy] = useState<string | null>(null) // what is saving: 'photo' | 'title' | member id | 'delete'
  const [confirming, setConfirming] = useState<string | null>(null) // member id | 'delete'
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const isOwner = c.myRole === 'owner'
  const titleChanged = title.trim() !== '' && title.trim() !== conversationName(c)

  useEffect(() => {
    void fetchProfile(myId).then(setMe)
  }, [myId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (what: string, action: () => Promise<void>, failText: string) => {
    setBusy(what)
    setError(null)
    try {
      await action()
      setConfirming(null)
    } catch (e) {
      setError(e instanceof AvatarUploadError ? e.message : failText)
    } finally {
      setBusy(null)
    }
  }

  const saveTitle = () => {
    if (!titleChanged) return
    void run('title', () => actions.rename(c.id, title.trim()), 'Could not rename the group.')
  }

  // owner first, then joined members, invited at the end; me on top
  const others = [...c.members].sort((a, b) => rank(a) - rank(b))
  const rows: { profile: ChatProfile; member: ChatMember | null }[] = [
    ...(me ? [{ profile: me, member: null }] : []),
    ...others.map(m => ({ profile: m, member: m })),
  ]

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-3xl bg-white p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* photo + name */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            title="Change photo"
            onClick={() => fileRef.current?.click()}
            disabled={busy === 'photo'}
            className="group relative shrink-0 rounded-full"
          >
            <ConversationAvatar conversation={c} className="h-16 w-16" />
            <span
              className={`absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white transition ${
                busy === 'photo' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              {busy === 'photo' ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <Camera className="h-5 w-5" />
              )}
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              e.target.value = '' // the same file can be picked again
              if (file) void run('photo', () => actions.setPhoto(c.id, file), 'Could not change the photo.')
            }}
          />

          <div className="flex min-w-0 flex-1 items-center gap-1">
            <input
              value={title}
              maxLength={100}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle() }}
              className="min-w-0 flex-1 rounded-xl border border-transparent px-2 py-1.5 text-lg font-bold text-gray-900 outline-none transition hover:border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
            />
            {titleChanged && (
              <button
                title="Save name"
                onClick={saveTitle}
                disabled={busy === 'title'}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white transition hover:bg-gray-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
              </button>
            )}
          </div>

          <button onClick={onClose} className="self-start rounded-full p-1.5 transition hover:bg-gray-100" title="Close">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        {/* members */}
        <p className="mt-5 mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
          Members · {rows.length}
        </p>
        <div className="skills-scroll -mx-1 flex-1 overflow-y-auto px-1">
          {rows.map(({ profile, member }) => {
            const isMe = !member
            const role = member ? member.role : c.myRole
            return (
              <div key={profile.id} className="flex items-center gap-3 rounded-xl p-2">
                <ChatAvatar profile={profile} className="h-9 w-9" />
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                  {displayName(profile)}
                  {isMe && <span className="font-normal text-gray-400"> (you)</span>}
                </p>

                {role === 'owner' && <span className="text-xs font-medium text-purple-600">Admin</span>}
                {member?.pending && <span className="text-xs text-gray-400">Invited</span>}

                {isOwner && member && (
                  confirming === member.id ? (
                    <button
                      onClick={() => void run(member.id, () => actions.removeMember(c.id, member.id), 'Could not remove the member.')}
                      disabled={busy === member.id}
                      className="rounded-full bg-red-500 px-3 py-1 text-xs font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirming(member.id)}
                      className="rounded-full px-3 py-1 text-xs font-medium text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )
                )}
              </div>
            )
          })}
        </div>

        {isOwner && (
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400">
              {confirming === 'delete' ? 'Delete the group and all messages for everyone?' : ''}
            </p>
            {confirming === 'delete' ? (
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => setConfirming(null)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void run('delete', () => actions.deleteGroup(c.id), 'Could not delete the group.')}
                  disabled={busy === 'delete'}
                  className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirming('delete')}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-50"
              >
                Delete group
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function rank(m: ChatMember): number {
  if (m.pending) return 2
  return m.role === 'owner' ? 0 : 1
}
