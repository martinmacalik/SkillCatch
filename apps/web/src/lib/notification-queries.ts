import { supabase } from './supabaseClient'

export const NOTIFICATIONS_LIMIT = 30

// `data` shape per type — keep in sync with apps/admin-api/src/routes/skills.ts
export type AppNotification =
  | {
      id: string
      type: 'skill_approved'
      data: { skill_id: string; skill_name: string }
      read_at: string | null
      created_at: string
    }
  | {
      id: string
      type: 'skill_rejected'
      data: {
        skill_name: string
        reason: string
        duplicate_of_id?: string
        duplicate_of_name?: string | null
      }
      read_at: string | null
      created_at: string
    }

// RLS returns only the caller's rows
export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, data, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(NOTIFICATIONS_LIMIT)
  if (error) throw error
  return (data ?? []) as AppNotification[]
}

export async function markNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_notifications_read')
  if (error) throw error
}
