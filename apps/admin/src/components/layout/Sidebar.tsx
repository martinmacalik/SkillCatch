import { NavLink } from 'react-router-dom';

const NAV = [
  { label: 'Requests', href: '/requests' },
  { label: 'Messages', href: '/messages' },
  { label: 'Audit Log', href: '/audit' },
];

export function Sidebar() {
  return (
    <aside className="w-52 shrink-0 bg-black border-r border-neutral-900 flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-neutral-900">
        <span className="text-white text-sm font-semibold tracking-tight">
          SkillCatch Admin
        </span>
      </div>
      <nav className="flex-1 py-4">
        {NAV.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) =>
              `block px-5 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'text-white border-l-2 border-indigo-500 bg-indigo-500/5'
                  : 'text-neutral-500 hover:text-white border-l-2 border-transparent'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
