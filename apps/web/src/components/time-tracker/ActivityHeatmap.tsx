import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { onAppEvent } from '@/lib/app-events'
import {
  formatMinutes,
  getTrackableSkills,
  pragueToday,
  timerDayBreakdown,
  timerHeatmap,
  type DayBreakdownRow,
  type TrackableSkill,
} from '@/lib/timer-queries'

// GitHub-style year of tracked time: 53 week columns × 7 days (Mon–Sun), no chart library.
// Pass skillNodeId to lock it to one skill (e.g. on a skill detail), otherwise a filter is shown.

interface Props {
  skillNodeId?: string
  title?: string
  className?: string
}

const WEEKS = 53
const DAY_MS = 86_400_000
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']

// 0 / 1–15 / 16–45 / 46–90 / 90+ minutes
const LEVEL_CLASSES = ['bg-gray-100', 'bg-purple-200', 'bg-purple-400', 'bg-purple-600', 'bg-purple-800']
function levelFor(minutes: number) {
  if (minutes <= 0) return 0
  if (minutes <= 15) return 1
  if (minutes <= 45) return 2
  if (minutes <= 90) return 3
  return 4
}

// All date math in UTC on plain YYYY-MM-DD strings → no DST/timezone drift
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(toMs(iso)).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts })

interface Cell { day: string; minutes: number; future: boolean }

