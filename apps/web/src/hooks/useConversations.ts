import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { fetchConversations, type ConversationLists } from '@/lib/chat-queries'

const EMPTY: ConversationLists = { requests: [], conversations: [], blockedIds: [] }

// Chat list + incoming requests, kept live through Realtime.
// Any relevant change simply refetches the whole list: small data, always correct.
export function useConversations(myId: string | undefined) {
  const [lists, setLists] = useState<ConversationLists>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // ignore responses of older requests that finish after a newer one
  const requestSeq = useRef(0)

  const reload = useCallback(async () => {
    if (!myId) return
    const seq = ++requestSeq.current
    try {
      const data = await fetchConversations(myId)
      if (seq !== requestSeq.current) return
      setLists(data)
      setError(null)
    } catch {
      if (seq !== requestSeq.current) return
      setError('Could not load chats.')
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [myId])

  useEffect(() => {
    if (!myId) return
    void reload()

    // RLS applies to Realtime too: only rows I can SELECT are delivered.
    // conversations itself isn't published → a new message (INSERT on messages)
    // is the signal that last_message_at changed.
    const channel = supabase
      .channel(`chat-list:${myId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_participants' }, () => void reload())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => void reload())
      // someone blocked / unblocked me → the composer switches live
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_blocks' }, () => void reload())
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [myId, reload])

  return { ...lists, loading, error, reload }
}
