import { supabase } from './supabaseClient'
import { resizeToBlob } from './avatarUpload'
import { normalizeUrl } from './links'

// Profile page blocks (table profile_cards). A page is a list of rows,
// each row holds 1–3 blocks side by side. See docs/learning/20-*.md.

export type BlockType = 'text' | 'image' | 'embed' | 'skill_list' | 'skill_spotlight'

export interface TextData { heading?: string; body?: string }
export interface ImageData { path?: string; caption?: string }
export interface EmbedData { kind?: 'youtube' | 'link'; url?: string; title?: string }
export interface SkillListData { title?: string; skill_ids?: string[] }
export interface SpotlightData { skill_id?: string; show_time?: boolean }

export type BlockData = TextData & ImageData & EmbedData & SkillListData & SpotlightData

export interface Block {
  id: string
  type: BlockType
  data: BlockData
  row_index: number
  col_index: number
}

export type Rows = Block[][]

// Live skill data from get_profile_skills()
export interface ProfileSkill {
  id: string
  name: string
  image_url: string | null
  status: 'watchlist' | 'learning' | 'learned' | 'dormant'
  level: { name: string; rank: number; total: number } | null
  progress: { done: number; total: number } | null
  attributes: { label: string; unit: string | null; value: unknown }[]
  time: { total_seconds: number; last_30d_seconds: number } | null // null = hidden
  teaches: { level: string; verified: boolean } | null
}

export const MAX_PER_ROW = 3
export const TEXT_BODY_MAX = 2000
export const TEXT_HEADING_MAX = 120
export const CAPTION_MAX = 200

// ── layout ─────────────────────────────────────────────────────────────────

export function toRows(blocks: Block[]): Rows {
  const sorted = [...blocks].sort((a, b) => a.row_index - b.row_index || a.col_index - b.col_index)
  const rows: Rows = []
  let lastRow: number | null = null
  for (const b of sorted) {
    if (b.row_index !== lastRow) { rows.push([]); lastRow = b.row_index }
    rows[rows.length - 1].push(b)
  }
  return rows
}

// rows → blocks with row_index/col_index renumbered 0, 1, 2 … (no gaps)
export function flatten(rows: Rows): Block[] {
  return rows
    .filter(r => r.length > 0)
    .flatMap((r, ri) => r.map((b, ci) => ({ ...b, row_index: ri, col_index: ci })))
}

// Can `type` join a row that already holds `row` (without the block being moved)?
// Max 3 per row; a spotlight needs space, so it shares a row with at most one block.
export function canJoinRow(row: Block[], type: BlockType): boolean {
  const types = [...row.map(b => b.type), type]
  if (types.length > MAX_PER_ROW) return false
  if (types.includes('skill_spotlight') && types.length > 2) return false
  return true
}

export type DropTarget =
  | { kind: 'gap'; index: number } // new row before row `index` (rows.length = at the end)
  | { kind: 'beside'; blockId: string; side: 'left' | 'right' }

export function moveBlock(rows: Rows, blockId: string, target: DropTarget): Rows | null {
  const moving = rows.flat().find(b => b.id === blockId)
  if (!moving) return null
  if (target.kind === 'beside' && target.blockId === blockId) return null

  const without = rows.map(r => r.filter(b => b.id !== blockId))

  if (target.kind === 'gap') {
    // insert BEFORE dropping emptied rows, so the gap index still points to the original rows
    const next = [...without]
    next.splice(target.index, 0, [moving])
    return next.filter(r => r.length > 0)
  }

  const ri = without.findIndex(r => r.some(b => b.id === target.blockId))
  if (ri < 0 || !canJoinRow(without[ri], moving.type)) return null
  const row = [...without[ri]]
  const ci = row.findIndex(b => b.id === target.blockId)
  row.splice(target.side === 'left' ? ci : ci + 1, 0, moving)
  const next = [...without]
  next[ri] = row
  return next.filter(r => r.length > 0)
}

// ── queries ────────────────────────────────────────────────────────────────

const COLUMNS = 'id, type, data, row_index, col_index'

export async function fetchBlocks(userId: string): Promise<Block[]> {
  const { data, error } = await supabase
    .from('profile_cards')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('row_index')
    .order('col_index')
  if (error) throw error
  return (data ?? []) as Block[]
}

export async function createBlock(
  userId: string,
  type: BlockType,
  rowIndex: number,
  colIndex: number,
): Promise<Block> {
  const data: BlockData = type === 'skill_spotlight' ? { show_time: true } : {}
  const { data: row, error } = await supabase
    .from('profile_cards')
    .insert({ user_id: userId, type, data, row_index: rowIndex, col_index: colIndex })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return row as Block
}

export async function updateBlockData(id: string, data: BlockData): Promise<void> {
  const { error } = await supabase.from('profile_cards').update({ data }).eq('id', id)
  if (error) throw error
}

export async function deleteBlock(block: Block): Promise<void> {
  const { error } = await supabase.from('profile_cards').delete().eq('id', block.id)
  if (error) throw error
  if (block.type === 'image' && block.data.path) await removeProfileImage(block.data.path)
}

export async function saveLayout(blocks: Block[]): Promise<void> {
  const layout = blocks.map(b => ({ id: b.id, row: b.row_index, col: b.col_index }))
  const { error } = await supabase.rpc('save_profile_layout', { p_layout: layout })
  if (error) throw error
}

export async function fetchProfileSkills(userId: string): Promise<Map<string, ProfileSkill>> {
  const { data, error } = await supabase.rpc('get_profile_skills', { p_user_id: userId })
  if (error) throw error
  return new Map(((data ?? []) as ProfileSkill[]).map(s => [s.id, s]))
}

// ── images (bucket profile-media, own folder) ──────────────────────────────

const IMAGE_MAX_INPUT = 15 * 1024 * 1024
const IMAGE_MAX_DIM = 1600

export async function uploadProfileImage(userId: string, file: File): Promise<string> {
  if (file.size > IMAGE_MAX_INPUT) throw new Error('File is larger than 15 MB.')
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Only JPEG, PNG, or WebP images are allowed.')
  const blob = await resizeToBlob(file, IMAGE_MAX_DIM)
  const path = `${userId}/blocks/${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage
    .from('profile-media')
    .upload(path, blob, { contentType: 'image/webp', upsert: false })
  if (error) throw new Error(error.message)
  return path
}

export async function removeProfileImage(path: string): Promise<void> {
  await supabase.storage.from('profile-media').remove([path])
}

export const profileImageUrl = (path: string) =>
  supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl

// ── embeds (helpers live in links.ts) ──────────────────────────────────────
export { normalizeUrl, hostOf, youtubeId } from './links'


// ── what a visitor sees ────────────────────────────────────────────────────

// Empty blocks stay as placeholders in the editor but aren't shown publicly
export function isVisible(block: Block, skills: Map<string, ProfileSkill>): boolean {
  const d = block.data
  switch (block.type) {
    case 'text': return !!(d.heading?.trim() || d.body?.trim())
    case 'image': return !!d.path
    case 'embed': return !!d.url && normalizeUrl(d.url) !== null
    case 'skill_list': return (d.skill_ids ?? []).some(id => skills.has(id))
    case 'skill_spotlight': return !!d.skill_id && skills.has(d.skill_id)
  }
}

export function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  const h = seconds / 3600
  return `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)} h`
}
