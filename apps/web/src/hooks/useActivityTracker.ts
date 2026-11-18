import { useEffect, useSyncExternalStore } from 'react'
import { useMatch } from 'react-router-dom'
import { useAuth } from '../contexts/AuthProvider'
import { fetchDayActivity, localDay, logActivity, type DayActivity } from '../lib/activity-queries'

// Automatic time tracking: no start/stop. While the tab is visible every second
// adds to today's app time and, on a skill's learn page, to that skill's time.
// Deltas are sent to the server every FLUSH_EVERY seconds and when the tab is
// hidden or closed.

const FLUSH_EVERY = 30

type Today = DayActivity & { day: string; loaded: boolean }

/* ── store: today's live totals, read by the dashboard widget ── */

let today: Today = { day: localDay(), appSeconds: 0, skills: {}, loaded: false }
const listeners = new Set<() => void>()

function setToday(next: Today) {
  today = next
  listeners.forEach(l => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Today's totals, re-rendering every second while time is being counted. */
export function useTodayActivity(): Today {
  return useSyncExternalStore(subscribe, () => today)
}

/* ── seconds counted but not yet sent ── */

type Pending = { day: string; app: number; skills: Record<string, number> }
let pending: Pending = { day: today.day, app: 0, skills: {} }

async function flush() {
  const batch = pending
  pending = { day: today.day, app: 0, skills: {} }
  const skillEntries = Object.entries(batch.skills)
  if (batch.app === 0 && skillEntries.length === 0) return

  try {
    // one call carries the app time + the first skill; extra skills (switched
    // between flushes) get their own call
    const [first, ...rest] = skillEntries
    await logActivity(batch.day, batch.app, first?.[0] ?? null, first?.[1] ?? 0)
    await Promise.all(rest.map(([id, secs]) => logActivity(batch.day, 0, id, secs)))
  } catch {
    // keep the seconds for the next try, as long as it's still the same day
    if (batch.day === pending.day) {
      pending.app += batch.app
      for (const [id, secs] of skillEntries) {
        pending.skills[id] = (pending.skills[id] ?? 0) + secs
      }
    }
  }
}

/* ── runner: mounted once in App ── */

export function useActivityTracker() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null
  const learnMatch = useMatch('/dashboard/learn/:skillId')
  const activeSkillId = learnMatch?.params.skillId ?? null

  // Load today's saved totals, then start counting on top of them
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const day = localDay()
    fetchDayActivity(day)
      .then(saved => {
        if (!cancelled) setToday({ day, ...saved, loaded: true })
      })
      .catch(() => {
        if (!cancelled) setToday({ day, appSeconds: 0, skills: {}, loaded: true })
      })
    return () => {
      cancelled = true
      void flush()
      setToday({ day: localDay(), appSeconds: 0, skills: {}, loaded: false })
    }
  }, [userId])

  // Tick every second while the tab is visible
  useEffect(() => {
    if (!userId) return
    let sinceFlush = 0

    const id = window.setInterval(() => {
      if (!today.loaded || document.visibilityState !== 'visible') return

      const day = localDay()
      if (day !== today.day) {
        // midnight: send yesterday's rest, start the new day empty
        void flush()
        setToday({ day, appSeconds: 0, skills: {}, loaded: true })
        pending = { day, app: 0, skills: {} }
      }

      pending.app++
      const skills = activeSkillId
        ? { ...today.skills, [activeSkillId]: (today.skills[activeSkillId] ?? 0) + 1 }
        : today.skills
      if (activeSkillId) {
        pending.skills[activeSkillId] = (pending.skills[activeSkillId] ?? 0) + 1
      }
      setToday({ ...today, appSeconds: today.appSeconds + 1, skills })

      if (++sinceFlush >= FLUSH_EVERY) {
        sinceFlush = 0
        void flush()
      }
    }, 1000)

    return () => window.clearInterval(id)
  }, [userId, activeSkillId])

  // Send what we have when the tab is hidden or closed
  useEffect(() => {
    if (!userId) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    const onPageHide = () => void flush()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [userId])
}
