import { Outlet } from 'react-router-dom'

import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { BottomNav } from './BottomNav'

export function DashboardLayout() {
  return (
    <div className="flex h-screen gap-2 overflow-hidden bg-white p-2 text-gray-900 sm:gap-4 sm:p-4">
      {/* Gradient defs shared by Sidebar (desktop) and BottomNav (mobile) */}
      <svg aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <defs>
          <linearGradient id="navIconGrad" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#c026d3" />
          </linearGradient>
        </defs>
      </svg>

      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden sm:gap-4">
        <TopBar />
        <main className="dashboard-main flex flex-1 flex-col overflow-hidden overflow-y-auto rounded-2xl bg-gray-100 p-3 pb-24 sm:p-5 sm:pb-28 2xl:p-7 2xl:pb-7">
          <Outlet />
        </main>
      </div>

      <BottomNav />
    </div>
  )
}
