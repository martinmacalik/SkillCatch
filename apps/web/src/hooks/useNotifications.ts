import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthProvider'
import {
  fetchNotifications,
  markNotificationsRead,
  type AppNotification,
} from '../lib/notification-queries'

// The current user's notifications, live: a new row from the admin-api
// arrives over Realtime (RLS limits the stream to the user's own rows).
export function useNotifications() {
  const { session } = useAuth()
  const myId = session?.user?.id ?? null
  const [items, setItems] = useState<AppNotification[]>([])
  // ignore responses of older requests that finish after a newer one
  const requestSeq = useRef(0)

  const reload = useCallback(async () => {
    if (!myId) return
    const seq = ++requestSeq.current
    try {
      const data = await fetchNotifications()
      if (seq !== requestSeq.current) return
      setItems(data)
    } catch {
      // the bell is non-critical; keep whatever we had
    }
  }, [myId])

  useEffect(() => {
    if (!myId) return
    // initial load; later changes come through the channel below
    const seq = ++requestSeq.current
    fetchNotifications()
      .then(data => { if (seq === requestSeq.current) setItems(data) })
      .catch(() => {})

    const channel = supabase
      .channel(`notifications:${myId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${myId}` },
        () => void reload()
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [myId, reload])

  const unreadCount = items.filter(n => !n.read_at).length

  const markAllRead = useCallback(async () => {
    if (!items.some(n => !n.read_at)) return
    const now = new Date().toISOString()
    setItems(prev => prev.map(n => (n.read_at ? n : { ...n, read_at: now })))
    await markNotificationsRead().catch(() => void reload())
  }, [items, reload])

  return { items, unreadCount, markAllRead }
}
