import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  MessageSquare,
  Grid3x3,
  BookOpen,
  Compass,
  Settings,
  HelpCircle,
  LogOut,
} from 'lucide-react'

import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabaseClient'

const menuItems = [
  { icon: LayoutDashboard, label: 'Overview', to: '/dashboard' },
  { icon: MessageSquare, label: 'Chats', to: '/dashboard/chats' },
  { icon: Grid3x3, label: 'Skills', to: '/dashboard/skills' },
  { icon: BookOpen, label: 'Learn', to: '/dashboard/learn' },
  { icon: Compass, label: 'Discover', to: '/dashboard/discover' },
]

const generalItems = [
  { icon: Settings, label: 'Settings', to: '/dashboard/settings' },
  { icon: HelpCircle, label: 'Help', to: '/dashboard/help' },
]

export function Sidebar() {
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <aside className="flex w-[230px] shrink-0 flex-col rounded-2xl bg-gray-100">
      {/* Logo */}
      <div className="px-6 pb-5 pt-7">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Skillcatch</h1>
      </div>

      {/* Menu */}
      <nav className="flex-1 space-y-1 px-3 pt-2">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          Menu
        </p>
        {menuItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-purple-50 text-purple-700'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800',
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}

        <p className="mb-2 mt-8 px-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          General
        </p>
        {generalItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-purple-50 text-purple-700'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800',
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800"
        >
          <LogOut className="h-5 w-5" />
          Logout
        </button>
      </nav>

      {/* Download App CTA */}
      <div className="p-4">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 to-fuchsia-700 p-5 text-white">
          <p className="text-sm font-bold leading-tight">Download Our Mobile App</p>
          <p className="mt-1.5 text-[11px] leading-snug text-purple-200">
            Get easy in another way
          </p>
          <button className="mt-4 rounded-xl bg-fuchsia-500 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-fuchsia-600">
            Download
          </button>
        </div>
      </div>
    </aside>
  )
}
