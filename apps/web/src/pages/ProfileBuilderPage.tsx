import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { FileText, Image as ImageIcon, Smile } from 'lucide-react'
import { fetchBlocks, fetchProfileSkills, type Block, type ProfileSkill } from '@/lib/profile-blocks'
import { EditableBlocks } from '@/components/profile-blocks/EditableBlocks'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthProvider'
import { emitAppEvent } from '@/lib/app-events'
import { uploadAvatar, removeAvatar, uploadBanner, removeBanner } from '@/lib/avatarUpload'

// Notion-style profile page. Everything here is the same data as Settings → Identity
// (name, avatar, bio live in `profiles`), plus a banner and a "page set up" timestamp.

type PageProfile = {
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  bio: string | null
  banner_url: string | null
  profile_page_created_at: string | null
}

const BIO_MAX = 160

const fullName = (p: PageProfile) => [p.first_name, p.last_name].filter(Boolean).join(' ')

// "Martin Mačalík" → first: Martin, last: Mačalík (everything after the first space)
function splitName(name: string): { first_name: string; last_name: string | null } {
  const i = name.indexOf(' ')
  if (i === -1) return { first_name: name, last_name: null }
  return { first_name: name.slice(0, i), last_name: name.slice(i + 1).trim() || null }
}

export default function ProfileBuilderPage() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? ''

  const [profile, setProfile] = useState<PageProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [justCreated, setJustCreated] = useState(false) // clicked "Set up" → focus the name

  useEffect(() => {
    if (!userId) return
    supabase
      .from('profiles')
      .select('first_name, last_name, avatar_url, bio, banner_url, profile_page_created_at')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (error) setError('Could not load your profile.')
        else setProfile(data as PageProfile)
      })
  }, [userId])

  // Save a few profile columns, update local state and let the TopBar refresh its avatar/name
  const save = async (patch: Partial<PageProfile>) => {
    setError(null)
    setProfile(p => (p ? { ...p, ...patch } : p))
    const { error } = await supabase
      .from('profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (error) setError('Could not save. Try again.')
    else emitAppEvent('profile:refresh')
  }

  if (!profile) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : (
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
        )}
      </div>
    )
  }

  if (!profile.profile_page_created_at) {
    return (
      <SetupPrompt
        onSetup={() => {
          setJustCreated(true)
          void save({ profile_page_created_at: new Date().toISOString() })
        }}
      />
    )
  }

  return (
    <ProfileEditor
      userId={userId}
      profile={profile}
      autoFocusName={justCreated}
      save={save}
      setProfile={setProfile}
      error={error}
      setError={setError}
    />
  )
}

// ── First visit ────────────────────────────────────────────────────────────

function SetupPrompt({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-32 text-center">
      <p className="text-base font-semibold text-gray-900">Your profile page</p>
      <p className="mt-1 max-w-xs text-sm text-gray-400">
        A page other people see when they open your profile. Until you set it up, it stays empty.
      </p>
      <button
        onClick={onSetup}
        className="mt-5 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
      >
        Set up profile page
      </button>
    </div>
  )
}

// ── Editor ─────────────────────────────────────────────────────────────────

type EditorProps = {
  userId: string
  profile: PageProfile
  autoFocusName: boolean
  save: (patch: Partial<PageProfile>) => Promise<void>
  setProfile: React.Dispatch<React.SetStateAction<PageProfile | null>>
  error: string | null
  setError: (e: string | null) => void
}

