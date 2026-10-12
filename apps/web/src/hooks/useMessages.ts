import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  fetchMessages,
  markRead,
  sendTextMessage,
  MESSAGES_PAGE_SIZE,
  type Message,
} from '@/lib/chat-queries'

function appendUnique(list: Message[], msg: Message): Message[] {
  return list.some(m => m.id === msg.id) ? list : [...list, msg]
}

// Messages of one conversation, live through Realtime.
// `enabled` = I'm an accepted member (a pending user can't read messages anyway).
export function useMessages(conversationId: string, myId: string | undefined, enabled: boolean) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        payload => {
          const msg = payload.new as Message
          setMessages(prev => appendUnique(prev, msg))
          // I'm looking at the conversation → the new message is read
          if (msg.sender_id !== myId) void markRead(conversationId).catch(() => {})
        },
      )
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

  // Throws on failure so the composer can keep the text and show an error.
  const send = useCallback(
    async (body: string) => {
      const msg = await sendTextMessage(conversationId, body)
      // don't wait for the realtime echo; appendUnique drops the duplicate later
      setMessages(prev => appendUnique(prev, msg))
    },
    [conversationId],
  )

  return { messages, loading: enabled && loading, loadingOlder, hasMore, error, loadOlder, send }
}
