import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthProvider'
import { fetchMySkillIds, startDirectChat } from '@/lib/chat-queries'
import { fetchBlocks, fetchProfileSkills, isVisible, type Block, type ProfileSkill } from '@/lib/profile-blocks'
import { addSkillToProfile, fetchSkillById } from '@/lib/skill-queries'
import { ReadOnlyBlocks } from '@/components/profile-blocks/ReadOnlyBlocks'
import AddSkillModal from '@/pages/skills/AddSkillModal'
import type { SkillNode } from '@/pages/skills/types'

interface Profile {
  id: string
  first_name: string | null
  last_name: string | null
  username: string | null
  avatar_url: string | null
  bio: string | null
  banner_url: string | null
  profile_page_created_at: string | null
}

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [skills, setSkills] = useState<Map<string, ProfileSkill>>(new Map())
  const [mySkillIds, setMySkillIds] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<SkillNode | null>(null)
  const [loading, setLoading] = useState(true)
  const { session } = useAuth()
  const myId = session?.user.id ?? ''
  const isOwnProfile = myId === id
  const [startingChat, setStartingChat] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const handleMessage = async () => {
    if (!id) return
    setStartingChat(true)
    setChatError(null)
    try {
      const conversationId = await startDirectChat(id)
      navigate(`/dashboard/chats/${conversationId}`)
    } catch {
      setChatError('Could not start the chat.')
      setStartingChat(false)
    }
  }

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, username, avatar_url, bio, banner_url, profile_page_created_at')
        .eq('id', id)
        .single(),
      fetchBlocks(id).catch(() => [] as Block[]),
      fetchProfileSkills(id).catch(() => new Map<string, ProfileSkill>()),
    ]).then(([{ data: prof }, loadedBlocks, loadedSkills]) => {
      if (!prof) { navigate('/dashboard'); return }
      setProfile(prof)
      setBlocks(loadedBlocks)
      setSkills(loadedSkills)
      setLoading(false)
    })
  }, [id, navigate])

  // "Add skill" on a skill block: which ones I have + the add modal (same as a chat card)
  useEffect(() => {
    if (myId && !isOwnProfile) void fetchMySkillIds(myId).then(setMySkillIds).catch(() => {})
  }, [myId, isOwnProfile])

  const openAddSkill = async (skillId: string) => {
    const node = await fetchSkillById(skillId)
    if (node) setAdding(node)
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
      </div>
    )
  }

  if (!profile) return null

  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.username || 'User'

  const messageButton = !isOwnProfile && (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        onClick={handleMessage}
        disabled={startingChat}
        className="flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-50"
      >
        <MessageSquare className="h-4 w-4" />
        Message
      </button>
      {chatError && <p className="text-xs text-red-500">{chatError}</p>}
    </div>
  )

  // Page not set up yet (never clicked "Set up profile page") → just the notice
  if (!profile.profile_page_created_at) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-32 text-center">
        <p className="text-sm text-gray-400">
          {isOwnProfile
            ? "You haven't set up your profile page yet."
            : "This person hasn't set up their profile page yet."}
        </p>
        {messageButton}
      </div>
    )
  }

  // Same layout + sizes as the editor (ProfileBuilderPage) so the editor is an accurate preview
  return (
    <div className="flex flex-col">
      {profile.banner_url && (
        <div className="h-48 w-full overflow-hidden rounded-2xl bg-gray-100">
          <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl px-2">
        {profile.avatar_url && (
          <img
            src={profile.avatar_url}
            alt=""
            className={`h-24 w-24 rounded-full border-4 border-white object-cover shadow-sm ${profile.banner_url ? '-mt-12' : 'mt-6'}`}
          />
        )}

        <div className="mt-6 flex items-start gap-4">
          <h1 className="min-w-0 flex-1 text-4xl font-bold text-gray-900">{displayName}</h1>
          {messageButton}
        </div>

        {profile.bio && <p className="mt-2 whitespace-pre-line text-base text-gray-600">{profile.bio}</p>}

        {blocks.some(b => isVisible(b, skills)) && (
          <div className="mt-8 border-t border-gray-100 pb-16 pt-4">
            <ReadOnlyBlocks
              ownerId={profile.id}
              blocks={blocks}
              skills={skills}
              mySkillIds={mySkillIds}
              // my own profile: no "Add skill" (I have them all)
              onAddSkill={isOwnProfile ? undefined : id => void openAddSkill(id)}
            />
          </div>
        )}
      </div>

      {adding && (
        <AddSkillModal
          node={adding}
          index={adding.name.length}
          onConfirm={async (values, status) => {
            await addSkillToProfile(myId, adding.id, status, values)
            setMySkillIds(prev => new Set(prev).add(adding.id))
          }}
          onCancel={() => setAdding(null)}
          onDone={() => setAdding(null)}
        />
      )}
    </div>
  )
}
