import { useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Info } from 'lucide-react'
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
import { SkillFilterCombobox } from './SkillFilterCombobox'

// Learning Progress: one bar per day of a week (Mon–Sun), each compared with your usual
// for that weekday; ‹ › browse earlier weeks. Data = timer_heatmap (last 365 days).
// Pass skillNodeId to lock it to one skill (e.g. on a skill detail), otherwise a filter is shown.

interface Props {
  skillNodeId?: string
  title?: string
  className?: string
}

const MAX_WEEKS_BACK = 51 // data covers 365 days
const USUAL_WEEKS = 8 // "usual" = average of the last 8 same weekdays with activity
const DAY_MS = 86_400_000
const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// what each bar look means (also listed in the (i) popup)
type BarKind = 'met' | 'below' | 'usual' | 'empty'
const HATCH: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(-45deg, #a855f7 0 5px, transparent 5px 11px)', // purple-500
}
const BAR_CLASSES: Record<BarKind, string> = {
  met: 'bg-purple-500',
  below: 'bg-fuchsia-300',
  usual: '',
  empty: 'bg-gray-100',
}

// All date math in UTC on plain YYYY-MM-DD strings → no DST/timezone drift
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(toMs(iso)).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts })

interface WeekDay { day: string; minutes: number; usual: number; kind: BarKind; future: boolean; isToday: boolean; height: number }
interface Hover { day: string; minutes: number; usual: number; future: boolean; x: number; y: number }

