import { supabase } from './supabaseClient'

// 10 minutes in the app on a day = that day counts toward the streak
export const STREAK_GOAL_SECONDS = 600

/** The user's local calendar date as YYYY-MM-DD (not UTC, so "today" matches their clock). */
export function localDay(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type DayActivity = {
  appSeconds: number
  skills: Record<string, number>
}

// RLS returns only the caller's rows
export async function fetchDayActivity(day: string): Promise<DayActivity> {
  const [app, skills] = await Promise.all([
    supabase.from('user_daily_activity').select('app_seconds').eq('day', day).maybeSingle(),
    supabase.from('user_skill_daily_time').select('skill_node_id, seconds').eq('day', day),
  ])
  if (app.error) throw app.error
  if (skills.error) throw skills.error
  const map: Record<string, number> = {}
  for (const row of skills.data ?? []) map[row.skill_node_id] = row.seconds
  return { appSeconds: app.data?.app_seconds ?? 0, skills: map }
}

/** Adds seconds to the day's totals; the server caps each delta at 300 s. */
export async function logActivity(
  day: string,
  appSeconds: number,
  skillNodeId: string | null = null,
  skillSeconds = 0
): Promise<void> {
  const { error } = await supabase.rpc('log_activity', {
    p_day: day,
    p_app_seconds: appSeconds,
    p_skill_node_id: skillNodeId,
    p_skill_seconds: skillSeconds,
  })
  if (error) throw error
}

/** Days before `today` with 10+ minutes in the app, newest first. */
export async function fetchStreakDays(today: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_daily_activity')
    .select('day')
    .lt('day', today)
    .gte('app_seconds', STREAK_GOAL_SECONDS)
    .order('day', { ascending: false })
    .limit(400)
  if (error) throw error
  return (data ?? []).map((r: { day: string }) => r.day)
}

/** Consecutive days ending yesterday (dates are YYYY-MM-DD, newest first). */
export function streakEndingYesterday(days: string[], today: string): number {
  let expected = addDays(today, -1)
  let streak = 0
  for (const day of days) {
    if (day !== expected) break
    streak++
    expected = addDays(expected, -1)
  }
  return streak
}

function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return localDay(new Date(y, m - 1, d + delta))
}
