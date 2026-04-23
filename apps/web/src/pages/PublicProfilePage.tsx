import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { ProfileCard } from '@/components/profile-builder/SortableCardList'

interface Profile {
  id: string
  first_name: string | null
  last_name: string | null
  username: string | null
  avatar_url: string | null
  bio: string | null
}

function CardRenderer({ card }: { card: ProfileCard }) {
  const d = card.data

  if (card.type === 'text') {
    const heading = d.heading as string | undefined
    const body = d.body as string | undefined
    if (!body) return null
    return (
      <div className="rounded-2xl bg-white p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        {heading && <h2 className="mb-2 text-xl font-bold text-gray-900">{heading}</h2>}
        <p className="leading-relaxed text-gray-600 whitespace-pre-wrap">{body}</p>
      </div>
    )
  }

  if (card.type === 'text_photo') {
    const heading = d.heading as string | undefined
    const body = d.body as string | undefined
    const photoUrl = d.photo_url as string | undefined
    const isRight = d.photo_position === 'right'
    if (!body && !photoUrl) return null
    return (
      <div className="rounded-2xl bg-white p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <div className={`flex gap-6 ${isRight ? 'flex-row' : 'flex-row-reverse'}`}>
          {photoUrl && (
            <img src={photoUrl} alt="" className="h-48 w-48 shrink-0 rounded-xl object-cover" />
          )}
          <div className="flex-1">
            {heading && <h2 className="mb-2 text-xl font-bold text-gray-900">{heading}</h2>}
            {body && <p className="leading-relaxed text-gray-600 whitespace-pre-wrap">{body}</p>}
          </div>
        </div>
      </div>
    )
  }

  if (card.type === 'photo') {
    const url = d.url as string | undefined
    const caption = d.caption as string | undefined
    if (!url) return null
    return (
      <div className="rounded-2xl bg-white p-4" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <img src={url} alt={caption ?? ''} className="w-full rounded-xl object-cover" />
        {caption && <p className="mt-2 text-center text-sm text-gray-400">{caption}</p>}
      </div>
    )
  }

  if (card.type === 'skills') {
    const skillIds = (d.skill_ids as string[]) ?? []
    const names = (d._skill_names as string[]) ?? []
    if (names.length === 0) return null
    return (
      <div className="rounded-2xl bg-white p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <h2 className="mb-3 text-lg font-bold text-gray-900">Skills</h2>
        <div className="flex flex-wrap gap-2">
          {names.map((name, i) => (
            <span
              key={skillIds[i] ?? i}
              className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (card.type === 'cv') {
    const fileUrl = d.file_url as string | undefined
    const filename = d.filename as string | undefined
    if (!fileUrl) return null
    return (
      <div className="rounded-2xl bg-white p-6" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
        <h2 className="mb-3 text-lg font-bold text-gray-900">CV</h2>
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          download={filename}
          className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:border-indigo-400 hover:text-indigo-600"
        >
          <Download className="h-4 w-4" />
          {filename ?? 'Download CV'}
        </a>
      </div>
    )
  }

  return null
}

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [cards, setCards] = useState<ProfileCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, username, avatar_url, bio')
        .eq('id', id)
        .single(),
      supabase
        .from('profile_cards')
        .select('*')
        .eq('user_id', id)
        .order('position'),
    ]).then(async ([{ data: prof }, { data: rawCards }]) => {
      if (!prof) { navigate('/dashboard'); return }
      setProfile(prof)

      // Resolve skill names for skills cards
      const resolvedCards: ProfileCard[] = []
      for (let card of (rawCards ?? []) as ProfileCard[]) {
        if (card.type === 'skills') {
          const ids = (card.data.skill_ids as string[]) ?? []
          if (ids.length > 0) {
            const { data: nodes } = await supabase
              .from('skill_nodes')
              .select('id, name')
              .in('id', ids)
            card = { ...card, data: { ...card.data, _skill_names: (nodes ?? []).map((n: { id: string; name: string }) => n.name) } }
          }
        }
        resolvedCards.push(card)
      }
      setCards(resolvedCards)
      setLoading(false)
    })
  }, [id, navigate])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
      </div>
    )
  }

  if (!profile) return null

  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.username || 'User'

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {/* Header */}
      <div className="mb-8 flex items-center gap-5">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="h-20 w-20 rounded-full bg-linear-to-br from-pink-300 to-rose-400" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
          {profile.username && (
            <p className="text-sm text-gray-400">@{profile.username}</p>
          )}
          {profile.bio && (
            <p className="mt-1.5 text-sm text-gray-600">{profile.bio}</p>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-4">
        {cards.map(card => (
          <CardRenderer key={card.id} card={card} />
        ))}
        {cards.length === 0 && (
          <p className="py-16 text-center text-sm text-gray-400">
            This user hasn't set up their profile yet.
          </p>
        )}
      </div>
    </div>
  )
}
