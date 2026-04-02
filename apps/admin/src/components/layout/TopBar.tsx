import { useAuth } from '../../contexts/AuthContext';

export function TopBar() {
  const { session, signOut } = useAuth();

  return (
    <header className="h-12 border-b border-neutral-900 flex items-center justify-end px-6 gap-4">
      <span className="text-neutral-500 text-xs">
        {session?.user.email ?? ''}
      </span>
      <button
        onClick={signOut}
        className="text-neutral-500 hover:text-white text-xs transition-colors"
      >
        Sign out
      </button>
    </header>
  );
}
