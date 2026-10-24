import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { useAuth } from '@/contexts/AuthProvider'
import { useSearch } from '@/contexts/SearchContext'
import { useConversations } from '@/hooks/useConversations'
import {
  acceptRequest,
  addGroupMembers,
  blockUser,
  createGroup,
  declineRequest,
  hideConversation,
  leaveGroup,
  startDirectChat,
  unblockUser,
} from '@/lib/chat-queries'
import { ConversationList } from '@/components/chat/ConversationList'
import { ChatThread } from '@/components/chat/ChatThread'
import type { ChatActions } from '@/components/chat/ChatHeader'
import { NewChatModal } from '@/components/chat/NewChatModal'

export default function ChatsPage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const navigate = useNavigate()
  const { session } = useAuth()
  const myId = session?.user.id
  const { query, setQuery } = useSearch()
  const { requests, conversations, blockedIds, loading, error, reload } = useConversations(myId)
  const [newChatOpen, setNewChatOpen] = useState(false)

  // the TopBar search query is shared with Skills → start and leave clean
  useEffect(() => {
    setQuery('')
    return () => setQuery('')
  }, [setQuery])

  const request = requests.find(c => c.id === conversationId)
  const active = request ?? conversations.find(c => c.id === conversationId)

  const handleAccept = useCallback(async (id: string) => {
    await acceptRequest(id)
    await reload()
    navigate(`/dashboard/chats/${id}`)
  }, [reload, navigate])

  const handleDecline = useCallback(async (id: string) => {
    await declineRequest(id)
    await reload()
    if (id === conversationId) navigate('/dashboard/chats')
  }, [reload, navigate, conversationId])

  const handlePick = useCallback(async (userId: string) => {
    const id = await startDirectChat(userId)
    await reload()
    setNewChatOpen(false)
    navigate(`/dashboard/chats/${id}`)
  }, [reload, navigate])

  // chat header buttons: run the RPC, refresh the list, go where it makes sense
  const actions = useMemo<ChatActions>(() => ({
    createGroup: async people => {
      const id = await createGroup(myId!, people)
      await reload()
      navigate(`/dashboard/chats/${id}`)
    },
    addMembers: async (id, people) => {
      await addGroupMembers(id, people.map(p => p.id))
      await reload()
    },
    leave: async id => {
      await leaveGroup(id)
      await reload()
      navigate('/dashboard/chats')
    },
    hide: async id => {
      await hideConversation(id)
      await reload()
      navigate('/dashboard/chats')
    },
    block: async userId => {
      await blockUser(userId)
      await reload()
    },
    unblock: async userId => {
      await unblockUser(userId)
      await reload()
    },
  }), [myId, reload, navigate])

  if (!myId) return null

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      {/* List — always on desktop, on mobile only when no conversation is open */}
      <aside className={`min-h-0 w-full lg:block lg:w-80 lg:shrink-0 ${conversationId ? 'hidden' : 'block'}`}>
        <ConversationList
          requests={requests}
          conversations={conversations}
          activeId={conversationId}
          loading={loading}
          error={error}
          filter={query}
          onAccept={handleAccept}
          onDecline={handleDecline}
          onNewChat={() => setNewChatOpen(true)}
        />
      </aside>

      <section
        className={`min-h-0 flex-1 flex-col rounded-2xl bg-gray-50 p-3 sm:p-4 lg:flex ${conversationId ? 'flex' : 'hidden'}`}
      >
        {!conversationId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-400">
            <MessageSquare className="h-10 w-10" />
            <p className="text-sm">Select a chat or start a new one.</p>
          </div>
        ) : active ? (
          <ChatThread
            key={active.id}
            conversation={active}
            isRequest={!!request}
            myId={myId}
            blockedIds={blockedIds}
            actions={actions}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        ) : loading ? (
          <div className="flex flex-1 justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <p className="font-semibold text-gray-900">This chat doesn't exist</p>
            <p className="text-sm text-gray-400">It may have been declined or you don't have access to it.</p>
            <Link to="/dashboard/chats" className="mt-2 text-sm font-medium text-purple-600 hover:underline">
              Back to chats
            </Link>
          </div>
        )}
      </section>

      {newChatOpen && (
        <NewChatModal myId={myId} onPick={handlePick} onClose={() => setNewChatOpen(false)} />
      )}
    </div>
  )
}
