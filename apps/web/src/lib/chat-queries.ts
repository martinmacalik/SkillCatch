import { supabase } from './supabaseClient'
import { uploadToAvatars } from './avatarUpload'

export const MESSAGE_MAX_LENGTH = 4000
export const MESSAGES_PAGE_SIZE = 50

export interface ChatProfile {
  id: string
  first_name: string | null
  last_name: string | null
  username: string | null
  avatar_url: string | null
}

export type ParticipantRole = 'owner' | 'admin' | 'member'

export interface ChatMember extends ChatProfile {
  pending: boolean // invited, hasn't accepted yet
  role: ParticipantRole
}

export interface ConversationSummary {
  id: string
  type: 'direct' | 'group'
  title: string | null // groups only
  avatarPath: string | null // group photo in the avatars bucket (groups only)
  lastMessageAt: string | null
  createdAt: string
  // the other person in the 1:1 chat (null after they deleted their account; always null for groups)
  other: ChatProfile | null
  // everyone except me (groups: incl. pending invites)
  members: ChatMember[]
  myRole: ParticipantRole
  // the other person hasn't accepted my chat request yet (1:1 only)
  otherPending: boolean
  unread: boolean
  // 1:1 only: a block in either direction → nobody can write
  blockedByMe: boolean
  blockedMe: boolean
}

export interface ConversationLists {
  requests: ConversationSummary[]      // I am pending → incoming chat requests
  conversations: ConversationSummary[] // I am accepted
  blockedIds: string[]                 // users with a block in either direction
}

export function conversationName(c: ConversationSummary): string {
  return c.type === 'group' ? c.title ?? 'Group' : displayName(c.other)
}

// what a system message says; the frontend writes the text so names stay current
export interface SystemMetadata {
  event: 'group_created' | 'member_added' | 'member_joined' | 'member_left' | 'member_removed' | 'renamed' | 'photo_changed' | 'role_changed'
  actor_id: string | null
  target_id?: string
  title?: string
  role?: ParticipantRole
}

// snapshot of the sender's progress, taken by share_skill() when sharing
// (other people's progress isn't readable, so the card can't load it live)
export interface SkillShareMetadata {
  name: string
  image_url: string | null
  status: 'watchlist' | 'learning' | 'learned' | 'dormant'
  level: { name: string; rank: number; total: number } | null
  progress: { done: number; total: number } | null
  attributes: { label: string; unit: string | null; value: unknown }[]
}

export const REACTION_EMOJI = ['👍', '👎', '😂', '😮'] as const
export type ReactionEmoji = (typeof REACTION_EMOJI)[number]

export interface Reaction {
  user_id: string
  emoji: ReactionEmoji
}

// the replied message, as far as the preview needs it
export interface ReplyPreview {
  id: string
  sender_id: string | null
  type: MessageRow['type']
  body: string | null
  metadata: MessageRow['metadata']
  deleted_at: string | null
}

// columns of the messages table (= what a Realtime payload carries)
export interface MessageRow {
  id: string
  conversation_id: string
  sender_id: string | null
  type: 'text' | 'image' | 'skill' | 'system'
  body: string | null
  reply_to_id: string | null
  skill_node_id: string | null // 'skill' only; null once the skill itself is deleted
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  metadata: SystemMetadata | SkillShareMetadata | null // system + skill messages
}

// + data embedded by the select
export interface Message extends MessageRow {
  reactions: Reaction[]
  reply_to: ReplyPreview | null
}

const ROW_COLUMNS =
  'id, conversation_id, sender_id, type, body, reply_to_id, skill_node_id, created_at, edited_at, deleted_at, metadata'
// message_reactions has an FK to messages → PostgREST can embed it;
// reply_to embeds the same table through the reply_to_id FK
const MESSAGE_COLUMNS =
  `${ROW_COLUMNS}, reactions:message_reactions(user_id, emoji), ` +
  'reply_to:messages!reply_to_id(id, sender_id, type, body, metadata, deleted_at)'

