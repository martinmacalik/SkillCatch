import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, GraduationCap, MessageCircle, ShieldCheck } from 'lucide-react'

import { useAuth } from '@/contexts/AuthProvider'
import { startDirectChat } from '@/lib/chat-queries'
import {
  fetchMyTeacherLinks,
  fetchSkillTeachers,
  requestTeacher,
  type MyTeacherLink,
  type SkillTeacher,
} from '@/lib/teacher-students-queries'
import { fetchMyAssignments, type MyAssignmentRow } from '@/lib/teach-assignments-queries'
import { LEVEL_LABELS, ROLE_LABELS, VERIFIED_LABELS } from '@/types/teaching'
import { formatNameWithTitles } from '@/components/teach/teach-utils'
import { YourTeacherCard } from './YourTeacherCard'
import { StudentAssignmentModal } from './StudentAssignmentModal'

/**
 * Learn sidebar, per skill:
 *   - with an active teacher: "Your teacher" card(s) with my assignments; other teachers folded away
 *   - otherwise: teachers with an approved license for this skill + "Learn with"
 * ?assignment=<id> opens that assignment (card click or a notification link).
 */
export function TeachersWidget({ skillNodeId }: { skillNodeId: string }) {
  const { session } = useAuth()
  const userId = session?.user.id
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const openId = params.get('assignment')

  const [teachers, setTeachers] = useState<SkillTeacher[]>([])
  const [links, setLinks] = useState<MyTeacherLink[]>([])
  const [assignments, setAssignments] = useState<MyAssignmentRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showOthers, setShowOthers] = useState(false)

  // bump to reload after a request / submission
  const [version, setVersion] = useState(0)
  const reload = () => setVersion(v => v + 1)

  useEffect(() => {
    let alive = true
    Promise.all([
      fetchSkillTeachers(skillNodeId),
      userId ? fetchMyTeacherLinks(userId, skillNodeId) : Promise.resolve([]),
      userId ? fetchMyAssignments(skillNodeId) : Promise.resolve([]),
    ])
      .then(([t, l, a]) => {
        if (!alive) return
        setTeachers(t)
        setLinks(l)
        setAssignments(a)
        setError(null)
      })
      .catch(() => { if (alive) setError('Could not load teachers.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [skillNodeId, userId, version])

  const ask = async (teacherId: string) => {
    if (!userId) return
    setBusyId(teacherId)
    try {
      await requestTeacher({ studentId: userId, teacherId, skillNodeId, message: '' })
      reload()
    } catch {
      setError('Could not send the request. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  const chat = async (teacherId: string) => {
    setBusyId(teacherId)
    try {
      navigate(`/dashboard/chats/${await startDirectChat(teacherId)}`)
    } finally {
      setBusyId(null)
    }
  }

  const setOpen = (id: string | null) =>
    setParams(p => {
      const next = new URLSearchParams(p)
      if (id) next.set('assignment', id)
      else next.delete('assignment')
      return next
    })

  const active = links.filter(l => l.status === 'active')
  const teacherNames = new Map(active.map(l => [l.teacherId, teachers.find(t => t.userId === l.teacherId)?.name ?? l.teacherName]))

  const list = (
    <div className="flex flex-col gap-2">
      {teachers.length === 0 ? (
        <p className="text-xs text-gray-400">No one is teaching this skill yet.</p>
      ) : (
        teachers.map(t => (
          <TeacherRow
            key={t.userId}
            t={t}
            link={links.find(l => l.teacherId === t.userId)}
            isMe={t.userId === userId}
            busy={busyId === t.userId}
            canAsk={!!userId}
            onAsk={() => void ask(t.userId)}
            onChat={() => void chat(t.userId)}
          />
        ))
      )}
    </div>
  )

  return (
    <>
      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <h3 className="text-base font-bold text-black">Teachers</h3>
          <p className="mt-4 text-xs text-gray-400">Loading…</p>
        </div>
      ) : active.length > 0 ? (
        <div className="flex flex-col gap-2">
          {active.map(l => {
            const t = teachers.find(x => x.userId === l.teacherId)
            return (
              <YourTeacherCard
                key={l.teacherId}
                teacherId={l.teacherId}
                name={t ? formatNameWithTitles(t.name, t.titleBefore, t.titleAfter) : l.teacherName}
                pictureUrl={t?.photoUrl ?? t?.avatarUrl ?? l.teacherAvatarUrl}
                assignments={assignments ? assignments.filter(a => a.teacher_id === l.teacherId) : null}
                busy={busyId === l.teacherId}
                onChat={() => void chat(l.teacherId)}
                onOpen={setOpen}
              />
            )
          })}
          {error && <p className="px-1 text-xs text-red-600">{error}</p>}
          {teachers.some(t => !active.some(l => l.teacherId === t.userId)) && (
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-3">
              <button
                onClick={() => setShowOthers(v => !v)}
                className="flex w-full items-center justify-between text-xs font-medium text-gray-500 hover:text-gray-800"
              >
                Other teachers for this skill
                <ChevronDown className={`h-4 w-4 transition ${showOthers ? 'rotate-180' : ''}`} />
              </button>
              {showOthers && <div className="mt-3">{list}</div>}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <h3 className="text-base font-bold text-black">Teachers</h3>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-4">{list}</div>
        </div>
      )}

      {openId && userId && (
        <StudentAssignmentModal
          key={openId}
          assignmentId={openId}
          studentId={userId}
          teacherNames={teacherNames}
          onClose={() => setOpen(null)}
          onChanged={reload}
        />
      )}
    </>
  )
}

function TeacherRow({ t, link, isMe, busy, canAsk, onAsk, onChat }: {
  t: SkillTeacher
  link: MyTeacherLink | undefined
  isMe: boolean
  busy: boolean
  canAsk: boolean
  onAsk: () => void
  onChat: () => void
}) {
  const picture = t.photoUrl ?? t.avatarUrl
  return (
    <div className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-gray-50">
      <Link to={`/dashboard/profile/${t.userId}`} className="flex min-w-0 flex-1 items-center gap-3">
        {picture ? (
          <img src={picture} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700">
            <GraduationCap className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate text-sm font-medium text-black">
            <span className="truncate">{formatNameWithTitles(t.name, t.titleBefore, t.titleAfter)}</span>
            {t.verificationStatus === 'verified' && t.verificationKind && (
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label={VERIFIED_LABELS[t.verificationKind]} />
            )}
          </p>
          <p className="truncate text-xs text-gray-400">
            {[LEVEL_LABELS[t.level], t.role && ROLE_LABELS[t.role], t.institutionName].filter(Boolean).join(' · ')}
          </p>
        </div>
      </Link>

      {isMe ? (
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">You</span>
      ) : link?.status === 'active' ? (
        <button
          type="button"
          disabled={busy}
          onClick={onChat}
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-purple-50 hover:text-purple-700"
        >
          <MessageCircle className="h-3 w-3" />
          Chat
        </button>
      ) : link?.status === 'pending' ? (
        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Requested</span>
      ) : (
        <button
          type="button"
          disabled={busy || !canAsk}
          onClick={onAsk}
          className="shrink-0 cursor-pointer rounded-lg bg-purple-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-purple-800 disabled:opacity-50"
        >
          Learn with
        </button>
      )}
    </div>
  )
}
