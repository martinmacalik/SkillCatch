import { supabase } from './supabaseClient'

export type BlockType =
  | 'heading' | 'text' | 'callout' | 'resource_list' | 'flashcards' | 'checklist'

export interface SkillNode {
  id: string
  name: string
  slug: string
  is_leaf: boolean
}

export interface LearningPage {
  id: string
  skill_node_id: string
  status: 'draft' | 'published'
  updated_at: string
}

export interface LearningBlock {
  id: string
  page_id: string
  type: BlockType
  content: Record<string, unknown>
  sort_order: number
}

export type UserSkillStatus = 'watchlist' | 'learning' | 'learned' | 'dormant'

export interface UserLearningSkill {
  skill_node_id: string
  status: UserSkillStatus
  created_at: string
  skill_nodes: { name: string; slug: string } | { name: string; slug: string }[] | null
}

// ── GLOBAL: page lookup by slug ──
export async function getSkillLearnPageBySlug(slug: string) {
  const { data: node } = await supabase
    .from('skill_nodes')
    .select('id, name, slug, is_leaf')
    .eq('slug', slug)
    .maybeSingle()
  if (!node) return null

  const { data: page } = await supabase
    .from('skill_learning_pages')
    .select('id, skill_node_id, status, updated_at')
    .eq('skill_node_id', node.id)
    .maybeSingle()

  if (!page) {
    return { node: node as SkillNode, page: null, blocks: [] as LearningBlock[] }
  }

  const { data: blocks } = await supabase
    .from('skill_learning_blocks')
    .select('id, page_id, type, content, sort_order')
    .eq('page_id', page.id)
    .order('sort_order')

  return {
    node: node as SkillNode,
    page: page as LearningPage,
    blocks: (blocks ?? []) as LearningBlock[],
  }
}

// ── PERSONAL: dashboard ──
// "Learning" is the kanban column on user_skills.status — same source of truth
// as the SkillsPage. Don't duplicate this concept anywhere else.
export async function getUserLearningSkills(): Promise<UserLearningSkill[]> {
  const { data, error } = await supabase
    .from('user_skills')
    .select('skill_node_id, status, created_at, skill_nodes(name, slug)')
    .eq('status', 'learning')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as UserLearningSkill[]
}

// Sets a skill's status to 'learning'. Inserts the user_skills row if missing
// (which also adds it to the user's library — the expected behavior when
// adding a skill from a skill page they don't yet have).
export async function addSkillToLearn(skillNodeId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')
  const { error } = await supabase
    .from('user_skills')
    .upsert(
      { user_id: user.id, skill_node_id: skillNodeId, status: 'learning' },
      { onConflict: 'user_id,skill_node_id' },
    )
  if (error) throw error
}

// Doesn't delete — moves the skill back to 'watchlist' so it stays in the user's library.
export async function removeSkillFromLearn(skillNodeId: string) {
  const { error } = await supabase
    .from('user_skills')
    .update({ status: 'watchlist' })
    .eq('skill_node_id', skillNodeId)
  if (error) throw error
}

// Whether the skill is currently in the user's 'learning' column.
export async function isSkillInLearn(skillNodeId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_skills')
    .select('status')
    .eq('skill_node_id', skillNodeId)
    .maybeSingle()
  return data?.status === 'learning'
}

// ── PERSONAL NOTES ──
export async function getOrCreateUserSkillNotes(skillNodeId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not authenticated')

  const { data } = await supabase
    .from('user_skill_notes')
    .select('content, updated_at')
    .eq('skill_node_id', skillNodeId)
    .maybeSingle()

  if (data) return data

  const { data: created, error } = await supabase
    .from('user_skill_notes')
    .insert({ user_id: user.id, skill_node_id: skillNodeId, content: { text: '' } })
    .select('content, updated_at')
    .single()
  if (error) throw error
  return created
}

export async function updateUserSkillNotes(
  skillNodeId: string,
  content: Record<string, unknown>,
) {
  const { error } = await supabase
    .from('user_skill_notes')
    .update({ content })
    .eq('skill_node_id', skillNodeId)
  if (error) throw error
}

// ── EDITOR: pages ──
export async function ensureLearningPage(skillNodeId: string) {
  const { data: existing } = await supabase
    .from('skill_learning_pages')
    .select('id, skill_node_id, status, updated_at')
    .eq('skill_node_id', skillNodeId)
    .maybeSingle()
  if (existing) return existing as LearningPage

  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('skill_learning_pages')
    .insert({ skill_node_id: skillNodeId, created_by: user?.id, updated_by: user?.id })
    .select('id, skill_node_id, status, updated_at')
    .single()
  if (error) throw error
  return data as LearningPage
}

export async function setPageStatus(pageId: string, status: 'draft' | 'published') {
  const { error } = await supabase
    .from('skill_learning_pages')
    .update({ status })
    .eq('id', pageId)
  if (error) throw error
}

// ── EDITOR: blocks ──
export async function createLearningBlock(
  pageId: string,
  type: BlockType,
  sortOrder: number,
  content: Record<string, unknown> = {},
) {
  const { data, error } = await supabase
    .from('skill_learning_blocks')
    .insert({ page_id: pageId, type, content, sort_order: sortOrder })
    .select()
    .single()
  if (error) throw error
  return data as LearningBlock
}

export async function updateLearningBlock(id: string, content: Record<string, unknown>) {
  const { error } = await supabase
    .from('skill_learning_blocks')
    .update({ content })
    .eq('id', id)
  if (error) throw error
}

export async function deleteLearningBlock(id: string) {
  const { error } = await supabase
    .from('skill_learning_blocks')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function reorderLearningBlocks(pageId: string, ids: string[]) {
  const { error } = await supabase.rpc('reorder_learning_blocks', {
    p_page_id: pageId,
    p_ids: ids,
  })
  if (error) throw error
}

// ── ROLE (UI gating only — RLS is the real enforcer) ──
export async function getMyRoles(): Promise<string[]> {
  const { data } = await supabase.from('user_roles').select('role')
  return (data ?? []).map(r => r.role as string)
}