// a Realtime payload is a bare row → add the embedded fields
export function fromRow(row: MessageRow): Message {
  return { ...row, reactions: [], reply_to: null }
}
// one-line text of a message for reply previews
export function messagePreview(m: Pick<ReplyPreview, 'type' | 'body' | 'metadata'>): string {
  if (m.type === 'skill' && m.metadata) return `Shared skill: ${(m.metadata as SkillShareMetadata).name}`
  return m.body ?? ''
}

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
  type: 'direct' | 'group'
  title: string | null
  avatar_path: string | null
  last_message_at: string | null
  created_at: string
  conversation_participants: {
    user_id: string
    role: ParticipantRole
    status: 'pending' | 'accepted'
    last_read_at: string | null
  }[]
}

// ── LIST: my conversations (1:1 + groups) + incoming requests ──
// participants.user_id references auth.users (not profiles), so PostgREST
// can't embed profiles → second query for the other people's profiles.
// Hidden chats and blocks are my own small tables → fetched alongside.
export async function fetchConversations(myId: string): Promise<ConversationLists> {
  const [convRes, hiddenRes, blocksRes] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, type, title, avatar_path, last_message_at, created_at, conversation_participants(user_id, role, status, last_read_at)')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase.from('hidden_conversations').select('conversation_id, hidden_at'),
    supabase.from('user_blocks').select('blocker_id, blocked_id'),
  ])
  if (convRes.error) throw convRes.error
  if (hiddenRes.error) throw hiddenRes.error
  if (blocksRes.error) throw blocksRes.error

  const rows = (convRes.data ?? []) as ConversationRow[]
  const hiddenAt = new Map(
    (hiddenRes.data as { conversation_id: string; hidden_at: string }[]).map(h => [h.conversation_id, h.hidden_at]),
  )
  const blocks = blocksRes.data as { blocker_id: string; blocked_id: string }[]
  const blockedByMe = new Set(blocks.filter(b => b.blocker_id === myId).map(b => b.blocked_id))
  const blockedMe = new Set(blocks.filter(b => b.blocked_id === myId).map(b => b.blocker_id))

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

  const result: ConversationLists = {
    requests: [],
    conversations: [],
    blockedIds: [...new Set([...blockedByMe, ...blockedMe])],
  }
  for (const r of rows) {
    const me = r.conversation_participants.find(p => p.user_id === myId)
    if (!me) continue

    // hidden until a newer message arrives
    const hidden = hiddenAt.get(r.id)
    if (hidden && Date.parse(hidden) >= Date.parse(r.last_message_at ?? r.created_at)) continue

    const others = r.conversation_participants.filter(p => p.user_id !== myId)
    const members: ChatMember[] = others.flatMap(p => {
      const prof = profiles.get(p.user_id)
      return prof ? [{ ...prof, pending: p.status === 'pending', role: p.role }] : []
    })
    const other = r.type === 'direct' ? others[0] : undefined

    const summary: ConversationSummary = {
      id: r.id,
      type: r.type,
      title: r.title,
      avatarPath: r.avatar_path,
      lastMessageAt: r.last_message_at,
      createdAt: r.created_at,
      other: other ? profiles.get(other.user_id) ?? null : null,
      members,
      myRole: me.role,
      otherPending: other?.status === 'pending',
      unread:
        me.status === 'accepted' &&
        r.last_message_at !== null &&
        (me.last_read_at === null || Date.parse(me.last_read_at) < Date.parse(r.last_message_at)),
      blockedByMe: !!other && blockedByMe.has(other.user_id),
      blockedMe: !!other && blockedMe.has(other.user_id),
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

// The group name is required by the DB → made from everyone's first names,
// e.g. "Adam, Petr, Martin". Any member can rename it later (renameGroup).
export async function createGroup(myId: string, members: ChatProfile[]): Promise<string> {
  const { data: me } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', myId).single()
  const names = [...members, ...(me ? [me as ChatProfile] : [])].map(p => p.first_name || displayName(p))
  let title = names.join(', ')
  if (title.length > 100) title = title.slice(0, 97) + '…'

  const { data, error } = await supabase.rpc('create_group_conversation', {
    p_title: title,
    p_member_ids: members.map(m => m.id),
  })
  if (error) throw error
  return data as string
}

// owner/admin only; invited people get a pending request
export async function addGroupMembers(conversationId: string, userIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('add_conversation_members', {
    p_conversation_id: conversationId,
    p_user_ids: userIds,
  })
  if (error) throw error
}

export async function leaveGroup(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_conversation', { p_conversation_id: conversationId })
  if (error) throw error
}

// ── GROUP SETTINGS ──
export function groupAvatarUrl(path: string): string {
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

// any member
export async function renameGroup(conversationId: string, title: string): Promise<void> {
  const { error } = await supabase.rpc('rename_conversation', {
    p_conversation_id: conversationId,
    p_title: title,
  })
  if (error) throw error
}

// any member; the file goes into MY folder of the avatars bucket.
// The previous photo is removed only if I uploaded it (storage policy).
export async function setGroupPhoto(
  myId: string,
  conversationId: string,
  file: File,
  priorPath: string | null,
): Promise<void> {
  const path = await uploadToAvatars(myId, file)
  const { error } = await supabase.rpc('set_group_avatar', {
    p_conversation_id: conversationId,
    p_path: path,
  })
  if (error) throw error
  if (priorPath?.startsWith(`${myId}/`)) await supabase.storage.from('avatars').remove([priorPath])
}

// owner/admin only
export async function removeGroupMember(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_conversation_member', {
    p_conversation_id: conversationId,
    p_user_id: userId,
  })
  if (error) throw error
}

// owner only — the whole chat disappears for everyone
export async function deleteGroup(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_group', { p_conversation_id: conversationId })
  if (error) throw error
}

export async function fetchProfile(id: string): Promise<ChatProfile | null> {
  const { data } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle()
  return data as ChatProfile | null
}

// 1:1 "trash": hidden from my list only, comes back with the next message
export async function hideConversation(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('hide_conversation', { p_conversation_id: conversationId })
  if (error) throw error
}

export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { p_user_id: userId })
  if (error) throw error
}

