import type * as React from 'react'

import { Link, NavLink } from 'react-router-dom'

import { cn } from '@/lib/cn'

type AppShellProps = {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-zinc-800/60 bg-zinc-950/70 backdrop-blur">
        <div className="flex h-14 w-full items-center gap-6 px-4">
          <Link to="/" className="font-semibold tracking-tight">
            SkillPath
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-zinc-300 sm:flex">
            <TopNavLink to="/">Dashboard</TopNavLink>
            <TopNavLink to="/mentors">Mentoři</TopNavLink>
            <TopNavLink to="/goals">Cíle</TopNavLink>
            <TopNavLink to="/skills/graph">Skilly</TopNavLink>
          </nav>
        </div>
      </header>

      <main>{children}</main>
    </div>
  )
}

function TopNavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn('rounded-lg px-2 py-1 hover:bg-zinc-800/50', isActive ? 'text-white' : 'text-zinc-300')
      }
      end
    >
      {children}
    </NavLink>
  )
}
