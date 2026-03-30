import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthProvider'
import { useSearch } from '@/contexts/SearchContext'

const searchPlaceholders: Record<string, string> = {
  '/dashboard': 'Search',
  '/dashboard/chats': 'Search Chat',
  '/dashboard/skills': 'Search Skill',
  '/dashboard/learn': 'Search Course',
  '/dashboard/discover': 'Discover',
}

export function TopBar() {
  const location = useLocation()
  const placeholder = searchPlaceholders[location.pathname] || 'Search'
  const { session } = useAuth()
  const { query, setQuery } = useSearch()
  const isSkills = location.pathname === '/dashboard/skills'
  const [profile, setProfile] = useState<{ first_name: string | null; last_name: string | null } | null>(null)

  useEffect(() => {
    if (!session?.user) return
    supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [session])

  const displayName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || (session?.user?.email ?? '')
    : (session?.user?.email ?? '')

  const email = session?.user?.email ?? ''

  return (
    <header className="flex h-14 shrink-0 items-center justify-between rounded-2xl bg-gray-100 px-4 sm:h-16 sm:px-6 2xl:h-21">
      {/* Search — hidden on mobile, visible sm+ */}
      <div className="relative hidden w-full max-w-xs sm:block sm:max-w-sm lg:max-w-md">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder={placeholder}
          value={isSkills ? query : undefined}
          onChange={isSkills ? (e) => setQuery(e.target.value) : undefined}
          onKeyDown={undefined}
          className="w-full rounded-4xl bg-white py-3 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10"
        />
      </div>

      {/* Mobile: page title instead of search */}
      <p className="text-base font-semibold text-gray-900 sm:hidden">
        {placeholder}
      </p>

      {/* Profile section */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden h-10 w-10 rounded-full bg-gray-200 sm:block" />
        <div className="hidden h-10 w-10 rounded-full bg-pink-100 sm:block" />
        <div className="h-9 w-9 rounded-full bg-linear-to-br from-pink-300 to-rose-400 sm:h-11 sm:w-11" />
        <div className="ml-1 hidden text-right sm:block">
          <p className="text-sm font-semibold text-gray-900">{displayName}</p>
          <p className="text-xs text-gray-400">{email}</p>
        </div>
      </div>
    </header>
  )
}