export async function unblockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_user', { p_user_id: userId })
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
  return ((data ?? []) as unknown as Message[]).reverse()
}

export async function fetchMessage(id: string): Promise<Message> {
  const { data, error } = await supabase.from('messages').select(MESSAGE_COLUMNS).eq('id', id).single()
  if (error) throw error
  return data as unknown as Message
}

// sender_id is filled by the column default auth.uid(); RLS checks it.
export async function sendTextMessage(
  conversationId: string,
  body: string,
  replyToId: string | null = null,
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, type: 'text', body, reply_to_id: replyToId })
    .select(MESSAGE_COLUMNS)
    .single()
  if (error) throw error
  return data as unknown as Message
}

// card with my progress on the skill; the RPC takes the snapshot (see SkillShareMetadata)
export async function shareSkill(conversationId: string, skillNodeId: string): Promise<Message> {
  const { data, error } = await supabase.rpc('share_skill', {
    p_conversation_id: conversationId,
    p_skill_node_id: skillNodeId,
  })
  if (error) throw error
  return fetchMessage(data as string)
}

export interface ShareableSkill {
  id: string
  name: string
  image_url: string | null
}

// skills in my profile that others can see (pending ones can't be shared)
export async function fetchShareableSkills(myId: string): Promise<ShareableSkill[]> {
  const { data, error } = await supabase
    .from('user_skills')
    .select('skill_nodes!inner(id, name, image_url, status)')
    .eq('user_id', myId)
    .eq('skill_nodes.status', 'approved')
  if (error) throw error
  const rows = (data ?? []) as unknown as { skill_nodes: ShareableSkill }[]
  return rows.map(r => r.skill_nodes).sort((a, b) => a.name.localeCompare(b.name))
}

export async function fetchMySkillIds(myId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('user_skills').select('skill_node_id').eq('user_id', myId)
  if (error) throw error
  return new Set((data ?? []).map(r => r.skill_node_id as string))
}

// RLS: only my own, not deleted message; the trigger sets edited_at
export async function editMessage(id: string, body: string): Promise<MessageRow> {
  const { data, error } = await supabase
    .from('messages')
    .update({ body })
    .eq('id', id)
    .select(ROW_COLUMNS)
    .single()
  if (error) throw error
  return data as MessageRow
}

// soft delete: the row stays (deleted_at set) so replies can still say "Message deleted",
// but the thread hides it
export async function deleteMessage(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_message', { p_message_id: id })
  if (error) throw error
}

// same emoji again (or null) removes my reaction
export async function setReaction(messageId: string, emoji: ReactionEmoji | null): Promise<void> {
  const { error } = await supabase.rpc('set_message_reaction', {
    p_message_id: messageId,
    p_emoji: emoji,
  })
  if (error) throw error
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
