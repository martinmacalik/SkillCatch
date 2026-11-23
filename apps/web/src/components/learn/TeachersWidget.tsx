import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GraduationCap, MessageCircle, ShieldCheck } from 'lucide-react'

import { useAuth } from '@/contexts/AuthProvider'
import { startDirectChat } from '@/lib/chat-queries'
import {
  fetchMyTeacherLinks,
  fetchSkillTeachers,
  requestTeacher,
  type MyTeacherLink,
  type SkillTeacher,
} from '@/lib/teacher-students-queries'
import { LEVEL_LABELS, ROLE_LABELS, VERIFIED_LABELS } from '@/types/teaching'
import { formatNameWithTitles } from '@/components/teach/teach-utils'

/** Teachers with an approved license for this skill; the viewer can ask to learn with one. */
export function TeachersWidget({ skillNodeId }: { skillNodeId: string }) {
  const { session } = useAuth()
  const userId = session?.user.id
  const navigate = useNavigate()

  const [teachers, setTeachers] = useState<SkillTeacher[]>([])
  const [links, setLinks] = useState<MyTeacherLink[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [t, l] = await Promise.all([
        fetchSkillTeachers(skillNodeId),
        userId ? fetchMyTeacherLinks(userId, skillNodeId) : Promise.resolve([]),
      ])
      setTeachers(t)
      setLinks(l)
      setError(null)
    } catch {
      setError('Could not load teachers.')
    } finally {
      setLoading(false)
    }
  }, [skillNodeId, userId])

  useEffect(() => {
    void load()
  }, [load])

  const ask = async (teacherId: string) => {
    if (!userId) return
    setBusyId(teacherId)
    try {
      await requestTeacher({ studentId: userId, teacherId, skillNodeId, message: '' })
      await load()
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

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="text-base font-bold text-black">Teachers</h3>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-4 flex flex-col gap-2">
        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : teachers.length === 0 ? (
          <p className="text-xs text-gray-400">No one is teaching this skill yet.</p>
        ) : (
          teachers.map((t) => {
            const link = links.find((l) => l.teacherId === t.userId)
            const isMe = t.userId === userId
            const picture = t.photoUrl ?? t.avatarUrl
            return (
              <div key={t.userId} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-gray-50">
                <Link to={`/profile/${t.userId}`} className="flex min-w-0 flex-1 items-center gap-3">
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
                    disabled={busyId === t.userId}
                    onClick={() => void chat(t.userId)}
                    className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-purple-50 hover:text-purple-700"
                  >
                    <MessageCircle className="h-3 w-3" />
                    Chat
                  </button>
                ) : link?.status === 'pending' ? (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    Requested
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === t.userId || !userId}
                    onClick={() => void ask(t.userId)}
                    className="shrink-0 cursor-pointer rounded-lg bg-purple-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-purple-800 disabled:opacity-50"
                  >
                    Learn with
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
