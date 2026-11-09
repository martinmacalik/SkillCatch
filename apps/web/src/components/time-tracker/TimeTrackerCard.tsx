import { useEffect, useState } from 'react'
import { Pause, Play, Square } from 'lucide-react'
import { useAuth } from '@/contexts/AuthProvider'
import { emitAppEvent } from '@/lib/app-events'
import {
  elapsedSeconds,
  errorMessage,
  formatClock,
  getLastTrackedSkillId,
  getTrackableSkills,
  timerActive,
  timerPause,
  timerResume,
  timerStart,
  timerStop,
  type TimeSession,
  type TrackableSkill,
} from '@/lib/timer-queries'
import { SessionSummaryModal } from './SessionSummaryModal'

const GROUP_LABELS = { pinned: 'Pinned', learning: 'Learning', other: 'Other skills' } as const

export function TimeTrackerCard({ className = '' }: { className?: string }) {
  const { session: auth } = useAuth()
  const userId = auth?.user.id

  const [skills, setSkills] = useState<TrackableSkill[]>([])
  const [skillId, setSkillId] = useState('')
  const [active, setActive] = useState<TimeSession | null>(null)
  const [finished, setFinished] = useState<TimeSession | null>(null)
  const [, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // load skills, the running session and the last used skill
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    Promise.all([getTrackableSkills(userId), timerActive(), getLastTrackedSkillId(userId)])
      .then(([list, running, lastId]) => {
        if (cancelled) return
        setSkills(list)
        setActive(running)
        const preferred = running?.skill_node_id ?? lastId
        setSkillId(list.some(s => s.id === preferred) ? preferred! : (list[0]?.id ?? ''))
      })
      .catch(e => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [userId])

  // re-render every second while the clock runs
  const running = !!active && !active.paused_at
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [running])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(errorMessage(e))
      // resync with the server (e.g. a session started in another tab)
      timerActive().then(setActive).catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  const start = () => run(async () => setActive(await timerStart(skillId)))
  const pause = () => run(async () => setActive(await timerPause()))
  const resume = () => run(async () => setActive(await timerResume()))
  const stop = () =>
    run(async () => {
      const done = await timerStop()
      setActive(null)
      setFinished(done)
      emitAppEvent('profile:refresh')
      emitAppEvent('timer:stopped')
    })

  const seconds = active ? elapsedSeconds(active) : 0
  const activeSkill = skills.find(s => s.id === (active?.skill_node_id ?? skillId))
  const groups = (['pinned', 'learning', 'other'] as const)
    .map(g => ({ g, items: skills.filter(s => s.group === g) }))
    .filter(x => x.items.length)

  const btn = 'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className={`flex flex-col gap-3 rounded-2xl bg-linear-to-br from-indigo-900 to-fuchsia-700 p-5 text-white ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-bold">Time Tracker</p>
        {active && (
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${running ? 'animate-pulse bg-emerald-400' : 'bg-amber-300'}`} title={running ? 'Running' : 'Paused'} />
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-white/70">What are you working on?</span>
        <select
          value={active?.skill_node_id ?? skillId}
          onChange={e => setSkillId(e.target.value)}
          disabled={!!active || loading || busy}
          className="w-full truncate rounded-xl bg-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40 disabled:opacity-80 [&_option]:text-gray-900"
        >
          {skills.length === 0 && <option value="">{loading ? 'Loading…' : 'No skills yet'}</option>}
          {groups.map(({ g, items }) => (
            <optgroup key={g} label={GROUP_LABELS[g]}>
              {items.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>

      <p className="font-mono text-4xl font-semibold tabular-nums tracking-tight" aria-live="off">
        {formatClock(seconds)}
      </p>

      <div className="mt-auto flex gap-2">
        {!active ? (
          <button onClick={start} disabled={!skillId || busy || loading} className={`${btn} bg-white text-purple-800 hover:bg-white/90`}>
            <Play className="h-4 w-4" /> Start
          </button>
        ) : (
          <>
            {running ? (
              <button onClick={pause} disabled={busy} className={`${btn} bg-white/15 hover:bg-white/25`}>
                <Pause className="h-4 w-4" /> Pause
              </button>
            ) : (
              <button onClick={resume} disabled={busy} className={`${btn} bg-white/15 hover:bg-white/25`}>
                <Play className="h-4 w-4" /> Resume
              </button>
            )}
            <button onClick={stop} disabled={busy} className={`${btn} bg-white text-purple-800 hover:bg-white/90`}>
              <Square className="h-4 w-4" /> Stop
            </button>
          </>
        )}
      </div>

      {error && <p className="text-xs text-rose-200">{error}</p>}

      {finished && (
        <SessionSummaryModal
          session={finished}
          skillName={skills.find(s => s.id === finished.skill_node_id)?.name ?? activeSkill?.name ?? 'Skill'}
          onClose={() => setFinished(null)}
        />
      )}
    </div>
  )
}
