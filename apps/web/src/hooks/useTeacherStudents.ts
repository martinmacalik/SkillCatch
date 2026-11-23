import { useCallback, useEffect, useState } from 'react'

import {
  fetchStudentsOverview,
  setStudentLinkStatus,
  type StudentOverview,
  type TeacherStudentStatus,
} from '@/lib/teacher-students-queries'

/** How often the list (and "active now") refreshes while the page is open. */
const REFRESH_MS = 60_000

/** The teacher's students + pending requests, refreshed every minute. */
export function useTeacherStudents(enabled: boolean) {
  const [rows, setRows] = useState<StudentOverview[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  // re-render "Active now" / "5 min ago" labels even when data did not change
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      setRows(await fetchStudentsOverview())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load students.')
    } finally {
      setLoading(false)
      setNow(Date.now())
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void load()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [enabled, load])

  const setStatus = useCallback(
    async (linkId: string, status: TeacherStudentStatus) => {
      await setStudentLinkStatus(linkId, status)
      await load()
    },
    [load],
  )

  return {
    requests: rows.filter((r) => r.status === 'pending'),
    students: rows.filter((r) => r.status === 'active'),
    loading,
    error,
    now,
    setStatus,
  }
}
