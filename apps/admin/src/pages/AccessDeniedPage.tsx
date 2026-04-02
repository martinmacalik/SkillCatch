import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function AccessDeniedPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto">
          <svg
            className="w-6 h-6 text-rose-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
        </div>
        <h1 className="text-white text-lg font-semibold">Access Denied</h1>
        <p className="text-neutral-500 text-sm">
          Your account does not have admin access to this dashboard.
        </p>
        <button
          onClick={handleSignOut}
          className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
        >
          Sign out and try another account
        </button>
      </div>
    </div>
  );
}
