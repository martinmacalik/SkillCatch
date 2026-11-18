import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Flame } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { STREAK_GOAL_SECONDS } from '../../lib/activity-queries'
import { useTodayActivity } from '../../hooks/useActivityTracker'

type Slide = {
  key: string
  title: string
  seconds: number
  /** 0–1, fill of the bottom bar */
  progress: number
}

/**
 * Today's time, counted automatically by useActivityTracker. The first slide is
 * the whole app (bar = progress to the 10-minute streak goal), then one slide
 * per skill learned today (bar = its share of today's app time). Up/down arrows
 * switch slides, like an iPhone widget stack.
 */
export function LearningTracker() {
  const today = useTodayActivity()
  const [index, setIndex] = useState(0)
  const [names, setNames] = useState<Record<string, string>>({})

  const skillIds = Object.keys(today.skills)
  const missingKey = skillIds.filter(id => !names[id]).sort().join(',')

  // Names for skills that appeared today (a new one appears after opening its learn page)
  useEffect(() => {
    if (!missingKey) return
    supabase
      .from('skill_nodes')
      .select('id, name')
      .in('id', missingKey.split(','))
      .then(({ data }) => {
        if (!data) return
        setNames(prev => {
          const next = { ...prev }
          for (const n of data as { id: string; name: string }[]) next[n.id] = n.name
          return next
        })
      })
  }, [missingKey])

  const slides: Slide[] = [
    {
      key: 'app',
      title: 'Learning Tracker',
      seconds: today.appSeconds,
      progress: Math.min(today.appSeconds / STREAK_GOAL_SECONDS, 1),
    },
    ...skillIds
      .sort((a, b) => today.skills[b] - today.skills[a])
      .map(id => ({
        key: id,
        title: names[id] ?? '…',
        seconds: today.skills[id],
        progress: today.appSeconds ? Math.min(today.skills[id] / today.appSeconds, 1) : 0,
      })),
  ]

  // a new day starts with one slide again
  const current = Math.min(index, slides.length - 1)
  const streakDone = today.appSeconds >= STREAK_GOAL_SECONDS

  return (
    <div className="relative flex h-full min-h-48 overflow-hidden rounded-2xl bg-linear-to-br from-indigo-900 to-fuchsia-700 text-white">
      {/* slides stacked vertically, the stack moves by whole slides */}
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div
          className="absolute inset-0 transition-transform duration-300 ease-out"
          style={{ transform: `translateY(-${current * 100}%)` }}
        >
          {slides.map(slide => (
            <TrackerSlide key={slide.key} slide={slide} streakDone={streakDone} />
          ))}
        </div>
      </div>

      {slides.length > 1 && (
        <div className="flex flex-col items-center justify-center gap-1 pr-2">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => setIndex(Math.max(current - 1, 0))}
            disabled={current === 0}
            className="rounded-full p-1 transition hover:bg-white/15 disabled:opacity-30"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          {slides.map((s, i) => (
            <span
              key={s.key}
              className={`h-1.5 w-1.5 rounded-full ${i === current ? 'bg-white' : 'bg-white/35'}`}
            />
          ))}
          <button
            type="button"
            aria-label="Next"
            onClick={() => setIndex(Math.min(current + 1, slides.length - 1))}
            disabled={current === slides.length - 1}
            className="rounded-full p-1 transition hover:bg-white/15 disabled:opacity-30"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  )
}

function TrackerSlide({ slide, streakDone }: { slide: Slide; streakDone: boolean }) {
  const [big, small] = splitTime(slide.seconds)

  return (
    <div className="flex h-full flex-col justify-between p-5">
      <p className="truncate text-xl font-medium">{slide.title}</p>

      <div className="flex items-start justify-center gap-4">
        <TimeUnit value={big.value} label={big.label} />
        <span className="text-4xl font-bold leading-none">:</span>
        <TimeUnit value={small.value} label={small.label} />
      </div>

      <div className="flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/35">
          <div
            className="h-full rounded-full bg-white transition-[width] duration-500"
            style={{ width: `${slide.progress * 100}%` }}
          />
        </div>
        <Flame
          className={`h-7 w-7 shrink-0 ${streakDone ? 'fill-orange-400 text-orange-300' : 'text-white'}`}
          strokeWidth={1.5}
        />
      </div>
    </div>
  )
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-4xl font-bold leading-none tabular-nums">{value}</span>
      <span className="mt-1 text-sm text-white/90">{label}</span>
    </div>
  )
}

/** Minutes : Seconds under an hour, Hours : Minutes from then on. */
function splitTime(seconds: number) {
  if (seconds < 3600) {
    return [
      { value: Math.floor(seconds / 60), label: 'Minutes' },
      { value: seconds % 60, label: 'Seconds' },
    ] as const
  }
  return [
    { value: Math.floor(seconds / 3600), label: 'Hours' },
    { value: Math.floor((seconds % 3600) / 60), label: 'Minutes' },
  ] as const
}