export function ActivityHeatmap({ skillNodeId, title = 'Learning Progress', className = '' }: Props) {
  const { session } = useAuth()
  const userId = session?.user.id

  const [filter, setFilter] = useState<string>('') // '' = all skills
  const [skills, setSkills] = useState<TrackableSkill[]>([])
  const [data, setData] = useState<Map<string, number>>(new Map())
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [hover, setHover] = useState<{ day: string; minutes: number; x: number; y: number } | null>(null)
  const [breakdown, setBreakdown] = useState<Record<string, DayBreakdownRow[] | 'loading'>>({})
  const requested = useRef(new Set<string>())

  const effectiveSkill = skillNodeId ?? (filter || null)

  // skills for the filter (only when not locked to one skill)
  useEffect(() => {
    if (!userId || skillNodeId) return
    getTrackableSkills(userId).then(setSkills).catch(() => {})
  }, [userId, skillNodeId])

  // reload after a session is stopped anywhere in the app
  useEffect(() => onAppEvent('timer:stopped', () => {
    requested.current.clear()
    setBreakdown({})
    setReloadKey(k => k + 1)
  }), [])

  // loading = the data on screen isn't for the current filter/reload yet
  const queryKey = `${effectiveSkill ?? 'all'}|${reloadKey}`
  const loading = loadedKey !== queryKey

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    timerHeatmap(effectiveSkill)
      .then(rows => new Map(rows.map(r => [r.day, r.minutes])))
      .catch(() => new Map<string, number>())
      .then(map => {
        if (cancelled) return
        setData(map)
        setLoadedKey(queryKey)
      })
    return () => { cancelled = true }
  }, [userId, effectiveSkill, queryKey])

  // 53 columns ending with the current week (Monday-first)
  const { columns, monthLabels, stats } = useMemo(() => {
    const today = pragueToday()
    const todayMs = toMs(today)
    const weekday = (new Date(todayMs).getUTCDay() + 6) % 7 // Mon = 0
    const startMs = todayMs - (weekday + (WEEKS - 1) * 7) * DAY_MS
    const firstCountedMs = todayMs - 364 * DAY_MS // same 365-day window as the server

    const columns: Cell[][] = []
    const monthLabels: (string | null)[] = []
    let prevMonth = -1
    for (let c = 0; c < WEEKS; c++) {
      const col: Cell[] = []
      for (let r = 0; r < 7; r++) {
        const ms = startMs + (c * 7 + r) * DAY_MS
        const day = toIso(ms)
        col.push({ day, minutes: data.get(day) ?? 0, future: ms > todayMs })
      }
      columns.push(col)
      const month = new Date(startMs + c * 7 * DAY_MS).getUTCMonth()
      // label a column where a new month starts; skip the first one if it's mostly last month
      const label = month !== prevMonth && !(c === 0 && new Date(startMs).getUTCDate() > 21)
      monthLabels.push(label ? fmt(toIso(startMs + c * 7 * DAY_MS), { month: 'short' }) : null)
      prevMonth = month
    }

    // stats over the last 365 days
    let totalMinutes = 0, longest = 0, current = 0
    let best: { day: string; minutes: number } | null = null
    for (let ms = firstCountedMs; ms <= todayMs; ms += DAY_MS) {
      const day = toIso(ms)
      const m = data.get(day) ?? 0
      totalMinutes += m
      current = m > 0 ? current + 1 : 0
      longest = Math.max(longest, current)
      if (m > 0 && (!best || m > best.minutes)) best = { day, minutes: m }
    }

    return { columns, monthLabels, stats: { totalMinutes, longest, best } }
  }, [data])

  function showTooltip(cell: Cell, el: HTMLElement) {
    const rect = el.getBoundingClientRect()
    setHover({ day: cell.day, minutes: cell.minutes, x: rect.left + rect.width / 2, y: rect.top })
    // lazy per-day breakdown, fetched once
    if (cell.minutes > 0 && !requested.current.has(cell.day)) {
      requested.current.add(cell.day)
      setBreakdown(b => ({ ...b, [cell.day]: 'loading' }))
      timerDayBreakdown(cell.day)
        .then(rows => setBreakdown(b => ({ ...b, [cell.day]: rows })))
        .catch(() => {
          requested.current.delete(cell.day)
          setBreakdown(b => ({ ...b, [cell.day]: [] }))
        })
    }
  }

  const hoverRows = hover ? breakdown[hover.day] : undefined

  return (
    <div className={`flex min-w-0 flex-col gap-3 rounded-2xl bg-white p-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {!skillNodeId && (
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="max-w-48 truncate rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-200"
          >
            <option value="">All skills</option>
            {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {/* grid scrolls horizontally inside the card on narrow screens */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1" onMouseLeave={() => setHover(null)}>
        <div
          className={`grid min-w-160 gap-[3px] transition-opacity ${loading ? 'opacity-50' : ''}`}
          style={{ gridTemplateColumns: `auto repeat(${WEEKS}, minmax(0, 1fr))` }}
        >
          {/* month labels row */}
          <span />
          {monthLabels.map((m, c) => (
            <span key={`m${c}`} className="relative h-4 text-[10px] leading-4 text-gray-400">
              {m && <span className="absolute left-0 whitespace-nowrap">{m}</span>}
            </span>
          ))}

          {/* 7 rows: day label + 53 cells */}
          {DAY_LABELS.map((label, r) => (
            <Row key={r} label={label}>
              {columns.map(col => {
                const cell = col[r]
                if (cell.future) return <span key={cell.day} className="aspect-square" />
                return (
                  <button
                    key={cell.day}
                    type="button"
                    aria-label={`${cell.day}: ${formatMinutes(cell.minutes)}`}
                    onMouseEnter={e => showTooltip(cell, e.currentTarget)}
                    onFocus={e => showTooltip(cell, e.currentTarget)}
                    onClick={e => showTooltip(cell, e.currentTarget)}
                    onBlur={() => setHover(null)}
                    className={`aspect-square rounded-[3px] ${LEVEL_CLASSES[levelFor(cell.minutes)]} outline-none ring-purple-900/40 hover:ring-2 focus-visible:ring-2`}
                  />
                )
              })}
            </Row>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Stat label="Hours this year" value={(stats.totalMinutes / 60).toFixed(1)} />
          <Stat label="Longest streak" value={`${stats.longest} ${stats.longest === 1 ? 'day' : 'days'}`} />
          <Stat
            label="Most active day"
            value={stats.best ? fmt(stats.best.day, { day: 'numeric', month: 'short' }) : '—'}
            sub={stats.best ? formatMinutes(stats.best.minutes) : undefined}
          />
        </div>
        <div className="flex items-center gap-1 text-[10px] text-gray-400">
          Less
          {LEVEL_CLASSES.map(c => <span key={c} className={`h-2.5 w-2.5 rounded-[3px] ${c}`} />)}
          More
        </div>
      </div>

      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 w-max max-w-60 -translate-x-1/2 -translate-y-full rounded-xl bg-gray-900 px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          <p className="font-semibold">{fmt(hover.day, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
          <p className="text-white/70">{hover.minutes > 0 ? `${formatMinutes(hover.minutes)} total` : 'No tracked time'}</p>
          {hover.minutes > 0 && (
            <div className="mt-1.5 flex flex-col gap-0.5 border-t border-white/10 pt-1.5">
              {hoverRows === 'loading' || hoverRows === undefined ? (
                <span className="text-white/50">Loading…</span>
              ) : (
                hoverRows.map(r => (
                  <span key={r.skill_node_id} className={`flex justify-between gap-3 ${effectiveSkill && r.skill_node_id !== effectiveSkill ? 'text-white/40' : ''}`}>
                    <span className="truncate">{r.skill_name}</span>
                    <span className="shrink-0 tabular-nums">{formatMinutes(r.minutes)}</span>
                  </span>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="pr-1.5 text-[10px] leading-none text-gray-400 self-center">{label}</span>
      {children}
    </>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-900">
        {value}
        {sub && <span className="ml-1 font-normal text-gray-400">· {sub}</span>}
      </p>
    </div>
  )
}
