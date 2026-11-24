import { useEffect, useState } from 'react'
import { Flash, Pen, Search, Settings } from 'reicon-react'
import { GlobalSearch } from '@/components/search/GlobalSearch'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthProvider'
import { NotificationsBell } from '@/components/notifications/NotificationsBell'
import { onAppEvent } from '@/lib/app-events'

// mobile: the page name next to the search icon
const PAGE_TITLES: [string, string][] = [
  ['/dashboard/chats', 'Chats'],
  ['/dashboard/skills', 'Skills'],
  ['/dashboard/learn', 'Learn'],
  ['/dashboard/discover', 'Discover'],
  ['/dashboard/teach', 'Teach'],
  ['/dashboard/rewards', 'Rewards'],
  ['/dashboard/settings', 'Settings'],
  ['/dashboard/help', 'Help'],
  ['/dashboard/profile-builder', 'Profile'],
  ['/dashboard/skill-feedback', 'Skill feedback'],
]

export function TopBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const pageTitle = PAGE_TITLES.find(([path]) => location.pathname.startsWith(path))?.[1] ?? 'Dashboard'
  const { session } = useAuth()
  // mobile: the search opens full screen
  const [searchOverlay, setSearchOverlay] = useState(false)
  const [profile, setProfile] = useState<{
    first_name: string | null
    last_name: string | null
    skillcoin_balance: number
    xp: number
    avatar_url: string | null
  } | null>(null)

  useEffect(() => {
    if (!session?.user) return
    const userId = session.user.id
    const load = () =>
      supabase
        .from('profiles')
        .select('first_name, last_name, skillcoin_balance, xp, avatar_url')
        .eq('id', userId)
        .single()
        .then(({ data }) => { if (data) setProfile(data) })
    load()
    // e.g. after a Time Tracker session paid out XP
    return onAppEvent('profile:refresh', load)
  }, [session])

  const displayName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || (session?.user?.email ?? '')
    : (session?.user?.email ?? '')

  const email = session?.user?.email ?? ''

  return (
    <header className="flex h-14 shrink-0 items-center justify-between rounded-2xl bg-gray-100 px-4 sm:h-16 sm:px-6 2xl:h-21">
      {/* Search everything (⌘K) — the field from sm+, a full-screen search on mobile */}
      <GlobalSearch
        className="hidden w-full max-w-xs sm:block sm:max-w-sm lg:max-w-md"
        onRequestOverlay={() => setSearchOverlay(true)}
      />

      {/* Mobile: page title + search icon */}
      <div className="flex items-center gap-1 sm:hidden">
        <p className="text-base font-semibold text-gray-900">{pageTitle}</p>
        <button
          type="button"
          onClick={() => setSearchOverlay(true)}
          aria-label="Search"
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-200"
        >
          <Search className="h-5 w-5" />
        </button>
      </div>
      {searchOverlay && <GlobalSearch variant="overlay" onClose={() => setSearchOverlay(false)} className="sm:hidden" />}

      {/* Profile section */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* SkillCoins + XP → Rewards page */}
        <button
          onClick={() => navigate('/dashboard/rewards')}
          className="hidden h-11 shrink-0 items-center gap-3 rounded-full bg-gray-200 pl-2.5 pr-4 transition hover:bg-gray-300 sm:flex"
          title="Rewards"
        >
          <span className="flex items-center gap-1.5">
            <img src="/coin.png" alt="" className="h-6 w-6 drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]" />
            <span className="text-sm font-semibold text-gray-900">{profile?.skillcoin_balance ?? 0}</span>
          </span>
          <span className="h-5 w-px bg-gray-300" />
          <span className="flex items-center gap-1">
            <Flash weight="Filled" className="nav-icon-active h-5 w-5" />
            <span className="text-sm font-semibold text-gray-900">{profile?.xp ?? 0} XP</span>
          </span>
        </button>

        {/* Notifications — also on mobile, unlike Settings */}
        <NotificationsBell />

        {/* Settings */}
        <button
          onClick={() => navigate('/dashboard/settings')}
          className="hidden h-11 w-11 items-center justify-center rounded-full bg-gray-200 transition hover:bg-gray-300 sm:flex"
          title="Settings"
        >
          <Settings className="h-4 w-4 text-gray-600" />
        </button>

        {/* Avatar — navigates to profile builder */}
        <button
          onClick={() => navigate('/dashboard/profile-builder')}
          className="group relative h-9 w-9 shrink-0 overflow-hidden rounded-full sm:h-11 sm:w-11"
          title="Edit profile"
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="avatar" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-linear-to-br from-pink-300 to-rose-400" />
          )}
          {/* hover: dimmed photo + white pencil */}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Pen weight="Filled" className="h-4 w-4 text-white sm:h-5 sm:w-5" />
          </span>
        </button>

        <div className="ml-1 hidden text-right sm:block">
          <p className="text-sm font-semibold text-gray-900">{displayName}</p>
          <p className="text-xs text-gray-400">{email}</p>
        </div>
      </div>
    </header>
  )
}
