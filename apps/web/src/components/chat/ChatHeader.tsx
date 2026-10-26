import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Ban, LogOut, Pencil, Trash2, UserPlus } from 'lucide-react'
import { conversationName, displayName, type ChatProfile, type ConversationSummary } from '@/lib/chat-queries'
import { AddPeopleModal } from './AddPeopleModal'
import { ChatAvatar, ConversationAvatar } from './ChatAvatar'
import { ConfirmButton } from './ConfirmButton'
import { GroupSettingsModal } from './GroupSettingsModal'

// what the header buttons do; ChatsPage implements them (RPC + reload + navigate)
export interface ChatActions {
  createGroup: (people: ChatProfile[]) => Promise<void>
  addMembers: (conversationId: string, people: ChatProfile[]) => Promise<void>
  leave: (conversationId: string) => Promise<void>
  rename: (conversationId: string, title: string) => Promise<void>
  setPhoto: (conversationId: string, file: File) => Promise<void>
  removeMember: (conversationId: string, userId: string) => Promise<void>
  deleteGroup: (conversationId: string) => Promise<void>
  hide: (conversationId: string) => Promise<void>
  block: (userId: string) => Promise<void>
  unblock: (userId: string) => Promise<void>
}

interface Props {
  conversation: ConversationSummary
  isRequest: boolean // no actions until I accept
  myId: string
  blockedIds: string[]
  actions: ChatActions
}

export function ChatHeader({ conversation: c, isRequest, myId, blockedIds, actions }: Props) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const isGroup = c.type === 'group'
  const blocked = c.blockedByMe || c.blockedMe
  // 1:1 → a new group with the other person; group → owner/admin invite more
  const canAdd = isGroup ? c.myRole === 'owner' || c.myRole === 'admin' : !!c.other && !blocked

  return (
    <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
      <Link
        to="/dashboard/chats"
        className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-gray-100 lg:hidden"
        title="Back"
      >
        <ArrowLeft className="h-5 w-5 text-gray-600" />
      </Link>

      {isGroup ? (
        <div className="flex min-w-0 items-center gap-3">
          <ConversationAvatar conversation={c} className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{conversationName(c)}</p>
            <p className="truncate text-xs text-gray-400">{membersLine(c)}</p>
          </div>
        </div>
      ) : c.other ? (
        <Link to={`/profile/${c.other.id}`} className="flex min-w-0 items-center gap-3">
          <ChatAvatar profile={c.other} className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{displayName(c.other)}</p>
            {c.other.username && <p className="text-xs text-gray-400">@{c.other.username}</p>}
          </div>
        </Link>
      ) : (
        <div className="flex items-center gap-3">
          <ChatAvatar profile={null} className="h-10 w-10" />
          <p className="font-semibold text-gray-500">{displayName(null)}</p>
        </div>
      )}

      {!isRequest && (
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {canAdd && (
            <button
              title={isGroup ? 'Add people' : 'Create a group'}
              onClick={() => setAdding(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            >
              <UserPlus className="h-5 w-5" />
            </button>
          )}

          {isGroup && (
            <button
              title="Group settings"
              onClick={() => setEditing(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            >
              <Pencil className="h-5 w-5" />
            </button>
          )}

          {isGroup ? (
            <ConfirmButton
              title="Leave group"
              question="Leave this group? You'll stop getting its messages."
              confirmLabel="Leave"
              danger
              onConfirm={() => actions.leave(c.id)}
            >
              <LogOut className="h-5 w-5" />
            </ConfirmButton>
          ) : (
            <>
              {c.other && (
                c.blockedByMe ? (
                  <ConfirmButton
                    title="Unblock"
                    question={`Unblock ${displayName(c.other)}? You'll be able to write to each other again.`}
                    confirmLabel="Unblock"
                    onConfirm={() => actions.unblock(c.other!.id)}
                  >
                    <Ban className="h-5 w-5 text-red-500" />
                  </ConfirmButton>
                ) : (
                  <ConfirmButton
                    title="Block"
                    question={`Block ${displayName(c.other)}? Neither of you will be able to write in this chat.`}
                    confirmLabel="Block"
                    danger
                    onConfirm={() => actions.block(c.other!.id)}
                  >
                    <Ban className="h-5 w-5" />
                  </ConfirmButton>
                )
              )}
              <ConfirmButton
                title="Remove from list"
                question="Remove this chat from your list? It comes back when a new message arrives."
                confirmLabel="Remove"
                danger
                onConfirm={() => actions.hide(c.id)}
              >
                <Trash2 className="h-5 w-5" />
              </ConfirmButton>
            </>
          )}
        </div>
      )}

      {adding && (
        <AddPeopleModal
          myId={myId}
          title={isGroup ? 'Add people' : 'Create a group'}
          confirmLabel={isGroup ? 'Invite' : 'Create group'}
          excludeIds={[...c.members.map(m => m.id), ...blockedIds]}
          onConfirm={async people => {
            if (isGroup) await actions.addMembers(c.id, people)
            else await actions.createGroup([c.other!, ...people])
            setAdding(false)
          }}
          onClose={() => setAdding(false)}
        />
      )}

      {editing && (
        <GroupSettingsModal conversation={c} myId={myId} actions={actions} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}

// "3 members · 1 invited" (me included in members)
function membersLine(c: ConversationSummary): string {
  const invited = c.members.filter(m => m.pending).length
  const joined = c.members.length - invited + 1
  return `${joined} member${joined === 1 ? '' : 's'}${invited > 0 ? ` · ${invited} invited` : ''}`
}
