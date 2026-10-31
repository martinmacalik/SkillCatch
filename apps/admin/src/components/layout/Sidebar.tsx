import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const NAV = [
  { label: 'Requests', href: '/requests' },
  { label: 'New Skills', href: '/skills' },
  { label: 'Suggestions', href: '/suggestions' },
  { label: 'Messages', href: '/messages' },
  { label: 'Audit Log', href: '/audit' },
  { label: 'Learning', href: '/learning' },
];

export function Sidebar() {
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  // On mobile the nav scrolls horizontally; keep the active tab visible.
  useEffect(() => {
    navRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

  return (
    <aside className="w-full md:w-52 shrink-0 bg-black border-b md:border-b-0 md:border-r border-neutral-900 flex flex-col md:min-h-screen">
      <div className="hidden md:block px-5 py-5 border-b border-neutral-900">
        <span className="text-white text-sm font-semibold tracking-tight">
          SkillCatch Admin
        </span>
      </div>
      <nav
        ref={navRef}
        className="flex md:flex-col md:flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:py-4"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            className={({ isActive }) =>
              `block shrink-0 whitespace-nowrap px-4 md:px-5 py-2.5 text-sm transition-colors border-b-2 md:border-b-0 md:border-l-2 ${
                isActive
                  ? 'text-white border-indigo-500 bg-indigo-500/5'
                  : 'text-neutral-500 hover:text-white border-transparent'
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
