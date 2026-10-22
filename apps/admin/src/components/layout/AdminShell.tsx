import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AdminShell() {
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#0a0a0a]">
      <Sidebar />
      {/* On mobile this wrapper is `contents`, so TopBar can be reordered above the nav. */}
      <div className="contents md:flex md:flex-1 md:flex-col md:min-h-screen md:min-w-0 md:overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
