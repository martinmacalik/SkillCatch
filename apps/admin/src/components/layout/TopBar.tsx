import { useAuth } from '../../contexts/AuthContext';

export function TopBar() {
  const { session, signOut } = useAuth();

  return (
    <header className="order-first md:order-0 h-12 shrink-0 bg-black md:bg-transparent border-b border-neutral-900 flex items-center justify-between md:justify-end px-4 md:px-6 gap-4">
      <span className="md:hidden text-white text-sm font-semibold tracking-tight">
        SkillCatch Admin
      </span>
      <span className="hidden sm:inline ml-auto md:ml-0 text-neutral-500 text-xs truncate">
        {session?.user.email ?? ''}
      </span>
      <button
        onClick={signOut}
        className="shrink-0 text-neutral-500 hover:text-white text-xs transition-colors"
      >
        Sign out
      </button>
    </header>
  );
}
