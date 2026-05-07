import { supabase } from './supabaseClient'

export interface SkillLevel {
  id: string
  skill_node_id: string
  sort_order: number
  name: string
  description: string | null
  criteria: { text: string }[]
}

export interface UserSkillLevel {
  level_id: string
  claimed_at: string
}

// ── READ ──

export async function getSkillLevels(skillNodeId: string): Promise<SkillLevel[]> {
  const { data, error } = await supabase
    .from('skill_levels')
    .select('id, skill_node_id, sort_order, name, description, criteria')
    .eq('skill_node_id', skillNodeId)
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as SkillLevel[]
}

export async function getMySkillLevel(skillNodeId: string): Promise<UserSkillLevel | null> {
  const { data } = await supabase
    .from('user_skill_level')
    .select('level_id, claimed_at')
    .eq('skill_node_id', skillNodeId)
    .maybeSingle()
  return data ?? null
}

// ── USER: claim a level ──

export async function claimSkillLevel(skillNodeId: string, levelId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const { error } = await supabase
    .from('user_skill_level')
    .upsert(
      { user_id: user.id, skill_node_id: skillNodeId, level_id: levelId, claimed_at: new Date().toISOString() },
      { onConflict: 'user_id,skill_node_id' },
    )
  if (error) throw error
}

export async function unclaimSkillLevel(skillNodeId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const { error } = await supabase
    .from('user_skill_level')
    .delete()
    .eq('user_id', user.id)
    .eq('skill_node_id', skillNodeId)
  if (error) throw error
}

// ── EDITOR: CRUD ──

export async function createSkillLevel(
  skillNodeId: string,
  name: string,
  sortOrder: number,
): Promise<SkillLevel> {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('skill_levels')
    .insert({ skill_node_id: skillNodeId, name, sort_order: sortOrder, criteria: [], created_by: user?.id, updated_by: user?.id })
    .select('id, skill_node_id, sort_order, name, description, criteria')
    .single()
  if (error) throw error
  return data as SkillLevel
}

export async function updateSkillLevel(
  id: string,
  patch: { name?: string; description?: string | null; criteria?: { text: string }[] },
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('skill_levels')
    .update({ ...patch, updated_by: user?.id })
    .eq('id', id)
  if (error) throw error
}

export async function deleteSkillLevel(id: string): Promise<void> {
  const { error } = await supabase.from('skill_levels').delete().eq('id', id)
  if (error) throw error
}
