import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  MessageSquare,
  Wrench,
  BookOpen,
  Compass,
  LogOut,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'

const navItems: { icon: LucideIcon; to: string; end?: boolean }[] = [
  { icon: LayoutDashboard, to: '/dashboard',          end: true },
  { icon: MessageSquare,   to: '/dashboard/chats' },
  { icon: Wrench,          to: '/dashboard/skills' },
  { icon: BookOpen,        to: '/dashboard/learn' },
  { icon: Compass,         to: '/dashboard/discover' },
]

export function BottomNav() {
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <nav className="2xl:hidden fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-0.5 rounded-2xl bg-white px-2 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.14)]">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            {({ isActive }) => (
              <div
                className={`rounded-xl p-3 transition-colors ${
                  isActive ? 'bg-gradient-to-br from-indigo-50 to-fuchsia-50' : 'hover:bg-gray-50'
                }`}
              >
                <item.icon
                  className={`h-5 w-5 ${!isActive ? 'text-gray-400' : ''}`}
                  style={isActive ? { stroke: 'url(#navIconGrad)' } : {}}
                />
              </div>
            )}
          </NavLink>
        ))}

        {/* Divider */}
        <div className="mx-1 h-6 w-px bg-gray-100" />

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="rounded-xl p-3 transition-colors hover:bg-gray-50"
        >
          <LogOut className="h-5 w-5 text-gray-400" />
        </button>
      </div>
    </nav>
  )
}
