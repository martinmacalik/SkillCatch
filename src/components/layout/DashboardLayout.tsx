import { Outlet } from 'react-router-dom'

import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function DashboardLayout() {
  return (
    <div className="flex h-screen gap-4 overflow-hidden bg-white p-4 text-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col gap-4 overflow-hidden">
        <TopBar />
        <main className="dashboard-main flex flex-1 flex-col overflow-hidden rounded-2xl bg-gray-100 p-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
