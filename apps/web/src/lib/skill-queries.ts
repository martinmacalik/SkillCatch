import { supabase } from './supabaseClient'
import type { SkillNode } from '../pages/skills/types'

export const SKILL_NAME_MIN = 2
export const SKILL_NAME_MAX = 60

export type UserSkillStatus = 'watchlist' | 'learning' | 'learned' | 'dormant'

// Accent/case-insensitive, typo-tolerant search (search_skill_nodes RPC).
// RLS hides other people's pending skills.
export async function searchSkills(query: string, limit = 30): Promise<SkillNode[]> {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await supabase.rpc('search_skill_nodes', { p_query: q, p_limit: limit })
  if (error) throw error
  return (data ?? []) as SkillNode[]
}

export interface CategoryOption {
  id: string
  name: string
  label: string // full path: "Sports › Winter › Skiing"
}

// Every approved category (non-leaf) with its full path, for the create form
export async function fetchCategoryOptions(): Promise<CategoryOption[]> {
  const { data, error } = await supabase
    .from('skill_nodes')
    .select('id, name, parent_id')
    .eq('is_leaf', false)
    .eq('status', 'approved')
  if (error) throw error

  const rows = (data ?? []) as { id: string; name: string; parent_id: string | null }[]
  const byId = new Map(rows.map(r => [r.id, r]))
  const labelOf = (r: (typeof rows)[number]) => {
    const parts = [r.name]
    let parent = r.parent_id ? byId.get(r.parent_id) : undefined
    // guard against a cycle in bad data
    for (let depth = 0; parent && depth < 20; depth++) {
      parts.unshift(parent.name)
      parent = parent.parent_id ? byId.get(parent.parent_id) : undefined
    }
    return parts.join(' › ')
  }

  return rows
    .map(r => ({ id: r.id, name: r.name, label: labelOf(r) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export type CreateSkillError =
  | { kind: 'duplicate'; existingId: string | null }
  | { kind: 'duplicate_pending' }
  | { kind: 'too_many_pending' }
  | { kind: 'invalid'; message: string }

export class CreateSkillFailed extends Error {
  reason: CreateSkillError

  constructor(reason: CreateSkillError) {
    super(reason.kind)
    this.reason = reason
  }
}

// Creates a pending skill and adds it to the caller's profile. Returns its id.
export async function createUserSkill(input: {
  name: string
  parentId: string
  showCreator: boolean
  status: UserSkillStatus
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_user_skill', {
    p_name: input.name,
    p_parent_id: input.parentId,
    p_show_creator: input.showCreator,
    p_status: input.status,
  })
  if (!error) return data as string

  const msg = error.message ?? ''
  if (msg.includes('duplicate_pending')) throw new CreateSkillFailed({ kind: 'duplicate_pending' })
  if (msg.includes('duplicate_skill')) {
    throw new CreateSkillFailed({ kind: 'duplicate', existingId: error.details || null })
  }
  if (msg.includes('too_many_pending')) throw new CreateSkillFailed({ kind: 'too_many_pending' })
  if (msg.includes('invalid_skill_name')) {
    throw new CreateSkillFailed({
      kind: 'invalid',
      message: `Name must be ${SKILL_NAME_MIN}–${SKILL_NAME_MAX} characters.`,
    })
  }
  if (msg.includes('invalid_parent')) {
    throw new CreateSkillFailed({ kind: 'invalid', message: 'Pick a category from the list.' })
  }
  throw error
}

export async function fetchSkillById(id: string): Promise<SkillNode | null> {
  const { data } = await supabase.from('skill_nodes').select('*').eq('id', id).maybeSingle()
  return (data as SkillNode | null) ?? null
}

// Display name for "Created by …" (only called when show_creator is on)
export async function fetchCreatorName(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('username, first_name, last_name')
    .eq('id', userId)
    .maybeSingle()
  if (!data) return null
  const full = [data.first_name, data.last_name].filter(Boolean).join(' ')
  return full || (data.username ? `@${data.username}` : null)
}

export async function setSkillShowCreator(skillId: string, show: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_skill_show_creator', { p_skill_id: skillId, p_show: show })
  if (error) throw error
}