function ProfileEditor({ userId, profile, autoFocusName, save, setProfile, error, setError }: EditorProps) {
  const [name, setName] = useState(fullName(profile))
  const [bio, setBio] = useState(profile.bio ?? '')
  const [bioOpen, setBioOpen] = useState(false)
  const [uploading, setUploading] = useState<'avatar' | 'banner' | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [blocksLoaded, setBlocksLoaded] = useState(false)
  const [skills, setSkills] = useState<Map<string, ProfileSkill>>(new Map())

  const refreshSkills = useCallback(() => {
    fetchProfileSkills(userId).then(setSkills).catch(() => {})
  }, [userId])

  useEffect(() => {
    fetchBlocks(userId)
      .then(b => { setBlocks(b); setBlocksLoaded(true) })
      .catch(() => setError('Could not load your blocks.'))
    refreshSkills()
  }, [userId, refreshSkills, setError])

  const nameRef = useRef<HTMLInputElement>(null)
  const bioRef = useRef<HTMLTextAreaElement>(null)
  const avatarInput = useRef<HTMLInputElement>(null)
  const bannerInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocusName) nameRef.current?.focus()
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (bioOpen) bioRef.current?.focus()
  }, [bioOpen])

  const saveName = () => {
    const trimmed = name.trim().replace(/\s+/g, ' ')
    // Left empty → put the saved name back
    if (!trimmed) { setName(fullName(profile)); return }
    setName(trimmed)
    if (trimmed !== fullName(profile)) void save(splitName(trimmed))
  }

  const saveBio = () => {
    const trimmed = bio.trim()
    setBio(trimmed)
    setBioOpen(false)
    if (trimmed !== (profile.bio ?? '')) void save({ bio: trimmed || null })
  }

  const handleFile = (kind: 'avatar' | 'banner') => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again
    if (!file) return
    setUploading(kind)
    setError(null)
    try {
      if (kind === 'avatar') {
        const url = await uploadAvatar(userId, file, profile.avatar_url)
        setProfile(p => (p ? { ...p, avatar_url: url } : p))
      } else {
        const url = await uploadBanner(userId, file, profile.banner_url)
        setProfile(p => (p ? { ...p, banner_url: url } : p))
      }
      emitAppEvent('profile:refresh')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(null)
    }
  }

  const handleRemove = async (kind: 'avatar' | 'banner') => {
    setError(null)
    try {
      if (kind === 'avatar') {
        await removeAvatar(userId, profile.avatar_url)
        setProfile(p => (p ? { ...p, avatar_url: null } : p))
      } else {
        await removeBanner(userId, profile.banner_url)
        setProfile(p => (p ? { ...p, banner_url: null } : p))
      }
      emitAppEvent('profile:refresh')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove.')
    }
  }

  const showBio = bioOpen || !!profile.bio

  return (
    <div className="flex flex-col">
      <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile('avatar')} />
      <input ref={bannerInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile('banner')} />

      {/* Banner */}
      {profile.banner_url && (
        <div className="group relative h-48 w-full overflow-hidden rounded-2xl bg-gray-100">
          <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />
          <HoverActions
            className="right-3 top-3"
            onChange={() => bannerInput.current?.click()}
            onRemove={() => handleRemove('banner')}
          />
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl px-2">
        {/* Icon (= avatar) */}
        {profile.avatar_url && (
          <div className={`group relative w-fit ${profile.banner_url ? '-mt-12' : 'mt-6'}`}>
            <img
              src={profile.avatar_url}
              alt=""
              className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-sm"
            />
            <HoverActions
              className="bottom-2 left-full pl-2"
              onChange={() => avatarInput.current?.click()}
              onRemove={() => handleRemove('avatar')}
            />
          </div>
        )}

        {/* Name */}
        <input
          ref={nameRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onFocus={e => e.target.select()}
          onBlur={saveName}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') { setName(fullName(profile)); requestAnimationFrame(() => nameRef.current?.blur()) }
          }}
          placeholder="Your name"
          maxLength={80}
          className="mt-6 w-full bg-transparent text-4xl font-bold text-gray-900 outline-none placeholder:text-gray-300"
        />

        {/* Add icon / banner / bio — only for what's still missing */}
        <div className="mt-2 flex flex-wrap gap-1">
          {!profile.avatar_url && (
            <AddButton icon={Smile} label={uploading === 'avatar' ? 'Uploading…' : 'Add icon'} onClick={() => avatarInput.current?.click()} />
          )}
          {!profile.banner_url && (
            <AddButton icon={ImageIcon} label={uploading === 'banner' ? 'Uploading…' : 'Add banner'} onClick={() => bannerInput.current?.click()} />
          )}
          {!showBio && <AddButton icon={FileText} label="Add bio" onClick={() => setBioOpen(true)} />}
        </div>

        {/* Bio */}
        {showBio && (
          <div className="mt-2">
            <textarea
              ref={bioRef}
              value={bio}
              onChange={e => setBio(e.target.value.slice(0, BIO_MAX))}
              onFocus={() => setBioOpen(true)}
              onBlur={saveBio}
              placeholder="Write a short bio…"
              rows={2}
              className="field-sizing-content w-full resize-none bg-transparent text-base text-gray-600 outline-none placeholder:text-gray-300"
            />
            {bioOpen && <p className="text-right text-xs text-gray-300">{bio.length}/{BIO_MAX}</p>}
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

        {/* Blocks (rows of 1–3 components); the first gap zone is the 16 px top padding */}
        <div className="mt-8 border-t border-gray-100 pb-16">
          {!blocksLoaded ? (
            <div className="py-6 text-sm text-gray-300">Loading…</div>
          ) : (
            <EditableBlocks
              userId={userId}
              blocks={blocks}
              setBlocks={setBlocks}
              skills={skills}
              refreshSkills={refreshSkills}
              onError={setError}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function AddButton({ icon: Icon, label, onClick }: { icon: typeof Smile; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function HoverActions({ className, onChange, onRemove }: { className: string; onChange: () => void; onRemove: () => void }) {
  return (
    <div className={`absolute z-10 flex gap-1 opacity-0 transition group-hover:opacity-100 ${className}`}>
      <button onClick={onChange} className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-white">
        Change
      </button>
      <button onClick={onRemove} className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-white">
        Remove
      </button>
    </div>
  )
}
