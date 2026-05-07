import { supabase } from './supabaseClient'

export interface ProgressItem {
  id: string
  skill_node_id: string
  section: string
  sort_order: number
  text: string
}

// ── READ ──

export async function getProgressItems(skillNodeId: string): Promise<ProgressItem[]> {
  const { data, error } = await supabase
    .from('skill_progress_items')
    .select('id, skill_node_id, section, sort_order, text')
    .eq('skill_node_id', skillNodeId)
    .order('section')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as ProgressItem[]
}

export async function getMyProgressChecks(skillNodeId: string): Promise<Set<string>> {
  // Fetch item IDs for this skill first, then query only those checks.
  // Filtering on a joined table column via .eq() is unreliable in Supabase JS.
  const { data: skillItems } = await supabase
    .from('skill_progress_items')
    .select('id')
    .eq('skill_node_id', skillNodeId)

  if (!skillItems?.length) return new Set()

  const { data, error } = await supabase
    .from('user_progress_checks')
    .select('item_id')
    .in('item_id', skillItems.map(i => i.id))

  if (error) throw error
  return new Set((data ?? []).map(r => r.item_id))
}

// ── USER: toggle a check ──

export async function checkProgressItem(itemId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const { error } = await supabase
    .from('user_progress_checks')
    .upsert({ user_id: user.id, item_id: itemId }, { onConflict: 'user_id,item_id' })
  if (error) throw error
}

export async function uncheckProgressItem(itemId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const { error } = await supabase
    .from('user_progress_checks')
    .delete()
    .eq('user_id', user.id)
    .eq('item_id', itemId)
  if (error) throw error
}

// ── EDITOR: CRUD ──

export async function createProgressItem(
  skillNodeId: string,
  section: string,
  text: string,
  sortOrder: number,
): Promise<ProgressItem> {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('skill_progress_items')
    .insert({ skill_node_id: skillNodeId, section, text, sort_order: sortOrder, created_by: user?.id, updated_by: user?.id })
    .select('id, skill_node_id, section, sort_order, text')
    .single()
  if (error) throw error
  return data as ProgressItem
}

export async function updateProgressItem(
  id: string,
  patch: { section?: string; text?: string; sort_order?: number },
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('skill_progress_items')
    .update({ ...patch, updated_by: user?.id })
    .eq('id', id)
  if (error) throw error
}

export async function deleteProgressItem(id: string): Promise<void> {
  const { error } = await supabase.from('skill_progress_items').delete().eq('id', id)
  if (error) throw error
}
