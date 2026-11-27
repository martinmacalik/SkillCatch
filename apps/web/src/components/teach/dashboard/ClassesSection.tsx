import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, GraduationCap } from 'lucide-react'
import { fetchClassesOverview, formatDue, type ClassOverview } from '@/lib/teach-assignments-queries'
import { colorForIndex } from '@/pages/skills/types'

/**
 * One card per skill you teach = one "class" (its active students).
 * reloadKey: changes when a request was accepted, so a new class shows up.
 */
export function ClassesSection({ reloadKey }: { reloadKey: number }) {
  const [classes, setClasses] = useState<ClassOverview[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchClassesOverview()
      .then(c => { if (alive) { setClasses(c); setError(null) } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not load classes.') })
    return () => { alive = false }
  }, [reloadKey])

  return (
    <section className="rounded-2xl bg-white p-5 sm:p-6">
      <h3 className="text-base font-semibold text-gray-900">Your classes</h3>
      <p className="mt-0.5 text-xs text-gray-400">Students grouped by skill. Each student only sees their own assignments.</p>

      {error ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : classes === null ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-gray-200 border-t-purple-600" />
        </div>
      ) : classes.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">Your classes appear here once a skill on your license is approved.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {classes.map(c => <ClassCard key={c.skill_node_id} c={c} />)}
        </div>
      )}
    </section>
  )
}

function ClassCard({ c }: { c: ClassOverview }) {
  return (
    <Link
      to={`/dashboard/teach/class/${c.skill_node_id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-gray-100 p-4 transition hover:border-purple-200 hover:shadow-sm"
    >
      <div className="flex items-center gap-3">
        {c.skill_image_url ? (
          <img src={c.skill_image_url} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colorForIndex(c.skill_name.length)}`}>
            <GraduationCap className="h-5 w-5 text-white/90" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{c.skill_name}</p>
          <p className="text-xs text-gray-500">
            {c.students} {c.students === 1 ? 'student' : 'students'} · {c.assignments}{' '}
            {c.assignments === 1 ? 'assignment' : 'assignments'}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition group-hover:text-purple-500" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {c.to_review > 0 ? (
          <span className="flex items-center gap-1.5 rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-600">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> {c.to_review} to review
          </span>
        ) : (
          <span className="text-gray-400">Nothing to review</span>
        )}
        {c.next_due && <span className="ml-auto text-gray-400">next due {formatDue(c.next_due)}</span>}
        {!c.licensed && (
          <span className="w-full rounded-full bg-amber-50 px-2 py-0.5 text-center font-medium text-amber-700">
            Not on your license · no new assignments
          </span>
        )}
      </div>
    </Link>
  )
}
