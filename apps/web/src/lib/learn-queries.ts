import { supabase } from './supabaseClient'

export type BlockType =
  | 'heading' | 'text' | 'callout' | 'resource_list' | 'flashcards' | 'checklist'

export interface SkillNode {
  id: string
  name: string
  slug: string
  is_leaf: boolean
  image_url: string | null
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
  pinned: boolean
  last_opened_at: string | null
  created_at: string
  skill_nodes: { name: string; slug: string } | { name: string; slug: string }[] | null
}

// ── GLOBAL: page lookup by skill id ──
// Routes use UUIDs because skill_nodes.slug is not unique — multiple skills
// can share the same slug (e.g. "Biathlon" appearing under different parents).
export interface LearnPageData {
  node: SkillNode
  page: LearningPage | null
  blocks: LearningBlock[]
}
export async function getSkillLearnPageById(skillId: string): Promise<LearnPageData | null> {
  const { data: node } = await supabase
    .from('skill_nodes')
    .select('id, name, slug, is_leaf, image_url')
    .eq('id', skillId)
    .maybeSingle()
  if (!node) return null

  const { data: page } = await supabase
    .from('skill_learning_pages')
    .select('id, skill_node_id, status, updated_at')
    .eq('skill_node_id', node.id)
    .maybeSingle()

  if (!page) {
    return { node: node as SkillNode, page: null, blocks: [] }
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
//
// Ordering: pinned first, then most recently opened, then never-opened by created_at.
// Matches the composite index user_skills_user_recent_idx.
export async function getUserLearningSkills(): Promise<UserLearningSkill[]> {
  const { data, error } = await supabase
    .from('user_skills')
    .select('skill_node_id, status, pinned, last_opened_at, created_at, skill_nodes(name, slug)')
    .eq('status', 'learning')
    .order('pinned', { ascending: false })
    .order('last_opened_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as UserLearningSkill[]
}

// Returns the skill the Learn page should default to (top of the ordering).
// Null if the user has nothing in their Learning column.
export async function getDefaultLearnSkillId(): Promise<string | null> {
  const { data } = await supabase
    .from('user_skills')
    .select('skill_node_id')
    .eq('status', 'learning')
    .order('pinned', { ascending: false })
    .order('last_opened_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.skill_node_id ?? null
}

// Stamp now() onto user_skills.last_opened_at for the current user.
// Fire-and-forget; harmless if the skill isn't in the user's library.
export async function touchSkillLastOpened(skillNodeId: string): Promise<void> {
  await supabase.rpc('touch_skill_last_opened', { p_skill_node_id: skillNodeId })
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

// ── SUGGESTIONS (non-editor edit flow) ──
//
// Suggestions are submitted by users without editor permissions. The proposed
// list represents the FULL final state of the page after approval. Each entry:
//   { id?, type, content, sort_order }
//   - id present = keep existing block (possibly with edits)
//   - id absent  = create new
//   - any current block id not in the list = delete
export interface ProposedBlock {
  id?: string
  type: BlockType
  content: Record<string, unknown>
  sort_order: number
}

export async function submitLearningSuggestion(
  skillNodeId: string,
  proposedBlocks: ProposedBlock[],
  message: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('submit_learning_suggestion', {
    p_skill_node_id: skillNodeId,
    p_proposed_blocks: proposedBlocks,
    p_message: message,
  })
  if (error) throw error
  return data as string
}

// Returns the user's pending suggestion for this skill (if any) — used to
// show the "awaiting review" pill on the Learn page.
export async function getMyPendingSuggestion(skillNodeId: string) {
  const { data } = await supabase
    .from('skill_learning_suggestions')
    .select('id, created_at, message')
    .eq('skill_node_id', skillNodeId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}
