import { supabase } from './supabaseClient'

// Time Tracker: all writes go through the timer_* RPCs (see migration 20261109001_time_tracker.sql)

export interface TimeSession {
  id: string
  user_id: string
  skill_node_id: string
  started_at: string
  ended_at: string | null
  paused_at: string | null
  paused_seconds: number
  duration_seconds: number | null
  note: string | null
  xp_awarded: number
  created_at: string
}

export interface HeatmapDay {
  day: string // YYYY-MM-DD (Europe/Prague)
  minutes: number
}

export interface DayBreakdownRow {
  skill_node_id: string
  skill_name: string
  minutes: number
}

export type SkillGroup = 'pinned' | 'learning' | 'other'

export interface TrackableSkill {
  id: string
  name: string
  group: SkillGroup
}

// ── RPC wrappers ──

async function rpcSession(fn: string, args?: Record<string, unknown>): Promise<TimeSession> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as TimeSession
}

export const timerStart = (skillNodeId: string) => rpcSession('timer_start', { p_skill_node_id: skillNodeId })
export const timerPause = () => rpcSession('timer_pause')
export const timerResume = () => rpcSession('timer_resume')
export const timerStop = () => rpcSession('timer_stop')

export const timerLog = (sessionId: string, note: string, itemIds: string[]) =>
  rpcSession('timer_log', { p_session_id: sessionId, p_note: note, p_item_ids: itemIds })

export async function timerActive(): Promise<TimeSession | null> {
  const { data, error } = await supabase.rpc('timer_active').maybeSingle()
  if (error) throw error
  return (data as TimeSession | null) ?? null
}

export async function timerHeatmap(skillNodeId?: string | null): Promise<HeatmapDay[]> {
  const { data, error } = await supabase.rpc('timer_heatmap', { p_skill_node_id: skillNodeId ?? null })
  if (error) throw error
  return (data ?? []) as HeatmapDay[]
}

export async function timerDayBreakdown(day: string): Promise<DayBreakdownRow[]> {
  const { data, error } = await supabase.rpc('timer_day_breakdown', { p_day: day })
  if (error) throw error
  return (data ?? []) as DayBreakdownRow[]
}

// ── Reads ──

// My skills for the "What are you working on?" dropdown: pinned, then learning, then the rest
export async function getTrackableSkills(userId: string): Promise<TrackableSkill[]> {
  const { data, error } = await supabase
    .from('user_skills')
    .select('skill_node_id, pinned, status, last_opened_at, skill_nodes(name)')
    .eq('user_id', userId)
  if (error) throw error

  type Row = {
    skill_node_id: string
    pinned: boolean
    status: string
    last_opened_at: string | null
    skill_nodes: { name: string } | { name: string }[] | null
  }
  const nodeName = (n: Row['skill_nodes']) => (Array.isArray(n) ? n[0]?.name : n?.name)

  const rank = { pinned: 0, learning: 1, other: 2 } as const
  return ((data ?? []) as Row[])
    .map(r => ({
      id: r.skill_node_id,
      name: nodeName(r.skill_nodes) ?? 'Unnamed skill',
      group: (r.pinned ? 'pinned' : r.status === 'learning' ? 'learning' : 'other') as SkillGroup,
      opened: r.last_opened_at ?? '',
    }))
    .sort((a, b) => rank[a.group] - rank[b.group] || b.opened.localeCompare(a.opened) || a.name.localeCompare(b.name))
    .map(({ id, name, group }) => ({ id, name, group }))
}

// Skill of my most recent session, to preselect in the dropdown
export async function getLastTrackedSkillId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('time_sessions')
    .select('skill_node_id')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.skill_node_id ?? null
}

// ── Helpers ──

// Supabase errors are plain objects with a message, not always Error instances
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  const msg = (e as { message?: unknown } | null)?.message
  return typeof msg === 'string' && msg ? msg : fallback
}

// Seconds of real work so far, from server timestamps (survives a refresh)
export function elapsedSeconds(s: TimeSession, now = Date.now()): number {
  const end = s.ended_at ? Date.parse(s.ended_at) : now
  const openPause = s.paused_at ? end - Date.parse(s.paused_at) : 0
  const ms = end - Date.parse(s.started_at) - openPause - s.paused_seconds * 1000
  return Math.max(0, Math.floor(ms / 1000))
}

export function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':')
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

// Today's date in Europe/Prague as YYYY-MM-DD (same day boundary as the server)
export function pragueToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(new Date())
}
