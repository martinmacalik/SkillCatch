import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'

interface Teacher {
  user_id: string
  mode: 'online' | 'in_person' | 'hybrid'
  location: string | null
  notes: string | null
  profiles: { first_name: string | null; last_name: string | null; username: string | null; avatar_url: string | null } | null
}

const MODE_LABEL: Record<Teacher['mode'], string> = {
  online: 'Online',
  in_person: 'In person',
  hybrid: 'Hybrid',
}

const MODE_STYLE: Record<Teacher['mode'], string> = {
  online: 'bg-blue-50 text-blue-700',
  in_person: 'bg-pink-50 text-pink-700',
  hybrid: 'bg-gray-100 text-gray-700',
}

export function TeachersWidget({ skillNodeId }: { skillNodeId: string }) {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('teaching_offers')
      .select('user_id, mode, location, notes, profiles(first_name, last_name, username, avatar_url)')
      .eq('skill_node_id', skillNodeId)
      .limit(20)
      .then(({ data }) => {
        setTeachers((data ?? []) as unknown as Teacher[])
        setLoading(false)
      })
  }, [skillNodeId])

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <h3 className="text-base font-bold text-black">Teachers</h3>
      <div className="mt-4 flex flex-col gap-2">
        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : teachers.length === 0 ? (
          <p className="text-xs text-gray-400">No one is teaching this skill yet.</p>
        ) : (
          teachers.map(t => {
            const p = Array.isArray(t.profiles) ? t.profiles[0] : t.profiles
            const name = [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.username || 'User'
            return (
              <Link
                key={t.user_id}
                to={`/profile/${t.user_id}`}
                className="flex items-center gap-3 rounded-xl border border-transparent p-2 transition hover:border-gray-200 hover:bg-gray-50"
              >
                {p?.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="h-9 w-9 shrink-0 rounded-full bg-linear-to-br from-pink-300 to-rose-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-black">{name}</p>
                  {t.location && (
                    <p className="truncate text-xs text-gray-400">{t.location}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${MODE_STYLE[t.mode]}`}>
                  {MODE_LABEL[t.mode]}
                </span>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
