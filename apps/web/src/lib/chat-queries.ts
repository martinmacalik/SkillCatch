import { supabase } from './supabaseClient'

export const MESSAGE_MAX_LENGTH = 4000
export const MESSAGES_PAGE_SIZE = 50

export interface ChatProfile {
  id: string
  first_name: string | null
  last_name: string | null
  username: string | null
  avatar_url: string | null
}

export interface ConversationSummary {
  id: string
  lastMessageAt: string | null
  createdAt: string
  // the other person in the 1:1 chat (null after they deleted their account)
  other: ChatProfile | null
  // the other person hasn't accepted my chat request yet
  otherPending: boolean
  unread: boolean
}

export interface ConversationLists {
  requests: ConversationSummary[]      // I am pending → incoming chat requests
  conversations: ConversationSummary[] // I am accepted
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string | null
  type: 'text' | 'image' | 'skill' | 'system'
  body: string | null
  created_at: string
  edited_at: string | null
  deleted_at: string | null
}

const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, type, body, created_at, edited_at, deleted_at'
const PROFILE_COLUMNS = 'id, first_name, last_name, username, avatar_url'

export function displayName(p: ChatProfile | null): string {
  if (!p) return 'Deleted user'
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || p.username || 'User'
}

// "14:05" today, "Mon" this week, "12. 10." otherwise
export function formatChatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const diffDays = (now.getTime() - d.getTime()) / 86_400_000
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'numeric' })
}

interface ConversationRow {
  id: string
  last_message_at: string | null
  created_at: string
  conversation_participants: { user_id: string; status: 'pending' | 'accepted'; last_read_at: string | null }[]
}

// ── LIST: my 1:1 conversations + incoming requests ──
// participants.user_id references auth.users (not profiles), so PostgREST
// can't embed profiles → second query for the other people's profiles.
export async function fetchConversations(myId: string): Promise<ConversationLists> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, last_message_at, created_at, conversation_participants(user_id, status, last_read_at)')
    .eq('type', 'direct')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw error

  const rows = (data ?? []) as ConversationRow[]
  const otherIds = rows
    .flatMap(r => r.conversation_participants)
    .map(p => p.user_id)
    .filter(id => id !== myId)

  const profiles = new Map<string, ChatProfile>()
  if (otherIds.length > 0) {
    const { data: profs, error: profErr } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .in('id', [...new Set(otherIds)])
    if (profErr) throw profErr
    for (const p of (profs ?? []) as ChatProfile[]) profiles.set(p.id, p)
  }

  const result: ConversationLists = { requests: [], conversations: [] }
  for (const r of rows) {
    const me = r.conversation_participants.find(p => p.user_id === myId)
    if (!me) continue
    const other = r.conversation_participants.find(p => p.user_id !== myId)
    const summary: ConversationSummary = {
      id: r.id,
      lastMessageAt: r.last_message_at,
      createdAt: r.created_at,
      other: other ? profiles.get(other.user_id) ?? null : null,
      otherPending: other?.status === 'pending',
      unread:
        me.status === 'accepted' &&
        r.last_message_at !== null &&
        (me.last_read_at === null || Date.parse(me.last_read_at) < Date.parse(r.last_message_at)),
    }
    if (me.status === 'pending') result.requests.push(summary)
    else result.conversations.push(summary)
  }
  return result
}

// ── CONVERSATION ACTIONS (RPC) ──
export async function startDirectChat(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
    p_other_user_id: otherUserId,
  })
  if (error) throw error
  return data as string
}

export async function acceptRequest(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_conversation', { p_conversation_id: conversationId })
  if (error) throw error
}

export async function declineRequest(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('decline_conversation', { p_conversation_id: conversationId })
  if (error) throw error
}

export async function markRead(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId })
  if (error) throw error
}

// ── MESSAGES ──
// Returns oldest → newest. `before` = created_at of the oldest loaded message.
export async function fetchMessages(conversationId: string, before?: string): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MESSAGES_PAGE_SIZE)
  if (before) query = query.lt('created_at', before)

  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as Message[]).reverse()
}

// sender_id is filled by the column default auth.uid(); RLS checks it.
export async function sendTextMessage(conversationId: string, body: string): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, type: 'text', body })
    .select(MESSAGE_COLUMNS)
    .single()
  if (error) throw error
  return data as Message
}

// ── PEOPLE SEARCH (new chat) ──
export async function searchPeople(q: string, myId: string): Promise<ChatProfile[]> {
  let query = supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .neq('id', myId)
    .order('first_name')
    .limit(20)
  // , ( ) are PostgREST .or() syntax → strip them so input can't break the filter
  const term = q.replace(/[,()]/g, ' ').trim()
  if (term) {
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,username.ilike.%${term}%`)
  }
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ChatProfile[]
}
