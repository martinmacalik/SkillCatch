import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  deleteMessage,
  editMessage,
  fetchMessage,
  fetchMessages,
  fromRow,
  markRead,
  sendTextMessage,
  setReaction,
  MESSAGES_PAGE_SIZE,
  type Message,
  type MessageRow,
  type Reaction,
  type ReactionEmoji,
} from '@/lib/chat-queries'

function appendUnique(list: Message[], msg: Message): Message[] {
  return list.some(m => m.id === msg.id) ? list : [...list, msg]
}

// new column values from an UPDATE, keep the embedded data
function applyRow(list: Message[], row: MessageRow): Message[] {
  return list.map(m =>
    m.id === row.id ? { ...m, ...row, reactions: row.deleted_at ? [] : m.reactions } : m,
  )
}

// replace one user's reaction on one message (null = remove it)
function withReaction(list: Message[], messageId: string, userId: string, emoji: ReactionEmoji | null): Message[] {
  return list.map(m => {
    if (m.id !== messageId) return m
    const others = m.reactions.filter(r => r.user_id !== userId)
    return { ...m, reactions: emoji ? [...others, { user_id: userId, emoji }] : others }
  })
}

type ReactionRow = Reaction & { message_id: string }

// Messages of one conversation, live through Realtime.
// `enabled` = I'm an accepted member (a pending user can't read messages anyway).
export function useMessages(conversationId: string, myId: string | undefined, enabled: boolean) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // realtime handlers need the current list without resubscribing
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    if (!enabled || !myId) return
    let cancelled = false
    setMessages([])
    setLoading(true)
    setError(null)

    fetchMessages(conversationId)
      .then(data => {
        if (cancelled) return
        // a realtime message may have arrived while loading → merge, don't overwrite
        setMessages(prev => prev.reduce(appendUnique, data))
        setHasMore(data.length === MESSAGES_PAGE_SIZE)
      })
      .catch(() => { if (!cancelled) setError('Could not load messages.') })
      .finally(() => { if (!cancelled) setLoading(false) })

    void markRead(conversationId).catch(() => {})

    const filter = `conversation_id=eq.${conversationId}`
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, payload => {
        const row = payload.new as MessageRow
        setMessages(prev => appendUnique(prev, fromRow(row)))
        // I'm looking at the conversation → the new message is read
        if (row.sender_id !== myId) void markRead(conversationId).catch(() => {})
        // replied message isn't loaded → fetch the row with its embedded preview
        if (row.reply_to_id && !messagesRef.current.some(m => m.id === row.reply_to_id)) {
          void fetchMessage(row.id)
            .then(full => { if (!cancelled) setMessages(prev => prev.map(m => (m.id === full.id ? full : m))) })
            .catch(() => {})
        }
      })
      // edits and soft deletes
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, payload => {
        setMessages(prev => applyRow(prev, payload.new as MessageRow))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions', filter }, payload => {
        const r = payload.new as ReactionRow
        setMessages(prev => withReaction(prev, r.message_id, r.user_id, r.emoji))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_reactions', filter }, payload => {
        const r = payload.new as ReactionRow
        setMessages(prev => withReaction(prev, r.message_id, r.user_id, r.emoji))
      })
      // DELETE events can't be filtered and carry only the primary key
      // → no filter; a message_id that isn't in this list changes nothing
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, payload => {
        const r = payload.old as Partial<ReactionRow>
        if (r.message_id && r.user_id) setMessages(prev => withReaction(prev, r.message_id!, r.user_id!, null))
      })
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [conversationId, myId, enabled])

  const loadOlder = useCallback(async () => {
    const oldest = messages[0]
    if (!oldest || loadingOlder) return
    setLoadingOlder(true)
    try {
      const older = await fetchMessages(conversationId, oldest.created_at)
      setMessages(prev => [...older, ...prev])
      setHasMore(older.length === MESSAGES_PAGE_SIZE)
    } catch {
      setError('Could not load older messages.')
    } finally {
      setLoadingOlder(false)
    }
  }, [conversationId, messages, loadingOlder])

  // send / edit throw on failure so the composer can keep the text and show an error
  const send = useCallback(
    async (body: string, replyToId: string | null = null) => {
      const msg = await sendTextMessage(conversationId, body, replyToId)
      // don't wait for the realtime echo; appendUnique drops the duplicate later
      setMessages(prev => appendUnique(prev, msg))
    },
    [conversationId],
  )

  const edit = useCallback(async (messageId: string, body: string) => {
    const row = await editMessage(messageId, body)
    setMessages(prev => applyRow(prev, row))
  }, [])

  const remove = useCallback(async (messageId: string) => {
    try {
      await deleteMessage(messageId)
    } catch {
      setError('Message could not be deleted.')
      return
    }
    setMessages(prev =>
      prev.map(m =>
        m.id === messageId ? { ...m, body: null, deleted_at: new Date().toISOString(), reactions: [] } : m,
      ),
    )
  }, [])

  // optimistic: show the change at once, put the old reactions back on error
  const react = useCallback(
    async (messageId: string, emoji: ReactionEmoji) => {
      if (!myId) return
      const before = messagesRef.current.find(m => m.id === messageId)
      if (!before) return
      const mine = before.reactions.find(r => r.user_id === myId)?.emoji ?? null
      setMessages(prev => withReaction(prev, messageId, myId, mine === emoji ? null : emoji))
      try {
        await setReaction(messageId, emoji)
      } catch {
        setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, reactions: before.reactions } : m)))
        setError('Reaction could not be saved.')
      }
    },
    [myId],
  )

  return { messages, loading: enabled && loading, loadingOlder, hasMore, error, loadOlder, send, edit, remove, react }
}
