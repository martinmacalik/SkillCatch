import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  LayoutDashboard,
  MessageSquare,
  Wrench,
  BookOpen,
  Compass,
  Settings,
  HelpCircle,
  LogOut,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabaseClient'
import TextLogoBlack from '@/assets/TextLogoColor.png'

const menuItems: { icon: LucideIcon; label: string; to: string }[] = [
  { icon: LayoutDashboard, label: 'Overview',  to: '/dashboard' },
  { icon: MessageSquare,   label: 'Chats',     to: '/dashboard/chats' },
  { icon: Wrench,          label: 'Skills',    to: '/dashboard/skills' },
  { icon: BookOpen,        label: 'Learn',     to: '/dashboard/learn' },
  { icon: Compass,         label: 'Discover',  to: '/dashboard/discover' },
]

const generalItems: { icon: LucideIcon; label: string; to: string }[] = [
  { icon: Settings,   label: 'Settings', to: '/dashboard/settings' },
  { icon: HelpCircle, label: 'Help',     to: '/dashboard/help' },
]

const allNavItems = [...menuItems, ...generalItems]

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  const navRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [indicator, setIndicator] = useState({ top: 0, height: 44, visible: false })

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  const moveIndicatorTo = useCallback((el: HTMLDivElement | null) => {
    if (!el || !navRef.current) return
    const navRect = navRef.current.getBoundingClientRect()
    const itemRect = el.getBoundingClientRect()
    setIndicator({ top: itemRect.top - navRect.top, height: itemRect.height, visible: true })
  }, [])

  useEffect(() => {
    const activeIdx = allNavItems.findIndex((item) =>
      item.to === '/dashboard'
        ? location.pathname === '/dashboard'
        : location.pathname.startsWith(item.to)
    )
    if (activeIdx >= 0) moveIndicatorTo(itemRefs.current[activeIdx] ?? null)
  }, [location.pathname, moveIndicatorTo])

  const handleNavLeave = useCallback(() => {
    const activeIdx = allNavItems.findIndex((item) =>
      item.to === '/dashboard'
        ? location.pathname === '/dashboard'
        : location.pathname.startsWith(item.to)
    )
    if (activeIdx >= 0) moveIndicatorTo(itemRefs.current[activeIdx] ?? null)
  }, [location.pathname, moveIndicatorTo])

  return (
    <aside className="hidden 2xl:flex w-[230px] shrink-0 flex-col rounded-2xl bg-gray-100">
      {/* Logo */}
      <div className="px-6 pb-5 pt-7">
        <img src={TextLogoBlack} alt="SkillCatch" className="h-9 w-auto" />
      </div>

      {/* Nav container */}
      <div
        ref={navRef}
        className="relative flex-1 px-3 pt-2"
        onMouseLeave={handleNavLeave}
      >
        {/* Sliding gradient bar — right corners only */}
        <div
          className="pointer-events-none absolute left-0"
          style={{
            top: indicator.top,
            height: indicator.height,
            width: 7,
            borderTopRightRadius: 7,
            borderBottomRightRadius: 7,
            opacity: indicator.visible ? 1 : 0,
            background: 'linear-gradient(to bottom right, #4f46e5, #c026d3)',
            transition: 'top 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s',
          }}
        />

        <nav className="space-y-1">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            Menu
          </p>

          {menuItems.map((item, i) => (
            <div
              key={item.to}
              ref={(el) => { itemRefs.current[i] = el }}
              onMouseEnter={() => moveIndicatorTo(itemRefs.current[i] ?? null)}
            >
              <NavLink
                to={item.to}
                end={item.to === '/dashboard'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium transition-colors',
                    isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className="h-5.5 w-5.5 shrink-0"
                      style={isActive ? { stroke: 'url(#navIconGrad)' } : {}}
                    />
                    {item.label}
                  </>
                )}
              </NavLink>
            </div>
          ))}

          <p className="mb-2 mt-8 px-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            General
          </p>

          {generalItems.map((item, i) => (
            <div
              key={item.to}
              ref={(el) => { itemRefs.current[menuItems.length + i] = el }}
              onMouseEnter={() => moveIndicatorTo(itemRefs.current[menuItems.length + i] ?? null)}
            >
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium transition-colors',
                    isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className="h-5.5 w-5.5 shrink-0"
                      style={isActive ? { stroke: 'url(#navIconGrad)' } : {}}
                    />
                    {item.label}
                  </>
                )}
              </NavLink>
            </div>
          ))}

          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-gray-500 transition-colors hover:text-gray-800"
          >
            <LogOut className="h-5.5 w-5.5 shrink-0" />
            Logout
          </button>
        </nav>
      </div>

      {/* Download App CTA */}
      <div className="p-4">
        <div className="overflow-hidden rounded-2xl bg-linear-to-br from-indigo-900 to-fuchsia-700 p-5 text-white">
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