export function LearningProgressCard({ skillNodeId, title = 'Learning Progress', className = '' }: Props) {
  const { session } = useAuth()
  const userId = session?.user.id

  const [weekOffset, setWeekOffset] = useState(0) // 0 = this week, 1 = last week …
  const [infoOpen, setInfoOpen] = useState(false)
  const [filter, setFilter] = useState<string>('') // '' = all skills
  const [skills, setSkills] = useState<TrackableSkill[]>([])
  const [data, setData] = useState<Map<string, number>>(new Map())
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [hover, setHover] = useState<Hover | null>(null)
  const [breakdown, setBreakdown] = useState<Record<string, DayBreakdownRow[] | 'loading'>>({})
  const requested = useRef(new Set<string>())
  const infoRef = useRef<HTMLDivElement>(null)

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

  // close the (i) popup on a click outside of it
  useEffect(() => {
    if (!infoOpen) return
    const onDown = (e: MouseEvent) => {
      if (!infoRef.current?.contains(e.target as Node)) setInfoOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [infoOpen])

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

  const todayMs = toMs(pragueToday())
  const currentMondayMs = todayMs - ((new Date(todayMs).getUTCDay() + 6) % 7) * DAY_MS // Mon = 0

  const week = useMemo(() => {
    const mondayMs = currentMondayMs - weekOffset * 7 * DAY_MS
    const days: Omit<WeekDay, 'height'>[] = []
    for (let i = 0; i < 7; i++) {
      const ms = mondayMs + i * DAY_MS
      const day = toIso(ms)
      const minutes = data.get(day) ?? 0

      // average of the same weekday in the previous weeks, only days with activity
      const past: number[] = []
      for (let k = 1; k <= USUAL_WEEKS; k++) {
        const m = data.get(toIso(ms - k * 7 * DAY_MS)) ?? 0
        if (m > 0) past.push(m)
      }
      const usual = past.length ? Math.round(past.reduce((a, b) => a + b, 0) / past.length) : 0

      const kind: BarKind =
        minutes > 0 ? (usual === 0 || minutes >= usual ? 'met' : 'below') : usual > 0 ? 'usual' : 'empty'
      days.push({ day, minutes, usual, kind, future: ms > todayMs, isToday: ms === todayMs })
    }

    // bar height relative to the tallest value shown this week
    const shown = (d: { minutes: number; usual: number }) => (d.minutes > 0 ? d.minutes : d.usual)
    const max = Math.max(1, ...days.map(shown))

    const label = weekOffset === 0
      ? 'This week'
      : weekOffset === 1
        ? 'Last week'
        : `${fmt(toIso(mondayMs), { day: 'numeric', month: 'short' })} – ${fmt(toIso(mondayMs + 6 * DAY_MS), { day: 'numeric', month: 'short' })}`

    return {
      days: days.map(d => ({ ...d, height: (shown(d) / max) * 100 })) as WeekDay[],
      total: days.reduce((a, d) => a + d.minutes, 0),
      activeDays: days.filter(d => d.minutes > 0).length,
      usualTotal: days.reduce((a, d) => a + d.usual, 0),
      label,
    }
  }, [data, weekOffset, todayMs, currentMondayMs])

  function showTooltip(d: WeekDay, el: HTMLElement) {
    const rect = el.getBoundingClientRect()
    setHover({ day: d.day, minutes: d.minutes, usual: d.usual, future: d.future, x: rect.left + rect.width / 2, y: rect.top })
    // lazy per-day breakdown, fetched once
    if (d.minutes > 0 && !requested.current.has(d.day)) {
      requested.current.add(d.day)
      setBreakdown(b => ({ ...b, [d.day]: 'loading' }))
      timerDayBreakdown(d.day)
        .then(rows => setBreakdown(b => ({ ...b, [d.day]: rows })))
        .catch(() => {
          requested.current.delete(d.day)
          setBreakdown(b => ({ ...b, [d.day]: [] }))
        })
    }
  }

  const hoverRows = hover ? breakdown[hover.day] : undefined

  return (
    <div className={`flex min-w-0 flex-col gap-3 rounded-2xl bg-white p-6 ${className}`}>
      {/* header: title | stats · skill filter · (i) */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
          <Stat label={weekOffset === 0 ? 'This week' : 'Total'} value={week.total ? formatMinutes(week.total) : '0 min'} />
          <Stat label="Active days" value={`${week.activeDays} / 7`} />
          <Stat label="Usual week" value={week.usualTotal ? formatMinutes(week.usualTotal) : '—'} />
          <div className="flex items-center gap-1">
            {!skillNodeId && <SkillFilterCombobox skills={skills} value={filter} onChange={setFilter} />}
            <div ref={infoRef} className="relative">
              <button
                type="button"
                onClick={() => setInfoOpen(o => !o)}
                aria-expanded={infoOpen}
                aria-label="What do the colours mean?"
                className={`flex h-7 w-7 items-center justify-center rounded-full transition ${infoOpen ? 'bg-purple-100 text-purple-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
              >
                <Info className="h-4 w-4" />
              </button>
              {infoOpen && (
                <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-gray-100 bg-white p-4 text-xs text-gray-600 shadow-lg">
                  <Legend />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* week navigation */}
      <div className="flex items-center gap-1">
        <ArrowButton onClick={() => setWeekOffset(o => o + 1)} disabled={weekOffset >= MAX_WEEKS_BACK} label="Previous week">
          <ChevronLeft className="h-4 w-4" />
        </ArrowButton>
        <span className="min-w-28 text-center text-xs font-medium text-gray-600">{week.label}</span>
        <ArrowButton onClick={() => setWeekOffset(o => o - 1)} disabled={weekOffset === 0} label="Next week">
          <ChevronRight className="h-4 w-4" />
        </ArrowButton>
      </div>

      {/* 7 bars */}
      <div
        className={`grid min-h-36 flex-1 grid-cols-7 gap-2 transition-opacity sm:gap-4 ${loading ? 'opacity-50' : ''}`}
        onMouseLeave={() => setHover(null)}
      >
        {week.days.map((d, i) => (
          <div key={d.day} className="flex min-h-0 flex-col items-center gap-2">
            <div className="relative w-full flex-1">
              <button
                type="button"
                aria-label={`${d.day}: ${formatMinutes(d.minutes)}`}
                onMouseEnter={(e: ReactMouseEvent<HTMLElement>) => showTooltip(d, e.currentTarget)}
                onFocus={(e: FocusEvent<HTMLElement>) => showTooltip(d, e.currentTarget)}
                onClick={(e: ReactMouseEvent<HTMLElement>) => showTooltip(d, e.currentTarget)}
                onBlur={() => setHover(null)}
                className={`absolute bottom-0 left-1/2 min-h-7 w-full max-w-14 -translate-x-1/2 rounded-full outline-none transition-[height] ${BAR_CLASSES[d.kind]} ${
                  d.isToday ? 'ring-2 ring-purple-900 ring-offset-2' : 'hover:ring-2 hover:ring-purple-900/30 focus-visible:ring-2 focus-visible:ring-purple-900/30'
                }`}
                style={{ height: d.kind === 'empty' ? undefined : `${d.height}%`, ...(d.kind === 'usual' ? HATCH : {}) }}
              />
            </div>
            <span className={`text-sm text-purple-500 ${d.isToday ? 'font-bold' : 'font-medium'}`}>{WEEK_LETTERS[i]}</span>
          </div>
        ))}
      </div>

      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 w-max max-w-60 -translate-x-1/2 -translate-y-full rounded-xl bg-gray-900 px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          <p className="font-semibold">{fmt(hover.day, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</p>
          <p className="text-white/70">
            {hover.minutes > 0 ? `${formatMinutes(hover.minutes)} total` : hover.future ? 'Upcoming' : 'No tracked time'}
          </p>
          {hover.usual > 0 && <p className="text-white/50">Usually {formatMinutes(hover.usual)}</p>}
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

/* ── Sub-components ── */

function ArrowButton({ onClick, disabled, label, children }: { onClick: () => void; disabled: boolean; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

function LegendRow({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0">{swatch}</span>
      <span>{children}</span>
    </li>
  )
}

function Legend() {
  const pill = 'block h-5 w-3.5 rounded-full'
  return (
    <>
      <p className="mb-2 font-semibold text-gray-900">What the bars mean</p>
      <ul className="flex flex-col gap-2">
        <LegendRow swatch={<span className={`${pill} bg-purple-500`} />}>
          <b className="text-gray-900">Purple</b>: you did at least your usual for that weekday.
        </LegendRow>
        <LegendRow swatch={<span className={`${pill} bg-fuchsia-300`} />}>
          <b className="text-gray-900">Pink</b>: some time, but less than usual.
        </LegendRow>
        <LegendRow swatch={<span className={pill} style={HATCH} />}>
          <b className="text-gray-900">Striped</b>: nothing tracked yet. The bar shows your usual, so a striped past day is one you skipped.
        </LegendRow>
        <LegendRow swatch={<span className={`${pill} bg-purple-500 ring-2 ring-purple-900 ring-offset-1`} />}>
          <b className="text-gray-900">Outline</b>: today.
        </LegendRow>
        <LegendRow swatch={<span className={`${pill} bg-gray-100`} />}>
          <b className="text-gray-900">Grey</b>: no history for that weekday yet.
        </LegendRow>
      </ul>
      <p className="mt-3 border-t border-gray-100 pt-2 text-[11px] text-gray-400">
        Bar height = minutes. “Usual” is your average for that weekday over the last {USUAL_WEEKS} weeks, counting only days you tracked. Use ‹ › to look at earlier weeks.
      </p>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-[11px] leading-tight text-gray-400">{label}</p>
      <p className="text-sm font-semibold leading-tight text-gray-900">{value}</p>
    </div>
  )
}
